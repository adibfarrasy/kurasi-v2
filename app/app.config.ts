import type { ConfigContext, ExpoConfig } from 'expo/config'

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  scheme: 'kurasi',
  userInterfaceStyle: 'automatic',
  orientation: 'default',
  // web: {
  //   output: 'static',
  // },
  name: 'Kurasi',
  slug: 'kurasi',
  extra: {
    eas: {
      projectId: '8a76902a-1db0-4fae-b9a5-b2e61d253ac7',
    },
  },
  plugins: [
    'expo-secure-store',
    'expo-web-browser',
    'expo-font',
    [
      'expo-splash-screen',
      {
        image: './assets/splash@3x.png',
        // Android uses `resizeMode`; iOS uses `imageResizeMode`.
        resizeMode: 'cover',
        imageResizeMode: 'cover',
        // Make the splash image much larger than the default (100).
        imageWidth: 300,
        android: {
          resizeMode: 'cover',
          imageWidth: 300,
        },
      },
    ],
  ],
  ios: {
    bundleIdentifier: 'com.ryanditjia.kurasi',
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
    },
  },
})
