package dev.bloom.pomodoro;

import android.Manifest;
import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import androidx.core.app.NotificationManagerCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * The Android half of the `BloomCompletionAlert` contract in
 * `src/native/completionAlerts.ts` — the same JS API iOS implements with
 * UserNotifications, implemented here with AlarmManager and one notification.
 *
 * Why an alarm rather than a timer inside the WebView: Android freezes a
 * backgrounded WebView and may reclaim the process entirely, so JavaScript is
 * not something a finish cue can depend on. The alarm is held by the system and
 * fires regardless. The reducer stays the only timer authority; this plugin
 * mirrors one deadline and reports how the cue was presented so React never
 * plays a second one.
 */
@CapacitorPlugin(
    name = "BloomCompletionAlert",
    permissions = {
        @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = "notifications")
    }
)
public class BloomCompletionAlertPlugin extends Plugin {
    private static final String ALIAS = "notifications";

    @Override
    public void load() {
        BloomNotifications.ensureChannels(getContext());
        setAppActive(true);
    }

    @Override
    protected void handleOnResume() {
        setAppActive(true);
    }

    @Override
    protected void handleOnPause() {
        setAppActive(false);
    }

    @Override
    protected void handleOnDestroy() {
        setAppActive(false);
    }

    private void setAppActive(boolean active) {
        BloomNotifications
            .prefs(getContext())
            .edit()
            .putBoolean(BloomNotifications.KEY_APP_ACTIVE, active)
            .apply();
    }

    // --- status -------------------------------------------------------------

    private boolean runtimePermissionRequired() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU;
    }

    private boolean permissionGranted() {
        return !runtimePermissionRequired()
            || getPermissionState(ALIAS) == PermissionState.GRANTED;
    }

    /**
     * Android cannot tell "never asked" from "denied", so Bloom records whether
     * it has asked. That flag lives in the plugin's own preferences rather than
     * in `bloom-state`: it describes this install's system permission, not user
     * data, so it must not travel through export/import or need a migration.
     */
    private String permissionValue() {
        boolean enabled = BloomNotifications.notificationsEnabled(getContext());
        if (permissionGranted() && enabled) return "granted";
        if (!runtimePermissionRequired()) return enabled ? "granted" : "denied";
        boolean asked = BloomNotifications
            .prefs(getContext())
            .getBoolean(BloomNotifications.KEY_PERMISSION_ASKED, false);
        return asked ? "denied" : "prompt";
    }

    private JSObject statusObject() {
        Context context = getContext();
        BloomNotifications.ensureChannels(context);
        String permission = permissionValue();
        boolean granted = "granted".equals(permission);
        JSObject status = new JSObject();
        status.put("permission", permission);
        status.put("alertsEnabled", granted);
        status.put("soundsEnabled", granted && BloomNotifications.finishChannelSounds(context));
        status.put(
            "lockScreenEnabled",
            granted && BloomNotifications.finishChannelOnLockScreen(context)
        );
        return status;
    }

    @PluginMethod
    public void status(PluginCall call) {
        call.resolve(statusObject());
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        BloomNotifications
            .prefs(getContext())
            .edit()
            .putBoolean(BloomNotifications.KEY_PERMISSION_ASKED, true)
            .apply();
        if (!runtimePermissionRequired() || permissionGranted()) {
            call.resolve(statusObject());
            return;
        }
        requestPermissionForAlias(ALIAS, call, "permissionResult");
    }

    @PermissionCallback
    private void permissionResult(PluginCall call) {
        call.resolve(statusObject());
    }

    // --- scheduling ---------------------------------------------------------

    private PendingIntent finishIntent(long deadlineMs, String title, String body, int flags) {
        Intent intent = new Intent(getContext(), BloomAlarmReceiver.class);
        intent.setAction(BloomAlarmReceiver.ACTION_FINISH);
        intent.putExtra(BloomAlarmReceiver.EXTRA_DEADLINE, deadlineMs);
        intent.putExtra(BloomAlarmReceiver.EXTRA_TITLE, title);
        intent.putExtra(BloomAlarmReceiver.EXTRA_BODY, body);
        return PendingIntent.getBroadcast(
            getContext(),
            BloomNotifications.NOTIFICATION_FINISH,
            intent,
            flags | PendingIntent.FLAG_IMMUTABLE
        );
    }

    private void clearScheduled() {
        AlarmManager alarms = (AlarmManager) getContext().getSystemService(Context.ALARM_SERVICE);
        PendingIntent existing = finishIntent(0L, "", "", PendingIntent.FLAG_NO_CREATE);
        if (alarms != null && existing != null) {
            alarms.cancel(existing);
            existing.cancel();
        }
        BloomNotifications
            .prefs(getContext())
            .edit()
            .remove(BloomNotifications.KEY_PENDING_DEADLINE)
            .apply();
    }

    private boolean canScheduleExact(AlarmManager alarms) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true;
        return alarms.canScheduleExactAlarms();
    }

    @PluginMethod
    public void schedule(PluginCall call) {
        Double deadline = call.getDouble("deadlineMs");
        String title = call.getString("title");
        String body = call.getString("body");
        JSObject result = new JSObject();
        if (deadline == null || title == null || body == null || deadline <= 0) {
            result.put("scheduled", false);
            result.put("reason", "invalid");
            call.resolve(result);
            return;
        }

        long deadlineMs = deadline.longValue();
        if (!permissionGranted() || !BloomNotifications.notificationsEnabled(getContext())) {
            clearScheduled();
            result.put("scheduled", false);
            result.put("reason", "permission");
            call.resolve(result);
            return;
        }

        BloomNotifications.ensureChannels(getContext());
        AlarmManager alarms = (AlarmManager) getContext().getSystemService(Context.ALARM_SERVICE);
        if (alarms == null) {
            result.put("scheduled", false);
            result.put("reason", "unavailable");
            call.resolve(result);
            return;
        }

        // One alarm, replaced in place: the request id is constant, so a restart
        // after a pause or a mode change can never leave two cues armed.
        PendingIntent pending = finishIntent(
            deadlineMs,
            title,
            body,
            PendingIntent.FLAG_UPDATE_CURRENT
        );
        Intent show = new Intent(getContext(), MainActivity.class);
        show.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent showPending = PendingIntent.getActivity(
            getContext(),
            0,
            show,
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
        );

        try {
            if (canScheduleExact(alarms)) {
                // `setAlarmClock` is the one alarm kind Doze never defers. A
                // timer people arrange their attention around has to land when
                // it says it will, so the nine-minute idle window that applies
                // to `setExactAndAllowWhileIdle` is not good enough here.
                alarms.setAlarmClock(
                    new AlarmManager.AlarmClockInfo(deadlineMs, showPending),
                    pending
                );
            } else {
                alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, deadlineMs, pending);
            }
        } catch (SecurityException denied) {
            clearScheduled();
            result.put("scheduled", false);
            result.put("reason", "exact-alarms-denied");
            call.resolve(result);
            return;
        }

        BloomNotifications
            .prefs(getContext())
            .edit()
            .putLong(BloomNotifications.KEY_PENDING_DEADLINE, deadlineMs)
            .remove(BloomNotifications.KEY_DELIVERED_DEADLINE)
            .remove(BloomNotifications.KEY_DELIVERED_PRESENTATION)
            .apply();

        result.put("scheduled", true);
        result.put("deadlineMs", (double) deadlineMs);
        call.resolve(result);
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        SharedPreferences prefs = BloomNotifications.prefs(getContext());
        long pendingDeadline = prefs.getLong(BloomNotifications.KEY_PENDING_DEADLINE, 0L);
        // A cue that is due right now while Bloom is in the background belongs
        // to the system, not to a WebView that woke up just enough to tick. This
        // is the Android form of the same window the iOS plugin guards.
        boolean appActive = prefs.getBoolean(BloomNotifications.KEY_APP_ACTIVE, false);
        if (pendingDeadline > 0
            && !appActive
            && pendingDeadline <= System.currentTimeMillis() + 1_000L) {
            call.resolve();
            return;
        }
        clearScheduled();
        NotificationManagerCompat.from(getContext())
            .cancel(BloomNotifications.NOTIFICATION_FINISH);
        call.resolve();
    }

    @PluginMethod
    public void consumeDue(PluginCall call) {
        Double deadline = call.getDouble("deadlineMs");
        JSObject result = new JSObject();
        SharedPreferences prefs = BloomNotifications.prefs(getContext());
        long delivered = prefs.getLong(BloomNotifications.KEY_DELIVERED_DEADLINE, 0L);
        String presentation = prefs.getString(
            BloomNotifications.KEY_DELIVERED_PRESENTATION,
            "none"
        );
        if (deadline == null || delivered <= 0 || Math.abs(delivered - deadline) >= 1) {
            result.put("presentation", "none");
            call.resolve(result);
            return;
        }
        prefs
            .edit()
            .remove(BloomNotifications.KEY_DELIVERED_DEADLINE)
            .remove(BloomNotifications.KEY_DELIVERED_PRESENTATION)
            .apply();
        result.put("presentation", presentation == null ? "none" : presentation);
        call.resolve(result);
    }

    @PluginMethod
    public void pending(PluginCall call) {
        long deadline = BloomNotifications
            .prefs(getContext())
            .getLong(BloomNotifications.KEY_PENDING_DEADLINE, 0L);
        JSObject result = new JSObject();
        result.put("count", deadline > 0 ? 1 : 0);
        if (deadline > 0) result.put("deadlineMs", (double) deadline);
        call.resolve(result);
    }
}
