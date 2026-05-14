import { useAtom } from 'jotai'
import { useEffect, useRef, useState } from 'react'
import { Dimensions, Image, PanResponder, Pressable, Text, View } from 'react-native'
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Path } from 'react-native-svg'
import { TAB_BAR_BOTTOM_GAP } from '@/lib/layout'
import { signaturePathsAtom } from '@/state/signature'

const ANIM_MS = 300
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window')

export type SignaturePadRect = { x: number; y: number; width: number; height: number }

type Props = {
  fromRect: SignaturePadRect
  onClose: () => void
}

/**
 * Fullscreen signature drawing overlay that zooms in from a small source rect
 * (the dashed signature box on the membership card) and zooms back out on
 * Save. Drawing is implemented as cumulative SVG `<Path>` strings — strokes
 * are recorded as `M…L…L…` data and persisted in `signaturePathsAtom`.
 *
 * Animation is driven by a single Reanimated `progress` shared value
 * (0 = collapsed at fromRect, 1 = expanded full canvas). Drawing is gated
 * until `progress === 1` so coordinate space stays stable while interpolating.
 */
export function SignaturePad({ fromRect, onClose }: Props) {
  const insets = useSafeAreaInsets()
  const [paths, setPaths] = useAtom(signaturePathsAtom)
  const [currentPath, setCurrentPath] = useState('')
  const progress = useSharedValue(0)

  // Match the card's 3x zoom: the scaled sig box is exactly 100x60 * 3 and
  // ends up centered on screen (the card's transformOrigin scale + translate
  // composition lands the box at screen center).
  const PAD_WIDTH = fromRect.width * 3
  const PAD_HEIGHT = fromRect.height * 3
  const TARGET_X = SCREEN_W / 2 - PAD_WIDTH / 2
  const TARGET_Y = SCREEN_H / 2 - PAD_HEIGHT / 2

  useEffect(() => {
    progress.value = withTiming(1, { duration: ANIM_MS })
  }, [progress])

  function handleSave() {
    // Don't animate the pad's collapse — the signature would visibly fly
    // back to the bottom-right corner. The page-level card handles its own
    // zoom-out animation; we just unmount immediately so the strokes hand
    // off to the card's sig box overlay.
    onClose()
  }

  const containerStyle = useAnimatedStyle(() => ({
    left: interpolate(progress.value, [0, 1], [fromRect.x, TARGET_X]),
    top: interpolate(progress.value, [0, 1], [fromRect.y, TARGET_Y]),
    width: interpolate(progress.value, [0, 1], [fromRect.width, PAD_WIDTH]),
    height: interpolate(progress.value, [0, 1], [fromRect.height, PAD_HEIGHT]),
  }))

  const controlsStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.7, 1], [0, 1], Extrapolation.CLAMP),
  }))

  // Track the active stroke in a ref so the PanResponder closure always reads
  // the current value without nesting setState calls (which React rejects as
  // "setState during render of another component").
  const currentPathRef = useRef('')

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        const { locationX, locationY } = e.nativeEvent
        currentPathRef.current = `M${locationX.toFixed(1)},${locationY.toFixed(1)}`
        setCurrentPath(currentPathRef.current)
      },
      onPanResponderMove: (e) => {
        const { locationX, locationY } = e.nativeEvent
        currentPathRef.current = `${currentPathRef.current} L${locationX.toFixed(1)},${locationY.toFixed(1)}`
        setCurrentPath(currentPathRef.current)
      },
      onPanResponderRelease: () => {
        const p = currentPathRef.current
        if (p) setPaths((prev) => [...prev, p])
        currentPathRef.current = ''
        setCurrentPath('')
      },
    }),
  ).current

  return (
    <View
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 2000,
      }}
    >
      {/*
        Backdrop intentionally omitted: the card itself is being scaled 3x
        beneath us (via `zoomProgress` on MembershipCardSheet), so the visual
        "zoom" comes from the actual card growing — not from a curtain over it.
      */}

      <Animated.View
        {...panResponder.panHandlers}
        style={[
          {
            position: 'absolute',
            overflow: 'hidden',
          },
          containerStyle,
        ]}
      >
        <Svg style={{ flex: 1 }}>
          {paths.map((d) => (
            <Path
              key={d}
              d={d}
              stroke="#000"
              strokeWidth={3}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
          {currentPath ? (
            <Path
              d={currentPath}
              stroke="#000"
              strokeWidth={3}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}
        </Svg>
      </Animated.View>

      <Animated.View
        pointerEvents="box-none"
        style={[
          {
            position: 'absolute',
            // 40px below the zoomed card's bottom edge. The sig box sits at
            // the bottom-right of the card, so the card's bottom edge ≈ the
            // dashed box bottom edge = TARGET_Y + PAD_HEIGHT (≈ SCREEN_H/2 + 90).
            top: TARGET_Y + PAD_HEIGHT + 40,
            left: 0,
            right: 0,
            alignItems: 'center',
          },
          controlsStyle,
        ]}
      >
        <Pressable
          onPress={() => setPaths([])}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            backgroundColor: '#fff',
            paddingLeft: 4,
            paddingRight: 12,
            paddingVertical: 8,
            borderRadius: 999,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.1,
            shadowRadius: 3,
          }}
        >
          <Image
            source={require('@/assets/trash.png')}
            style={{ width: 24, height: 16 }}
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
            Erase
          </Text>
        </Pressable>
      </Animated.View>

      <Animated.View
        style={[
          {
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            paddingHorizontal: 30,
            paddingBottom: insets.bottom + TAB_BAR_BOTTOM_GAP,
          },
          controlsStyle,
        ]}
      >
        <Pressable
          onPress={handleSave}
          style={{
            height: 56,
            backgroundColor: 'rgba(0,0,0,0.9)',
            borderRadius: 999,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text
            style={{
              color: '#fff',
              fontSize: 16,
              fontWeight: '500',
              letterSpacing: -0.24,
            }}
          >
            Save
          </Text>
        </Pressable>
      </Animated.View>
    </View>
  )
}
