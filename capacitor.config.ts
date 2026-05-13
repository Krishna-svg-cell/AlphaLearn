import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.alphalearn.app',
  appName: 'AlphaLearn',
  webDir: 'public', // Using public as a placeholder web directory
  bundledWebRuntime: false,
  server: {
    // IMPORTANT: Replace this with your actual deployed URL (e.g., https://alphalearn.vercel.app)
    url: 'https://your-production-url.com', 
    cleartext: true
  }
};

export default config;
