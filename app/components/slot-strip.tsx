import { Image, Pressable, ScrollView, Text, View } from 'react-native'
import AddItem from '@/assets/icons/AddItem.svg'

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

const labelStyle = {
  position: 'absolute',
  top: 8,
  left: 8,
  width: 38,
  height: 18,
  fontFamily: 'Kirang',
  fontSize: 14,
  lineHeight: 14,
  letterSpacing: -0.42,
  color: '#dc2626',
  opacity: 0.68,
  textTransform: 'uppercase',
  transform: [{ rotate: '-15deg' }],
  zIndex: 2,
} as const

export type SlotItem = {
  id: string
  imageUrl: string
  brand: string | null
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
        { transform: [{ rotate: index % 2 === 0 ? '-1deg' : '1deg' }] },
      ]}
    >
      <Text style={labelStyle}>{label}</Text>
      {item ? (
        <Image
          source={{ uri: item.imageUrl }}
          style={{ width: '100%', flex: 1 }}
          resizeMode="contain"
        />
      ) : (
        <View style={{ flex: 1 }} />
      )}
      <Text
        numberOfLines={1}
        style={{ fontSize: 9, color: '#444', textAlign: 'center' }}
      >
        {item?.brand ?? ''}
      </Text>
    </Pressable>
  )
}

/**
 * Empty/Add Item slot card matching the slot-strip style. Renders the
 * AddItem.svg (74x65) plus a "+ Add Item" caption underneath. The card
 * itself is 90x100 with a faint right-side divider.
 */
export function AddSlotCard({ onPress }: { onPress?: () => void }) {
  return (
    <Pressable
      onPress={onPress}
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
      <AddItem width={74} height={65} color="#000" />
      <Text
        style={{
          width: 74,
          height: 12,
          fontFamily: 'Inter',
          fontSize: 9,
          lineHeight: 12,
          letterSpacing: 0.18,
          color: '#3C3C3C',
          textAlign: 'center',
        }}
      >
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
}: {
  slots: SlotEntry[]
  onAdd?: () => void
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingTop: 12,
        paddingBottom: 16,
        paddingLeft: 20,
        gap: 8,
      }}
    >
      {onAdd ? <AddSlotCard onPress={onAdd} /> : null}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingRight: 20,
          gap: 8,
          alignItems: 'center',
        }}
        style={{ flexGrow: 1 }}
      >
        {slots.map((s, i) => (
          <SlotCard
            key={s.key}
            label={s.label}
            item={s.item}
            index={i}
            onPress={s.onPress}
          />
        ))}
      </ScrollView>
    </View>
  )
}
