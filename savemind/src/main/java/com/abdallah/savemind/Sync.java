package com.abdallah.savemind;

import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.content.ComponentName;
import android.content.Context;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

/**
 * Syncs links and collections with the user's Supabase account. Local changes are marked dirty
 * and uploaded through push_items (last write wins); other devices' changes are downloaded by seq.
 * Runs on its own serial thread; requests are coalesced.
 */
final class Sync {

    private static final int JOB_ID = 4343;
    private static final int PAGE = 500;
    private static final int PUSH_BATCH = 200;
    private static final ScheduledExecutorService EXEC = Executors.newSingleThreadScheduledExecutor();
    private static ScheduledFuture<?> pending;
    private static volatile boolean running;

    static final class Result {
        final boolean ok;
        final String error;
        final boolean needsConfirm;

        Result(boolean ok, String error, boolean needsConfirm) {
            this.ok = ok;
            this.error = error;
            this.needsConfirm = needsConfirm;
        }

        String toJson() {
            JSONObject o = new JSONObject();
            try {
                o.put("ok", ok);
                if (error != null) o.put("error", error);
                o.put("needsConfirm", needsConfirm);
            } catch (JSONException ignored) {
                // not reachable
            }
            return o.toString();
        }
    }

    private Sync() {}

    static boolean isRunning() {
        return running;
    }

    /** Syncs about two seconds from now; repeated calls in between collapse into one run. */
    static synchronized void requestSoon(final Context context) {
        final Context app = context.getApplicationContext();
        if (!SyncConfig.configured() || !new Prefs(app).signedIn()) return;
        if (pending != null && !pending.isDone()) return;
        pending = EXEC.schedule(new Runnable() {
            @Override
            public void run() {
                syncNow(app);
            }
        }, 2, TimeUnit.SECONDS);
    }

    /** Runs a sync on the sync thread, then calls {@code done} (on that thread). */
    static void runAsync(final Context context, final Runnable done) {
        final Context app = context.getApplicationContext();
        EXEC.execute(new Runnable() {
            @Override
            public void run() {
                try {
                    syncNow(app);
                } finally {
                    if (done != null) done.run();
                }
            }
        });
    }

    // ----------------------------------------------------------------- auth

    static Result signIn(Context context, String email, String password) {
        Prefs prefs = new Prefs(context);
        try {
            JSONObject body = new JSONObject().put("email", email.trim()).put("password", password);
            Http r = call("POST", "/auth/v1/token?grant_type=password", body.toString(), null);
            if (r.code != 200) return new Result(false, authError(r), false);
            if (!storeSession(prefs, new JSONObject(r.body), email.trim())) {
                return new Result(false, "Unexpected answer from the sync server.", false);
            }
            Db.get(context).markAllDirty();
            prefs.setLastSeq(0);
            schedulePeriodic(context);
            runAsync(context, null);
            ChangeBus.post();
            return new Result(true, null, false);
        } catch (IOException e) {
            return new Result(false, "Could not reach the sync server. Check your connection.", false);
        } catch (JSONException e) {
            return new Result(false, "Unexpected answer from the sync server.", false);
        }
    }

    static Result signUp(Context context, String email, String password) {
        try {
            JSONObject body = new JSONObject().put("email", email.trim()).put("password", password);
            Http r = call("POST", "/auth/v1/signup", body.toString(), null);
            if (r.code != 200) return new Result(false, authError(r), false);
            JSONObject o = new JSONObject(r.body);
            if (o.has("access_token")) {
                storeSession(new Prefs(context), o, email.trim());
                Db.get(context).markAllDirty();
                new Prefs(context).setLastSeq(0);
                schedulePeriodic(context);
                runAsync(context, null);
                ChangeBus.post();
                return new Result(true, null, false);
            }
            return new Result(true, null, true);
        } catch (IOException e) {
            return new Result(false, "Could not reach the sync server. Check your connection.", false);
        } catch (JSONException e) {
            return new Result(false, "Unexpected answer from the sync server.", false);
        }
    }

    /** Signs out on this device. Local data stays; nothing is deleted from the account. */
    static void signOut(Context context) {
        Prefs prefs = new Prefs(context);
        final String token = prefs.accessToken();
        prefs.clearSession();
        JobScheduler js = (JobScheduler) context.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        if (js != null) js.cancel(JOB_ID);
        if (token != null) {
            EXEC.execute(new Runnable() {
                @Override
                public void run() {
                    try {
                        call("POST", "/auth/v1/logout", "{}", token);
                    } catch (IOException ignored) {
                        // signing out locally is what matters
                    }
                }
            });
        }
        ChangeBus.post();
    }

    private static boolean storeSession(Prefs prefs, JSONObject o, String email) {
        String access = o.optString("access_token", null);
        String refresh = o.optString("refresh_token", null);
        if (access == null || refresh == null) return false;
        long expiresAt = System.currentTimeMillis() + o.optLong("expires_in", 3600) * 1000L;
        JSONObject user = o.optJSONObject("user");
        String userId = user == null ? null : user.optString("id", null);
        String mail = user == null ? email : user.optString("email", email);
        prefs.saveSession(mail, userId, access, expiresAt, refresh);
        return true;
    }

    private static String authError(Http r) {
        String msg = "";
        try {
            JSONObject o = new JSONObject(r.body);
            msg = o.optString("msg", o.optString("error_description", o.optString("message", o.optString("error", ""))));
        } catch (JSONException ignored) {
            // keep generic message
        }
        String lower = msg.toLowerCase(java.util.Locale.ROOT);
        if (lower.contains("invalid login")) return "Wrong email or password.";
        if (lower.contains("not confirmed")) return "Confirm your email first: open the link Supabase sent you, then sign in.";
        if (lower.contains("already registered")) return "This email already has an account. Sign in instead.";
        if (lower.contains("password")) return msg;
        if (r.code == 429) return "Too many attempts. Wait a minute and try again.";
        return msg.isEmpty() ? "Sign-in failed (HTTP " + r.code + ")." : msg;
    }

    /** A valid access token, refreshed when it expires within a minute; null when signed out. */
    private static String token(Prefs prefs) throws IOException {
        String access = prefs.accessToken();
        if (access != null && prefs.accessExpiresAt() > System.currentTimeMillis() + 60_000) return access;
        String refresh = prefs.refreshToken();
        if (refresh == null) return null;
        try {
            Http r = call("POST", "/auth/v1/token?grant_type=refresh_token",
                    new JSONObject().put("refresh_token", refresh).toString(), null);
            if (r.code == 200) {
                storeSession(prefs, new JSONObject(r.body), null);
                return prefs.accessToken();
            }
            if (r.code == 400 || r.code == 401) {
                prefs.clearSession();
                prefs.setSyncResult(0, "Signed out. Sign in again to keep syncing.");
                ChangeBus.post();
            }
            return null;
        } catch (JSONException e) {
            return null;
        }
    }

    // ----------------------------------------------------------------- sync

    private static void syncNow(Context app) {
        Prefs prefs = new Prefs(app);
        if (!SyncConfig.configured() || !prefs.signedIn()) return;
        running = true;
        ChangeBus.post();
        try {
            String token = token(prefs);
            if (token == null) return;
            Db db = Db.get(app);
            push(db, token);
            boolean changed = pull(app, db, prefs, token);
            prefs.setSyncResult(System.currentTimeMillis(), null);
            if (changed) Analyzer.kick(app);
        } catch (IOException e) {
            prefs.setSyncResult(0, "Offline. Changes will sync when you are back online.");
        } catch (SyncException e) {
            prefs.setSyncResult(0, e.getMessage());
        } catch (JSONException e) {
            prefs.setSyncResult(0, "Sync failed: unexpected data from the server.");
        } finally {
            running = false;
            ChangeBus.post();
        }
    }

    private static final class SyncException extends Exception {
        SyncException(String msg) {
            super(msg);
        }
    }

    private static void push(Db db, String token) throws IOException, JSONException, SyncException {
        List<Db.Outgoing> out = db.outgoing();
        for (int start = 0; start < out.size(); start += PUSH_BATCH) {
            List<Db.Outgoing> batch = out.subList(start, Math.min(out.size(), start + PUSH_BATCH));
            JSONArray items = new JSONArray();
            for (Db.Outgoing o : batch) items.put(o.item);
            Http r = call("POST", "/rest/v1/rpc/push_items", new JSONObject().put("items", items).toString(), token);
            if (r.code == 404) throw new SyncException("Sync is not set up on the server yet: run schema.sql in Supabase.");
            if (r.code != 200 && r.code != 204) throw new SyncException("Upload failed (HTTP " + r.code + ").");
            for (Db.Outgoing o : batch) db.markUploaded(o);
        }
    }

    private static boolean pull(Context app, Db db, Prefs prefs, String token)
            throws IOException, JSONException, SyncException {
        long since = Math.max(0, prefs.lastSeq() - 20);
        long maxSeq = prefs.lastSeq();
        JSONArray all = new JSONArray();
        while (true) {
            Http r = call("GET", "/rest/v1/items?select=id,kind,data,deleted,updated_at,seq&seq=gt." + since
                    + "&order=seq.asc&limit=" + PAGE, null, token);
            if (r.code != 200) throw new SyncException("Download failed (HTTP " + r.code + ").");
            JSONArray page = new JSONArray(r.body);
            for (int i = 0; i < page.length(); i++) {
                JSONObject it = page.getJSONObject(i);
                all.put(it);
                since = Math.max(since, it.optLong("seq"));
                maxSeq = Math.max(maxSeq, it.optLong("seq"));
            }
            if (page.length() < PAGE) break;
        }
        boolean changed = false;
        // Collections first, so links can point at them.
        for (int pass = 0; pass < 2; pass++) {
            for (int i = 0; i < all.length(); i++) {
                JSONObject it = all.getJSONObject(i);
                boolean isCollection = "collection".equals(it.optString("kind"));
                if ((pass == 0) != isCollection) continue;
                long res = db.applyRemote(it);
                if (res >= 0) changed = true;
                if (res > 0) Reminders.schedule(app, db.getLink(res));
            }
        }
        prefs.setLastSeq(maxSeq);
        if (changed) ChangeBus.post();
        return changed;
    }

    // ------------------------------------------------------------ schedule

    static void schedulePeriodic(Context context) {
        JobScheduler js = (JobScheduler) context.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        if (js == null) return;
        JobInfo job = new JobInfo.Builder(JOB_ID, new ComponentName(context, SyncJobService.class))
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setPeriodic(15 * 60 * 1000L)
                .setPersisted(true)
                .build();
        try {
            js.schedule(job);
        } catch (RuntimeException ignored) {
            // foreground syncs still run
        }
    }

    // ----------------------------------------------------------------- http

    private static final class Http {
        int code;
        String body;
    }

    private static Http call(String method, String path, String body, String bearer) throws IOException {
        HttpURLConnection c = (HttpURLConnection) new URL(SyncConfig.URL + path).openConnection();
        c.setRequestMethod(method);
        c.setConnectTimeout(15_000);
        c.setReadTimeout(30_000);
        c.setRequestProperty("apikey", SyncConfig.ANON_KEY);
        c.setRequestProperty("Authorization", "Bearer " + (bearer != null ? bearer : SyncConfig.ANON_KEY));
        c.setRequestProperty("Accept", "application/json");
        if (body != null) {
            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
            c.setDoOutput(true);
            c.setRequestProperty("Content-Type", "application/json");
            c.setFixedLengthStreamingMode(bytes.length);
            OutputStream out = c.getOutputStream();
            try {
                out.write(bytes);
            } finally {
                out.close();
            }
        }
        Http r = new Http();
        r.code = c.getResponseCode();
        InputStream in = r.code >= 400 ? c.getErrorStream() : c.getInputStream();
        ByteArrayOutputStream buf = new ByteArrayOutputStream();
        if (in != null) {
            try {
                byte[] b = new byte[8192];
                int n;
                while ((n = in.read(b)) != -1) buf.write(b, 0, n);
            } finally {
                in.close();
            }
        }
        r.body = new String(buf.toByteArray(), StandardCharsets.UTF_8);
        c.disconnect();
        return r;
    }
}
