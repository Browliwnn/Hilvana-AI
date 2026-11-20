import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.hilvana.mobile', // cámbialo por tu dominio invertido cuando lo tengas
  appName: 'Hilvana AI',
  webDir: 'dist',
  server: { androidScheme: 'https' },
  ios: { contentInset: 'always' },
};

export default config;
