package dev.bloom.pomodoro;

import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.service.notification.StatusBarNotification;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * The Android half of the `BloomLiveActivity` contract in
 * `src/native/liveActivity.ts`. iOS renders that snapshot with ActivityKit on
 * the Lock Screen and the Dynamic Island; Android renders it as one ongoing
 * notification whose countdown the system ticks itself.
 *
 * That last part is the point. Android freezes a backgrounded WebView, so a
 * countdown drawn by JavaScript stops being true the moment the person leaves.
 * A chronometer notification keeps counting without Bloom running at all, which
 * is the same promise the Live Activity makes on iOS and the same reason
 * neither of them is allowed to be a second timer authority: the reducer owns
 * the deadline, and this only mirrors it.
 *
 * Task text never appears here, only the mode — the surface is visible on a
 * lock screen someone else may be looking at.
 */
@CapacitorPlugin(name = "BloomLiveActivity")
public class BloomLiveActivityPlugin extends Plugin {
    private String activeSessionId;

    @Override
    public void load() {
        BloomNotifications.ensureChannels(getContext());
    }

    private boolean countdownPosted() {
        NotificationManager manager = getContext().getSystemService(NotificationManager.class);
        if (manager == null) return false;
        try {
            for (StatusBarNotification posted : manager.getActiveNotifications()) {
                if (posted.getId() == BloomNotifications.NOTIFICATION_COUNTDOWN) return true;
            }
        } catch (RuntimeException unavailable) {
            // Some OEM builds refuse this read. Fall back to what was posted
            // from here; the worst case is a redundant re-post, not a wrong one.
            return activeSessionId != null;
        }
        return false;
    }

    @PluginMethod
    public void status(PluginCall call) {
        boolean active = countdownPosted();
        JSObject result = new JSObject();
        result.put("supported", true);
        result.put("enabled", BloomNotifications.notificationsEnabled(getContext()));
        result.put("active", active);
        if (active && activeSessionId != null) {
            result.put("sessionId", activeSessionId);
            result.put("activityId", activeSessionId);
        }
        call.resolve(result);
    }

    private String titleFor(String mode) {
        return "tiny".equals(mode) ? "Tiny focus" : "Focus";
    }

    private static String remainingWords(int totalSeconds) {
        int minutes = totalSeconds / 60;
        int seconds = totalSeconds % 60;
        if (minutes <= 0) {
            return seconds == 1 ? "1 second left" : seconds + " seconds left";
        }
        if (seconds == 0) {
            return minutes == 1 ? "1 minute left" : minutes + " minutes left";
        }
        return String.format(java.util.Locale.US, "%d:%02d left", minutes, seconds);
    }

    @PluginMethod
    public void reconcile(PluginCall call) {
        String sessionId = call.getString("sessionId");
        String mode = call.getString("mode");
        String state = call.getString("state");
        Double startedAtMs = call.getDouble("startedAtMs");

        JSObject result = new JSObject();
        result.put("supported", true);
        result.put("enabled", BloomNotifications.notificationsEnabled(getContext()));

        boolean running = "running".equals(state);
        Double deadlineMs = call.getDouble("deadlineMs");
        Integer remainingSeconds = call.getInt("remainingSeconds");
        boolean valid =
            sessionId != null
                && !sessionId.trim().isEmpty()
                && ("focus".equals(mode) || "tiny".equals(mode))
                && startedAtMs != null
                && startedAtMs > 0
                && (running
                    ? deadlineMs != null && deadlineMs > startedAtMs
                    : "paused".equals(state) && remainingSeconds != null && remainingSeconds >= 0);

        if (!valid) {
            result.put("active", countdownPosted());
            result.put("changed", false);
            result.put("reason", "invalid");
            call.resolve(result);
            return;
        }

        BloomNotifications.ensureChannels(getContext());
        if (!BloomNotifications.notificationsEnabled(getContext())) {
            result.put("active", false);
            result.put("changed", false);
            result.put("reason", "notifications-disabled");
            call.resolve(result);
            return;
        }

        Intent open = new Intent(getContext(), MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent contentIntent = PendingIntent.getActivity(
            getContext(),
            0,
            open,
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(
                getContext(),
                BloomNotifications.CHANNEL_COUNTDOWN
            )
            .setSmallIcon(R.drawable.ic_stat_bloom)
            .setContentTitle(titleFor(mode))
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_STOPWATCH)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setContentIntent(contentIntent);

        if (running) {
            // The system draws and ticks this countdown, so it stays true while
            // the WebView is frozen — which is the whole reason it exists.
            builder
                .setUsesChronometer(true)
                .setChronometerCountDown(true)
                // Notification.when takes epoch milliseconds. Android converts
                // that timestamp to the chronometer's elapsed-realtime base.
                .setWhen(deadlineMs.longValue())
                .setShowWhen(true)
                .setContentText("Counting down. Bloom is keeping time.");
        } else {
            builder
                .setUsesChronometer(false)
                .setShowWhen(false)
                .setContentText("Paused — " + remainingWords(remainingSeconds));
        }

        boolean wasActive = countdownPosted();
        try {
            NotificationManagerCompat.from(getContext())
                .notify(BloomNotifications.NOTIFICATION_COUNTDOWN, builder.build());
        } catch (SecurityException denied) {
            result.put("active", false);
            result.put("changed", false);
            result.put("reason", "permission");
            call.resolve(result);
            return;
        }

        boolean changed = !wasActive || !sessionId.equals(activeSessionId);
        activeSessionId = sessionId;
        result.put("active", true);
        result.put("changed", changed);
        call.resolve(result);
    }

    @PluginMethod
    public void end(PluginCall call) {
        String sessionId = call.getString("sessionId");
        boolean wasActive = countdownPosted();
        if (sessionId != null && activeSessionId != null && !sessionId.equals(activeSessionId)) {
            // A stale end for a session that is no longer on screen must not
            // take down the countdown that replaced it.
            JSObject stale = new JSObject();
            stale.put("supported", true);
            stale.put("active", wasActive);
            stale.put("changed", false);
            stale.put("reason", "stale");
            call.resolve(stale);
            return;
        }
        NotificationManagerCompat.from(getContext())
            .cancel(BloomNotifications.NOTIFICATION_COUNTDOWN);
        activeSessionId = null;
        JSObject result = new JSObject();
        result.put("supported", true);
        result.put("active", false);
        result.put("changed", wasActive);
        call.resolve(result);
    }
}
