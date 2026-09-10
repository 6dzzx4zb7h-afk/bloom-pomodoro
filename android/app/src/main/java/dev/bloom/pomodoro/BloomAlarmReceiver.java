package dev.bloom.pomodoro;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

/**
 * Fires at the reducer-owned deadline, whether or not Bloom's process survived
 * that long. It presents a cue and records how it was presented; it never
 * completes or records a session.
 */
public class BloomAlarmReceiver extends BroadcastReceiver {
    static final String ACTION_FINISH = "dev.bloom.pomodoro.TIMER_FINISHED";
    static final String EXTRA_DEADLINE = "deadlineMs";
    static final String EXTRA_TITLE = "title";
    static final String EXTRA_BODY = "body";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !ACTION_FINISH.equals(intent.getAction())) return;

        long deadlineMs = intent.getLongExtra(EXTRA_DEADLINE, 0L);
        String title = intent.getStringExtra(EXTRA_TITLE);
        String body = intent.getStringExtra(EXTRA_BODY);
        if (deadlineMs <= 0L || title == null || body == null) return;

        SharedPreferences prefs = BloomNotifications.prefs(context);
        // A finish that arrives while Bloom is open belongs to the in-page
        // chime, which is warmer and already synchronized with the pet. Posting
        // a banner over the app the person is looking at would be the second
        // cue for one event, so the notice stands down and says so.
        boolean appActive = prefs.getBoolean(BloomNotifications.KEY_APP_ACTIVE, false);
        String presentation = appActive ? "foreground-suppressed" : "background-system";

        prefs
            .edit()
            .remove(BloomNotifications.KEY_PENDING_DEADLINE)
            .putLong(BloomNotifications.KEY_DELIVERED_DEADLINE, deadlineMs)
            .putString(BloomNotifications.KEY_DELIVERED_PRESENTATION, presentation)
            .apply();

        if (appActive) return;

        BloomNotifications.ensureChannels(context);
        if (!BloomNotifications.notificationsEnabled(context)) return;

        Intent open = new Intent(context, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent contentIntent = PendingIntent.getActivity(
            context,
            0,
            open,
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(
                context,
                BloomNotifications.CHANNEL_FINISH
            )
            .setSmallIcon(R.drawable.ic_stat_bloom)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setAutoCancel(true)
            .setShowWhen(true)
            .setWhen(deadlineMs)
            .setContentIntent(contentIntent)
            // Pre-Oreo has no channels, so the sound rides on the notification.
            .setSound(BloomNotifications.completionSound(context));

        try {
            NotificationManagerCompat.from(context)
                .notify(BloomNotifications.NOTIFICATION_FINISH, builder.build());
        } catch (SecurityException denied) {
            // POST_NOTIFICATIONS was revoked between scheduling and delivery.
            // The timer is unaffected and Settings reports the recovery path.
        }

        // The countdown this alert belongs to is over; leaving it up would show
        // a stopped clock next to the finish notice.
        NotificationManagerCompat.from(context)
            .cancel(BloomNotifications.NOTIFICATION_COUNTDOWN);
    }
}
