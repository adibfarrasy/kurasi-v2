import { Image, Pressable, ScrollView, Text, View } from 'react-native'
import { AddItem } from '@/components/textured-icons'

const CARD_WIDTH = 88
const CARD_HEIGHT = 100

const cardBaseStyle = {
  width: CARD_WIDTH,
  height: CARD_HEIGHT,
  paddingTop: 8,
  paddingRight: 8,
  paddingBottom: 4,
  paddingLeft: 8,
  gap: 4,
  borderRadius: 2,
  backgroundColor: '#FFFFFF',
  shadowColor: '#000',
  shadowOpacity: 0.4,
  shadowRadius: 1,
  shadowOffset: { width: 0.5, height: 1 },
  elevation: 2,
} as const

export type SlotItem = {
  id: string
  imageUrl: string
  brand: string | null
  /** When true, renders a small red dot next to the slot label to flag that
   *  the slot has been changed from its initial state. */
  changed?: boolean
  /** When true, renders a small diamond glyph between the image and the
   *  brand caption to flag that the item is AI-generated rather than a
   *  real wardrobe row the user owns. */
  aiGenerated?: boolean
}

export function SlotCard({
  label,
  item,
  index,
  onPress,
}: {
  label: string
  item: SlotItem | null
  /** Used to alternate the card's tilt (-1° / +1°) so neighbouring cards
   *  rotate opposite directions. */
  index: number
  onPress?: () => void
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        cardBaseStyle,
        {
          overflow: 'visible',
          transform: [{ rotate: index % 2 === 0 ? '-1deg' : '1deg' }],
        },
      ]}
    >
      <View
        style={{
          position: 'absolute',
          // Negative offsets push the label outside the card's top-left so
          // the rotated text reads as a sticker peeking past the corner.
          // Pivot stays at 0% 0% so left/top set the rotated baseline.
          left: -1,
          top: -1,
          zIndex: 2,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          transformOrigin: '0% 0%',
          transform: [{ rotate: '-15deg' }],
        }}
      >
        <Text className="font-funnel font-bold text-[9px] leading-[12px] tracking-[0.18px] text-red-600 opacity-[0.68] uppercase">
          {label}
        </Text>
        {item?.changed ? (
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#FF0D00' }} />
        ) : null}
      </View>
      {item ? (
        <Image
          source={{ uri: item.imageUrl }}
          style={{ width: '100%', flex: 1 }}
          resizeMode="contain"
        />
      ) : (
        <View style={{ flex: 1 }} />
      )}
      {item?.aiGenerated ? (
        <Image
          source={require('@/assets/diamond.png')}
          style={{ width: 16, height: 14, alignSelf: 'center' }}
          resizeMode="contain"
        />
      ) : (
        <Text numberOfLines={1} style={{ fontSize: 9, color: '#444', textAlign: 'center' }}>
          {item?.brand ?? ''}
        </Text>
      )}
    </Pressable>
  )
}

/**
 * Empty/Add Item slot card matching the slot-strip style. Renders the
 * AddItem.svg (74x65) plus a "+ Add Item" caption underneath. The card
 * itself is 90x100 with a faint right-side divider.
 */
export function AddSlotCard({ onPress, disabled }: { onPress?: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      style={{
        width: 90,
        height: 100,
        padding: 8,
        gap: 7,
        borderRadius: 2,
        borderRightWidth: 1,
        borderColor: 'rgba(0,0,0,0.1)',
        backgroundColor: '#FFFFFF',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOpacity: 0.4,
        shadowRadius: 1,
        shadowOffset: { width: 0.5, height: 1 },
        elevation: 2,
      }}
    >
      <AddItem width={74} height={65} />
      <Text className="font-funnel h-[12px] w-[74px] text-center text-[9px] leading-[12px] tracking-[0.18px] text-[#3C3C3C]">
        + Add Item
      </Text>
    </Pressable>
  )
}

export type SlotEntry = {
  /** Stable key per slot (e.g. 'base', 'outer'). */
  key: string
  /** UPPERCASE label rendered in red on the card (e.g. 'SHIRT'). */
  label: string
  item: SlotItem | null
  onPress?: () => void
}

/**
 * Horizontal slot strip. Renders the `slots` as tilted SlotCards inside a
 * scrollable row. If `onAdd` is provided, an AddSlotCard is rendered at the
 * left, pinned (does not scroll with the rest), matching the Try On screen.
 *
 * Used by both the saved-outfit detail page and the Try On page so the card
 * styling stays in lockstep.
 */
export function SlotStrip({
  slots,
  onAdd,
  addDisabled,
}: {
  slots: SlotEntry[]
  onAdd?: () => void
  /** When true, the AddSlotCard renders in its disabled (greyed) state and
   *  does not invoke `onAdd`. Used on the Try On screen when the user is
   *  reviewing a Steal-the-Look draft. */
  addDisabled?: boolean
}) {
  return (
    <View
      style={{
        height: 132,
        paddingTop: 12,
        paddingRight: 20,
        paddingBottom: 16,
        paddingLeft: 20,
        overflow: 'visible',
      }}
    >
      {/* Scroll first, full width, so cards can slide UNDER the AddSlotCard. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          gap: 8,
          alignItems: 'center',
          // Reserve space at the start equal to the AddSlotCard width (90) +
          // the gap (8) so the first scrollable card lines up just to the
          // right of the pinned card and doesn't sit underneath it at rest.
          paddingLeft: onAdd ? 90 + 8 : 0,
        }}
        style={{ flexGrow: 1, overflow: 'visible' }}
      >
        {slots.map((s, i) => (
          <SlotCard key={s.key} label={s.label} item={s.item} index={i} onPress={s.onPress} />
        ))}
      </ScrollView>
      {onAdd ? (
        <View
          pointerEvents="box-none"
          style={{
            position: 'absolute',
            left: 20,
            top: 12,
            bottom: 16,
            zIndex: 5,
          }}
        >
          <AddSlotCard onPress={onAdd} disabled={addDisabled} />
        </View>
      ) : null}
    </View>
  )
}
