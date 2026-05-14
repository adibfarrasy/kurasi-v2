import type { ConfigContext, ExpoConfig } from 'expo/config'

const ROOT = '..'
const GF = `${ROOT}/node_modules/@expo-google-fonts`

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  scheme: 'kurasi',
  userInterfaceStyle: 'automatic',
  orientation: 'default',
  name: 'Kurasi',
  slug: 'kurasi',
  extra: {
    eas: {
      projectId: '8a76902a-1db0-4fae-b9a5-b2e61d253ac7',
    },
  },
  owner: 'kurasi',
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-web-browser',
    'expo-image',
    [
      'expo-image-picker',
      {
        photosPermission: 'Kurasi needs access to your photos to analyze outfit inspirations.',
        cameraPermission: 'Kurasi needs camera access to capture outfit inspirations.',
      },
    ],
    [
      'expo-camera',
      {
        cameraPermission: 'Kurasi needs camera access to capture your face for your avatar.',
      },
    ],
    [
      'expo-font',
      {
        ios: {
          fonts: [
            `${GF}/funnel-sans/400Regular/FunnelSans_400Regular.ttf`,
            `${GF}/funnel-sans/500Medium/FunnelSans_500Medium.ttf`,
            `${GF}/funnel-sans/700Bold/FunnelSans_700Bold.ttf`,
            `${GF}/bebas-neue/400Regular/BebasNeue_400Regular.ttf`,
            `${GF}/kirang-haerang/400Regular/KirangHaerang_400Regular.ttf`,
          ],
        },
        android: {
          fonts: [
            {
              fontFamily: 'Funnel Sans',
              fontDefinitions: [
                {
                  path: `${GF}/funnel-sans/400Regular/FunnelSans_400Regular.ttf`,
                  weight: 400,
                },
                {
                  path: `${GF}/funnel-sans/500Medium/FunnelSans_500Medium.ttf`,
                  weight: 500,
                },
                {
                  path: `${GF}/funnel-sans/700Bold/FunnelSans_700Bold.ttf`,
                  weight: 700,
                },
              ],
            },
            {
              fontFamily: 'Bebas Neue',
              fontDefinitions: [
                {
                  path: `${GF}/bebas-neue/400Regular/BebasNeue_400Regular.ttf`,
                  weight: 400,
                },
              ],
            },
            {
              fontFamily: 'Kirang Haerang',
              fontDefinitions: [
                {
                  path: `${GF}/kirang-haerang/400Regular/KirangHaerang_400Regular.ttf`,
                  weight: 400,
                },
              ],
            },
          ],
        },
      },
    ],
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
  android: {
    package: 'com.kurasi',
  },
})
