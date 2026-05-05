import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { Image, Pressable, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Warning from '@/assets/Warning.svg'
import { Camera } from '@/components/textured-icons'

const ERROR = '#FF0D00'

export default function StealTheLookFailed() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { uri, reason } = useLocalSearchParams<{ uri?: string; reason?: string }>()

  const { title, body } =
    reason === 'multiple_people'
      ? {
          title: "Can't proceed with the outfit breakdown",
          body: "We noticed your image shows multiple people. We can only analyze one person's outfit at a time. Please upload a photo with a single person and try again.",
        }
      : {
          title: 'TODO error title',
          body: 'TODO error message',
        }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ flex: 1, backgroundColor: '#e5e5e5' }}>
        <View
          style={{
            flex: 1,
            paddingTop: insets.top + 24,
            paddingHorizontal: 20,
            alignItems: 'center',
          }}
        >
          {/* Outer: white frame + red glow shadow (no overflow, so iOS
              actually renders the shadow). Inner: image clipped. */}
          <View
            style={{
              alignSelf: 'center',
              width: '100%',
              maxWidth: 353,
              height: 460,
              padding: 8,
              borderRadius: 4,
              backgroundColor: '#fff',
              shadowColor: '#FC0000',
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 0.25,
              shadowRadius: 50,
              elevation: 14,
            }}
          >
            <View style={{ flex: 1, overflow: 'hidden' }}>
              <Image
                source={uri ? { uri } : require('@/assets/default-man.png')}
                style={{ width: '100%', height: '100%' }}
                resizeMode="cover"
              />
            </View>
          </View>

          <View
            style={{
              marginTop: 32,
              width: 353,
              maxWidth: '100%',
              paddingHorizontal: 12,
              gap: 12,
            }}
          >
            <Warning width={24} height={24} color={ERROR} fill={ERROR} />
            <Text
              className="font-funnel font-bold text-[16px] leading-[22px] tracking-[-0.16px]"
              style={{ color: ERROR }}
            >
              {title}
            </Text>
            <Text className="font-funnel font-normal text-[14px] leading-[18px] text-black">
              {body}
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
              backgroundColor: '#000',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              gap: 10,
            }}
          >
            <Camera width={20} height={20} color="#fff" fill="#fff" />
            <Text className="font-funnel font-medium text-[16px] leading-[24px] tracking-[-0.24px] text-white">
              Upload another picture
            </Text>
          </Pressable>
        </View>
      </View>
    </>
  )
}
