import * as ImageManipulator from 'expo-image-manipulator'
import { LinearGradient } from 'expo-linear-gradient'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { useSetAtom } from 'jotai'
import { useEffect, useRef, useState } from 'react'
import { Animated, Easing, Image, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Defs, FeGaussianBlur, Filter, Text as SvgText } from 'react-native-svg'
import { client } from '@/lib/orpc-client'
import { stealTheLookDraftAtom } from '@/state/steal-the-look'

// Re-encode to JPEG and downscale before sending to the backend. The picker
// hands us the original asset (often HEIC on iOS), which fal's vision model
// can't decode. Resizing also keeps the orpc payload small.
async function prepareForUpload(uri: string): Promise<{ base64: string }> {
  const ctx = ImageManipulator.ImageManipulator.manipulate(uri).resize({ width: 1024 })
  const ref = await ctx.renderAsync()
  const out = await ref.saveAsync({
    compress: 0.85,
    format: ImageManipulator.SaveFormat.JPEG,
    base64: true,
  })
  if (!out.base64) throw new Error('Image manipulator returned no base64')
  return { base64: out.base64 }
}

const STAGES = ['Analyzing', 'Optimizing image', 'Finalizing style']
const STAGE_ROW_H = 30

function BlurredText({ label, stdDeviation }: { label: string; stdDeviation: number }) {
  const filterId = `blur-${stdDeviation}`
  return (
    <Svg width={240} height={24}>
      <Defs>
        <Filter id={filterId}>
          <FeGaussianBlur stdDeviation={stdDeviation} />
        </Filter>
      </Defs>
      <SvgText
        x="120"
        y="17"
        textAnchor="middle"
        fontFamily="FunnelSans-Bold"
        fontSize="16"
        fontWeight="700"
        letterSpacing="-0.16"
        fill="#000"
        fillOpacity={0.4}
        filter={`url(#${filterId})`}
      >
        {label}
      </SvgText>
    </Svg>
  )
}

export default function StealTheLookAnalyzing() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { uri } = useLocalSearchParams<{ uri?: string }>()
  const setDraft = useSetAtom(stealTheLookDraftAtom)
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

  const [stageIndex, setStageIndex] = useState(0)
  const scrollY = useRef(new Animated.Value(0)).current

  useEffect(() => {
    let cancelled = false
    let pollTimer: ReturnType<typeof setInterval> | null = null

    // Backend phases collapse onto the user-facing carousel:
    //   detect  → "Analyzing"        (stage 0)
    //   extract → "Optimizing image" (stage 1)
    //   refine  → "Optimizing image" (stage 1)
    //   <done>  → "Finalizing style" (stage 2, held for FINALIZE_DELAY_MS)
    const PHASE_INDEX: Record<string, number> = {
      detect: 0,
      extract: 1,
      refine: 1,
    }
    const FINALIZE_DELAY_MS = 3000

    const run = async () => {
      if (!uri) {
        router.replace({
          pathname: '/steal-the-look/failed',
          params: { reason: 'unknown', detail: 'No image URI' },
        })
        return
      }

      const { base64 } = await prepareForUpload(uri)
      const { sessionId } = await client.stealTheLook.start({
        imageBase64: base64,
        mimeType: 'image/jpeg',
      })

      const tick = async () => {
        if (cancelled) return
        try {
          const progress = await client.stealTheLook.progress({ sessionId })
          if (cancelled) return

          if (progress.phase === 'error') {
            if (pollTimer) clearInterval(pollTimer)
            router.replace({
              pathname: '/steal-the-look/failed',
              params: { uri, reason: 'unknown', detail: progress.message },
            })
            return
          }

          if (progress.phase === 'done') {
            if (pollTimer) clearInterval(pollTimer)
            const r = progress.result
            if (r.result !== 'no_error') {
              router.replace({
                pathname: '/steal-the-look/failed',
                params: { uri, reason: r.result },
              })
              return
            }
            // Show "Finalizing style" briefly before navigating so the
            // carousel always plays the third beat, even if the backend
            // returned faster than the user could read stage 2.
            setStageIndex(2)
            setTimeout(() => {
              if (cancelled) return
              setDraft(r)
              router.replace('/tryon')
            }, FINALIZE_DELAY_MS)
            return
          }

          // 'detect' | 'extract' | 'refine' | 'composite'
          const idx = PHASE_INDEX[progress.phase]
          if (typeof idx === 'number') setStageIndex(idx)
        } catch (err) {
          if (cancelled) return
          if (pollTimer) clearInterval(pollTimer)
          const message = err instanceof Error ? err.message : 'Analyze failed'
          router.replace({
            pathname: '/steal-the-look/failed',
            params: { uri, reason: 'unknown', detail: message },
          })
        }
      }

      // First poll immediately so the carousel reflects the real phase
      // without waiting a full second.
      await tick()
      pollTimer = setInterval(tick, 1000)
    }

    run().catch((err) => {
      if (cancelled) return
      const message = err instanceof Error ? err.message : 'Analyze failed'
      router.replace({
        pathname: '/steal-the-look/failed',
        params: { uri, reason: 'unknown', detail: message },
      })
    })

    return () => {
      cancelled = true
      if (pollTimer) clearInterval(pollTimer)
    }
  }, [router, uri, setDraft])

  useEffect(() => {
    Animated.timing(scrollY, {
      toValue: -stageIndex * STAGE_ROW_H,
      duration: 400,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start()
  }, [stageIndex, scrollY])

  const translateX = beam.interpolate({ inputRange: [0, 1], outputRange: [-260, 260] })

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View
        style={{
          flex: 1,
          backgroundColor: '#e5e5e5',
          paddingTop: insets.top + 24,
          paddingHorizontal: 20,
          paddingBottom: insets.bottom + 32,
          alignItems: 'center',
        }}
      >
        <View
          style={{
            alignSelf: 'center',
            width: '100%',
            maxWidth: 353,
            height: 530,
            borderRadius: 4,
            borderWidth: 5,
            borderColor: '#fff',
            overflow: 'hidden',
            backgroundColor: '#dcdcdc',
            shadowColor: '#000',
            shadowOffset: { width: 0.5, height: 1 },
            shadowOpacity: 0.4,
            shadowRadius: 1,
            elevation: 1,
          }}
        >
          <Image
            source={uri ? { uri } : require('@/assets/default-man.png')}
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

        <View style={{ alignItems: 'center', marginTop: 24, gap: 15 }}>
          <Image
            source={require('@/assets/star.png')}
            style={{
              width: 24,
              height: 24,
              shadowColor: '#000',
              shadowOffset: { width: 0.5, height: 0.66 },
              shadowOpacity: 0.66,
              shadowRadius: 0,
            }}
            resizeMode="contain"
          />
          <View style={{ height: STAGE_ROW_H * 3, overflow: 'hidden', alignItems: 'center' }}>
            <Animated.View style={{ alignItems: 'center', transform: [{ translateY: scrollY }] }}>
              {STAGES.map((label, i) => {
                const offset = i - stageIndex
                const focused = offset === 0
                // Real Gaussian blur via SVG feGaussianBlur. SVG's
                // stdDeviation ≈ Figma layer-blur radius / 2, so Figma
                // blur(3) ≈ stdDev 1.5 and blur(5) ≈ stdDev 2.5. Tuned to
                // 1 / 2 here so the text stays semi-legible on this canvas.
                const stdDev = focused ? 0 : offset === 1 ? 1 : 2
                return (
                  <View key={label} style={{ height: STAGE_ROW_H, justifyContent: 'center' }}>
                    {focused ? (
                      <Text className="text-center font-funnel font-bold text-[20px] leading-[24px] tracking-[-0.3px] text-black">
                        {label}
                      </Text>
                    ) : (
                      <BlurredText label={label} stdDeviation={stdDev} />
                    )}
                  </View>
                )
              })}
            </Animated.View>
          </View>
        </View>
      </View>
    </>
  )
}
