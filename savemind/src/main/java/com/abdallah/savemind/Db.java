package com.abdallah.savemind;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.Locale;

/**
 * Local persistence (PRD section 10): saved links, collections and analysis runs.
 * Every write notifies {@link ChangeBus} so open screens refresh.
 */
final class Db extends SQLiteOpenHelper {

    static final String ST_QUEUED = "queued";
    static final String ST_PROCESSING = "processing";
    static final String ST_ANALYZED = "analyzed";
    static final String ST_PARTIAL = "partial";
    static final String ST_FAILED = "failed";

    static final int COLLECTION_COLORS = 7;

    private static final String[] LINK_COLUMNS = {
            "id", "url", "normalized_url", "shared_text", "source_app", "saved_at", "updated_at",
            "status", "source_level", "title", "summary", "content_type", "topic", "tags",
            "action_label", "collection_id", "suggested_collection_id", "suggested_new_name",
            "confidence", "reviewed", "favorite", "archived", "notes", "error", "attempts",
            "next_attempt_at", "site_name", "image_url", "analyzed_at", "title_locked",
            "tags_locked", "action_locked", "page_title", "deadline_at", "deadline_has_time",
            "deadline_source", "deadline_locked", "remind_days", "reminded", "effort_days",
            "effort_locked", "steps", "steps_locked", "uid", "origin", "dirty", "countries",
            "countries_locked", "ref_links"
    };

    /** Link fields shared with other devices (plus "collection" and "suggested_collection" uids). */
    static final String[] SYNC_LINK_FIELDS = {
            "url", "shared_text", "source_app", "saved_at", "status", "source_level", "title",
            "page_title", "summary", "content_type", "topic", "tags", "action_label",
            "suggested_new_name", "confidence", "reviewed", "favorite", "archived", "notes", "error",
            "site_name", "image_url", "analyzed_at", "title_locked", "tags_locked", "action_locked",
            "deadline_at", "deadline_has_time", "deadline_source", "deadline_locked", "remind_days",
            "effort_days", "effort_locked", "steps", "steps_locked", "origin", "countries",
            "countries_locked", "ref_links"
    };

    /** Columns that never come from a backup file or another device as-is. */
    private static final java.util.Set<String> IMPORT_SKIP = new java.util.HashSet<>(
            java.util.Arrays.asList("id", "uid", "dirty", "origin"));

    private static Db instance;

    static synchronized Db get(Context context) {
        if (instance == null) instance = new Db(context.getApplicationContext());
        return instance;
    }

    private final Context app;

    private Db(Context context) {
        super(context, "savemind.db", null, 5);
        app = context;
    }

    /** A local edit: refresh open screens and schedule a sync. */
    private void localChange() {
        ChangeBus.post();
        Sync.requestSoon(app);
    }

    static String newUid() {
        return java.util.UUID.randomUUID().toString();
    }

    @Override
    public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE collections ("
                + "id INTEGER PRIMARY KEY AUTOINCREMENT,"
                + "name TEXT NOT NULL,"
                + "description TEXT,"
                + "color INTEGER NOT NULL DEFAULT 0,"
                + "created_at INTEGER NOT NULL)");
        db.execSQL("CREATE TABLE links ("
                + "id INTEGER PRIMARY KEY AUTOINCREMENT,"
                + "url TEXT NOT NULL,"
                + "normalized_url TEXT NOT NULL,"
                + "shared_text TEXT,"
                + "source_app TEXT,"
                + "saved_at INTEGER NOT NULL,"
                + "updated_at INTEGER NOT NULL,"
                + "status TEXT NOT NULL,"
                + "source_level TEXT,"
                + "title TEXT,"
                + "page_title TEXT,"
                + "summary TEXT,"
                + "content_type TEXT,"
                + "topic TEXT,"
                + "tags TEXT NOT NULL DEFAULT '[]',"
                + "action_label TEXT,"
                + "collection_id INTEGER,"
                + "suggested_collection_id INTEGER,"
                + "suggested_new_name TEXT,"
                + "confidence REAL,"
                + "reviewed INTEGER NOT NULL DEFAULT 0,"
                + "favorite INTEGER NOT NULL DEFAULT 0,"
                + "archived INTEGER NOT NULL DEFAULT 0,"
                + "notes TEXT,"
                + "error TEXT,"
                + "attempts INTEGER NOT NULL DEFAULT 0,"
                + "next_attempt_at INTEGER NOT NULL DEFAULT 0,"
                + "site_name TEXT,"
                + "image_url TEXT,"
                + "analyzed_at INTEGER,"
                + "title_locked INTEGER NOT NULL DEFAULT 0,"
                + "tags_locked INTEGER NOT NULL DEFAULT 0,"
                + "action_locked INTEGER NOT NULL DEFAULT 0)");
        addDeadlineColumns(db);
        addPlanColumns(db);
        addSyncColumns(db);
        addCountryColumns(db);
        db.execSQL("CREATE INDEX idx_links_norm ON links(normalized_url)");
        db.execSQL("CREATE INDEX idx_links_status ON links(status)");
        db.execSQL("CREATE TABLE analysis_runs ("
                + "id INTEGER PRIMARY KEY AUTOINCREMENT,"
                + "link_id INTEGER NOT NULL,"
                + "model TEXT,"
                + "prompt_version TEXT,"
                + "source_level TEXT,"
                + "status TEXT,"
                + "error_code TEXT,"
                + "input_tokens INTEGER NOT NULL DEFAULT 0,"
                + "output_tokens INTEGER NOT NULL DEFAULT 0,"
                + "latency_ms INTEGER NOT NULL DEFAULT 0,"
                + "created_at INTEGER NOT NULL)");
    }

    @Override
    public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
        if (oldVersion < 2) addDeadlineColumns(db);
        if (oldVersion < 3) addPlanColumns(db);
        if (oldVersion < 4) addSyncColumns(db);
        if (oldVersion < 5) addCountryColumns(db);
    }

    /**
     * Version 5: countries where the opportunity takes place (ISO 3166 codes or "ONLINE") and
     * reference links ([{"url","title","status"}]) that Claude reads with the saved link.
     */
    private static void addCountryColumns(SQLiteDatabase db) {
        db.execSQL("ALTER TABLE links ADD COLUMN countries TEXT NOT NULL DEFAULT '[]'");
        db.execSQL("ALTER TABLE links ADD COLUMN countries_locked INTEGER NOT NULL DEFAULT 0");
        db.execSQL("ALTER TABLE links ADD COLUMN ref_links TEXT NOT NULL DEFAULT '[]'");
    }

    /**
     * Version 4: sync. uid is the item's id on every device; dirty marks local changes not yet
     * uploaded; origin is the device that saved a link (only it analyzes the link automatically);
     * tombstones remember deletions until they are uploaded.
     */
    private static void addSyncColumns(SQLiteDatabase db) {
        db.execSQL("ALTER TABLE links ADD COLUMN uid TEXT");
        db.execSQL("ALTER TABLE links ADD COLUMN origin TEXT");
        db.execSQL("ALTER TABLE links ADD COLUMN dirty INTEGER NOT NULL DEFAULT 1");
        db.execSQL("ALTER TABLE collections ADD COLUMN uid TEXT");
        db.execSQL("ALTER TABLE collections ADD COLUMN updated_at INTEGER");
        db.execSQL("ALTER TABLE collections ADD COLUMN dirty INTEGER NOT NULL DEFAULT 1");
        db.execSQL("CREATE TABLE IF NOT EXISTS tombstones (uid TEXT PRIMARY KEY, kind TEXT NOT NULL, "
                + "deleted_at INTEGER NOT NULL)");
        for (String table : new String[]{"links", "collections"}) {
            Cursor c = db.rawQuery("SELECT id FROM " + table + " WHERE uid IS NULL", null);
            try {
                while (c.moveToNext()) {
                    ContentValues v = new ContentValues();
                    v.put("uid", newUid());
                    db.update(table, v, "id = ?", new String[]{String.valueOf(c.getLong(0))});
                }
            } finally {
                c.close();
            }
        }
        db.execSQL("UPDATE collections SET updated_at = created_at WHERE updated_at IS NULL");
        db.execSQL("CREATE UNIQUE INDEX IF NOT EXISTS idx_links_uid ON links(uid)");
        db.execSQL("CREATE UNIQUE INDEX IF NOT EXISTS idx_collections_uid ON collections(uid)");
    }

    /** Version 3: the Planner's work estimate (days) and preparation steps ([{"t":text,"d":0|1}]). */
    private static void addPlanColumns(SQLiteDatabase db) {
        db.execSQL("ALTER TABLE links ADD COLUMN effort_days INTEGER");
        db.execSQL("ALTER TABLE links ADD COLUMN effort_locked INTEGER NOT NULL DEFAULT 0");
        db.execSQL("ALTER TABLE links ADD COLUMN steps TEXT NOT NULL DEFAULT '[]'");
        db.execSQL("ALTER TABLE links ADD COLUMN steps_locked INTEGER NOT NULL DEFAULT 0");
    }

    /** Version 2: deadlines. deadline_at is epoch ms; a date without a time is stored as 23:59 local. */
    private static void addDeadlineColumns(SQLiteDatabase db) {
        db.execSQL("ALTER TABLE links ADD COLUMN deadline_at INTEGER");
        db.execSQL("ALTER TABLE links ADD COLUMN deadline_has_time INTEGER NOT NULL DEFAULT 0");
        db.execSQL("ALTER TABLE links ADD COLUMN deadline_source TEXT");
        db.execSQL("ALTER TABLE links ADD COLUMN deadline_locked INTEGER NOT NULL DEFAULT 0");
        db.execSQL("ALTER TABLE links ADD COLUMN remind_days INTEGER NOT NULL DEFAULT 0");
        db.execSQL("ALTER TABLE links ADD COLUMN reminded INTEGER NOT NULL DEFAULT 0");
    }

    // ---------------------------------------------------------------- links

    /** Persists a link immediately (FR-03). Returns the new row id. */
    long insertLink(String url, String sharedText, String sourceApp, String notes) {
        long now = System.currentTimeMillis();
        String domain = UrlUtil.domain(url);
        ContentValues v = new ContentValues();
        v.put("url", url);
        v.put("normalized_url", UrlUtil.normalize(url));
        v.put("shared_text", emptyToNull(sharedText));
        v.put("source_app", emptyToNull(sourceApp));
        v.put("saved_at", now);
        v.put("updated_at", now);
        v.put("status", ST_QUEUED);
        v.put("site_name", UrlUtil.siteName(domain));
        v.put("notes", emptyToNull(notes));
        v.put("uid", newUid());
        v.put("origin", new Prefs(app).deviceId());
        v.put("dirty", 1);
        long id = getWritableDatabase().insert("links", null, v);
        localChange();
        return id;
    }

    /** Most recent saved link with the same normalized URL, or null (FR-11). */
    JSONObject findDuplicate(String url) {
        String norm = UrlUtil.normalize(url);
        Cursor c = getReadableDatabase().rawQuery(
                "SELECT l.id, l.saved_at, l.title, c.name FROM links l "
                        + "LEFT JOIN collections c ON c.id = l.collection_id "
                        + "WHERE l.normalized_url = ? ORDER BY l.saved_at DESC LIMIT 1",
                new String[]{norm});
        try {
            if (!c.moveToFirst()) return null;
            JSONObject o = new JSONObject();
            o.put("id", c.getLong(0));
            o.put("savedAt", c.getLong(1));
            o.put("title", c.isNull(2) ? JSONObject.NULL : c.getString(2));
            o.put("collection", c.isNull(3) ? JSONObject.NULL : c.getString(3));
            return o;
        } catch (JSONException e) {
            return null;
        } finally {
            c.close();
        }
    }

    JSONObject getLink(long id) {
        Cursor c = getReadableDatabase().query("links", LINK_COLUMNS, "id = ?",
                new String[]{String.valueOf(id)}, null, null, null);
        try {
            return c.moveToFirst() ? linkRow(c) : null;
        } finally {
            c.close();
        }
    }

    JSONArray allLinks() {
        JSONArray out = new JSONArray();
        Cursor c = getReadableDatabase().query("links", LINK_COLUMNS, null, null, null, null,
                "saved_at DESC");
        try {
            while (c.moveToNext()) out.put(linkRow(c));
        } finally {
            c.close();
        }
        return out;
    }

    private static JSONObject linkRow(Cursor c) {
        JSONObject o = new JSONObject();
        try {
            for (int i = 0; i < c.getColumnCount(); i++) {
                String name = c.getColumnName(i);
                if (c.isNull(i)) {
                    o.put(name, JSONObject.NULL);
                    continue;
                }
                switch (c.getType(i)) {
                    case Cursor.FIELD_TYPE_INTEGER:
                        o.put(name, c.getLong(i));
                        break;
                    case Cursor.FIELD_TYPE_FLOAT:
                        o.put(name, c.getDouble(i));
                        break;
                    default:
                        o.put(name, c.getString(i));
                }
            }
            for (String arr : new String[]{"steps", "countries", "ref_links"}) {
                try {
                    o.put(arr, new JSONArray(o.optString(arr, "[]")));
                } catch (JSONException e) {
                    o.put(arr, new JSONArray());
                }
            }
            String tags = o.optString("tags", "[]");
            try {
                o.put("tags", new JSONArray(tags));
            } catch (JSONException e) {
                o.put("tags", new JSONArray());
            }
        } catch (JSONException ignored) {
            // JSONObject.put only throws for non-finite numbers
        }
        return o;
    }

    void updateLink(long id, ContentValues v) {
        v.put("updated_at", System.currentTimeMillis());
        v.put("dirty", 1);
        getWritableDatabase().update("links", v, "id = ?", new String[]{String.valueOf(id)});
        localChange();
    }

    void deleteLink(long id) {
        SQLiteDatabase db = getWritableDatabase();
        tombstone(db, "links", "link", id);
        db.delete("links", "id = ?", new String[]{String.valueOf(id)});
        db.delete("analysis_runs", "link_id = ?", new String[]{String.valueOf(id)});
        localChange();
    }

    private static void tombstone(SQLiteDatabase db, String table, String kind, long id) {
        Cursor c = db.rawQuery("SELECT uid FROM " + table + " WHERE id = ?", new String[]{String.valueOf(id)});
        try {
            if (c.moveToFirst() && !c.isNull(0)) {
                ContentValues t = new ContentValues();
                t.put("uid", c.getString(0));
                t.put("kind", kind);
                t.put("deleted_at", System.currentTimeMillis());
                db.insertWithOnConflict("tombstones", null, t, SQLiteDatabase.CONFLICT_REPLACE);
            }
        } finally {
            c.close();
        }
    }

    /**
     * Atomically claims the next link that is due for analysis, marking it as processing.
     * Returns null when nothing is due.
     */
    JSONObject claimNextQueued() {
        SQLiteDatabase db = getWritableDatabase();
        long now = System.currentTimeMillis();
        db.beginTransaction();
        try {
            Cursor c = db.rawQuery("SELECT id FROM links WHERE status = ? AND next_attempt_at <= ? "
                    + "AND (origin IS NULL OR origin = '" + new Prefs(app).deviceId().replace("'", "") + "') "
                    + "ORDER BY saved_at ASC LIMIT 1", new String[]{ST_QUEUED, String.valueOf(now)});
            long id;
            try {
                if (!c.moveToFirst()) return null;
                id = c.getLong(0);
            } finally {
                c.close();
            }
            ContentValues v = new ContentValues();
            v.put("status", ST_PROCESSING);
            v.put("error", (String) null);
            v.put("updated_at", now);
            db.update("links", v, "id = ?", new String[]{String.valueOf(id)});
            db.setTransactionSuccessful();
            ChangeBus.post();
            return getLink(id);
        } finally {
            db.endTransaction();
        }
    }

    /** Earliest scheduled retry among queued links, or -1 when nothing is queued. */
    long nextQueuedAttemptAt() {
        Cursor c = getReadableDatabase().rawQuery(
                "SELECT MIN(next_attempt_at) FROM links WHERE status = ? AND (origin IS NULL OR origin = ?)",
                new String[]{ST_QUEUED, new Prefs(app).deviceId()});
        try {
            return c.moveToFirst() && !c.isNull(0) ? c.getLong(0) : -1;
        } finally {
            c.close();
        }
    }

    /** Recovers links left in "processing" when the app was killed mid-analysis. */
    void resetStuckProcessing() {
        ContentValues v = new ContentValues();
        v.put("status", ST_QUEUED);
        int n = getWritableDatabase().update("links", v, "status = ?", new String[]{ST_PROCESSING});
        if (n > 0) ChangeBus.post();
    }

    /** Re-queues links that were waiting for an API key or failed because of the key. */
    void requeueKeyFailures() {
        ContentValues v = new ContentValues();
        v.put("status", ST_QUEUED);
        v.put("attempts", 0);
        v.put("next_attempt_at", 0);
        v.put("error", (String) null);
        getWritableDatabase().update("links", v,
                "(status = ? AND error = ?) OR (status = ? AND error LIKE ?)",
                new String[]{ST_QUEUED, Analyzer.ERR_NEEDS_KEY, ST_FAILED, "%API key%"});
        ChangeBus.post();
    }

    int countQueued() {
        Cursor c = getReadableDatabase().rawQuery("SELECT COUNT(*) FROM links WHERE status = ?",
                new String[]{ST_QUEUED});
        try {
            return c.moveToFirst() ? c.getInt(0) : 0;
        } finally {
            c.close();
        }
    }

    /** Links whose deadline reminder has not fired yet. */
    JSONArray pendingReminders() {
        JSONArray out = new JSONArray();
        Cursor c = getReadableDatabase().query("links", LINK_COLUMNS,
                "remind_days > 0 AND reminded = 0 AND deadline_at IS NOT NULL AND archived = 0",
                null, null, null, null);
        try {
            while (c.moveToNext()) out.put(linkRow(c));
        } finally {
            c.close();
        }
        return out;
    }

    /** Open links with a future deadline but no work estimate, for a one-tap re-analysis. */
    int requeueMissingPlans() {
        ContentValues v = new ContentValues();
        v.put("origin", new Prefs(app).deviceId());
        v.put("dirty", 1);
        v.put("updated_at", System.currentTimeMillis());
        v.put("status", ST_QUEUED);
        v.put("attempts", 0);
        v.put("next_attempt_at", 0);
        v.putNull("error");
        int n = getWritableDatabase().update("links", v,
                "deadline_at IS NOT NULL AND deadline_at > ? AND effort_days IS NULL AND archived = 0 "
                        + "AND status IN ('analyzed', 'partial', 'failed')",
                new String[]{String.valueOf(System.currentTimeMillis())});
        if (n > 0) localChange();
        return n;
    }

    /** Opportunities, events and courses with no country yet, re-queued on this device. */
    int requeueMissingCountries() {
        ContentValues v = new ContentValues();
        v.put("origin", new Prefs(app).deviceId());
        v.put("dirty", 1);
        v.put("updated_at", System.currentTimeMillis());
        v.put("status", ST_QUEUED);
        v.put("attempts", 0);
        v.put("next_attempt_at", 0);
        v.putNull("error");
        int n = getWritableDatabase().update("links", v,
                "content_type IN ('opportunity', 'event', 'course') AND countries = '[]' AND countries_locked = 0 "
                        + "AND archived = 0 AND status IN ('analyzed', 'partial', 'failed')", null);
        if (n > 0) localChange();
        return n;
    }

    // ---------------------------------------------------------- collections

    JSONArray allCollections() {
        JSONArray out = new JSONArray();
        Cursor c = getReadableDatabase().rawQuery(
                "SELECT c.id, c.name, c.description, c.color, c.created_at, "
                        + "(SELECT MAX(l.updated_at) FROM links l WHERE l.collection_id = c.id) "
                        + "FROM collections c ORDER BY c.name COLLATE NOCASE", null);
        try {
            while (c.moveToNext()) {
                JSONObject o = new JSONObject();
                o.put("id", c.getLong(0));
                o.put("name", c.getString(1));
                o.put("description", c.isNull(2) ? JSONObject.NULL : c.getString(2));
                o.put("color", c.getInt(3));
                o.put("created_at", c.getLong(4));
                o.put("updated_at", c.isNull(5) ? c.getLong(4) : c.getLong(5));
                out.put(o);
            }
        } catch (JSONException ignored) {
            // not reachable
        } finally {
            c.close();
        }
        return out;
    }

    /** Returns the id of the collection with this name (case-insensitive), creating it if needed. */
    long createCollection(String name) {
        String clean = name == null ? "" : name.trim().replaceAll("\\s+", " ");
        if (clean.isEmpty()) return -1;
        if (clean.length() > 60) clean = clean.substring(0, 60);
        long existing = collectionIdByName(clean);
        if (existing > 0) return existing;
        SQLiteDatabase db = getWritableDatabase();
        long count = android.database.DatabaseUtils.queryNumEntries(db, "collections");
        ContentValues v = new ContentValues();
        v.put("name", clean);
        v.put("color", (int) (count % COLLECTION_COLORS));
        v.put("created_at", System.currentTimeMillis());
        v.put("updated_at", System.currentTimeMillis());
        v.put("uid", newUid());
        v.put("dirty", 1);
        long id = db.insert("collections", null, v);
        localChange();
        return id;
    }

    long collectionIdByName(String name) {
        Cursor c = getReadableDatabase().rawQuery(
                "SELECT id FROM collections WHERE name = ? COLLATE NOCASE LIMIT 1", new String[]{name});
        try {
            return c.moveToFirst() ? c.getLong(0) : -1;
        } finally {
            c.close();
        }
    }

    boolean collectionExists(long id) {
        Cursor c = getReadableDatabase().rawQuery("SELECT 1 FROM collections WHERE id = ?",
                new String[]{String.valueOf(id)});
        try {
            return c.moveToFirst();
        } finally {
            c.close();
        }
    }

    String collectionName(long id) {
        Cursor c = getReadableDatabase().rawQuery("SELECT name FROM collections WHERE id = ?",
                new String[]{String.valueOf(id)});
        try {
            return c.moveToFirst() ? c.getString(0) : null;
        } finally {
            c.close();
        }
    }

    boolean renameCollection(long id, String name) {
        String clean = name == null ? "" : name.trim().replaceAll("\\s+", " ");
        if (clean.isEmpty()) return false;
        long other = collectionIdByName(clean);
        if (other > 0 && other != id) return false;
        ContentValues v = new ContentValues();
        v.put("name", clean.length() > 60 ? clean.substring(0, 60) : clean);
        v.put("updated_at", System.currentTimeMillis());
        v.put("dirty", 1);
        getWritableDatabase().update("collections", v, "id = ?", new String[]{String.valueOf(id)});
        localChange();
        return true;
    }

    /** Deletes a collection; its links return to the Inbox. */
    void deleteCollection(long id) {
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            long now = System.currentTimeMillis();
            ContentValues v = new ContentValues();
            v.putNull("collection_id");
            v.put("updated_at", now);
            v.put("dirty", 1);
            db.update("links", v, "collection_id = ?", new String[]{String.valueOf(id)});
            ContentValues s = new ContentValues();
            s.putNull("suggested_collection_id");
            s.put("updated_at", now);
            s.put("dirty", 1);
            db.update("links", s, "suggested_collection_id = ?", new String[]{String.valueOf(id)});
            tombstone(db, "collections", "collection", id);
            db.delete("collections", "id = ?", new String[]{String.valueOf(id)});
            db.setTransactionSuccessful();
        } finally {
            db.endTransaction();
        }
        localChange();
    }

    /**
     * Existing collections for the analysis prompt, each with a few titles the user has
     * already filed there, so suggestions learn from the user's own organization (FR-06).
     */
    JSONArray collectionsForPrompt(long excludeLinkId) {
        JSONArray out = new JSONArray();
        SQLiteDatabase db = getReadableDatabase();
        Cursor c = db.rawQuery("SELECT c.id, c.name, COUNT(l.id) AS n FROM collections c "
                + "LEFT JOIN links l ON l.collection_id = c.id "
                + "GROUP BY c.id ORDER BY n DESC LIMIT 40", null);
        try {
            while (c.moveToNext()) {
                JSONObject o = new JSONObject();
                long id = c.getLong(0);
                o.put("id", id);
                o.put("name", c.getString(1));
                JSONArray examples = new JSONArray();
                Cursor e = db.rawQuery("SELECT title FROM links WHERE collection_id = ? AND id != ? "
                                + "AND title IS NOT NULL ORDER BY updated_at DESC LIMIT 3",
                        new String[]{String.valueOf(id), String.valueOf(excludeLinkId)});
                try {
                    while (e.moveToNext()) examples.put(e.getString(0));
                } finally {
                    e.close();
                }
                o.put("examples", examples);
                out.put(o);
            }
        } catch (JSONException ignored) {
            // not reachable
        } finally {
            c.close();
        }
        return out;
    }

    // ------------------------------------------------------------- analysis

    void logRun(long linkId, String model, String promptVersion, String level, String status,
                String errorCode, long inTokens, long outTokens, long latencyMs) {
        ContentValues v = new ContentValues();
        v.put("link_id", linkId);
        v.put("model", model);
        v.put("prompt_version", promptVersion);
        v.put("source_level", level);
        v.put("status", status);
        v.put("error_code", errorCode);
        v.put("input_tokens", inTokens);
        v.put("output_tokens", outTokens);
        v.put("latency_ms", latencyMs);
        v.put("created_at", System.currentTimeMillis());
        getWritableDatabase().insert("analysis_runs", null, v);
    }

    /** Usage and quality figures for the Settings screen (PRD section 15). */
    JSONObject stats() {
        JSONObject o = new JSONObject();
        SQLiteDatabase db = getReadableDatabase();
        try {
            Cursor c = db.rawQuery("SELECT COUNT(*), "
                    + "SUM(CASE WHEN source_level = 'FULL' THEN 1 ELSE 0 END), "
                    + "SUM(CASE WHEN source_level = 'PARTIAL' THEN 1 ELSE 0 END), "
                    + "SUM(CASE WHEN source_level = 'UNAVAILABLE' THEN 1 ELSE 0 END), "
                    + "SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) FROM links", null);
            try {
                if (c.moveToFirst()) {
                    o.put("links", c.getLong(0));
                    o.put("full", c.getLong(1));
                    o.put("partial", c.getLong(2));
                    o.put("unavailable", c.getLong(3));
                    o.put("failed", c.getLong(4));
                }
            } finally {
                c.close();
            }
            JSONArray perModel = new JSONArray();
            Cursor r = db.rawQuery("SELECT model, COUNT(*), SUM(input_tokens), SUM(output_tokens), "
                    + "AVG(latency_ms) FROM analysis_runs WHERE status != 'error' GROUP BY model", null);
            try {
                while (r.moveToNext()) {
                    JSONObject m = new JSONObject();
                    m.put("model", r.getString(0));
                    m.put("runs", r.getLong(1));
                    m.put("input", r.getLong(2));
                    m.put("output", r.getLong(3));
                    m.put("avgMs", (long) r.getDouble(4));
                    perModel.put(m);
                }
            } finally {
                r.close();
            }
            o.put("models", perModel);
        } catch (JSONException ignored) {
            // not reachable
        }
        return o;
    }

    // --------------------------------------------------------- backup/reset

    JSONObject exportAll() throws JSONException {
        JSONObject o = new JSONObject();
        o.put("format", "savemind-backup");
        o.put("version", 1);
        o.put("exported_at", System.currentTimeMillis());
        o.put("collections", allCollections());
        o.put("links", allLinks());
        return o;
    }

    /** Merges a backup: collections by name, links skipped when the URL already exists. */
    int importAll(JSONObject backup) throws JSONException {
        if (!"savemind-backup".equals(backup.optString("format"))) {
            throw new JSONException("Not a SaveMind backup file");
        }
        SQLiteDatabase db = getWritableDatabase();
        JSONArray cols = backup.optJSONArray("collections");
        JSONArray links = backup.optJSONArray("links");
        java.util.HashMap<Long, Long> idMap = new java.util.HashMap<>();
        int added = 0;
        db.beginTransaction();
        try {
            if (cols != null) {
                for (int i = 0; i < cols.length(); i++) {
                    JSONObject c = cols.getJSONObject(i);
                    long newId = createCollectionNoNotify(db, c.optString("name"));
                    if (newId > 0) idMap.put(c.optLong("id"), newId);
                }
            }
            if (links != null) {
                for (int i = 0; i < links.length(); i++) {
                    JSONObject l = links.getJSONObject(i);
                    String url = l.optString("url", "");
                    if (UrlUtil.validate(url) == null) continue;
                    String norm = UrlUtil.normalize(url);
                    Cursor dup = db.rawQuery("SELECT 1 FROM links WHERE normalized_url = ?",
                            new String[]{norm});
                    boolean exists;
                    try {
                        exists = dup.moveToFirst();
                    } finally {
                        dup.close();
                    }
                    if (exists) continue;
                    ContentValues v = new ContentValues();
                    for (String col : LINK_COLUMNS) {
                        if (IMPORT_SKIP.contains(col) || !l.has(col) || l.isNull(col)) continue;
                        Object val = l.get(col);
                        if (col.equals("collection_id") || col.equals("suggested_collection_id")) {
                            Long mapped = idMap.get(l.optLong(col));
                            if (mapped != null) v.put(col, mapped);
                        } else if (val instanceof JSONArray) {
                            v.put(col, val.toString());
                        } else if (val instanceof Number) {
                            if (val instanceof Double || val instanceof Float) {
                                v.put(col, ((Number) val).doubleValue());
                            } else {
                                v.put(col, ((Number) val).longValue());
                            }
                        } else {
                            v.put(col, String.valueOf(val));
                        }
                    }
                    v.put("normalized_url", norm);
                    if (ST_PROCESSING.equals(v.getAsString("status"))) v.put("status", ST_QUEUED);
                    if (!v.containsKey("saved_at")) v.put("saved_at", System.currentTimeMillis());
                    if (!v.containsKey("updated_at")) v.put("updated_at", System.currentTimeMillis());
                    if (!v.containsKey("status")) v.put("status", ST_QUEUED);
                    v.put("uid", newUid());
                    v.put("origin", new Prefs(app).deviceId());
                    v.put("dirty", 1);
                    db.insert("links", null, v);
                    added++;
                }
            }
            db.setTransactionSuccessful();
        } finally {
            db.endTransaction();
        }
        localChange();
        return added;
    }

    private static long createCollectionNoNotify(SQLiteDatabase db, String name) {
        String clean = name == null ? "" : name.trim();
        if (clean.isEmpty()) return -1;
        Cursor c = db.rawQuery("SELECT id FROM collections WHERE name = ? COLLATE NOCASE LIMIT 1",
                new String[]{clean});
        try {
            if (c.moveToFirst()) return c.getLong(0);
        } finally {
            c.close();
        }
        long count = android.database.DatabaseUtils.queryNumEntries(db, "collections");
        ContentValues v = new ContentValues();
        v.put("name", clean);
        v.put("color", (int) (count % COLLECTION_COLORS));
        v.put("created_at", System.currentTimeMillis());
        v.put("updated_at", System.currentTimeMillis());
        v.put("uid", newUid());
        v.put("dirty", 1);
        return db.insert("collections", null, v);
    }

    void deleteAll() {
        SQLiteDatabase db = getWritableDatabase();
        long now = System.currentTimeMillis();
        db.execSQL("INSERT OR REPLACE INTO tombstones (uid, kind, deleted_at) "
                + "SELECT uid, 'link', ? FROM links WHERE uid IS NOT NULL", new Object[]{now});
        db.execSQL("INSERT OR REPLACE INTO tombstones (uid, kind, deleted_at) "
                + "SELECT uid, 'collection', ? FROM collections WHERE uid IS NOT NULL", new Object[]{now});
        db.delete("links", null, null);
        db.delete("collections", null, null);
        db.delete("analysis_runs", null, null);
        localChange();
    }

    // ------------------------------------------------------------------ sync

    /** One item ready to upload, with what is needed to mark it clean afterwards. */
    static final class Outgoing {
        final JSONObject item;
        final String table;
        final String uid;
        final long updatedAt;

        Outgoing(JSONObject item, String table, String uid, long updatedAt) {
            this.item = item;
            this.table = table;
            this.uid = uid;
            this.updatedAt = updatedAt;
        }
    }

    /** Local changes to upload: collections first, then links, then deletions. */
    java.util.List<Outgoing> outgoing() throws JSONException {
        java.util.List<Outgoing> out = new java.util.ArrayList<>();
        SQLiteDatabase db = getReadableDatabase();
        java.util.HashMap<Long, String> colUid = new java.util.HashMap<>();
        Cursor cc = db.rawQuery("SELECT id, uid, name, description, color, created_at, updated_at, dirty FROM collections", null);
        try {
            while (cc.moveToNext()) {
                colUid.put(cc.getLong(0), cc.getString(1));
                if (cc.getInt(7) == 0) continue;
                JSONObject data = new JSONObject();
                data.put("name", cc.getString(2));
                data.put("description", cc.isNull(3) ? JSONObject.NULL : cc.getString(3));
                data.put("color", cc.getInt(4));
                data.put("created_at", cc.getLong(5));
                long upd = cc.isNull(6) ? cc.getLong(5) : cc.getLong(6);
                out.add(new Outgoing(item(cc.getString(1), "collection", data, false, upd), "collections", cc.getString(1), upd));
            }
        } finally {
            cc.close();
        }
        Cursor c = db.query("links", LINK_COLUMNS, "dirty = 1", null, null, null, null);
        try {
            while (c.moveToNext()) {
                JSONObject row = linkRow(c);
                JSONObject data = new JSONObject();
                for (String f : SYNC_LINK_FIELDS) {
                    Object val = row.opt(f);
                    data.put(f, val == null ? JSONObject.NULL : val);
                }
                if ("processing".equals(row.optString("status"))) data.put("status", ST_QUEUED);
                data.put("collection", row.isNull("collection_id") ? JSONObject.NULL
                        : orNull(colUid.get(row.optLong("collection_id"))));
                data.put("suggested_collection", row.isNull("suggested_collection_id") ? JSONObject.NULL
                        : orNull(colUid.get(row.optLong("suggested_collection_id"))));
                String uid = row.optString("uid");
                long upd = row.optLong("updated_at");
                out.add(new Outgoing(item(uid, "link", data, false, upd), "links", uid, upd));
            }
        } finally {
            c.close();
        }
        Cursor t = db.rawQuery("SELECT uid, kind, deleted_at FROM tombstones", null);
        try {
            while (t.moveToNext()) {
                out.add(new Outgoing(item(t.getString(0), t.getString(1), new JSONObject(), true, t.getLong(2)),
                        "tombstones", t.getString(0), t.getLong(2)));
            }
        } finally {
            t.close();
        }
        return out;
    }

    private static Object orNull(Object o) {
        return o == null ? JSONObject.NULL : o;
    }

    private static JSONObject item(String uid, String kind, JSONObject data, boolean deleted, long updatedAt)
            throws JSONException {
        return new JSONObject().put("id", uid).put("kind", kind).put("data", data)
                .put("deleted", deleted).put("updated_at", updatedAt);
    }

    /** Marks an uploaded item clean, unless it changed again while uploading. */
    void markUploaded(Outgoing o) {
        SQLiteDatabase db = getWritableDatabase();
        if (o.table.equals("tombstones")) {
            db.delete("tombstones", "uid = ?", new String[]{o.uid});
        } else {
            ContentValues v = new ContentValues();
            v.put("dirty", 0);
            String col = o.table.equals("links") ? "updated_at" : "COALESCE(updated_at, created_at)";
            db.update(o.table, v, "uid = ? AND " + col + " = ?", new String[]{o.uid, String.valueOf(o.updatedAt)});
        }
    }

    /** After signing in: upload everything this device has. */
    void markAllDirty() {
        SQLiteDatabase db = getWritableDatabase();
        db.execSQL("UPDATE links SET dirty = 1");
        db.execSQL("UPDATE collections SET dirty = 1");
    }

    /**
     * Applies one item downloaded from the server when it is newer than the local copy.
     * Returns the local link id when a link changed (for reminders), 0 for other changes, -1 for none.
     */
    long applyRemote(JSONObject it) throws JSONException {
        SQLiteDatabase db = getWritableDatabase();
        String uid = it.getString("id");
        String kind = it.optString("kind");
        boolean deleted = it.optBoolean("deleted");
        long updatedAt = it.optLong("updated_at");
        JSONObject data = it.optJSONObject("data");
        if (data == null) data = new JSONObject();
        String table = "collection".equals(kind) ? "collections" : "links";

        long localId = -1;
        long localUpdated = -1;
        Cursor c = db.rawQuery("SELECT id, " + ("links".equals(table) ? "updated_at" : "COALESCE(updated_at, created_at)")
                + " FROM " + table + " WHERE uid = ?", new String[]{uid});
        try {
            if (c.moveToFirst()) {
                localId = c.getLong(0);
                localUpdated = c.getLong(1);
            }
        } finally {
            c.close();
        }

        if (deleted) {
            if (localId < 0) return -1;
            if ("collections".equals(table)) {
                ContentValues v = new ContentValues();
                v.putNull("collection_id");
                db.update("links", v, "collection_id = ?", new String[]{String.valueOf(localId)});
                ContentValues sv = new ContentValues();
                sv.putNull("suggested_collection_id");
                db.update("links", sv, "suggested_collection_id = ?", new String[]{String.valueOf(localId)});
            } else {
                db.delete("analysis_runs", "link_id = ?", new String[]{String.valueOf(localId)});
            }
            db.delete(table, "id = ?", new String[]{String.valueOf(localId)});
            return "links".equals(table) ? localId : 0;
        }
        if (localId >= 0 && localUpdated >= updatedAt) return -1;

        ContentValues v = new ContentValues();
        v.put("uid", uid);
        v.put("dirty", 0);
        if ("collections".equals(table)) {
            v.put("name", data.optString("name", "Untitled"));
            v.put("description", data.isNull("description") ? null : data.optString("description"));
            v.put("color", data.optInt("color"));
            v.put("created_at", data.optLong("created_at", updatedAt));
            v.put("updated_at", updatedAt);
            if (localId >= 0) {
                db.update(table, v, "id = ?", new String[]{String.valueOf(localId)});
            } else {
                db.insert(table, null, v);
            }
            return 0;
        }

        for (String f : SYNC_LINK_FIELDS) {
            if (!data.has(f) || data.isNull(f)) {
                if (f.equals("tags") || f.equals("steps") || f.equals("countries") || f.equals("ref_links")) v.put(f, "[]");
                else if (isNotNullInt(f)) v.put(f, 0);
                else v.putNull(f);
                continue;
            }
            Object val = data.get(f);
            if (val instanceof JSONArray || val instanceof JSONObject) v.put(f, val.toString());
            else if (val instanceof Boolean) v.put(f, ((Boolean) val) ? 1 : 0);
            else if (val instanceof Double || val instanceof Float) v.put(f, ((Number) val).doubleValue());
            else if (val instanceof Number) v.put(f, ((Number) val).longValue());
            else v.put(f, String.valueOf(val));
        }
        if (v.getAsString("url") == null) return -1;
        if (v.getAsString("status") == null) v.put("status", ST_QUEUED);
        if (v.getAsLong("saved_at") == null) v.put("saved_at", updatedAt);
        v.put("normalized_url", UrlUtil.normalize(v.getAsString("url")));
        v.put("updated_at", updatedAt);
        Long col = localCollectionId(db, data.optString("collection", null));
        if (col != null) v.put("collection_id", col); else v.putNull("collection_id");
        Long sug = localCollectionId(db, data.optString("suggested_collection", null));
        if (sug != null) v.put("suggested_collection_id", sug); else v.putNull("suggested_collection_id");
        if (localId >= 0) {
            db.update("links", v, "id = ?", new String[]{String.valueOf(localId)});
            return localId;
        }
        return db.insert("links", null, v);
    }

    private static boolean isNotNullInt(String f) {
        switch (f) {
            case "reviewed": case "favorite": case "archived": case "title_locked": case "tags_locked":
            case "action_locked": case "deadline_has_time": case "deadline_locked": case "remind_days":
            case "effort_locked": case "steps_locked": case "countries_locked":
                return true;
            default:
                return false;
        }
    }

    private static Long localCollectionId(SQLiteDatabase db, String uid) {
        if (uid == null || uid.isEmpty() || "null".equals(uid)) return null;
        Cursor c = db.rawQuery("SELECT id FROM collections WHERE uid = ?", new String[]{uid});
        try {
            return c.moveToFirst() ? c.getLong(0) : null;
        } finally {
            c.close();
        }
    }

    static String emptyToNull(String s) {
        if (s == null) return null;
        String t = s.trim();
        return t.isEmpty() ? null : t;
    }

    static String lower(String s) {
        return s == null ? "" : s.toLowerCase(Locale.ROOT);
    }
}
