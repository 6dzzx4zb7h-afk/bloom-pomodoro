package dev.bloom.pomodoro;

import android.content.ComponentName;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;
import java.util.List;

/**
 * PLAN 13.18 — the home-screen icon follows whichever friend is on duty.
 *
 * Android has no alternate-icon API. What it has is one {@code <activity-alias>}
 * per friend, each carrying that friend's launcher art, with exactly one of them
 * enabled; the launcher shows the enabled alias. The web reducer stays the
 * authority on who is on duty and this plugin only mirrors that choice, so no
 * friend list is duplicated here — the aliases are discovered from the package
 * itself. Every icon is compiled into the APK, so nothing about the choice
 * leaves the device.
 */
@CapacitorPlugin(name = "BloomAppIcon")
public class BloomAppIconPlugin extends Plugin {

    /** Aliases are named after the app so a future non-launcher activity cannot be swept up. */
    private static final String ALIAS_PREFIX = "Bloom";

    /** One launcher alias, plus whether the manifest ships it enabled. */
    private static final class Alias {
        final ComponentName component;
        final boolean enabledByDefault;

        Alias(ComponentName component, boolean enabledByDefault) {
            this.component = component;
            this.enabledByDefault = enabledByDefault;
        }
    }

    /**
     * `name` is the short class name of the alias to leave enabled, relative to
     * the application id (for example {@code BloomLuna}). An unknown or missing
     * name changes nothing rather than risking a home screen with no Bloom on it.
     */
    @PluginMethod
    public void select(PluginCall call) {
        String requested = call.getString("name");
        String target = requested == null ? "" : requested.trim();

        PackageManager packageManager = getContext().getPackageManager();
        String packageName = getContext().getPackageName();

        List<Alias> aliases = launcherAliases(packageManager, packageName);
        if (aliases.isEmpty()) {
            // A build without the aliases (or a manifest merge that dropped
            // them) keeps whatever icon it has instead of failing a session.
            call.resolve(result(false, false));
            return;
        }

        Alias wanted = null;
        for (Alias alias : aliases) {
            if (alias.component.getClassName().equals(packageName + "." + target)) {
                wanted = alias;
                break;
            }
        }
        if (wanted == null) {
            call.resolve(result(false, false));
            return;
        }

        if (isEnabled(packageManager, wanted)) {
            // This friend is already on the home screen. Re-applying the same
            // state would make the launcher drop and re-add Bloom's icon for a
            // change the user cannot see.
            call.resolve(result(true, false));
            return;
        }

        // Enable first, disable after: for the moment in between, Bloom has two
        // launcher entries rather than none. The other order can leave the app
        // with no launcher component at all if the process dies mid-change.
        setEnabled(packageManager, wanted.component, true);
        for (Alias alias : aliases) {
            if (alias != wanted && isEnabled(packageManager, alias)) {
                setEnabled(packageManager, alias.component, false);
            }
        }

        call.resolve(result(true, true));
    }

    /** Every {@code Bloom*} activity(-alias) this package declares, enabled or not. */
    private List<Alias> launcherAliases(PackageManager packageManager, String packageName) {
        List<Alias> found = new ArrayList<>();
        try {
            PackageInfo info;
            int flags = PackageManager.GET_ACTIVITIES | PackageManager.MATCH_DISABLED_COMPONENTS;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                info = packageManager.getPackageInfo(
                        packageName, PackageManager.PackageInfoFlags.of(flags));
            } else {
                info = packageManager.getPackageInfo(packageName, flags);
            }
            if (info.activities == null) return found;
            for (ActivityInfo activity : info.activities) {
                String simpleName = activity.name.startsWith(packageName + ".")
                        ? activity.name.substring(packageName.length() + 1)
                        : activity.name;
                if (simpleName.startsWith(ALIAS_PREFIX)) {
                    found.add(new Alias(
                            new ComponentName(packageName, activity.name), activity.enabled));
                }
            }
        } catch (PackageManager.NameNotFoundException error) {
            // Cannot happen for our own package; an empty list is the safe answer.
            return found;
        }
        return found;
    }

    /**
     * A component nobody has switched yet reports {@code STATE_DEFAULT}, which
     * means "whatever the manifest said" — so the manifest value has to be
     * folded in, or the first launch would rewrite the state it already has.
     */
    private boolean isEnabled(PackageManager packageManager, Alias alias) {
        int state = packageManager.getComponentEnabledSetting(alias.component);
        if (state == PackageManager.COMPONENT_ENABLED_STATE_DEFAULT) return alias.enabledByDefault;
        return state == PackageManager.COMPONENT_ENABLED_STATE_ENABLED;
    }

    private void setEnabled(PackageManager packageManager, ComponentName alias, boolean enabled) {
        packageManager.setComponentEnabledSetting(
                alias,
                enabled
                        ? PackageManager.COMPONENT_ENABLED_STATE_ENABLED
                        : PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
                // Without DONT_KILL_APP the system stops Bloom to apply the
                // change, which would end a running focus session.
                PackageManager.DONT_KILL_APP);
    }

    private JSObject result(boolean supported, boolean changed) {
        JSObject value = new JSObject();
        value.put("supported", supported);
        value.put("changed", changed);
        return value;
    }
}
