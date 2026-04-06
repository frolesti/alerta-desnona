import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'cat.alertadesnona.app',
  appName: 'Alerta Desnona',
  webDir: 'dist',

  // Servidor de producció (canviar quan tinguem domini)
  server: {
    // En dev, apuntar al servidor local:
    // url: 'http://192.168.1.X:5173',
    // androidScheme: 'http',

    // En producció, servir els fitxers estàtics del bundle:
    androidScheme: 'https',
    iosScheme: 'https',
  },

  plugins: {
    PushNotifications: {
      // Presentar notificació push en primer pla (foreground)
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 2000,
      backgroundColor: '#dc2626',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#dc2626',
    },
  },
};

export default config;
