interface CapacitorConfig {
  appId: string;
  appName: string;
  webDir: string;
  server?: {
    androidScheme: string;
    cleartext: boolean;
  };
  plugins?: any;
  android?: any;
}

const config: CapacitorConfig = {
  appId: 'io.ionic.starter',
  appName: 'kiosk',
  webDir: 'www/browser',
  server: {
    androidScheme: 'http',
    cleartext: true,
  },
  plugins: {
    CapacitorSQLite: {
      iosDatabaseLocation: 'Library/databases',
      androidDatabaseLocation: 'databases',
    },
  },
  android: {
    allowMixedContent: true,
  },
};

export default config;
