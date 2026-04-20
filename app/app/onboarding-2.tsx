import { StatusBar } from 'expo-status-bar'
import { Image, Pressable, Text, View } from 'react-native'
import { useOnboarding } from '@/hooks/use-onboarding'

export default function Onboarding2() {
  const { completeOnboarding } = useOnboarding()

  return (
    <View className="flex-1 bg-white">
      <StatusBar style="dark" />

      <View className="relative">
        <View className="h-[381px] bg-[#999] items-center justify-center px-10">
          <Text className="text-white text-[16px] tracking-[-0.24px] font-medium text-center">
            (Strava-like UI)
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
          Show O<Text className="font-kirang text-[55px] leading-[52px] text-black">F</Text>f Yo
          <Text className="font-kirang text-[58px] leading-[52px] text-black">U</Text>r Fit of t
          <Text className="font-kirang text-[58px] leading-[52px] text-black">H</Text>e d
          <Text className="font-bebas text-[48px] leading-[52px] text-black">a</Text>y
        </Text>
        <Text className="text-[16px] leading-[22px] tracking-[-0.16px] text-black">
          Share your style to your friends on social media
        </Text>
      </View>

      <View className="flex-1" />

      <Pressable
        className="mx-[30px] mb-[50px] h-[56px] bg-black/90 rounded-full items-center justify-center"
        onPress={completeOnboarding}
      >
        <Text className="text-white text-[16px] font-medium tracking-[-0.24px]">Continue</Text>
      </Pressable>
    </View>
  )
}
