import { View } from 'react-native'
import Animated, {
  Extrapolation,
  interpolate,
  type SharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated'

export const WHEEL_ITEM_HEIGHT = 38
export const WHEEL_VISIBLE_COUNT = 5

type WheelPickerProps<T> = {
  items: T[]
  initialIndex: number
  onChange: (index: number) => void
  renderLabel: (value: T) => string
}

/**
 * Vertical scroll-snap wheel picker (single column). Items at the center are
 * full-size; ±1 and ±2 from center compress vertically via `scaleY` to give
 * the iOS-style drum perspective. Width is preserved so glyphs don't get
 * thinner — only the height squashes. Animation is driven by a Reanimated
 * shared value updated on the UI thread, so the squash interpolates smoothly
 * during scroll without crossing the JS bridge.
 *
 * Combine multiple instances side-by-side for a multi-column picker (see
 * `app/onboarding-3.tsx`). The highlight band for the selected row is the
 * caller's responsibility — typically a sibling absolutely-positioned at
 * `top: WHEEL_ITEM_HEIGHT * Math.floor(WHEEL_VISIBLE_COUNT / 2)`.
 */
export function WheelPicker<T>({
  items,
  initialIndex,
  onChange,
  renderLabel,
}: WheelPickerProps<T>) {
  const offsetY = useSharedValue(initialIndex * WHEEL_ITEM_HEIGHT)

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      offsetY.value = e.contentOffset.y
    },
  })

  const padding = WHEEL_ITEM_HEIGHT * Math.floor(WHEEL_VISIBLE_COUNT / 2)

  return (
    <View className="flex-1" style={{ overflow: 'hidden' }}>
      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        snapToInterval={WHEEL_ITEM_HEIGHT}
        decelerationRate="fast"
        contentOffset={{ x: 0, y: initialIndex * WHEEL_ITEM_HEIGHT }}
        contentContainerStyle={{ paddingVertical: padding }}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        onMomentumScrollEnd={(e) => {
          const idx = Math.round(e.nativeEvent.contentOffset.y / WHEEL_ITEM_HEIGHT)
          const clamped = Math.max(0, Math.min(items.length - 1, idx))
          onChange(clamped)
        }}
      >
        {items.map((item, i) => (
          <WheelItem
            key={renderLabel(item)}
            label={renderLabel(item)}
            index={i}
            offsetY={offsetY}
          />
        ))}
      </Animated.ScrollView>
    </View>
  )
}

function WheelItem({
  label,
  index,
  offsetY,
}: {
  label: string
  index: number
  offsetY: SharedValue<number>
}) {
  const animatedTextStyle = useAnimatedStyle(() => {
    const distance = Math.abs(index * WHEEL_ITEM_HEIGHT - offsetY.value) / WHEEL_ITEM_HEIGHT
    return {
      opacity: interpolate(distance, [0, 1, 2], [1, 0.66, 0.33], Extrapolation.CLAMP),
      transform: [
        { scaleY: interpolate(distance, [0, 1, 2], [1, 0.66, 0.33], Extrapolation.CLAMP) },
      ],
    }
  })

  return (
    <View style={{ height: WHEEL_ITEM_HEIGHT, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.Text
        style={[
          {
            color: '#000',
            fontSize: 16,
            fontWeight: '400',
            lineHeight: 22,
            letterSpacing: -0.16,
          },
          animatedTextStyle,
        ]}
      >
        {label}
      </Animated.Text>
    </View>
  )
}
