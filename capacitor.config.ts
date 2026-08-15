import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'dev.bloom.pomodoro',
  appName: 'Bloom',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
    backgroundColor: '#fdf3fb',
  },
  ios: {
    // Keep launch and WebView surfaces aligned with Bloom's day-theme canvas.
    backgroundColor: '#fdf3fb',
  },
};

export default config;
