import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.dineshk.hexglyph',
  appName: 'HexGlyph',
  webDir: 'dist/public',        // ← matches vite's outDir exactly
  server: {
    androidScheme: 'https'
  }
};

export default config;
