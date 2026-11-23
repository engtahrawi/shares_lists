package com.abdallah.savemind;

/** The Supabase project SaveMind syncs through. The anon key is public by design (Row Level Security protects data). */
final class SyncConfig {
    static final String URL = "https://cxnyhdphmfzsylnwadxp.supabase.co";
    static final String ANON_KEY = "SUPABASE_ANON_KEY";

    private SyncConfig() {}

    static boolean configured() {
        return ANON_KEY.length() > 40;
    }
}
