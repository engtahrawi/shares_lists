package com.abdallah.savemind;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/** Hosts the SaveMind interface (bundled HTML/CSS/JS) and the native bridge it calls. */
public class MainActivity extends Activity {

    static final String EXTRA_ROUTE = "route";

    private static final String BASE = "file:///android_asset/web/index.html";
    private static final int REQ_EXPORT = 11;
    private static final int REQ_IMPORT = 12;

    private WebView web;
    private boolean pageReady;
    private String pendingRoute;

    private final Runnable onDataChanged = new Runnable() {
        @Override
        public void run() {
            js("window.SMNative && SMNative.changed()");
        }
    };

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        styleSystemBars();

        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#F5F6F8"));
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(false);
        s.setAllowFileAccessFromFileURLs(false);
        s.setAllowUniversalAccessFromFileURLs(false);
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setTextZoom(100);
        web.addJavascriptInterface(new Bridge(), "SM");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return handleNavigation(request.getUrl().toString());
            }

            @SuppressWarnings("deprecation")
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handleNavigation(url);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                pageReady = true;
                if (pendingRoute != null) {
                    go(pendingRoute);
                    pendingRoute = null;
                }
            }
        });
        setContentView(web);

        String route = getIntent().getStringExtra(EXTRA_ROUTE);
        web.loadUrl(route != null && route.startsWith("#/") ? BASE + route : BASE);
        ChangeBus.add(onDataChanged);
    }

    private void styleSystemBars() {
        Window w = getWindow();
        w.setStatusBarColor(Color.parseColor("#F5F6F8"));
        w.setNavigationBarColor(Color.WHITE);
        int flags = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
        if (Build.VERSION.SDK_INT >= 26) flags |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
        w.getDecorView().setSystemUiVisibility(flags);
    }

    private boolean handleNavigation(String url) {
        if (url.startsWith("file:///android_asset/")) return false;
        openExternal(url);
        return true;
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        String route = intent.getStringExtra(EXTRA_ROUTE);
        if (route != null && route.startsWith("#/")) {
            if (pageReady) go(route);
            else pendingRoute = route;
        }
    }

    private void go(String route) {
        js("window.SMNative && SMNative.go(" + JSONObject.quote(route) + ")");
    }

    private final android.os.Handler poller = new android.os.Handler(android.os.Looper.getMainLooper());
    private final Runnable poll = new Runnable() {
        @Override
        public void run() {
            Sync.requestSoon(MainActivity.this);
            poller.postDelayed(this, 20_000);
        }
    };

    @Override
    protected void onPause() {
        poller.removeCallbacks(poll);
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        poller.removeCallbacks(poll);
        poller.post(poll);
        if (new Prefs(this).signedIn()) Sync.schedulePeriodic(this);
        Analyzer.kick(this);
        if (pageReady) onDataChanged.run();
    }

    @Override
    protected void onDestroy() {
        ChangeBus.remove(onDataChanged);
        web.destroy();
        super.onDestroy();
    }

    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        if (!pageReady) {
            super.onBackPressed();
            return;
        }
        web.evaluateJavascript("window.SMNative ? SMNative.back() : false", new ValueCallback<String>() {
            @Override
            public void onReceiveValue(String value) {
                if (!"true".equals(value)) moveTaskToBack(true);
            }
        });
    }

    private void js(final String code) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (web != null && pageReady) web.evaluateJavascript(code, null);
            }
        });
    }

    private void callback(int id, String result) {
        js("window.SMNative && SMNative.callback(" + id + "," + JSONObject.quote(result) + ")");
    }

    private void toast(final String msg) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                Toast.makeText(MainActivity.this, msg, Toast.LENGTH_SHORT).show();
            }
        });
    }

    private void requestNotificationPermission() {
        if (Build.VERSION.SDK_INT < 33) return;
        if (checkSelfPermission("android.permission.POST_NOTIFICATIONS")
                == android.content.pm.PackageManager.PERMISSION_GRANTED) {
            return;
        }
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, 21);
            }
        });
    }

    private void openExternal(String url) {
        String valid = UrlUtil.validate(url);
        if (valid == null) return;
        try {
            Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(valid));
            i.addCategory(Intent.CATEGORY_BROWSABLE);
            startActivity(i);
        } catch (ActivityNotFoundException e) {
            toast("No app can open this link");
        }
    }

    // ------------------------------------------------------- backup files

    @SuppressWarnings("deprecation")
    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (resultCode != RESULT_OK || data == null || data.getData() == null) return;
        final Uri uri = data.getData();
        if (requestCode == REQ_EXPORT) {
            Analyzer.runAsync(new Runnable() {
                @Override
                public void run() {
                    try {
                        byte[] bytes = Db.get(MainActivity.this).exportAll().toString(2)
                                .getBytes(StandardCharsets.UTF_8);
                        OutputStream out = getContentResolver().openOutputStream(uri, "wt");
                        if (out == null) throw new java.io.IOException("Cannot write file");
                        try {
                            out.write(bytes);
                        } finally {
                            out.close();
                        }
                        toast("Backup saved");
                    } catch (Exception e) {
                        toast("Backup failed: " + e.getMessage());
                    }
                }
            });
        } else if (requestCode == REQ_IMPORT) {
            Analyzer.runAsync(new Runnable() {
                @Override
                public void run() {
                    try {
                        InputStream in = getContentResolver().openInputStream(uri);
                        if (in == null) throw new java.io.IOException("Cannot read file");
                        ByteArrayOutputStream buf = new ByteArrayOutputStream();
                        try {
                            byte[] b = new byte[8192];
                            int n;
                            while ((n = in.read(b)) != -1) {
                                buf.write(b, 0, n);
                                if (buf.size() > 30_000_000) throw new java.io.IOException("File too large");
                            }
                        } finally {
                            in.close();
                        }
                        JSONObject backup = new JSONObject(new String(buf.toByteArray(), StandardCharsets.UTF_8));
                        int added = Db.get(MainActivity.this).importAll(backup);
                        Reminders.scheduleAll(MainActivity.this);
                        toast("Imported " + added + " link" + (added == 1 ? "" : "s"));
                        Analyzer.kick(MainActivity.this);
                    } catch (Exception e) {
                        toast("Import failed: " + e.getMessage());
                    }
                }
            });
        }
    }

    // ------------------------------------------------------------- bridge

    /** Methods callable from the interface as {@code SM.method(...)}. All data crosses as JSON. */
    public final class Bridge {

        private Db db() {
            return Db.get(MainActivity.this);
        }

        private Prefs prefs() {
            return new Prefs(MainActivity.this);
        }

        @JavascriptInterface
        public String getState() {
            JSONObject o = new JSONObject();
            try {
                Prefs p = prefs();
                o.put("links", db().allLinks());
                o.put("collections", db().allCollections());
                JSONObject settings = new JSONObject();
                settings.put("name", p.name());
                settings.put("model", p.model());
                settings.put("lang", p.briefLanguage());
                settings.put("autoFile", p.autoFile());
                settings.put("hasKey", p.hasApiKey());
                settings.put("keyHint", p.apiKeyHint());
                settings.put("onboarded", p.onboarded());
                o.put("settings", settings);
                JSONObject account = new JSONObject();
                account.put("available", SyncConfig.configured());
                account.put("signedIn", p.signedIn());
                account.put("email", p.accountEmail());
                account.put("lastSync", p.lastSync());
                account.put("syncing", Sync.isRunning());
                account.put("error", p.syncError() == null ? JSONObject.NULL : p.syncError());
                o.put("account", account);
                o.put("platform", "android");
                o.put("version", appVersion());
            } catch (JSONException ignored) {
                // not reachable
            }
            return o.toString();
        }

        @JavascriptInterface
        public String getStats() {
            return db().stats().toString();
        }

        @JavascriptInterface
        public String appVersion() {
            try {
                PackageInfo pi = getPackageManager().getPackageInfo(getPackageName(), 0);
                return pi.versionName;
            } catch (Exception e) {
                return "";
            }
        }

        @JavascriptInterface
        public String validateUrl(String input) {
            String v = UrlUtil.validate(input);
            return v == null ? "" : v;
        }

        @JavascriptInterface
        public String checkDuplicate(String input) {
            String v = UrlUtil.validate(input);
            if (v == null) return "null";
            JSONObject dup = db().findDuplicate(v);
            return dup == null ? "null" : dup.toString();
        }

        @JavascriptInterface
        public String addLink(String input, String context, boolean saveCopy) {
            JSONObject r = new JSONObject();
            try {
                String url = UrlUtil.validate(input);
                if (url == null) {
                    r.put("ok", false);
                    r.put("error", "Enter a valid web link that starts with http:// or https://");
                    return r.toString();
                }
                if (!saveCopy) {
                    JSONObject dup = db().findDuplicate(url);
                    if (dup != null) {
                        r.put("ok", false);
                        r.put("duplicate", dup);
                        return r.toString();
                    }
                }
                long id = db().insertLink(url, context, "SaveMind", null);
                Analyzer.kick(MainActivity.this);
                r.put("ok", true);
                r.put("id", id);
            } catch (JSONException ignored) {
                // not reachable
            }
            return r.toString();
        }

        @JavascriptInterface
        public void updateLink(long id, String json) {
            try {
                JSONObject in = new JSONObject(json);
                JSONObject cur = db().getLink(id);
                if (cur == null) return;
                ContentValues v = new ContentValues();
                if (in.has("title")) {
                    String t = in.optString("title").trim();
                    if (!t.isEmpty() && !t.equals(cur.optString("title"))) {
                        v.put("title", t.length() > 200 ? t.substring(0, 200) : t);
                        v.put("title_locked", 1);
                    }
                }
                if (in.has("notes")) v.put("notes", Db.emptyToNull(in.optString("notes")));
                if (in.has("tags")) {
                    JSONArray tags = in.optJSONArray("tags");
                    JSONArray clean = new JSONArray();
                    if (tags != null) {
                        for (int i = 0; i < tags.length() && clean.length() < 12; i++) {
                            String t = tags.optString(i).trim().replaceFirst("^#+", "")
                                    .toLowerCase(Locale.ROOT).replaceAll("\\s+", "-");
                            if (!t.isEmpty() && t.length() <= 32) clean.put(t);
                        }
                    }
                    v.put("tags", clean.toString());
                    v.put("tags_locked", 1);
                }
                if (in.has("action_label")) {
                    String a = in.optString("action_label").trim();
                    if (!a.isEmpty()) {
                        v.put("action_label", a.length() > 24 ? a.substring(0, 24) : a);
                        v.put("action_locked", 1);
                    }
                }
                if (in.has("collection_id")) {
                    long cid = in.isNull("collection_id") ? -1 : in.optLong("collection_id", -1);
                    if (cid > 0 && db().collectionExists(cid)) v.put("collection_id", cid);
                    else v.putNull("collection_id");
                    v.put("reviewed", 1);
                }
                if (v.size() > 0) db().updateLink(id, v);
            } catch (JSONException ignored) {
                // malformed input from the page is ignored
            }
        }

        @JavascriptInterface
        public void setFlag(long id, String flag, boolean on) {
            if (!flag.equals("favorite") && !flag.equals("archived") && !flag.equals("reviewed")) return;
            ContentValues v = new ContentValues();
            v.put(flag, on ? 1 : 0);
            db().updateLink(id, v);
            if (flag.equals("archived")) Reminders.schedule(MainActivity.this, db().getLink(id));
        }

        /** Applies the AI suggestion; a new collection is only created here, on user approval. */
        @JavascriptInterface
        public String acceptSuggestion(long id) {
            JSONObject l = db().getLink(id);
            if (l == null) return "";
            ContentValues v = new ContentValues();
            String name = "Inbox";
            if (!l.isNull("suggested_collection_id") && db().collectionExists(l.optLong("suggested_collection_id"))) {
                long cid = l.optLong("suggested_collection_id");
                v.put("collection_id", cid);
                name = db().collectionName(cid);
            } else if (!l.isNull("suggested_new_name") && !l.optString("suggested_new_name").isEmpty()) {
                long cid = db().createCollection(l.optString("suggested_new_name"));
                if (cid > 0) {
                    v.put("collection_id", cid);
                    name = db().collectionName(cid);
                }
            }
            v.put("reviewed", 1);
            db().updateLink(id, v);
            return name == null ? "" : name;
        }

        /**
         * Sets a deadline by hand ("YYYY-MM-DD", optional "HH:MM") with a reminder 0, 3 or 7 days before.
         * A deadline set here is never overwritten by a later analysis.
         */
        @JavascriptInterface
        public boolean setDeadline(long id, String date, String time, int remindDays) {
            String text = date == null ? "" : date.trim();
            if (time != null && !time.trim().isEmpty()) text += "T" + time.trim();
            Deadlines.Value d = Deadlines.parse(text);
            if (d == null) return false;
            ContentValues v = new ContentValues();
            v.put("deadline_at", d.at);
            v.put("deadline_has_time", d.hasTime ? 1 : 0);
            v.put("deadline_source", "user");
            v.put("deadline_locked", 1);
            v.put("remind_days", remindDays == 3 || remindDays == 7 ? remindDays : 0);
            v.put("reminded", 0);
            db().updateLink(id, v);
            Reminders.schedule(MainActivity.this, db().getLink(id));
            if (remindDays > 0) requestNotificationPermission();
            return true;
        }

        /** Sets the work estimate in days (1 to 60); never overwritten by a later analysis. */
        @JavascriptInterface
        public void setEffort(long id, int days) {
            if (days < 1 || days > 60) return;
            ContentValues v = new ContentValues();
            v.put("effort_days", days);
            v.put("effort_locked", 1);
            db().updateLink(id, v);
        }

        /** Replaces the preparation steps ([{"t":text,"d":0|1}]); never overwritten by a later analysis. */
        @JavascriptInterface
        public void setSteps(long id, String json) {
            try {
                JSONArray in = new JSONArray(json);
                JSONArray clean = new JSONArray();
                for (int i = 0; i < in.length() && clean.length() < 20; i++) {
                    JSONObject o = in.optJSONObject(i);
                    if (o == null) continue;
                    String t = o.optString("t").trim();
                    if (t.isEmpty()) continue;
                    if (t.length() > 120) t = t.substring(0, 120);
                    clean.put(new JSONObject().put("t", t).put("d", o.optInt("d") == 1 ? 1 : 0));
                }
                ContentValues v = new ContentValues();
                v.put("steps", clean.toString());
                v.put("steps_locked", 1);
                db().updateLink(id, v);
            } catch (JSONException ignored) {
                // malformed input from the page is ignored
            }
        }

        /** Sets the countries (ISO codes or ONLINE); never overwritten by a later analysis. */
        @JavascriptInterface
        public void setCountries(long id, String json) {
            try {
                ContentValues v = new ContentValues();
                v.put("countries", ClaudeClient.validCountries(new JSONArray(json)).toString());
                v.put("countries_locked", 1);
                db().updateLink(id, v);
            } catch (JSONException ignored) {
                // malformed input from the page is ignored
            }
        }

        /** Adds a reference link (up to 5) and analyzes the opportunity again with it. */
        @JavascriptInterface
        public String addRefLink(long id, String input) {
            JSONObject r = new JSONObject();
            try {
                JSONObject l = db().getLink(id);
                String url = UrlUtil.validate(input);
                if (l == null || url == null) {
                    r.put("ok", false).put("error", "Enter a valid web link that starts with http:// or https://");
                    return r.toString();
                }
                JSONArray refs = l.optJSONArray("ref_links");
                if (refs == null) refs = new JSONArray();
                String norm = UrlUtil.normalize(url);
                for (int i = 0; i < refs.length(); i++) {
                    if (norm.equals(UrlUtil.normalize(refs.optJSONObject(i).optString("url")))) {
                        r.put("ok", false).put("error", "This reference link is already added.");
                        return r.toString();
                    }
                }
                if (norm.equals(UrlUtil.normalize(l.optString("url")))) {
                    r.put("ok", false).put("error", "That is the saved link itself. Add a different page.");
                    return r.toString();
                }
                if (refs.length() >= 5) {
                    r.put("ok", false).put("error", "You can add up to 5 reference links.");
                    return r.toString();
                }
                refs.put(new JSONObject().put("url", url).put("title", UrlUtil.domain(url)).put("status", "pending"));
                ContentValues v = new ContentValues();
                v.put("ref_links", refs.toString());
                v.put("status", Db.ST_QUEUED);
                v.put("attempts", 0);
                v.put("next_attempt_at", 0);
                v.putNull("error");
                v.put("origin", prefs().deviceId());
                db().updateLink(id, v);
                Analyzer.kick(MainActivity.this);
                r.put("ok", true);
            } catch (JSONException ignored) {
                // not reachable
            }
            return r.toString();
        }

        @JavascriptInterface
        public void removeRefLink(long id, int index) {
            JSONObject l = db().getLink(id);
            if (l == null) return;
            JSONArray refs = l.optJSONArray("ref_links");
            if (refs == null || index < 0 || index >= refs.length()) return;
            JSONArray out = new JSONArray();
            for (int i = 0; i < refs.length(); i++) if (i != index) out.put(refs.opt(i));
            ContentValues v = new ContentValues();
            v.put("ref_links", out.toString());
            db().updateLink(id, v);
        }

        @JavascriptInterface
        public int reanalyzeMissingCountries() {
            int n = db().requeueMissingCountries();
            if (n > 0) Analyzer.kick(MainActivity.this);
            return n;
        }

        /** Re-analyzes open opportunities that have a deadline but no work estimate yet. */
        @JavascriptInterface
        public int reanalyzeMissingPlans() {
            int n = db().requeueMissingPlans();
            if (n > 0) Analyzer.kick(MainActivity.this);
            return n;
        }

        /** Removes the deadline and keeps it removed on re-analysis. */
        @JavascriptInterface
        public void clearDeadline(long id) {
            ContentValues v = new ContentValues();
            v.putNull("deadline_at");
            v.put("deadline_has_time", 0);
            v.put("deadline_source", "user");
            v.put("deadline_locked", 1);
            v.put("remind_days", 0);
            db().updateLink(id, v);
            Reminders.schedule(MainActivity.this, db().getLink(id));
        }

        @JavascriptInterface
        public void moveLink(long id, long collectionId) {
            ContentValues v = new ContentValues();
            if (collectionId > 0 && db().collectionExists(collectionId)) v.put("collection_id", collectionId);
            else v.putNull("collection_id");
            v.put("reviewed", 1);
            db().updateLink(id, v);
        }

        @JavascriptInterface
        public void deleteLink(long id) {
            db().deleteLink(id);
        }

        @JavascriptInterface
        public void retry(long id, String extraContext) {
            JSONObject l = db().getLink(id);
            if (l == null) return;
            ContentValues v = new ContentValues();
            String extra = extraContext == null ? "" : extraContext.trim();
            if (!extra.isEmpty()) {
                String prev = l.isNull("shared_text") ? "" : l.optString("shared_text");
                v.put("shared_text", prev.isEmpty() ? extra : prev + "\n" + extra);
            }
            v.put("status", Db.ST_QUEUED);
            v.put("attempts", 0);
            v.put("next_attempt_at", 0);
            v.putNull("error");
            v.put("origin", prefs().deviceId());
            db().updateLink(id, v);
            Analyzer.kick(MainActivity.this);
        }

        @JavascriptInterface
        public long createCollection(String name) {
            return db().createCollection(name);
        }

        @JavascriptInterface
        public boolean renameCollection(long id, String name) {
            return db().renameCollection(id, name);
        }

        @JavascriptInterface
        public void deleteCollection(long id) {
            db().deleteCollection(id);
        }

        @JavascriptInterface
        public void openUrl(String url) {
            openExternal(url);
        }

        @JavascriptInterface
        public void shareLink(String url, String title) {
            Intent i = new Intent(Intent.ACTION_SEND);
            i.setType("text/plain");
            String body = title == null || title.isEmpty() ? url : title + "\n" + url;
            i.putExtra(Intent.EXTRA_TEXT, body);
            startActivity(Intent.createChooser(i, "Share link"));
        }

        @JavascriptInterface
        public void copyText(String text) {
            final String t = text;
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                    if (cm != null) cm.setPrimaryClip(ClipData.newPlainText("SaveMind", t));
                    if (Build.VERSION.SDK_INT < 33) toast("Copied");
                }
            });
        }

        @JavascriptInterface
        public String readClipboard() {
            ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
            if (cm == null || !cm.hasPrimaryClip()) return "";
            ClipData clip = cm.getPrimaryClip();
            if (clip == null || clip.getItemCount() == 0) return "";
            CharSequence text = clip.getItemAt(0).coerceToText(MainActivity.this);
            return text == null ? "" : text.toString();
        }

        @JavascriptInterface
        public void saveSettings(String json) {
            try {
                JSONObject o = new JSONObject(json);
                Prefs p = prefs();
                String name = o.optString("name", p.name()).trim();
                if (name.length() > 40) name = name.substring(0, 40);
                String model = o.optString("model", p.model());
                String lang = o.optString("lang", p.briefLanguage());
                if (!lang.equals("auto") && !lang.equals("en") && !lang.equals("ar")) lang = "auto";
                p.save(name, model, lang, o.optBoolean("autoFile", p.autoFile()));
                if (o.optBoolean("onboarded", false)) p.setOnboarded();
                ChangeBus.post();
            } catch (JSONException ignored) {
                // malformed input from the page is ignored
            }
        }

        @JavascriptInterface
        public boolean setApiKey(String key) {
            boolean ok = prefs().setApiKey(key);
            if (ok && key != null && !key.trim().isEmpty()) {
                db().requeueKeyFailures();
                Analyzer.kick(MainActivity.this);
            }
            ChangeBus.post();
            return ok;
        }

        @JavascriptInterface
        public void testApiKey(final int callbackId) {
            new Thread(new Runnable() {
                @Override
                public void run() {
                    Prefs p = prefs();
                    String key = p.apiKey();
                    String result = key == null ? "No API key saved yet." : ClaudeClient.testKey(key, p.model());
                    callback(callbackId, result);
                }
            }).start();
        }

        @JavascriptInterface
        public void exportData() {
            runOnUiThread(new Runnable() {
                @SuppressWarnings("deprecation")
                @Override
                public void run() {
                    Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                    i.addCategory(Intent.CATEGORY_OPENABLE);
                    i.setType("application/json");
                    String date = new SimpleDateFormat("yyyy-MM-dd", Locale.ROOT).format(new Date());
                    i.putExtra(Intent.EXTRA_TITLE, "savemind-backup-" + date + ".json");
                    try {
                        startActivityForResult(i, REQ_EXPORT);
                    } catch (ActivityNotFoundException e) {
                        toast("No file manager available");
                    }
                }
            });
        }

        @JavascriptInterface
        public void importData() {
            runOnUiThread(new Runnable() {
                @SuppressWarnings("deprecation")
                @Override
                public void run() {
                    Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                    i.addCategory(Intent.CATEGORY_OPENABLE);
                    i.setType("*/*");
                    try {
                        startActivityForResult(i, REQ_IMPORT);
                    } catch (ActivityNotFoundException e) {
                        toast("No file manager available");
                    }
                }
            });
        }

        @JavascriptInterface
        public void deleteAllData(boolean includeKey) {
            db().deleteAll();
            if (includeKey) prefs().setApiKey(null);
            ChangeBus.post();
        }

        @JavascriptInterface
        public void signIn(final String email, final String password, final boolean create, final int callbackId) {
            new Thread(new Runnable() {
                @Override
                public void run() {
                    Sync.Result r = create ? Sync.signUp(MainActivity.this, email, password)
                            : Sync.signIn(MainActivity.this, email, password);
                    callback(callbackId, r.toJson());
                }
            }).start();
        }

        @JavascriptInterface
        public void signOut() {
            Sync.signOut(MainActivity.this);
        }

        @JavascriptInterface
        public void syncNow() {
            Sync.runAsync(MainActivity.this, null);
        }

        @JavascriptInterface
        public void toast(String msg) {
            MainActivity.this.toast(msg);
        }
    }
}
