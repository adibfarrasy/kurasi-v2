import { Stack, useRouter } from 'expo-router'
import { Image, Pressable, ScrollView, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Camera from '@/assets/icons/Camera.svg'
import XIcon from '@/assets/icons/X.svg'

// Inline check + cross marks rendered as small filled circles with glyph
function StatusBadge({ kind }: { kind: 'do' | 'dont' }) {
  const bg = kind === 'do' ? '#089511' : '#E90000'
  const glyph = kind === 'do' ? '✓' : '✕'
  return (
    <View
      style={{
        width: 18,
        height: 18,
        borderRadius: 9,
        backgroundColor: bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text className="text-[11px] font-bold leading-3 text-white">{glyph}</Text>
    </View>
  )
}

function GuideCard({
  kind,
  title,
  body,
  caption,
}: {
  kind: 'do' | 'dont'
  title: string
  body: string
  caption: string
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: kind === 'do' ? 'white' : 'transparent',
        borderRadius: 4,
        overflow: 'hidden',
        gap: 16,
        height: 168,
        paddingTop: 4,
        paddingRight: 16,
        paddingBottom: 4,
        paddingLeft: 4,
      }}
    >
      <View
        style={{
          alignSelf: 'stretch',
          aspectRatio: 88 / 110,
          backgroundColor: '#e5e5e5',
          overflow: 'hidden',
        }}
      >
        <Image
          source={
            kind === 'do'
              ? require('@/assets/stealthelook-do.png')
              : require('@/assets/stealthelook-dont.png')
          }
          style={{ width: '100%', height: '100%' }}
          resizeMode="cover"
        />
      </View>
      <View style={{ flex: 1, paddingTop: 32, paddingBottom: 8, gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <StatusBadge kind={kind} />
          <Text
            className={`font-funnel text-[13px] font-bold tracking-[0.6px] ${
              kind === 'do' ? 'text-[#089511]' : 'text-[#E90000]'
            }`}
          >
            {title}
          </Text>
        </View>
        <Text className="font-funnel font-normal text-[16px] leading-[22px] tracking-[-0.16px] text-black">
          {body}
        </Text>
        <Text className="mt-auto font-funnel text-[12px] leading-[16px] tracking-[0.06px] text-[#6b7280]">
          {caption}
        </Text>
      </View>
    </View>
  )
}

export default function StealTheLookIntro() {
  const insets = useSafeAreaInsets()
  const router = useRouter()

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ flex: 1, backgroundColor: '#e5e5e5' }}>
        <ScrollView
          contentContainerStyle={{
            paddingTop: insets.top + 12,
            paddingHorizontal: 20,
            paddingBottom: 140,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <Text className="font-funnel font-normal text-[20px] leading-[24px] tracking-[-0.3px] text-black">
              Upload
            </Text>
            <Pressable
              onPress={() => router.back()}
              hitSlop={12}
              style={{
                width: 28,
                height: 28,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <XIcon width={20} height={20} color="#000" />
            </Pressable>
          </View>

          <Text className="mt-3 font-bebas text-[48px] leading-[52px] text-black">
            OU
            <Text className="font-kirang text-[58px] leading-[52px]">t</Text>
            FIT INSPIR
            <Text className="font-kirang text-[58px] leading-[52px]">At</Text>
            ION
          </Text>

          <View style={{ marginTop: 56, gap: 17 }}>
            <GuideCard
              kind="do"
              title="DO"
              body={'Have 1 (one) person in\nthe frame.'}
              caption="Even if the background is busy, we can analyze it without problem."
            />
            <GuideCard
              kind="dont"
              title="DON'T"
              body={'Have multiple people\nin the frame.'}
              caption="Which one do you even want?"
            />
          </View>
        </ScrollView>

        <View
          style={{
            position: 'absolute',
            left: 20,
            right: 20,
            bottom: insets.bottom + 16,
          }}
        >
          <Pressable
            onPress={() => router.push('/steal-the-look/analyzing')}
            style={{
              height: 56,
              borderRadius: 99,
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.15)',
              backgroundColor: '#000',
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
            <Camera width={20} height={20} color="#fff" fill="#fff" />
            <Text className="font-funnel font-medium text-[16px] leading-[24px] tracking-[-0.24px] text-white">
              Upload a picture
            </Text>
          </Pressable>
        </View>
      </View>
    </>
  )
}
