import type { BottomSheetModal } from '@gorhom/bottom-sheet'
import MaskedView from '@react-native-masked-view/masked-view'
import { BlurView } from 'expo-blur'
import { LinearGradient } from 'expo-linear-gradient'
import { useRouter } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { useEffect, useRef, useState } from 'react'
import { Dimensions, Image, Pressable, View } from 'react-native'
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AvatarLoader } from '@/components/avatar-loader'
import { MembershipCardSheet, type SignatureRect } from '@/components/membership-card-sheet'
import { MembershipCardView } from '@/components/membership-card-view'
import { SignaturePad } from '@/components/signature-pad'
import { startAvatarJob } from '@/lib/start-avatar-job'
import {
  avatarJobErrorAtom,
  avatarJobPhaseAtom,
  avatarJobResultUrlAtom,
  avatarJobSessionIdAtom,
  avatarJobSourceUriAtom,
} from '@/state/avatar-job'
import { capturedFaceAtom } from '@/state/face-capture'
import { cardNameAtom } from '@/state/membership'
import { genderAtom, heightAtom, weightAtom } from '@/state/onboarding-profile'

const HEADER_HEIGHT = 48
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window')

type Step = 'name' | 'signature'

export default function MembershipCardPage() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const cardSheetRef = useRef<BottomSheetModal>(null)
  const [step, setStep] = useState<Step>('name')
  const [sigPadRect, setSigPadRect] = useState<SignatureRect | null>(null)
  const [hasSignature, setHasSignature] = useState(false)
  const [isDrawing, setIsDrawing] = useState(false)
  const [name, setName] = useAtom(cardNameAtom)
  const [cardHeight, setCardHeight] = useState(245)
  const zoomProgress = useSharedValue(0)

  // Auto-fire avatar generation whenever the captured face URI changes
  // and doesn't match the URI the in-flight (or last-completed) job was
  // started with. Triggered when the user returns from /onboarding-
  // capture-face after pressing Retake on the avatar — the camera page
  // writes a new URI to capturedFaceAtom and clears avatarJobSourceUri,
  // and this effect picks it up to kick off the new job without making
  // them tap anything else.
  const faceUri = useAtomValue(capturedFaceAtom)
  const gender = useAtomValue(genderAtom)
  const height = useAtomValue(heightAtom)
  const weight = useAtomValue(weightAtom)
  const [avatarSourceUri, setAvatarSourceUri] = useAtom(avatarJobSourceUriAtom)
  const setAvatarSessionId = useSetAtom(avatarJobSessionIdAtom)
  const setAvatarPhase = useSetAtom(avatarJobPhaseAtom)
  const setAvatarResultUrl = useSetAtom(avatarJobResultUrlAtom)
  const setAvatarError = useSetAtom(avatarJobErrorAtom)

  useEffect(() => {
    if (!faceUri || faceUri === avatarSourceUri) return
    let cancelled = false
    // Clear prior result/error/session immediately so AvatarLoader drops
    // back into the in-progress (carousel) branch while we await the new
    // sessionId. Without this the previous avatar would linger on-screen
    // for the ~500ms it takes start() to return.
    setAvatarResultUrl(null)
    setAvatarError(null)
    setAvatarPhase(null)
    setAvatarSessionId(null)
    ;(async () => {
      try {
        const { sessionId } = await startAvatarJob({
          faceUri,
          gender,
          heightCm: height,
          weightKg: weight,
        })
        if (cancelled) return
        setAvatarSessionId(sessionId)
        setAvatarPhase('classify')
        setAvatarSourceUri(faceUri)
      } catch (err) {
        console.warn('[membership-card] auto-fire avatar job failed:', err)
        if (!cancelled) setAvatarError('Could not start avatar generation. Please try again.')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [
    faceUri,
    avatarSourceUri,
    gender,
    height,
    weight,
    setAvatarResultUrl,
    setAvatarError,
    setAvatarPhase,
    setAvatarSessionId,
    setAvatarSourceUri,
  ])

  const CARD_WIDTH = SCREEN_W - 48
  // Sig box sits at right:4, bottom:4 inside the card's inner-border which
  // is inside card padding 15. So 19px from card edge.
  const SIG_INSET = 19
  const SIG_W = 100
  const SIG_H = 60
  // Pivot in card-local coords = sig box center.
  const pivotX = CARD_WIDTH - SIG_INSET - SIG_W / 2 // 345-19-50 = 276
  const pivotY = cardHeight - SIG_INSET - SIG_H / 2 // cardHeight - 49

  function openSignaturePad(rect: SignatureRect) {
    setSigPadRect(rect)
    setHasSignature(true)
    setIsDrawing(true)
    zoomProgress.value = withTiming(1, { duration: 320 })
  }

  function closeSignaturePad() {
    setIsDrawing(false)
    // Unmount on the animation's completion callback (not a wall-clock
    // setTimeout) so the page card doesn't linger at scale=1 for a frame
    // before unmounting — that lingering causes a visible flicker as the
    // sheet card cross-fades in.
    zoomProgress.value = withTiming(0, { duration: 280 }, (done) => {
      if (done) runOnJS(setSigPadRect)(null)
    })
  }

  // Page-level zoom card: layout-positioned to overlay the sheet card at its
  // natural screen rect; the transform here is unconstrained by sheet bounds
  // (the page is not clipped). Scale anchored at the sig box (transformOrigin
  // 85%/90%) so the box stays put, then translate to centre it on screen.
  // Blur fades in/out with zoom so it never has to mount/unmount mid-frame.
  // The mannequin itself is NOT cross-faded — fading both layers leaves a
  // window (around zoomProgress ≈ 0.5) where the sharp mannequin shows
  // through the half-transparent blur, reading as "briefly unblurred."
  // Letting the blur do all the work avoids that mid-transition window.
  const blurOverlayStyle = useAnimatedStyle(() => ({
    opacity: zoomProgress.value,
  }))

  const zoomCardStyle = useAnimatedStyle(() => {
    const z = zoomProgress.value
    const scale = 1 + z * 2
    // RN composes transforms right-to-left like CSS: with `[scale, translate]`
    // the translate is applied in PRE-scale local coords, so a visual delta of
    // `D` pixels needs a translate value of `D / scale`. Divide to compensate.
    // Sig box lands here at zoom=1. Shift up/left from pure screen center.
    const targetX = SCREEN_W / 2 - 50
    const targetY = SCREEN_H / 2 - 40
    const txVisual = sigPadRect ? (targetX - (sigPadRect.x + sigPadRect.width / 2)) * z : 0
    const tyVisual = sigPadRect ? (targetY - (sigPadRect.y + sigPadRect.height / 2)) * z : 0
    return {
      transform: [{ scale }, { translateX: txVisual / scale }, { translateY: tyVisual / scale }],
      transformOrigin: [pivotX, pivotY, 0],
    }
  })

  function onBack() {
    if (step === 'signature') {
      setStep('name')
    } else {
      router.back()
    }
  }

  // Auto-present the card sheet on mount so the page lands with the sliding
  // animation already starting — feels like a transition, not a separate
  // screen the user has to discover a button to open.
  useEffect(() => {
    const t = setTimeout(() => cardSheetRef.current?.present(), 100)
    return () => clearTimeout(t)
  }, [])

  return (
    <View className="flex-1 bg-[#EFEFEF]">
      <StatusBar style="dark" />

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 20,
          paddingTop: insets.top + 8,
          height: insets.top + HEADER_HEIGHT,
          zIndex: 20,
        }}
      >
        <Pressable
          onPress={onBack}
          hitSlop={12}
          style={{
            position: 'absolute',
            left: 20,
            top: insets.top + 12,
            width: 24,
            height: 24,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Image
            source={require('@/assets/arrow-left.png')}
            style={{ width: 24, height: 24 }}
            resizeMode="contain"
          />
        </Pressable>
        <Image
          source={require('@/assets/logomark.png')}
          style={{ width: 104, height: 40, tintColor: '#000' }}
          resizeMode="contain"
        />
      </View>

      {/*
        Mannequin is hidden entirely while zoomed (sigPadRect != null) because
        the blur only masks the top half — the legs would otherwise poke out
        below the dashed box. Hide is instant at zoom-in start; show is delayed
        until zoom-out completion since `sigPadRect` is cleared inside the
        withTiming callback in closeSignaturePad. No cross-fade window → no
        sharp-mannequin-bleeding-through artifact.
      */}
      {!sigPadRect && (
        <View className="flex-1 pb-4 items-center" style={{ paddingTop: 24 }}>
          <AvatarLoader />
        </View>
      )}

      <MembershipCardSheet
        ref={cardSheetRef}
        // Keep sheet backdrop bounds CONSTANT regardless of zoom state. Changing
        // them at the moment sigPadRect toggles causes the native BlurView to
        // re-snapshot its background at the new bounds, which lags 1–2 frames
        // on iOS — that lag is the "mannequin briefly sharp after zoom-out"
        // flicker. The overlay blur above owns the zoom-mode focus effect.
        headerOffset={insets.top + HEADER_HEIGHT + 8}
        bottomOffset={0}
        step={step}
        onStepChange={setStep}
        onOpenSignaturePad={openSignaturePad}
        hasSignature={hasSignature}
        hideCard={sigPadRect != null}
      />

      {/*
        Always-mounted blur overlay. Opacity is driven by zoomProgress so the
        BlurView compositor stays alive across the full transition — avoids
        the one-frame "mannequin sharp then blurred" flicker that happens
        when MaskedView/BlurView mount/unmount on sigPadRect toggle.
      */}
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: SCREEN_H / 2 - 90,
            zIndex: 1500,
          },
          blurOverlayStyle,
        ]}
      >
        <MaskedView
          style={{ flex: 1 }}
          maskElement={
            <LinearGradient
              colors={['rgba(0,0,0,1)', 'rgba(0,0,0,1)', 'rgba(0,0,0,0)']}
              locations={[0, 0.65, 1]}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={{ flex: 1 }}
            />
          }
        >
          <BlurView
            tint="light"
            intensity={40}
            style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.1)' }}
          />
        </MaskedView>
      </Animated.View>

      {sigPadRect && (
        <Animated.View
          pointerEvents="none"
          onLayout={(e) => setCardHeight(e.nativeEvent.layout.height)}
          style={[
            {
              position: 'absolute',
              // Anchor the page card so its bottom-right sits exactly 19px
              // beyond the measured sig box's bottom-right edge (card padding
              // 15 + inner border 1 + sig box offset 4 = 19). With this, at
              // zoom=0 the sig box overlays sigPadRect exactly; the transform
              // then scales 3x around the sig box and translates the box to
              // screen center.
              width: CARD_WIDTH,
              right: SCREEN_W - (sigPadRect.x + sigPadRect.width + SIG_INSET),
              bottom: SCREEN_H - (sigPadRect.y + sigPadRect.height + SIG_INSET),
              zIndex: 1000,
            },
            zoomCardStyle,
          ]}
        >
          <MembershipCardView
            name={name}
            onChangeName={setName}
            nameEditable={false}
            showSignatureBox
            hasSignature={hasSignature}
            hideSavedSignature={isDrawing}
          />
        </Animated.View>
      )}

      {isDrawing && sigPadRect && (
        <SignaturePad fromRect={sigPadRect} onClose={closeSignaturePad} />
      )}
    </View>
  )
}
