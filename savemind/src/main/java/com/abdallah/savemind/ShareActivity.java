package com.abdallah.savemind;

import android.app.Activity;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.inputmethod.InputMethodManager;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ImageView;
import android.widget.TextView;

import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * Share target (FR-01). The link is saved before anything else happens, a small sheet confirms
 * it, and the user goes straight back to the app they were in. Analysis runs in the background.
 */
public class ShareActivity extends Activity {

    private long savedId = -1;
    private long duplicateId = -1;
    private String pendingUrl;
    private String pendingShared;
    private String pendingSource;
    private EditText note;
    private boolean noteOpen;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_share);

        findViewById(R.id.share_root).setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                finishSheet();
            }
        });
        note = (EditText) findViewById(R.id.note);

        if (savedInstanceState != null) {
            savedId = savedInstanceState.getLong("savedId", -1);
        }

        Intent intent = getIntent();
        String text = intent.getStringExtra(Intent.EXTRA_TEXT);
        String subject = intent.getStringExtra(Intent.EXTRA_SUBJECT);
        String url = UrlUtil.findUrl(text);
        if (url == null) url = UrlUtil.findUrl(subject);
        url = UrlUtil.validate(url);

        if (url == null) {
            showNoLink();
            return;
        }

        pendingUrl = url;
        pendingShared = sharedContext(text, subject, url);
        pendingSource = sourceApp();
        bindLink(url, pendingSource);

        if (savedId > 0) {
            showSaved();
            return;
        }

        JSONObject dup = Db.get(this).findDuplicate(url);
        if (dup != null) {
            duplicateId = dup.optLong("id");
            showDuplicate(dup);
        } else {
            save();
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        outState.putLong("savedId", savedId);
    }

    private void save() {
        savedId = Db.get(this).insertLink(pendingUrl, pendingShared, pendingSource, null);
        Analyzer.kick(this);
        showSaved();
    }

    private void showSaved() {
        ((TextView) findViewById(R.id.title)).setText(R.string.saved_title);
        ((TextView) findViewById(R.id.subtitle)).setText(R.string.saved_sub);
        findViewById(R.id.chip).setVisibility(View.VISIBLE);
        Button secondary = (Button) findViewById(R.id.secondary);
        Button primary = (Button) findViewById(R.id.primary);
        secondary.setText(R.string.add_note);
        primary.setText(R.string.done);
        secondary.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                toggleNote();
            }
        });
        primary.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                finishSheet();
            }
        });
    }

    private void showDuplicate(JSONObject dup) {
        ImageView tile = (ImageView) findViewById(R.id.tile);
        tile.setBackgroundResource(R.drawable.bg_tile_warn);
        tile.setImageResource(R.drawable.ic_info);
        ((TextView) findViewById(R.id.title)).setText(R.string.dup_title);
        String when = new SimpleDateFormat("d MMM", Locale.getDefault()).format(new Date(dup.optLong("savedAt")));
        String where = dup.isNull("collection") ? "Inbox" : dup.optString("collection");
        ((TextView) findViewById(R.id.subtitle)).setText("Saved " + when + " in " + where);
        findViewById(R.id.chip).setVisibility(View.GONE);
        Button secondary = (Button) findViewById(R.id.secondary);
        Button primary = (Button) findViewById(R.id.primary);
        secondary.setText(R.string.view_existing);
        primary.setText(R.string.save_copy);
        secondary.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                openInApp(duplicateId);
            }
        });
        primary.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                ImageView t = (ImageView) findViewById(R.id.tile);
                t.setBackgroundResource(R.drawable.bg_tile);
                t.setImageResource(R.drawable.ic_check);
                save();
            }
        });
    }

    private void showNoLink() {
        ImageView tile = (ImageView) findViewById(R.id.tile);
        tile.setBackgroundResource(R.drawable.bg_tile_warn);
        tile.setImageResource(R.drawable.ic_info);
        ((TextView) findViewById(R.id.title)).setText(R.string.no_link_title);
        ((TextView) findViewById(R.id.subtitle)).setText(R.string.no_link_sub);
        findViewById(R.id.link_card).setVisibility(View.GONE);
        findViewById(R.id.secondary).setVisibility(View.GONE);
        Button primary = (Button) findViewById(R.id.primary);
        primary.setText(R.string.done);
        primary.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                finish();
            }
        });
    }

    private void bindLink(String url, String source) {
        String domain = UrlUtil.domain(url);
        ((TextView) findViewById(R.id.source)).setText(
                source == null ? domain : domain + " · shared from " + source);
        String shown = url.replaceFirst("^https?://(www\\.)?", "");
        ((TextView) findViewById(R.id.url)).setText(shown);
    }

    private void toggleNote() {
        noteOpen = !noteOpen;
        note.setVisibility(noteOpen ? View.VISIBLE : View.GONE);
        InputMethodManager imm = (InputMethodManager) getSystemService(INPUT_METHOD_SERVICE);
        if (noteOpen) {
            note.requestFocus();
            if (imm != null) imm.showSoftInput(note, InputMethodManager.SHOW_IMPLICIT);
            ((Button) findViewById(R.id.secondary)).setText("Hide note");
        } else {
            if (imm != null) imm.hideSoftInputFromWindow(note.getWindowToken(), 0);
            ((Button) findViewById(R.id.secondary)).setText(R.string.add_note);
        }
    }

    private void finishSheet() {
        if (savedId > 0) {
            String text = note.getText().toString().trim();
            if (!text.isEmpty()) {
                ContentValues v = new ContentValues();
                v.put("notes", text);
                Db.get(this).updateLink(savedId, v);
            }
        }
        finish();
    }

    private void openInApp(long id) {
        Intent i = new Intent(this, MainActivity.class);
        i.putExtra(MainActivity.EXTRA_ROUTE, "#/link/" + id);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        startActivity(i);
        finish();
    }

    /** Text shared along with the link (often the post text or page title), minus the URL. */
    private static String sharedContext(String text, String subject, String url) {
        StringBuilder sb = new StringBuilder();
        if (subject != null && !subject.trim().isEmpty() && (text == null || !text.contains(subject.trim()))) {
            sb.append(subject.trim());
        }
        if (text != null) {
            String rest = text.replace(url, " ");
            String bare = url.replaceFirst("^https?://", "");
            rest = rest.replace(bare, " ").replaceAll("https?://\\S+", " ").replaceAll("\\s+", " ").trim();
            if (!rest.isEmpty()) {
                if (sb.length() > 0) sb.append("\n");
                sb.append(rest);
            }
        }
        String out = sb.toString().trim();
        return out.length() > 4000 ? out.substring(0, 4000) : out;
    }

    private String sourceApp() {
        try {
            Uri ref = getReferrer();
            if (ref != null && "android-app".equals(ref.getScheme())) {
                String pkg = ref.getHost();
                if (getPackageName().equals(pkg)) return "SaveMind";
                String name = UrlUtil.appName(pkg);
                if (name != null) return name;
                if (pkg != null) {
                    CharSequence label = getPackageManager().getApplicationLabel(
                            getPackageManager().getApplicationInfo(pkg, 0));
                    if (label != null && label.length() > 0) return label.toString();
                }
            }
        } catch (Exception ignored) {
            // The sending app is optional information.
        }
        return null;
    }
}
