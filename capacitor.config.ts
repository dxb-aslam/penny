import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ai.penny.app',
  appName: 'Penny',
  webDir: 'dist',
  backgroundColor: '#F6F1E6',
  plugins: {
    Keyboard: {
      resize: 'native',
    },
  },
};

export default config;
