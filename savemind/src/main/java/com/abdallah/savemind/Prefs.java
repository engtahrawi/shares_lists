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
