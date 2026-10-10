package com.abdallah.welcome;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.text.Editable;
import android.text.TextWatcher;
import android.text.format.DateUtils;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.BaseAdapter;
import android.widget.EditText;
import android.widget.ListView;
import android.widget.TextView;
import android.widget.Toast;

import java.util.ArrayList;
import java.util.List;

/** One page listing every link shared into the app. */
public class HomeActivity extends Activity {
    private LinkStore store;
    private LinkAdapter adapter;
    private EditText search;
    private TextView count;
    private View empty;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_home);
        store = new LinkStore(this);
        adapter = new LinkAdapter();
        search = findViewById(R.id.search);
        count = findViewById(R.id.count);
        empty = findViewById(R.id.empty);

        ListView list = findViewById(R.id.links);
        list.setAdapter(adapter);
        list.setOnItemClickListener((parent, view, position, id) -> open(adapter.getItem(position)));
        list.setOnItemLongClickListener((parent, view, position, id) -> {
            showActions(adapter.getItem(position));
            return true;
        });

        search.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int a, int b, int c) { }
            @Override public void onTextChanged(CharSequence s, int a, int b, int c) { reload(); }
            @Override public void afterTextChanged(Editable s) { }
        });
    }

    @Override
    protected void onResume() {
        super.onResume();
        reload();
    }

    private void reload() {
        String query = search.getText().toString();
        adapter.setLinks(store.all(query));
        int total = adapter.getCount();
        count.setText(getResources().getQuantityString(R.plurals.link_count, total, total));
        empty.setVisibility(total == 0 && query.trim().isEmpty() ? View.VISIBLE : View.GONE);
    }

    private void open(Link link) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(link.url)));
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, R.string.cannot_open, Toast.LENGTH_SHORT).show();
        }
    }

    private void showActions(Link link) {
        String[] actions = {
                getString(R.string.action_open),
                getString(R.string.action_share),
                getString(R.string.action_copy),
                getString(R.string.action_delete)
        };
        new AlertDialog.Builder(this)
                .setTitle(link.title != null ? link.title : link.url)
                .setItems(actions, (dialog, which) -> {
                    switch (which) {
                        case 0: open(link); break;
                        case 1: share(link); break;
                        case 2: copy(link); break;
                        case 3: confirmDelete(link); break;
                    }
                })
                .show();
    }

    private void share(Link link) {
        Intent send = new Intent(Intent.ACTION_SEND)
                .setType("text/plain")
                .putExtra(Intent.EXTRA_TEXT, link.url);
        startActivity(Intent.createChooser(send, getString(R.string.action_share)));
    }

    private void copy(Link link) {
        ClipboardManager clipboard = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
        clipboard.setPrimaryClip(ClipData.newPlainText("link", link.url));
        Toast.makeText(this, R.string.copied, Toast.LENGTH_SHORT).show();
    }

    private void confirmDelete(Link link) {
        new AlertDialog.Builder(this)
                .setMessage(R.string.delete_confirm)
                .setPositiveButton(R.string.action_delete, (d, w) -> {
                    store.delete(link.id);
                    reload();
                })
                .setNegativeButton(android.R.string.cancel, null)
                .show();
    }

    private class LinkAdapter extends BaseAdapter {
        private List<Link> links = new ArrayList<>();

        void setLinks(List<Link> links) {
            this.links = links;
            notifyDataSetChanged();
        }

        @Override public int getCount() { return links.size(); }
        @Override public Link getItem(int position) { return links.get(position); }
        @Override public long getItemId(int position) { return links.get(position).id; }

        @Override
        public View getView(int position, View convertView, ViewGroup parent) {
            View row = convertView != null ? convertView
                    : LayoutInflater.from(HomeActivity.this).inflate(R.layout.item_link, parent, false);
            Link link = getItem(position);
            Uri uri = Uri.parse(link.url);
            String host = uri.getHost() != null ? uri.getHost().replaceFirst("^www\\.", "") : link.url;

            ((TextView) row.findViewById(R.id.badge)).setText(host.substring(0, 1).toUpperCase());
            ((TextView) row.findViewById(R.id.title)).setText(link.title != null ? link.title : host);
            ((TextView) row.findViewById(R.id.url)).setText(link.url);

            CharSequence when = DateUtils.getRelativeTimeSpanString(link.savedAt,
                    System.currentTimeMillis(), DateUtils.MINUTE_IN_MILLIS);
            String meta = link.source != null
                    ? getString(R.string.meta_with_source, link.source, when)
                    : when.toString();
            ((TextView) row.findViewById(R.id.meta)).setText(meta);
            return row;
        }
    }
}
