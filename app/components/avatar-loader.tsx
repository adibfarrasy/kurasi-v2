import type { NormalizeAvatarProgress } from 'backend/orpc/normalize-avatar-handlers'
import { BlurView } from 'expo-blur'
import { useRouter } from 'expo-router'
import { useAtomValue, useSetAtom } from 'jotai'
import { useEffect, useRef, useState } from 'react'
import { Animated, Easing, Image, Pressable, Text, View } from 'react-native'
import Svg, { Defs, FeGaussianBlur, Filter, Text as SvgText } from 'react-native-svg'
import { client } from '@/lib/orpc-client'
import {
  avatarJobErrorAtom,
  avatarJobPhaseAtom,
  avatarJobResultUrlAtom,
  avatarJobSessionIdAtom,
} from '@/state/avatar-job'
import { capturedFaceAtom } from '@/state/face-capture'

// Locked from Figma — DO NOT add new labels or rename. The pipeline has
// six backend phases but the UI surfaces four canonical stages; multiple
// phases map to the same stage via PHASE_TO_STAGE_INDEX below.
const STAGES: Array<{ label: string }> = [
  { label: 'Adjusting body proportion' },
  { label: 'Identifying facial features' },
  { label: 'Finalizing' },
  { label: 'Wrapping up' },
]
const PHASE_TO_STAGE_INDEX: Record<NormalizeAvatarProgress['phase'], number> = {
  classify: 0,
  pass1: 0,
  pass2: 0,
  faceswap: 1,
  rembg: 2,
  finalize: 3,
  done: 3,
  error: 0,
}
const STAGE_ROW_H = 30
const POLL_INTERVAL_MS = 800

/**
 * Renders the user's avatar over the membership-card flow's mannequin slot.
 *
 * Three states:
 *   - **No session** (user skipped face upload): show the static
 *     mannequin asset as-is.
 *   - **Job in progress**: blur the mannequin and overlay a sparkle icon
 *     plus a vertically-scrolling stack of stage labels (current label
 *     focused/bold, neighbours SVG-blurred). Same pattern as the
 *     upload-wardrobe carousel.
 *   - **Job done**: render the generated avatar URL via <Image>.
 *
 * The polling effect keys on `sessionId` from the avatar-job atoms — a
 * fresh job (user retook their photo and pressed Continue again on
 * onboarding-3) overwrites the atom, the effect tears down, and a new
 * polling loop starts.
 */
export function AvatarLoader() {
  const router = useRouter()
  const sessionId = useAtomValue(avatarJobSessionIdAtom)
  const setPhase = useSetAtom(avatarJobPhaseAtom)
  const phase = useAtomValue(avatarJobPhaseAtom)
  const avatarUrl = useAtomValue(avatarJobResultUrlAtom)
  const setAvatarUrl = useSetAtom(avatarJobResultUrlAtom)
  const error = useAtomValue(avatarJobErrorAtom)
  const setError = useSetAtom(avatarJobErrorAtom)
  const faceUri = useAtomValue(capturedFaceAtom)

  // Retake = re-capture the photo, not re-run the AI on the existing
  // photo. Camera screen writes a new URI to capturedFaceAtom and clears
  // avatarJobSourceUriAtom; the auto-fire effect in
  // onboarding-membership-card.tsx then notices the mismatch and kicks
  // off a fresh normalizeAvatar.start.
  function onRetake() {
    if (!faceUri) return
    router.push('/onboarding-capture-face')
  }

  // Drives the vertical translate of the stage stack — same animation
  // technique as upload-wardrobe.tsx.
  const scrollY = useRef(new Animated.Value(0)).current
  const stageIndex = phase ? (PHASE_TO_STAGE_INDEX[phase] ?? 0) : 0
  const [activeStage, setActiveStage] = useState(stageIndex)

  useEffect(() => {
    setActiveStage(stageIndex)
  }, [stageIndex])

  useEffect(() => {
    Animated.timing(scrollY, {
      toValue: -activeStage * STAGE_ROW_H,
      duration: 400,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start()
  }, [activeStage, scrollY])

  // Polling loop. Keyed on sessionId so a retake (new session) tears
  // down the prior loop cleanly.
  useEffect(() => {
    if (!sessionId || avatarUrl) return
    let cancelled = false
    const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

    async function poll() {
      while (!cancelled) {
        try {
          const p = await client.normalizeAvatar.progress({ sessionId: sessionId as string })
          if (cancelled) return
          if (p.phase === 'done') {
            setAvatarUrl(p.avatarUrl)
            setPhase('done')
            return
          }
          if (p.phase === 'error') {
            setError(p.message)
            setPhase('error')
            return
          }
          setPhase(p.phase)
        } catch (err) {
          console.warn('[avatar-loader] poll failed:', err)
          if (!cancelled) setError('Lost connection while generating avatar.')
          return
        }
        await sleep(POLL_INTERVAL_MS)
      }
    }
    void poll()
    return () => {
      cancelled = true
    }
  }, [sessionId, avatarUrl, setAvatarUrl, setPhase, setError])

  // Done → avatar image with a Retake pill centered on top so the user
  // can re-roll the AI without leaving the page.
  if (avatarUrl) {
    return (
      <View
        style={{
          flex: 1,
          width: '100%',
          maxHeight: 375,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Image
          source={{ uri: avatarUrl }}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: '100%',
            height: '100%',
          }}
          resizeMode="contain"
        />
        {faceUri && <RetakePill onPress={onRetake} />}
      </View>
    )
  }

  // No job → just the static mannequin. (No retake button because there
  // was no upload to re-roll from.)
  if (!sessionId) {
    return (
      <Image
        source={require('@/assets/mannequin.png')}
        style={{ flex: 1, width: '100%', height: undefined, maxHeight: 375 }}
        resizeMode="contain"
      />
    )
  }

  // Errored → static mannequin + Retake pill so the user can recover.
  if (error) {
    return (
      <View
        style={{
          flex: 1,
          width: '100%',
          maxHeight: 375,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Image
          source={require('@/assets/mannequin.png')}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: '100%',
            height: '100%',
          }}
          resizeMode="contain"
        />
        {faceUri && <RetakePill onPress={onRetake} />}
      </View>
    )
  }

  // Job in progress → blurred mannequin + carousel, all constrained to
  // the same 375-tall slot the done-state avatar occupies so the carousel
  // visually centers inside the avatar region rather than the full
  // available column.
  return (
    <View
      style={{
        flex: 1,
        width: '100%',
        maxHeight: 375,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Image
        source={require('@/assets/mannequin.png')}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: '100%',
          height: '100%',
        }}
        resizeMode="contain"
      />
      <BlurView
        tint="light"
        intensity={40}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(255,255,255,0.1)',
        }}
      />
      <View style={{ alignItems: 'center', gap: 15 }}>
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
            {STAGES.map((s, i) => {
              const offset = i - activeStage
              const focused = offset === 0
              const stdDev = focused ? 0 : offset === 1 ? 1 : 2
              return (
                <View key={s.label} style={{ height: STAGE_ROW_H, justifyContent: 'center' }}>
                  {focused ? (
                    <Text className="text-center font-funnel font-bold text-[20px] leading-[24px] tracking-[-0.3px] text-black">
                      {s.label}
                    </Text>
                  ) : (
                    <BlurredText label={s.label} stdDeviation={stdDev} />
                  )}
                </View>
              )
            })}
          </Animated.View>
        </View>
      </View>
    </View>
  )
}

function RetakePill({ onPress }: { onPress: () => void }) {
  // Centered on the avatar's max-height slot. The parent View provides
  // alignItems/justifyContent center, so this pill lands at the visual
  // midpoint regardless of how tall the contained image renders.
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: '#fff',
        paddingLeft: 4,
        paddingRight: 16,
        paddingVertical: 8,
        borderRadius: 999,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.12,
        shadowRadius: 4,
      }}
    >
      <Image
        source={require('@/assets/reset.png')}
        style={{ width: 24, height: 24 }}
        resizeMode="contain"
      />
      <Text
        style={{
          fontSize: 14,
          fontWeight: '400',
          lineHeight: 18,
          letterSpacing: 0,
          color: '#000',
        }}
      >
        Retake
      </Text>
    </Pressable>
  )
}

function BlurredText({ label, stdDeviation }: { label: string; stdDeviation: number }) {
  const filterId = `avatar-blur-${stdDeviation}`
  return (
    <Svg width={280} height={24}>
      <Defs>
        <Filter id={filterId}>
          <FeGaussianBlur stdDeviation={stdDeviation} />
        </Filter>
      </Defs>
      <SvgText
        x="140"
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
