package com.abdallah.welcome;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

import java.util.ArrayList;
import java.util.List;

/** SQLite storage for saved links. Sharing the same URL again moves it back to the top. */
public class LinkStore extends SQLiteOpenHelper {
    private static final String DB_NAME = "links.db";
    private static final int DB_VERSION = 1;
    private static final String TABLE = "links";

    public LinkStore(Context context) {
        super(context.getApplicationContext(), DB_NAME, null, DB_VERSION);
    }

    @Override
    public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE " + TABLE + " ("
                + "id INTEGER PRIMARY KEY AUTOINCREMENT, "
                + "url TEXT NOT NULL UNIQUE, "
                + "title TEXT, "
                + "source TEXT, "
                + "saved_at INTEGER NOT NULL)");
    }

    @Override
    public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
    }

    /** Returns true when the link is new, false when an existing one was refreshed. */
    public boolean save(String url, String title, String source) {
        SQLiteDatabase db = getWritableDatabase();
        ContentValues values = new ContentValues();
        values.put("saved_at", System.currentTimeMillis());
        if (title != null) values.put("title", title);
        if (source != null) values.put("source", source);
        int updated = db.update(TABLE, values, "url = ?", new String[]{url});
        if (updated > 0) return false;
        values.put("url", url);
        db.insert(TABLE, null, values);
        return true;
    }

    public void delete(long id) {
        getWritableDatabase().delete(TABLE, "id = ?", new String[]{String.valueOf(id)});
    }

    public List<Link> all(String query) {
        String where = null;
        String[] args = null;
        if (query != null && !query.trim().isEmpty()) {
            String like = "%" + query.trim() + "%";
            where = "url LIKE ? OR title LIKE ? OR source LIKE ?";
            args = new String[]{like, like, like};
        }
        List<Link> links = new ArrayList<>();
        try (Cursor c = getReadableDatabase().query(TABLE,
                new String[]{"id", "url", "title", "source", "saved_at"},
                where, args, null, null, "saved_at DESC")) {
            while (c.moveToNext()) {
                links.add(new Link(c.getLong(0), c.getString(1), c.getString(2),
                        c.getString(3), c.getLong(4)));
            }
        }
        return links;
    }
}
