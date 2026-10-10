package com.abdallah.welcome;

public class Link {
    public final long id;
    public final String url;
    public final String title;
    public final String source;
    public final long savedAt;

    public Link(long id, String url, String title, String source, long savedAt) {
        this.id = id;
        this.url = url;
        this.title = title;
        this.source = source;
        this.savedAt = savedAt;
    }
}
