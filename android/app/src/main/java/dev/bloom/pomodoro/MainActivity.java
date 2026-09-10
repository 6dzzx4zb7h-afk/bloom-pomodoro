package dev.bloom.pomodoro;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // PLAN 13.18: the launcher icon follows the friend on duty.
        registerPlugin(BloomAppIconPlugin.class);
        // The two surfaces that give a backgrounded Bloom a voice: the finish
        // alert, and the ongoing countdown the system ticks while the WebView
        // is frozen. Both implement the same JS contracts as their iOS
        // counterparts — see src/native/completionAlerts.ts and liveActivity.ts.
        registerPlugin(BloomCompletionAlertPlugin.class);
        registerPlugin(BloomLiveActivityPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
