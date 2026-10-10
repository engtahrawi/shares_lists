package com.abdallah.welcome;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.util.Patterns;
import android.widget.Toast;

import java.util.regex.Matcher;

/** Saves a link shared from another app and immediately returns to that app. */
public class ShareReceiverActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Intent intent = getIntent();
        if (Intent.ACTION_SEND.equals(intent.getAction())) {
            handleShare(intent);
        }
        finish();
    }

    private void handleShare(Intent intent) {
        String text = intent.getStringExtra(Intent.EXTRA_TEXT);
        String url = extractUrl(text);
        if (url == null) {
            Toast.makeText(this, R.string.no_link_found, Toast.LENGTH_SHORT).show();
            return;
        }
        String title = intent.getStringExtra(Intent.EXTRA_SUBJECT);
        if (title == null || title.trim().isEmpty()) {
            title = textWithoutUrl(text, url);
        }
        boolean isNew = new LinkStore(this).save(url, title, sourceAppName());
        Toast.makeText(this, isNew ? R.string.link_saved : R.string.link_already_saved,
                Toast.LENGTH_SHORT).show();
    }

    private static String extractUrl(String text) {
        if (text == null) return null;
        Matcher m = Patterns.WEB_URL.matcher(text);
        while (m.find()) {
            String candidate = m.group();
            if (candidate.startsWith("http://") || candidate.startsWith("https://")) {
                return candidate;
            }
        }
        m.reset();
        if (m.find()) return "https://" + m.group();
        return null;
    }

    private static String textWithoutUrl(String text, String url) {
        String rest = text.replace(url, "").trim();
        return rest.isEmpty() ? null : rest;
    }

    private String sourceAppName() {
        Uri referrer = getReferrer();
        if (referrer == null || !"android-app".equals(referrer.getScheme())) return null;
        String pkg = referrer.getHost();
        if (pkg == null || pkg.equals(getPackageName())) return null;
        try {
            PackageManager pm = getPackageManager();
            ApplicationInfo info = pm.getApplicationInfo(pkg, 0);
            return pm.getApplicationLabel(info).toString();
        } catch (PackageManager.NameNotFoundException e) {
            return null;
        }
    }
}
