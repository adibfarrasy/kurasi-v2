import { Redirect } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { Image, ImageBackground, Pressable, Text, View } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import GoogleLogo from '@/assets/google-logo.svg'
import { useAuth } from '@/contexts/auth-context'

function AppleLogo({ size = 24 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M17.05 20.28C16.07 21.23 15 21.08 13.97 20.63C12.88 20.17 11.88 20.15 10.73 20.63C9.29 21.25 8.53 21.07 7.67 20.28C2.79 15.25 3.51 7.59 9.05 7.31C10.4 7.38 11.34 8.05 12.13 8.11C13.31 7.87 14.44 7.18 15.7 7.27C17.21 7.39 18.35 7.99 19.1 9.07C15.98 10.94 16.72 15.05 19.58 16.2C19.01 17.7 18.27 19.19 17.04 20.29L17.05 20.28ZM12.03 7.25C11.88 5.02 13.69 3.18 15.77 3C16.06 5.58 13.43 7.5 12.03 7.25Z"
        fill="black"
      />
    </Svg>
  )
}

export default function Login() {
  const { isAuthenticated, isInitialLoading, loginWithGoogle } = useAuth()

  if (isInitialLoading) {
    return null
  }

  if (isAuthenticated) {
    return <Redirect href="/" />
  }

  return (
    <ImageBackground source={require('@/assets/splash.png')} className="flex-1 px-8">
      <View className="items-center pt-16">
        <Image
          source={require('@/assets/logomark.png')}
          className="w-24 h-24"
          resizeMode="contain"
        />
      </View>

      <View className="flex-1" />

      <View className="mb-10">
        <Text className="font-bebas text-[64px] leading-[70px] text-white">
          Cur<Text className="font-kirang text-[75px] leading-[70px] text-white">A</Text>
          te,
        </Text>
        <Text className="font-bebas text-[64px] leading-[70px] text-white">
          S<Text className="font-kirang text-[75px] leading-[70px] text-white">T</Text>y
          <Text className="font-kirang text-[75px] leading-[70px] text-white">L</Text>
          e,
        </Text>
        <Text className="font-bebas text-[64px] leading-[70px] text-white">
          I<Text className="font-kirang text-[75px] leading-[70px] text-white">N</Text>
          sp<Text className="font-kirang text-[75px] leading-[70px] text-white">I</Text>
          <Text className="font-kirang text-[75px] leading-[70px] text-white">R</Text>
          e.
        </Text>
      </View>

      <View className="mb-12 gap-4">
        <Pressable className="flex-row items-center justify-center self-stretch h-14 bg-white/90 rounded-full px-3 py-3.5">
          <View className="pl-2">
            <AppleLogo size={24} />
          </View>
          <View className="px-2">
            <Text className="text-[16px] font-medium tracking-[-0.24px] text-black">
              Continue with Apple
            </Text>
          </View>
        </Pressable>

        <Pressable
          className="flex-row items-center justify-center self-stretch h-14 bg-white/90 rounded-full px-3 py-3.5"
          onPress={() => loginWithGoogle()}
        >
          <View className="pl-2">
            <GoogleLogo width={24} height={24} />
          </View>
          <View className="px-2">
            <Text className="text-[16px] font-medium tracking-[-0.24px] text-black">
              Continue with Google
            </Text>
          </View>
        </Pressable>
      </View>

      <StatusBar style="light" />
    </ImageBackground>
  )
}
