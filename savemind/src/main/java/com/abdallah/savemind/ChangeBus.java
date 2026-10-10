package com.abdallah.savemind;

import android.os.Handler;
import android.os.Looper;

import java.util.concurrent.CopyOnWriteArrayList;

/** Notifies open screens on the main thread when stored data changes. Bursts are coalesced. */
final class ChangeBus {

    private static final CopyOnWriteArrayList<Runnable> LISTENERS = new CopyOnWriteArrayList<>();
    private static final Handler MAIN = new Handler(Looper.getMainLooper());
    private static boolean pending;

    private static final Runnable DISPATCH = new Runnable() {
        @Override
        public void run() {
            synchronized (ChangeBus.class) {
                pending = false;
            }
            for (Runnable r : LISTENERS) r.run();
        }
    };

    private ChangeBus() {}

    static void add(Runnable listener) {
        LISTENERS.add(listener);
    }

    static void remove(Runnable listener) {
        LISTENERS.remove(listener);
    }

    static void post() {
        synchronized (ChangeBus.class) {
            if (pending) return;
            pending = true;
        }
        MAIN.postDelayed(DISPATCH, 120);
    }
}
