import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'dev.bloom.pomodoro',
  appName: 'Bloom',
  webDir: 'dist',
  backgroundColor: '#fdf3fb',
  android: {
    // Keep the WebView background matching the app so there's no white flash.
    backgroundColor: '#fdf3fb',
  },
};

export default config;
