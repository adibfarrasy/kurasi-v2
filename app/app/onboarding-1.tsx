import { useRouter } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { Image, Pressable, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { TAB_BAR_BOTTOM_GAP } from '@/lib/layout'

export default function Onboarding1() {
  const router = useRouter()
  const insets = useSafeAreaInsets()

  return (
    <View className="flex-1 bg-white">
      <StatusBar style="dark" />

      <View className="relative">
        <View className="h-[381px] bg-[#999] items-center justify-center px-10">
          <Text className="text-white text-[16px] tracking-[-0.24px] font-medium text-center">
            (video = person’s digital avatar, changing between 5 very distinct fashion style—same
            face, same pose)
          </Text>
        </View>
        <Image
          source={require('@/assets/logomark.png')}
          className="absolute top-[50px] self-center w-[52px] h-[20px]"
          resizeMode="contain"
        />
      </View>

      <View className="px-[30px] pt-8 gap-4">
        <Text className="font-bebas text-[48px] leading-[52px] text-black">
          Find Yo
          <Text className="font-kirang text-[58px] leading-[52px] text-black">U</Text>r Sign
          <Text className="font-kirang text-[58px] leading-[52px] text-black">A</Text>
          TUre S<Text className="font-kirang text-[58px] leading-[52px] text-black">T</Text>
          yle
        </Text>
        <Text className="text-[16px] leading-[22px] tracking-[-0.16px] text-black">
          See how outfits look on your body with AI-powered fit generation
        </Text>
      </View>

      <View className="flex-1" />

      <Pressable
        className="mx-[30px] h-[56px] bg-black/90 rounded-full items-center justify-center"
        style={{ marginBottom: insets.bottom + TAB_BAR_BOTTOM_GAP }}
        onPress={() => router.push('/onboarding-2')}
      >
        <Text className="text-white text-[16px] font-medium tracking-[-0.24px]">Continue</Text>
      </Pressable>
    </View>
  )
}
