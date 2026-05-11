import {
  type BottomSheetBackdropProps,
  type BottomSheetModal,
  BottomSheetModal as BottomSheetModalCmp,
  BottomSheetView,
} from '@gorhom/bottom-sheet'
import { BlurView } from 'expo-blur'
import { useRouter } from 'expo-router'
import { useAtom, useAtomValue } from 'jotai'
import { forwardRef, useRef } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { interpolate, useAnimatedProps, useAnimatedStyle } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { MembershipCardView } from '@/components/membership-card-view'
import { TAB_BAR_BOTTOM_GAP } from '@/lib/layout'
import {
  avatarJobErrorAtom,
  avatarJobResultUrlAtom,
  avatarJobSessionIdAtom,
} from '@/state/avatar-job'
import { cardNameAtom } from '@/state/membership'
import { signaturePathsAtom } from '@/state/signature'

const AnimatedBlurView = Animated.createAnimatedComponent(BlurView)

type Step = 'name' | 'signature'

export type SignatureRect = { x: number; y: number; width: number; height: number }

type Props = {
  headerOffset?: number
  bottomOffset?: number
  step: Step
  onStepChange: (step: Step) => void
  onOpenSignaturePad?: (rect: SignatureRect) => void
  hasSignature?: boolean
  hideCard?: boolean
}

export const MembershipCardSheet = forwardRef<BottomSheetModal, Props>(
  (
    {
      headerOffset = 0,
      bottomOffset = 0,
      step,
      onStepChange,
      onOpenSignaturePad,
      hasSignature = false,
      hideCard,
    },
    ref,
  ) => {
    const router = useRouter()
    const insets = useSafeAreaInsets()

    const [name, setName] = useAtom(cardNameAtom)
    const signaturePaths = useAtomValue(signaturePathsAtom)
    const avatarSessionId = useAtomValue(avatarJobSessionIdAtom)
    const avatarResultUrl = useAtomValue(avatarJobResultUrlAtom)
    const avatarError = useAtomValue(avatarJobErrorAtom)
    const sigBoxRef = useRef<View | null>(null)

    const title = step === 'name' ? 'Customize your membership card' : 'Next, add your signature'
    // Signature step gates Continue on actual drawn strokes — `hasSignature`
    // flips true the moment the pad opens, so it's not a reliable "user
    // actually signed" signal. The atom is the source of truth for strokes.
    const hasDrawnSignature = signaturePaths.length > 0
    // If the user uploaded a face photo, hold Continue until the backend
    // avatar job lands (or errors out — in which case we degrade gracefully
    // and let them through with the static mannequin). Skipped face-upload
    // means no sessionId at all, so this gate is a no-op for that path.
    const avatarPending = !!avatarSessionId && !avatarResultUrl && !avatarError
    const canContinue =
      step === 'name' ? name.trim().length > 0 : hasDrawnSignature && !avatarPending

    function onContinue() {
      if (step === 'name') {
        onStepChange('signature')
      } else {
        // Signature step → AI credits welcome-gift screen, which is the
        // actual onboarding terminus and calls completeOnboarding itself.
        router.push('/onboarding-ai-credits')
      }
    }

    return (
      <BottomSheetModalCmp
        ref={ref}
        enableDynamicSizing
        enablePanDownToClose={false}
        // Keyboard handling: 'interactive' tracks the keyboard frame so the
        // sheet (and the card inside) shifts up as soon as the name input
        // is focused, instead of the keyboard covering it. 'restore' brings
        // the sheet back to its natural position on blur. android adjustPan
        // mirrors iOS behavior so the same UX works on both platforms.
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        android_keyboardInputMode="adjustPan"
        backgroundStyle={{ backgroundColor: 'transparent' }}
        handleComponent={null}
        backdropComponent={(props) => (
          <HeaderAwareBackdrop
            {...props}
            topOffset={headerOffset}
            bottomOffset={bottomOffset}
            // Once the user has filled in both name + signature, drop the
            // backdrop entirely so the mannequin/avatar above the sheet
            // becomes clearly visible. This is what "unblur the avatar"
            // means in practice — the mannequin's blur was the backdrop's
            // doing, not AvatarLoader's.
            hidden={hasDrawnSignature && name.trim().length > 0}
          />
        )}
      >
        <BottomSheetView style={{ paddingHorizontal: 24, paddingTop: 8 }}>
          <Text
            className="text-black text-center mb-4"
            style={{
              fontSize: 14,
              fontWeight: '700',
              lineHeight: 18,
              letterSpacing: 0,
              // Hide the title once a signature has been drawn — the
              // "Next, add your signature" prompt is no longer relevant
              // (and visually noisy) once the action it asks for is done.
              opacity: hideCard || (step === 'signature' && hasDrawnSignature) ? 0 : 1,
            }}
          >
            {title}
          </Text>

          <View style={{ opacity: hideCard ? 0 : 1 }}>
            <MembershipCardView
              name={name}
              onChangeName={setName}
              nameEditable={step === 'name'}
              showSignatureBox={step === 'signature'}
              hasSignature={hasSignature}
              sigBoxRef={sigBoxRef}
              insideBottomSheet
              onPressSigBox={() => {
                sigBoxRef.current?.measureInWindow((x, y, width, height) => {
                  onOpenSignaturePad?.({ x, y, width, height })
                })
              }}
            />
          </View>

          {step === 'name' || hasDrawnSignature ? (
            <Pressable
              className="mt-6 h-[56px] rounded-full items-center justify-center"
              style={{
                backgroundColor: canContinue ? 'rgba(0,0,0,0.9)' : '#9A9A9A',
                marginBottom: insets.bottom + TAB_BAR_BOTTOM_GAP,
                // Hide the Continue button while the signature pad is zoomed —
                // otherwise it appears at the screen bottom directly under the
                // pad's own Save button (the user sees both stacked) since
                // strokes flip `hasDrawnSignature` true inside the pad.
                opacity: hideCard ? 0 : 1,
              }}
              disabled={!canContinue || hideCard}
              onPress={onContinue}
            >
              <Text className="text-white text-[16px] font-medium tracking-[-0.24px]">
                Continue
              </Text>
            </Pressable>
          ) : (
            // Invisible placeholder (signature step, no strokes yet) keeps the
            // sheet's intrinsic height stable so the card doesn't reflow when
            // Continue appears the moment the user finishes signing.
            <View
              pointerEvents="none"
              style={{
                marginTop: 24,
                height: 56,
                marginBottom: insets.bottom + TAB_BAR_BOTTOM_GAP,
              }}
            />
          )}
        </BottomSheetView>
      </BottomSheetModalCmp>
    )
  },
)

MembershipCardSheet.displayName = 'MembershipCardSheet'

function HeaderAwareBackdrop({
  style,
  animatedIndex,
  topOffset,
  bottomOffset,
  hidden,
}: BottomSheetBackdropProps & { topOffset: number; bottomOffset: number; hidden: boolean }) {
  const tintStyle = useAnimatedStyle(() => ({
    opacity: interpolate(animatedIndex.value, [-1, 0], [0, 1], 'clamp'),
  }))
  const blurProps = useAnimatedProps(() => ({
    intensity: interpolate(animatedIndex.value, [-1, 0], [0, 40], 'clamp'),
  }))
  if (hidden) return null
  return (
    <Animated.View
      pointerEvents="none"
      style={[style, StyleSheet.absoluteFill, { top: topOffset, bottom: bottomOffset }, tintStyle]}
    >
      <AnimatedBlurView
        tint="light"
        animatedProps={blurProps}
        style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.1)' }]}
      />
    </Animated.View>
  )
}
