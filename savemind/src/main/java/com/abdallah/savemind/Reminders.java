package com.abdallah.savemind;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.content.ComponentName;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.PersistableBundle;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Calendar;

/** Deadline reminders: one scheduled job per link, firing at 9:00 on the chosen day before the deadline. */
final class Reminders {

    static final String CHANNEL = "deadlines";
    private static final int JOB_BASE = 100_000;
    private static final long DAY = 24L * 60 * 60 * 1000;

    private Reminders() {}

    /** Schedules, reschedules or cancels the reminder for one link to match its current fields. */
    static void schedule(Context context, JSONObject link) {
        if (link == null) return;
        JobScheduler js = (JobScheduler) context.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        if (js == null) return;
        long id = link.optLong("id");
        int jobId = (int) (JOB_BASE + id);
        long fireAt = fireTime(link);
        if (fireAt < 0) {
            js.cancel(jobId);
            return;
        }
        PersistableBundle extras = new PersistableBundle();
        extras.putLong("linkId", id);
        JobInfo.Builder b = new JobInfo.Builder(jobId, new ComponentName(context, ReminderJobService.class))
                .setPersisted(true)
                .setExtras(extras)
                .setMinimumLatency(Math.max(0, fireAt - System.currentTimeMillis()));
        try {
            js.schedule(b.build());
        } catch (RuntimeException ignored) {
            // A reminder is best effort; the deadline still shows in the app.
        }
    }

    /** Re-applies every pending reminder, e.g. after an import. */
    static void scheduleAll(Context context) {
        JSONArray links = Db.get(context).pendingReminders();
        for (int i = 0; i < links.length(); i++) schedule(context, links.optJSONObject(i));
    }

    /** When the reminder should fire, or -1 when there is nothing to remind about. */
    static long fireTime(JSONObject link) {
        if (link.isNull("deadline_at")) return -1;
        int days = (int) link.optLong("remind_days");
        if (days <= 0 || link.optLong("reminded") == 1 || link.optLong("archived") == 1) return -1;
        long deadline = link.optLong("deadline_at");
        if (deadline <= System.currentTimeMillis()) return -1;
        Calendar c = Calendar.getInstance();
        c.setTimeInMillis(deadline);
        c.add(Calendar.DAY_OF_MONTH, -days);
        c.set(Calendar.HOUR_OF_DAY, 9);
        c.set(Calendar.MINUTE, 0);
        c.set(Calendar.SECOND, 0);
        c.set(Calendar.MILLISECOND, 0);
        return c.getTimeInMillis();
    }

    /** Shows the notification for a link if it is still due, then marks it as sent. */
    static void fire(Context context, long linkId) {
        Db db = Db.get(context);
        JSONObject link = db.getLink(linkId);
        if (link == null || link.isNull("deadline_at") || link.optLong("remind_days") <= 0
                || link.optLong("reminded") == 1 || link.optLong("archived") == 1) {
            return;
        }
        long deadline = link.optLong("deadline_at");
        if (deadline <= System.currentTimeMillis()) return;

        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        ensureChannel(context, nm);

        String title = link.isNull("title") ? UrlUtil.domain(link.optString("url")) : link.optString("title");
        int left = daysLeft(deadline);
        String when = left <= 0 ? "Deadline today" : left == 1 ? "Deadline tomorrow" : "Deadline in " + left + " days";

        Intent open = new Intent(context, MainActivity.class);
        open.putExtra(MainActivity.EXTRA_ROUTE, "#/link/" + linkId);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(context, (int) linkId, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification.Builder nb = Build.VERSION.SDK_INT >= 26
                ? new Notification.Builder(context, CHANNEL)
                : new Notification.Builder(context);
        nb.setSmallIcon(R.drawable.ic_notify)
                .setContentTitle(when)
                .setContentText(title)
                .setStyle(new Notification.BigTextStyle().bigText(title))
                .setContentIntent(pi)
                .setAutoCancel(true)
                .setColor(0xFF2446E0);
        try {
            nm.notify((int) (JOB_BASE + linkId), nb.build());
        } catch (SecurityException ignored) {
            // Notifications not allowed; the deadline still shows in the app.
        }
        ContentValues v = new ContentValues();
        v.put("reminded", 1);
        db.updateLink(linkId, v);
    }

    static void ensureChannel(Context context, NotificationManager nm) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL, "Deadline reminders",
                NotificationManager.IMPORTANCE_DEFAULT);
        ch.setDescription("Reminders before saved opportunities close");
        nm.createNotificationChannel(ch);
    }

    /** Calendar days from today to the deadline's day (0 = today). */
    static int daysLeft(long deadline) {
        Calendar a = Calendar.getInstance();
        a.set(Calendar.HOUR_OF_DAY, 0);
        a.set(Calendar.MINUTE, 0);
        a.set(Calendar.SECOND, 0);
        a.set(Calendar.MILLISECOND, 0);
        Calendar b = Calendar.getInstance();
        b.setTimeInMillis(deadline);
        b.set(Calendar.HOUR_OF_DAY, 0);
        b.set(Calendar.MINUTE, 0);
        b.set(Calendar.SECOND, 0);
        b.set(Calendar.MILLISECOND, 0);
        return (int) Math.round((b.getTimeInMillis() - a.getTimeInMillis()) / (double) DAY);
    }
}
