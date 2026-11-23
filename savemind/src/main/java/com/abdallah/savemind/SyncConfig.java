package com.abdallah.savemind;

/** The Supabase project SaveMind syncs through. The publishable key is public by design (Row Level Security protects data). */
final class SyncConfig {
    static final String URL = "https://cxnyhdphmfzsylnwadxp.supabase.co";
    static final String ANON_KEY = "sb_publishable_mKL3GPWeKPRmCAMtNQsH8w_1tB4B-cH";

    private SyncConfig() {}

    static boolean configured() {
        return ANON_KEY.length() > 30;
    }
}
