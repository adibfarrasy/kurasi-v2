import { LinearGradient } from 'expo-linear-gradient'
import { Stack, useRouter } from 'expo-router'
import { Image, Pressable, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Camera from '@/assets/icons/Camera.svg'
import Warning from '@/assets/icons/Warning.svg'

export default function StealTheLookFailed() {
  const insets = useSafeAreaInsets()
  const router = useRouter()

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ flex: 1, backgroundColor: '#0a0203' }}>
        <LinearGradient
          colors={['#1a0608', '#3a0a0d', '#0a0203']}
          locations={[0, 0.55, 1]}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />

        <View
          style={{
            flex: 1,
            paddingTop: insets.top + 100,
            paddingHorizontal: 20,
            alignItems: 'center',
          }}
        >
          <View
            style={{
              width: '100%',
              maxHeight: 352,
              height: 352,
              borderRadius: 14,
              backgroundColor: '#1a0608',
              boxShadow: '0px 0px 100px 0px #FC0000A8',
              shadowColor: '#FC0000',
              shadowOffset: { width: 0, height: 0 },
              shadowRadius: 100,
              shadowOpacity: 0.66,
            }}
          >
            <View
              style={{
                flex: 1,
                borderRadius: 14,
                overflow: 'hidden',
              }}
            >
              <Image
                source={require('@/assets/default_man.png')}
                style={{ width: '100%', height: '100%' }}
                resizeMode="cover"
              />
            </View>
          </View>

          <View
            style={{
              marginTop: 40,
              width: '100%',
              gap: 12,
              paddingHorizontal: 12,
            }}
          >
            <Warning width={28} height={28} color="#FFA0A0" fill="#FFA0A0" />
            <Text
              style={{
                fontFamily: 'FunnelSans_500Medium',
                fontSize: 16,
                color: '#FFA0A0',
                textShadowColor: 'rgba(252, 0, 0, 0.66)',
                textShadowOffset: { width: 0, height: 0 },
                textShadowRadius: 100,
              }}
            >
              Can't proceed with the outfit breakdown
            </Text>
            <Text
              style={{
                fontFamily: 'FunnelSans_400Regular',
                fontSize: 14,
                lineHeight: 18,
                color: 'rgba(255,255,255,0.75)',
              }}
            >
              We noticed your image shows multiple people. We can only analyze one person's outfit
              at a time. Please upload a photo with a single person and try again.
            </Text>
          </View>
        </View>

        <View
          style={{
            paddingHorizontal: 20,
            paddingBottom: insets.bottom + 16,
          }}
        >
          <Pressable
            onPress={() => router.replace('/steal-the-look')}
            style={{
              height: 56,
              borderRadius: 99,
              backgroundColor: '#fff',
              borderWidth: 1,
              borderColor: 'rgba(0,0,0,0.1)',
              paddingTop: 12,
              paddingRight: 12,
              paddingBottom: 14,
              paddingLeft: 12,
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              gap: 10,
            }}
          >
            <Camera width={20} height={20} color="#000" fill="#000" />
            <Text
              style={{
                color: '#000',
                fontFamily: 'FunnelSans_500Medium',
                fontSize: 16,
                lineHeight: 24,
                letterSpacing: -0.24,
              }}
            >
              Upload another picture
            </Text>
          </Pressable>
        </View>
      </View>
    </>
  )
}
