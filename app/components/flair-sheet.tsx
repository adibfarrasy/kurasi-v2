import {
  type BottomSheetBackdropProps,
  BottomSheetModal,
  type BottomSheetModalProps,
} from '@gorhom/bottom-sheet'
import { BlurView } from 'expo-blur'
import { forwardRef, useCallback, useRef } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import Animated, { interpolate, useAnimatedProps, useAnimatedStyle } from 'react-native-reanimated'
import { TopFlair } from '@/components/top-flair'

const AnimatedBlurView = Animated.createAnimatedComponent(BlurView)

/**
 * Light-tinted Gaussian backdrop that fades + blurs in lockstep with the
 * sheet's animatedIndex. Tapping anywhere outside the sheet calls
 * `onPress`. Shared by every "flair sheet" (TopFlair handle + white card)
 * across the app — try-on AddItemSheet, SaveFitSheet, PlusModal, etc.
 */
export function FlairBlurBackdrop({
  style,
  animatedIndex,
  onPress,
}: BottomSheetBackdropProps & { onPress?: () => void }) {
  const tintStyle = useAnimatedStyle(() => ({
    opacity: interpolate(animatedIndex.value, [-1, 0], [0, 1], 'clamp'),
  }))
  const blurProps = useAnimatedProps(() => ({
    intensity: interpolate(animatedIndex.value, [-1, 0], [0, 40], 'clamp'),
  }))
  return (
    <Animated.View style={[style, StyleSheet.absoluteFill, tintStyle]}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onPress}>
        <AnimatedBlurView
          tint="light"
          animatedProps={blurProps}
          style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.1)' }]}
        />
      </Pressable>
    </Animated.View>
  )
}

/**
 * The shared visual treatment for our bottom sheets: white card with the
 * TopFlair torn-paper handle and a blur backdrop. Wraps BottomSheetModal
 * and forwards the ref so callers can `.present()` / `.dismiss()`.
 *
 * Pass any extra BottomSheetModal props through (snapPoints,
 * enableDynamicSizing, footerComponent, keyboardBehavior, …).
 */
export const FlairSheet = forwardRef<BottomSheetModal, BottomSheetModalProps>(
  ({ children, ...rest }, ref) => {
    const localRef = useRef<BottomSheetModal>(null)
    // Merge the forwarded ref with our local one via a memoized callback
    // ref. WITHOUT useCallback, RN sees a fresh function on every parent
    // render, calls the old ref with `null`, and re-attaches with the
    // new function — which has the side effect of reinitializing the
    // BottomSheetModal's internal isOpen state, manifesting as the
    // dismissed sheet popping back open the next time the parent
    // re-renders (e.g. when the form pages forward).
    const setRef = useCallback(
      (node: BottomSheetModal | null) => {
        localRef.current = node
        if (typeof ref === 'function') ref(node)
        else if (ref) ref.current = node
      },
      [ref],
    )
    // Memoize the render-prop components so gorhom doesn't see fresh
    // function identities on every parent re-render — fresh refs make
    // gorhom recreate internal handlers, which can race with the
    // animatedIndex and re-present a dismissed sheet.
    const backgroundComponent = useCallback(
      // biome-ignore lint/suspicious/noExplicitAny: gorhom's BottomSheetBackgroundProps style isn't worth importing
      ({ style }: any) => (
        <View
          style={[style, { backgroundColor: '#fff', top: 12, borderRadius: 0 }]}
          pointerEvents="none"
        />
      ),
      [],
    )
    const handleComponent = useCallback(
      () => (
        <View>
          <TopFlair />
          <View style={{ height: 15 }} />
          <View style={{ height: 1, backgroundColor: '#E5E5E5' }} />
        </View>
      ),
      [],
    )
    const backdropComponent = useCallback(
      (props: BottomSheetBackdropProps) => (
        <FlairBlurBackdrop {...props} onPress={() => localRef.current?.dismiss()} />
      ),
      [],
    )
    return (
      <BottomSheetModal
        ref={setRef}
        enablePanDownToClose
        // Default 'switch' keeps dismissed modals in a hidden stack and
        // restores them when the topmost dismisses, which causes a
        // previously-shown sheet to reappear after another sheet closes.
        // 'replace' drops the previous modal so each present is
        // independent.
        stackBehavior="replace"
        backgroundStyle={{ backgroundColor: 'transparent', borderRadius: 0 }}
        backgroundComponent={backgroundComponent}
        handleComponent={handleComponent}
        backdropComponent={backdropComponent}
        {...rest}
      >
        {children}
      </BottomSheetModal>
    )
  },
)

FlairSheet.displayName = 'FlairSheet'
