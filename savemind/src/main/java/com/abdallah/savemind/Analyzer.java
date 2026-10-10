package com.abdallah.savemind;

import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.content.ComponentName;
import android.content.ContentValues;
import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Background pipeline (PRD section 11): queued link, then content extraction, then Claude
 * analysis, then validated storage. Links are always saved before this runs, so a failure
 * here never loses a link. Work runs on one serial thread; JobScheduler resumes it after
 * network loss or when the app is closed.
 */
final class Analyzer {

    static final String ERR_NEEDS_KEY = "needs_key";

    private static final int JOB_ID = 4242;
    private static final int MAX_ATTEMPTS = 4;
    private static final ExecutorService EXEC = Executors.newSingleThreadExecutor();

    private Analyzer() {}

    /** Starts processing due links now and keeps a network-gated job as a safety net. */
    static void kick(Context context) {
        final Context app = context.getApplicationContext();
        scheduleJob(app, 0);
        EXEC.execute(new Runnable() {
            @Override
            public void run() {
                drain(app);
            }
        });
    }

    /** Runs {@link #drain} on the worker thread, then calls {@code done}. */
    static void drainAsync(Context context, final Runnable done) {
        final Context app = context.getApplicationContext();
        EXEC.execute(new Runnable() {
            @Override
            public void run() {
                try {
                    drain(app);
                } finally {
                    done.run();
                }
            }
        });
    }

    static void runAsync(Runnable r) {
        EXEC.execute(r);
    }

    private static void drain(Context app) {
        Db db = Db.get(app);
        // Work is serial on this thread, so any row still "processing" was interrupted.
        db.resetStuckProcessing();
        Prefs prefs = new Prefs(app);
        String key = prefs.apiKey();
        if (key == null) {
            markWaitingForKey(db);
            return;
        }
        while (true) {
            JSONObject link = db.claimNextQueued();
            if (link == null) break;
            process(app, db, prefs, key, link);
        }
        long next = db.nextQueuedAttemptAt();
        if (next > 0) scheduleJob(app, Math.max(0, next - System.currentTimeMillis()));
    }

    private static void markWaitingForKey(Db db) {
        ContentValues v = new ContentValues();
        v.put("error", ERR_NEEDS_KEY);
        JSONArray links = db.allLinks();
        for (int i = 0; i < links.length(); i++) {
            JSONObject l = links.optJSONObject(i);
            if (Db.ST_QUEUED.equals(l.optString("status")) && !ERR_NEEDS_KEY.equals(l.optString("error"))) {
                db.updateLink(l.optLong("id"), new ContentValues(v));
            }
        }
    }

    private static void process(Context app, Db db, Prefs prefs, String key, JSONObject link) {
        long id = link.optLong("id");
        String url = link.optString("url");
        String sharedText = link.isNull("shared_text") ? "" : link.optString("shared_text");
        String notes = link.isNull("notes") ? "" : link.optString("notes");
        String model = prefs.model();
        long started = System.currentTimeMillis();

        Extractor.Result page = Extractor.extract(url, sharedText + " " + notes);
        JSONArray collections = db.collectionsForPrompt(id);
        String content = buildUserContent(url, page, sharedText, notes, link, collections);

        ContentValues v = new ContentValues();
        if (!page.siteName.isEmpty()) v.put("site_name", page.siteName);
        if (!page.image.isEmpty()) v.put("image_url", page.image);
        if (!page.title.isEmpty()) v.put("page_title", page.title);

        try {
            ClaudeClient.Analysis a = ClaudeClient.analyze(key, model, content,
                    languageRule(prefs.briefLanguage()), collections);
            String level = page.level;
            if (!a.contentSufficient && Extractor.FULL.equals(level)) level = Extractor.PARTIAL;

            if (link.optLong("title_locked") == 0) {
                String title = !a.title.isEmpty() ? a.title : !page.title.isEmpty() ? page.title : UrlUtil.domain(url);
                v.put("title", title);
            }
            String summary = a.summary;
            if (Extractor.UNAVAILABLE.equals(level)) {
                summary = "The content of this link could not be retrieved, so no summary was generated. "
                        + "Add context and retry to improve the analysis.";
            }
            v.put("summary", summary);
            v.put("content_type", a.contentType);
            v.put("topic", a.topic);
            if (link.optLong("tags_locked") == 0) v.put("tags", a.tags.toString());
            if (link.optLong("action_locked") == 0) v.put("action_label", a.action);
            v.put("confidence", a.confidence);
            v.put("source_level", level);
            v.put("status", Extractor.FULL.equals(level) ? Db.ST_ANALYZED : Db.ST_PARTIAL);
            v.put("error", (String) null);
            v.put("analyzed_at", System.currentTimeMillis());
            v.put("attempts", 0);

            boolean reviewed = link.optLong("reviewed") == 1;
            if (a.suggestedCollectionId > 0) {
                v.put("suggested_collection_id", a.suggestedCollectionId);
                v.putNull("suggested_new_name");
                if (!reviewed && prefs.autoFile() && a.confidence >= 0.8 && link.isNull("collection_id")) {
                    v.put("collection_id", a.suggestedCollectionId);
                    v.put("reviewed", 1);
                }
            } else {
                v.putNull("suggested_collection_id");
                v.put("suggested_new_name", a.suggestedNewName);
            }
            db.updateLink(id, v);
            db.logRun(id, model, ClaudeClient.PROMPT_VERSION, level, "ok", null,
                    a.inputTokens, a.outputTokens, System.currentTimeMillis() - started);
        } catch (ClaudeClient.ClaudeException e) {
            int attempts = (int) link.optLong("attempts") + 1;
            v.put("attempts", attempts);
            if (e.retryable && attempts < MAX_ATTEMPTS) {
                long delay = 30_000L * (1L << (attempts - 1)); // 30 s, 1 min, 2 min
                v.put("status", Db.ST_QUEUED);
                v.put("next_attempt_at", System.currentTimeMillis() + delay);
                v.put("error", e.getMessage());
            } else {
                v.put("status", Db.ST_FAILED);
                v.put("error", e.getMessage());
                if (!page.level.equals(Extractor.UNAVAILABLE) && link.isNull("source_level")) {
                    v.put("source_level", page.level);
                }
            }
            if (link.isNull("title") && !page.title.isEmpty() && link.optLong("title_locked") == 0) {
                v.put("title", page.title);
            }
            db.updateLink(id, v);
            db.logRun(id, model, ClaudeClient.PROMPT_VERSION, page.level, "error", e.code, 0, 0,
                    System.currentTimeMillis() - started);
        }
    }

    private static String buildUserContent(String url, Extractor.Result page, String sharedText,
                                           String notes, JSONObject link, JSONArray collections) {
        StringBuilder sb = new StringBuilder();
        sb.append("Analyze this saved link.\n\n");
        sb.append("<link>").append(url).append("</link>\n");
        if (!page.finalUrl.equals(url)) sb.append("<final_url>").append(page.finalUrl).append("</final_url>\n");
        sb.append("<site>").append(UrlUtil.domain(url));
        if (!page.siteName.isEmpty()) sb.append(" (").append(page.siteName).append(')');
        sb.append("</site>\n");
        String app = link.isNull("source_app") ? "" : link.optString("source_app");
        if (!app.isEmpty()) sb.append("<shared_from_app>").append(app).append("</shared_from_app>\n");
        sb.append("<source_access_level>").append(page.level).append("</source_access_level>\n");
        if (!page.note.isEmpty()) sb.append("<retrieval_note>").append(page.note).append("</retrieval_note>\n");

        sb.append("<page_metadata>\n");
        appendField(sb, "title", page.title);
        appendField(sb, "description", page.description);
        appendField(sb, "type", page.ogType);
        appendField(sb, "author", page.author);
        appendField(sb, "published", page.published);
        appendField(sb, "content_type_header", page.contentType);
        sb.append("</page_metadata>\n");

        if (!sharedText.trim().isEmpty() || !notes.trim().isEmpty()) {
            sb.append("<user_context>\n");
            if (!sharedText.trim().isEmpty()) sb.append("Shared with the link: ").append(sharedText.trim()).append('\n');
            if (!notes.trim().isEmpty()) sb.append("User's note: ").append(notes.trim()).append('\n');
            sb.append("</user_context>\n");
        }

        sb.append("<existing_collections>\n");
        if (collections.length() == 0) {
            sb.append("(none yet)\n");
        } else {
            for (int i = 0; i < collections.length(); i++) {
                JSONObject c = collections.optJSONObject(i);
                sb.append("id ").append(c.optLong("id")).append(": ").append(c.optString("name"));
                JSONArray ex = c.optJSONArray("examples");
                if (ex != null && ex.length() > 0) {
                    sb.append(" | e.g. ");
                    for (int j = 0; j < ex.length(); j++) {
                        if (j > 0) sb.append("; ");
                        sb.append(ex.optString(j));
                    }
                }
                sb.append('\n');
            }
        }
        sb.append("</existing_collections>\n");

        if (!page.text.isEmpty()) {
            sb.append("<source_content>\n").append(page.text).append("\n</source_content>\n");
        }
        return sb.toString();
    }

    private static void appendField(StringBuilder sb, String name, String value) {
        if (value != null && !value.isEmpty()) sb.append(name).append(": ").append(value).append('\n');
    }

    private static String languageRule(String pref) {
        if ("en".equals(pref)) {
            return "Write title, summary, topic and tags in English, whatever the source language.";
        }
        if ("ar".equals(pref)) {
            return "Write title, summary, topic and tags in Modern Standard Arabic, whatever the "
                    + "source language. A suggested new collection name may also be in Arabic.";
        }
        return "Write title, summary, topic and tags in the main language of the source material "
                + "(for example, Arabic material gets an Arabic summary). Write a suggested new "
                + "collection name in the language most existing collection names use, or English "
                + "when there are none.";
    }

    static void scheduleJob(Context context, long delayMs) {
        JobScheduler js = (JobScheduler) context.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        if (js == null) return;
        JobInfo.Builder b = new JobInfo.Builder(JOB_ID,
                new ComponentName(context, AnalysisJobService.class))
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setPersisted(true)
                .setBackoffCriteria(30_000, JobInfo.BACKOFF_POLICY_EXPONENTIAL);
        if (delayMs > 0) b.setMinimumLatency(delayMs);
        try {
            js.schedule(b.build());
        } catch (RuntimeException ignored) {
            // Scheduling is a safety net; in-app processing still runs.
        }
    }
}
