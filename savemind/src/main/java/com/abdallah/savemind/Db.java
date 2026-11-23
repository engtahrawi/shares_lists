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
            "effort_locked", "steps", "steps_locked"
    };

    private static Db instance;

    static synchronized Db get(Context context) {
        if (instance == null) instance = new Db(context.getApplicationContext());
        return instance;
    }

    private Db(Context context) {
        super(context, "savemind.db", null, 3);
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
        long id = getWritableDatabase().insert("links", null, v);
        ChangeBus.post();
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
            String steps = o.optString("steps", "[]");
            try {
                o.put("steps", new JSONArray(steps));
            } catch (JSONException e) {
                o.put("steps", new JSONArray());
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
        getWritableDatabase().update("links", v, "id = ?", new String[]{String.valueOf(id)});
        ChangeBus.post();
    }

    void deleteLink(long id) {
        SQLiteDatabase db = getWritableDatabase();
        db.delete("links", "id = ?", new String[]{String.valueOf(id)});
        db.delete("analysis_runs", "link_id = ?", new String[]{String.valueOf(id)});
        ChangeBus.post();
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
                "SELECT MIN(next_attempt_at) FROM links WHERE status = ?", new String[]{ST_QUEUED});
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
        v.put("status", ST_QUEUED);
        v.put("attempts", 0);
        v.put("next_attempt_at", 0);
        v.putNull("error");
        int n = getWritableDatabase().update("links", v,
                "deadline_at IS NOT NULL AND deadline_at > ? AND effort_days IS NULL AND archived = 0 "
                        + "AND status IN ('analyzed', 'partial', 'failed')",
                new String[]{String.valueOf(System.currentTimeMillis())});
        if (n > 0) ChangeBus.post();
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
        long id = db.insert("collections", null, v);
        ChangeBus.post();
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
        getWritableDatabase().update("collections", v, "id = ?", new String[]{String.valueOf(id)});
        ChangeBus.post();
        return true;
    }

    /** Deletes a collection; its links return to the Inbox. */
    void deleteCollection(long id) {
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            ContentValues v = new ContentValues();
            v.putNull("collection_id");
            db.update("links", v, "collection_id = ?", new String[]{String.valueOf(id)});
            ContentValues s = new ContentValues();
            s.putNull("suggested_collection_id");
            db.update("links", s, "suggested_collection_id = ?", new String[]{String.valueOf(id)});
            db.delete("collections", "id = ?", new String[]{String.valueOf(id)});
            db.setTransactionSuccessful();
        } finally {
            db.endTransaction();
        }
        ChangeBus.post();
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
                        if (col.equals("id") || !l.has(col) || l.isNull(col)) continue;
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
                    db.insert("links", null, v);
                    added++;
                }
            }
            db.setTransactionSuccessful();
        } finally {
            db.endTransaction();
        }
        ChangeBus.post();
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
        return db.insert("collections", null, v);
    }

    void deleteAll() {
        SQLiteDatabase db = getWritableDatabase();
        db.delete("links", null, null);
        db.delete("collections", null, null);
        db.delete("analysis_runs", null, null);
        ChangeBus.post();
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
