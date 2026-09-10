package dev.bloom.pomodoro;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;

import androidx.core.app.NotificationManagerCompat;

/**
 * Shared Android notification plumbing for the two surfaces that give a
 * backgrounded Bloom a voice: the finish alert and the ongoing countdown.
 *
 * The reducer in `src/store/useBloom.ts` remains the only timer authority.
 * Nothing here writes Bloom state or claims a session was completed — a
 * delivered notice says the timer finished, which is true even when Android
 * killed the process and the boot sweep later records the session as
 * interrupted. See docs/adr/0001.
 */
final class BloomNotifications {
    /** High-importance, sounds. Mirrors the iOS completion request. */
    static final String CHANNEL_FINISH = "bloom-timer-finish";
    /** Silent and ongoing. The Android answer to the iOS Live Activity. */
    static final String CHANNEL_COUNTDOWN = "bloom-timer-countdown";

    static final int NOTIFICATION_FINISH = 4101;
    static final int NOTIFICATION_COUNTDOWN = 4102;

    static final String PREFS = "bloom-native-alerts";
    /** Deadline of the one scheduled finish alert, or 0 when none is pending. */
    static final String KEY_PENDING_DEADLINE = "pendingDeadlineMs";
    /** Deadline of a finish alert that has already fired and not been consumed. */
    static final String KEY_DELIVERED_DEADLINE = "deliveredDeadlineMs";
    /** How that delivery was presented: see CompletionAlertPresentation in TS. */
    static final String KEY_DELIVERED_PRESENTATION = "deliveredPresentation";
    /** Whether Bloom's WebView was resumed when the alarm fired. */
    static final String KEY_APP_ACTIVE = "appActive";
    /** Whether Bloom has ever asked for POST_NOTIFICATIONS on this install. */
    static final String KEY_PERMISSION_ASKED = "permissionAsked";

    private BloomNotifications() {}

    static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /**
     * Channels are created once and never recreated with different settings:
     * Android ignores changes to an existing channel, and silently rewriting a
     * person's own choice of sound or importance would be the wrong thing to
     * attempt anyway.
     */
    static void ensureChannels(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return;

        if (manager.getNotificationChannel(CHANNEL_FINISH) == null) {
            NotificationChannel finish = new NotificationChannel(
                CHANNEL_FINISH,
                "Timer finished",
                NotificationManager.IMPORTANCE_HIGH
            );
            finish.setDescription("The chime when a focus, tiny or break timer reaches zero.");
            finish.setShowBadge(false);
            finish.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            finish.setSound(
                completionSound(context),
                new AudioAttributes.Builder()
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION_EVENT)
                    .build()
            );
            manager.createNotificationChannel(finish);
        }

        if (manager.getNotificationChannel(CHANNEL_COUNTDOWN) == null) {
            NotificationChannel countdown = new NotificationChannel(
                CHANNEL_COUNTDOWN,
                "Session in progress",
                NotificationManager.IMPORTANCE_LOW
            );
            countdown.setDescription("The quiet countdown Bloom shows while a session is running.");
            countdown.setShowBadge(false);
            countdown.setSound(null, null);
            countdown.enableVibration(false);
            countdown.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            manager.createNotificationChannel(countdown);
        }
    }

    /** The same cue the Web Audio chime and the iOS notification are built from. */
    static Uri completionSound(Context context) {
        return Uri.parse(
            "android.resource://" + context.getPackageName() + "/" + R.raw.bloom_completion
        );
    }

    static boolean notificationsEnabled(Context context) {
        return NotificationManagerCompat.from(context).areNotificationsEnabled();
    }

    /** True when the finish channel can actually make a sound. */
    static boolean finishChannelSounds(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return true;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return false;
        NotificationChannel channel = manager.getNotificationChannel(CHANNEL_FINISH);
        if (channel == null) return false;
        return channel.getImportance() >= NotificationManager.IMPORTANCE_DEFAULT
            && channel.getSound() != null;
    }

    /** True when the finish notice is allowed to show its content on the lock screen. */
    static boolean finishChannelOnLockScreen(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return true;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return false;
        NotificationChannel channel = manager.getNotificationChannel(CHANNEL_FINISH);
        if (channel == null) return false;
        return channel.getImportance() != NotificationManager.IMPORTANCE_NONE
            && channel.getLockscreenVisibility() != Notification.VISIBILITY_SECRET;
    }
}
