package com.abdallah.savemind;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** App settings. The Claude API key is encrypted with a hardware-backed Android Keystore key. */
final class Prefs {

    static final String MODEL_OPUS = "claude-opus-5-5";
    static final String MODEL_SONNET = "claude-sonnet-5-5";
    static final String MODEL_HAIKU = "claude-haiku-5-5";

    private static final String FILE = "savemind_settings";
    private static final String KEY_ALIAS = "savemind_api_key";
    private static final String ANDROID_KEYSTORE = "AndroidKeyStore";

    private final SharedPreferences sp;

    Prefs(Context context) {
        sp = context.getApplicationContext().getSharedPreferences(FILE, Context.MODE_PRIVATE);
    }

    String name() {
        return sp.getString("name", "Abdallah");
    }

    String model() {
        String m = sp.getString("model", MODEL_OPUS);
        if (!MODEL_OPUS.equals(m) && !MODEL_SONNET.equals(m) && !MODEL_HAIKU.equals(m)) return MODEL_OPUS;
        return m;
    }

    /** "auto" (match the source), "en" or "ar". */
    String briefLanguage() {
        return sp.getString("lang", "auto");
    }

    /** When true, confident matches to existing collections are filed without review. */
    boolean autoFile() {
        return sp.getBoolean("autoFile", false);
    }

    void save(String name, String model, String lang, boolean autoFile) {
        sp.edit()
                .putString("name", name)
                .putString("model", model)
                .putString("lang", lang)
                .putBoolean("autoFile", autoFile)
                .apply();
    }

    boolean hasApiKey() {
        return sp.contains("apiKeyEnc");
    }

    /** A random id for this installation; links saved here are analyzed here. */
    synchronized String deviceId() {
        String id = sp.getString("deviceId", null);
        if (id == null) {
            id = java.util.UUID.randomUUID().toString();
            sp.edit().putString("deviceId", id).commit();
        }
        return id;
    }

    // ------------------------------------------------------------ account

    boolean signedIn() {
        return sp.contains("refreshEnc") && sp.contains("userId");
    }

    String accountEmail() {
        return sp.getString("email", "");
    }

    String userId() {
        return sp.getString("userId", null);
    }

    String accessToken() {
        return sp.getString("accessToken", null);
    }

    long accessExpiresAt() {
        return sp.getLong("accessExpires", 0);
    }

    String refreshToken() {
        return decrypt(sp.getString("refreshEnc", null), sp.getString("refreshIv", null));
    }

    void saveSession(String email, String userId, String access, long expiresAt, String refresh) {
        String[] enc = encrypt(refresh);
        SharedPreferences.Editor e = sp.edit()
                .putString("accessToken", access)
                .putLong("accessExpires", expiresAt);
        if (email != null) e.putString("email", email);
        if (userId != null) e.putString("userId", userId);
        if (enc != null) e.putString("refreshEnc", enc[0]).putString("refreshIv", enc[1]);
        e.commit();
    }

    void clearSession() {
        sp.edit().remove("accessToken").remove("accessExpires").remove("refreshEnc").remove("refreshIv")
                .remove("userId").remove("lastSeq").remove("lastSync").remove("syncError").commit();
    }

    long lastSeq() {
        return sp.getLong("lastSeq", 0);
    }

    void setLastSeq(long seq) {
        sp.edit().putLong("lastSeq", seq).apply();
    }

    long lastSync() {
        return sp.getLong("lastSync", 0);
    }

    void setSyncResult(long when, String error) {
        SharedPreferences.Editor e = sp.edit();
        if (when > 0) e.putLong("lastSync", when);
        if (error == null) e.remove("syncError"); else e.putString("syncError", error);
        e.apply();
    }

    String syncError() {
        return sp.getString("syncError", null);
    }

    private static String[] encrypt(String plain) {
        if (plain == null) return null;
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, secretKey());
            byte[] enc = cipher.doFinal(plain.getBytes(StandardCharsets.UTF_8));
            return new String[]{Base64.encodeToString(enc, Base64.NO_WRAP),
                    Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP)};
        } catch (Exception e) {
            return null;
        }
    }

    private static String decrypt(String enc, String iv) {
        if (enc == null || iv == null) return null;
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, secretKey(), new GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP)));
            return new String(cipher.doFinal(Base64.decode(enc, Base64.NO_WRAP)), StandardCharsets.UTF_8);
        } catch (Exception e) {
            return null;
        }
    }

    String apiKey() {
        String enc = sp.getString("apiKeyEnc", null);
        String iv = sp.getString("apiKeyIv", null);
        if (enc == null || iv == null) return null;
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, secretKey(),
                    new GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP)));
            byte[] plain = cipher.doFinal(Base64.decode(enc, Base64.NO_WRAP));
            return new String(plain, StandardCharsets.UTF_8);
        } catch (Exception e) {
            return null;
        }
    }

    boolean setApiKey(String key) {
        if (key == null || key.trim().isEmpty()) {
            sp.edit().remove("apiKeyEnc").remove("apiKeyIv").remove("apiKeyHint").apply();
            return true;
        }
        String k = key.trim();
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, secretKey());
            byte[] enc = cipher.doFinal(k.getBytes(StandardCharsets.UTF_8));
            String hint = k.length() > 8 ? k.substring(0, 7) + "…" + k.substring(k.length() - 4) : "set";
            sp.edit()
                    .putString("apiKeyEnc", Base64.encodeToString(enc, Base64.NO_WRAP))
                    .putString("apiKeyIv", Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP))
                    .putString("apiKeyHint", hint)
                    .apply();
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    String apiKeyHint() {
        return sp.getString("apiKeyHint", "");
    }

    private static SecretKey secretKey() throws Exception {
        KeyStore ks = KeyStore.getInstance(ANDROID_KEYSTORE);
        ks.load(null);
        if (ks.containsAlias(KEY_ALIAS)) {
            return ((KeyStore.SecretKeyEntry) ks.getEntry(KEY_ALIAS, null)).getSecretKey();
        }
        KeyGenerator gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE);
        gen.init(new KeyGenParameterSpec.Builder(KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build());
        return gen.generateKey();
    }
}
