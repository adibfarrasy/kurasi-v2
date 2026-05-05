import * as ImageManipulator from 'expo-image-manipulator'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import {
  Animated,
  Dimensions,
  Easing,
  Image,
  Pressable,
  type ScrollView,
  Text,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Defs, FeGaussianBlur, Filter, Text as SvgText } from 'react-native-svg'
import { client } from '@/lib/orpc-client'

const SCREEN_WIDTH = Dimensions.get('window').width
const CARD_WIDTH = SCREEN_WIDTH - 80
const CARD_HEIGHT = 420
const CARD_GAP = 16
const PAGE_INTERVAL = CARD_WIDTH + CARD_GAP
const SIDE_PADDING = (SCREEN_WIDTH - CARD_WIDTH) / 2

const STAGES = ['Removing background', 'Optimizing image', 'Prefilling tags', 'Wrapping up']
const STAGE_ROW_H = 30

// Pacing per card. The real backend work sits inside "Optimizing image"
// (stage 1), which holds until the corresponding session resolves. The
// other stages each get a fixed dwell so the user reads each label.
const REMOVE_BG_MS = 3000
const POST_DETECT_DWELL_MS = 1000

type ResultItem = {
  title: string
  category: string
  fit: string | null
  length: string | null
  colors: { name: string; hex: string; ratio: number }[]
  originalImageUrl: string
  processedImageUrl: string
}

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

function BlurredText({ label, stdDeviation }: { label: string; stdDeviation: number }) {
  const filterId = `blur-${stdDeviation}`
  return (
    <Svg width={260} height={24}>
      <Defs>
        <Filter id={filterId}>
          <FeGaussianBlur stdDeviation={stdDeviation} />
        </Filter>
      </Defs>
      <SvgText
        x="130"
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

function PhotoCard({
  uri,
  index,
  scrollX,
}: {
  uri: string
  index: number
  scrollX: Animated.Value
}) {
  // Tilt eases in to -2° as the card centers, eases back out to 0° as
  // the carousel advances away.
  const rotate = scrollX.interpolate({
    inputRange: [(index - 1) * PAGE_INTERVAL, index * PAGE_INTERVAL, (index + 1) * PAGE_INTERVAL],
    outputRange: ['0deg', '-2deg', '0deg'],
    extrapolate: 'clamp',
  })
  return (
    <Animated.View
      style={{
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        marginRight: CARD_GAP,
        borderRadius: 8,
        borderWidth: 5,
        borderColor: '#fff',
        backgroundColor: '#cfcfcf',
        transform: [{ rotate }],
        shadowColor: '#000',
        shadowOffset: { width: 0.5, height: 1 },
        shadowOpacity: 0.4,
        shadowRadius: 1,
        elevation: 1,
        overflow: 'hidden',
      }}
    >
      <Image source={{ uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
    </Animated.View>
  )
}

function parseUris(raw: string | undefined): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((u): u is string => typeof u === 'string') : []
  } catch {
    return []
  }
}

export default function UploadWardrobe() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const params = useLocalSearchParams<{ uris?: string }>()
  // Snapshot the URIs ONCE on first render. The processing loop runs
  // for tens of seconds and we don't want it to be torn down because
  // some unrelated render handed back a fresh `params` object whose
  // `uris` string somehow differed (or got re-decoded). The first
  // value is the only thing the route was opened with anyway.
  const urisRef = useRef<string[] | null>(null)
  if (urisRef.current === null) {
    urisRef.current = parseUris(params.uris)
  }
  const uris = urisRef.current
  const scrollY = useRef(new Animated.Value(0)).current
  const scrollX = useRef(new Animated.Value(0)).current
  const scrollRef = useRef<ScrollView>(null)
  const [stageIndex, setStageIndex] = useState(0)
  const [cardIndex, setCardIndex] = useState(0)
  // When the pipeline fails for every image, we show this inline instead
  // of using Alert.alert — Alert was getting swallowed by the effect's
  // cleanup (Fast Refresh / nav transition) firing `cancelled` before the
  // dialog could surface.
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Drives the horizontal carousel programmatically; not user-scrollable.
  // The onScroll Animated.event keeps `scrollX` in sync so each card's
  // tilt interpolation tracks the actual position smoothly.
  useEffect(() => {
    scrollRef.current?.scrollTo({ x: cardIndex * PAGE_INTERVAL, animated: true })
  }, [cardIndex])

  useEffect(() => {
    Animated.timing(scrollY, {
      toValue: -stageIndex * STAGE_ROW_H,
      duration: 400,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start()
  }, [stageIndex, scrollY])

  useEffect(() => {
    let cancelled = false

    const sleep = (ms: number) =>
      new Promise<void>((resolve) => {
        const t = setTimeout(resolve, ms)
        // Wrapping in a promise lets the awaited sequence below short-
        // circuit cleanly via the `cancelled` flag without leaking
        // timers — the function returns even if the timeout fires
        // after unmount.
        if (cancelled) clearTimeout(t)
      })

    const run = async () => {
      if (uris.length === 0) {
        router.replace('/upload-wardrobe-guide')
        return
      }

      const results: ResultItem[] = []
      // First user-facing error message we hit, surfaced via Alert if no
      // image makes it through. Keeping just the first keeps the message
      // simple; per-image diagnostics stay in console.
      let firstError: string | null = null

      // Process images SEQUENTIALLY — kick off the next session's start
      // only after the previous image finishes its full carousel cycle.
      // Running in parallel overloads the upstream vision API and made
      // the request budget per upload feel unbounded.
      for (let i = 0; i < uris.length; i++) {
        if (cancelled) return
        setCardIndex(i)
        setStageIndex(0)

        const uri = uris[i]!
        console.log(`[upload-wardrobe] processing ${i + 1}/${uris.length}`)

        // Kick off this image's prepare + start in the background; its
        // run overlaps the 3s "Removing background" lead-in so the user
        // doesn't sit on stage 0 longer than necessary.
        const startPromise = (async () => {
          const { base64 } = await prepareForUpload(uri)
          const { sessionId } = await client.addClothes.start({
            imageBase64: base64,
            mimeType: 'image/jpeg',
          })
          return sessionId
        })()
        // Swallow rejection here — we await `startPromise` below where
        // we actually want it to throw into the catch.
        startPromise.catch(() => {})

        // Stage 0 lead-in (Removing background).
        await sleep(REMOVE_BG_MS)
        if (cancelled) return

        // Stage 1 (Optimizing image) holds until backend `done`.
        setStageIndex(1)
        let sessionId: string
        try {
          sessionId = await startPromise
        } catch (err) {
          console.warn(`[upload-wardrobe] start ${i + 1} failed:`, err)
          if (!firstError) firstError = 'Could not upload this photo. Please try again.'
          // Keep what we have so far; fall through to navigate.
          break
        }
        if (cancelled) return

        let item: ResultItem | null = null
        for (;;) {
          if (cancelled) return
          let progress
          try {
            progress = await client.addClothes.progress({ sessionId })
          } catch (err) {
            console.warn(`[upload-wardrobe] poll ${i + 1} failed:`, err)
            if (!firstError) firstError = 'Lost connection while processing. Please try again.'
            break
          }
          if (cancelled) return
          if (progress.phase === 'error') {
            console.warn(`[upload-wardrobe] session ${i + 1} error:`, progress.message)
            if (!firstError) firstError = progress.message
            break
          }
          if (progress.phase === 'done') {
            const r = progress.result
            if (r.result !== 'no_error' || r.items.length === 0) {
              console.warn(`[upload-wardrobe] session ${i + 1} not usable:`, r.result)
              break
            }
            item = r.items[0]!
            break
          }
          await sleep(800)
        }

        // Even if this session failed, run the closing stages so the
        // carousel doesn't snap back to stage 0 mid-cycle.
        setStageIndex(2)
        await sleep(POST_DETECT_DWELL_MS)
        if (cancelled) return
        setStageIndex(3)
        await sleep(POST_DETECT_DWELL_MS)
        if (cancelled) return

        if (item) results.push(item)
      }

      if (cancelled) return
      if (results.length === 0) {
        // Every session failed. Surface the (already-generic) backend
        // message inline so the user knows something went wrong instead
        // of silently teleporting them back to the guide.
        setErrorMessage(firstError ?? 'Could not process your photos. Please try again.')
        return
      }
      router.replace({
        pathname: '/upload-wardrobe-review',
        params: {
          uris: JSON.stringify(uris.slice(0, results.length)),
          prefills: JSON.stringify(results),
        },
      })
    }

    run().catch((err) => {
      if (cancelled) return
      console.warn('[upload-wardrobe] run failed:', err)
      setErrorMessage('Something went wrong while processing your photos. Please try again.')
    })

    return () => {
      cancelled = true
    }
  }, [router, uris])

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View
        style={{
          flex: 1,
          backgroundColor: '#e5e5e5',
          paddingTop: insets.top + 24,
          paddingBottom: insets.bottom + 32,
        }}
      >
        <View style={{ paddingHorizontal: 20, marginBottom: 20 }}>
          <Text className="font-bebas text-[48px] leading-[52px] text-black">
            U<Text className="font-kirang text-[58px] leading-[52px]">P</Text>
            LO<Text className="font-kirang text-[58px] leading-[52px]">A</Text>D WA
            <Text className="font-kirang text-[58px] leading-[52px]">R</Text>
            DRO<Text className="font-kirang text-[58px] leading-[52px]">B</Text>E
          </Text>
        </View>

        <Animated.ScrollView
          ref={scrollRef}
          horizontal
          scrollEnabled={false}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingLeft: SIDE_PADDING, paddingRight: SIDE_PADDING }}
          style={{ flexGrow: 0, overflow: 'visible' }}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
            useNativeDriver: true,
          })}
          scrollEventThrottle={16}
        >
          {uris.map((u, i) => (
            <PhotoCard key={u} uri={u} index={i} scrollX={scrollX} />
          ))}
        </Animated.ScrollView>

        <View style={{ alignItems: 'center', marginTop: 32, gap: 15 }}>
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
          <View style={{ height: STAGE_ROW_H * 4, overflow: 'hidden', alignItems: 'center' }}>
            <Animated.View style={{ alignItems: 'center', transform: [{ translateY: scrollY }] }}>
              {STAGES.map((label, i) => {
                const offset = i - stageIndex
                const focused = offset === 0
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

        {errorMessage ? (
          <View
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: 0,
              bottom: 0,
              backgroundColor: 'rgba(0,0,0,0.45)',
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: 32,
            }}
          >
            <View
              style={{
                backgroundColor: '#fff',
                paddingHorizontal: 24,
                paddingVertical: 24,
                gap: 16,
                width: '100%',
                maxWidth: 360,
              }}
            >
              <Text className="font-funnel font-bold text-[18px] leading-[24px] text-black">
                Upload failed
              </Text>
              <Text className="font-funnel text-[14px] leading-[20px] text-[#444]">
                {errorMessage}
              </Text>
              <Pressable
                onPress={() => router.replace('/upload-wardrobe-guide')}
                style={{
                  height: 48,
                  borderRadius: 99,
                  backgroundColor: '#000',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginTop: 4,
                }}
              >
                <Text className="font-funnel font-medium text-[16px] leading-[24px] tracking-[-0.16px] text-white">
                  Try again
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </View>
    </>
  )
}
