import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Single place for the applicationId so it can change before a Play Store
 * release without touching native code.
 */
export const APPLICATION_ID = 'app.vexadeck.android';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'VexaDeck',
  slug: 'vexadeck',
  version: '1.1.1',
  orientation: 'default',
  scheme: 'vexadeck',
  userInterfaceStyle: 'dark',
  backgroundColor: '#0A0C0F',
  splash: {
    backgroundColor: '#0A0C0F',
    resizeMode: 'contain',
    image: './assets/icon.png',
  },
  android: {
    package: APPLICATION_ID,
    versionCode: 1110,
    softwareKeyboardLayoutMode: 'pan',
    adaptiveIcon: {
      foregroundImage: './assets/icon.png',
      backgroundColor: '#0A0C0F',
    },
    permissions: [
      'INTERNET',
      'ACCESS_NETWORK_STATE',
      'ACCESS_WIFI_STATE',
      'CHANGE_WIFI_MULTICAST_STATE',
      'VIBRATE',
      'CAMERA',
    ],
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: false,
        data: [{ scheme: 'vexadeck', host: 'pair' }],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
  },
  plugins: [
    './plugins/withWebAssets',
    [
      'expo-build-properties',
      {
        android: {
          usesCleartextTraffic: true,
          minSdkVersion: 26,
          targetSdkVersion: 35,
          compileSdkVersion: 35,
        },
      },
    ],
    'expo-secure-store',
    [
      'expo-camera',
      {
        cameraPermission: 'VexaDeck usa la cámara solo para escanear el código QR de emparejamiento.',
      },
    ],
  ],
});
