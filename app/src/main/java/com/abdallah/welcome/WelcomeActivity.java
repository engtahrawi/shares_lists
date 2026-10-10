package com.abdallah.welcome;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;

public class WelcomeActivity extends Activity {
    private static final long WELCOME_DURATION_MS = 1500;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable openHome = this::openHome;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_welcome);
        findViewById(R.id.welcome_root).setOnClickListener(v -> openHome());
    }

    @Override
    protected void onResume() {
        super.onResume();
        handler.postDelayed(openHome, WELCOME_DURATION_MS);
    }

    @Override
    protected void onPause() {
        super.onPause();
        handler.removeCallbacks(openHome);
    }

    private void openHome() {
        handler.removeCallbacks(openHome);
        startActivity(new Intent(this, HomeActivity.class));
        finish();
    }
}
