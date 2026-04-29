import { LinearGradient } from 'expo-linear-gradient'
import { Stack, useRouter } from 'expo-router'
import { useEffect, useRef } from 'react'
import { Animated, Easing, Image, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Sparkle from '@/assets/icons/Sparkle.svg'

export default function StealTheLookAnalyzing() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const beam = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.loop(
      Animated.timing(beam, {
        toValue: 1,
        duration: 1800,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    ).start()
  }, [beam])

  useEffect(() => {
    // Success/result UI not finalised yet — analyzing always routes to the
    // failed state for now. Restore branching once the result screen lands.
    const t = setTimeout(() => router.replace('/steal-the-look/failed'), 2200)
    return () => clearTimeout(t)
  }, [router])

  // Beam translates diagonally across the photo to mimic an analysis sweep.
  const translateX = beam.interpolate({ inputRange: [0, 1], outputRange: [-260, 260] })

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View
        style={{
          flex: 1,
          backgroundColor: '#fff',
          paddingTop: insets.top + 40,
          paddingHorizontal: 20,
          alignItems: 'center',
        }}
      >
        <View
          style={{
            alignSelf: 'stretch',
            maxHeight: 520,
            borderRadius: 16,
            overflow: 'hidden',
            backgroundColor: '#dcdcdc',
          }}
        >
          <Image
            source={require('@/assets/default_man.png')}
            style={{ width: '100%', height: '100%' }}
            resizeMode="cover"
          />
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: -40,
              bottom: -40,
              width: 180,
              transform: [{ translateX }, { rotate: '20deg' }],
            }}
          >
            <LinearGradient
              colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.85)', 'rgba(255,255,255,0)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{ flex: 1 }}
            />
          </Animated.View>
        </View>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            marginTop: 20,
          }}
        >
          <Sparkle width={24} height={24} color="#000" fill="#000" />
          <Text
            style={{
              fontFamily: 'FunnelSans_400Regular',
              fontSize: 20,
              lineHeight: 24,
              letterSpacing: -0.3,
              textAlign: 'center',
              color: '#000',
            }}
          >
            Analyzing...
          </Text>
        </View>
      </View>
    </>
  )
}
