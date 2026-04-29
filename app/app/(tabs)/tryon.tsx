import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Image, Pressable, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import BookmarkSimple from '@/assets/icons/BookmarkSimple.svg'
import List from '@/assets/icons/List.svg'
import ShareFat from '@/assets/icons/ShareFat.svg'
import { HeroFloor } from '@/components/hero-floor'
import { SlotStrip } from '@/components/slot-strip'
import { ToneBackground } from '@/components/tone-background'
import { client } from '@/lib/orpc-client'
import { getOutfitTone } from '@/lib/outfit-tone'

type Item = Awaited<ReturnType<typeof client.clothingItem.list>>[number]
type SlotKey = 'headwear' | 'base' | 'outer' | 'bottom' | 'footwear'

const SLOTS: Array<{
  key: SlotKey
  label: string
  matches: (cat: Item['category']) => boolean
}> = [
  { key: 'headwear', label: 'HAT', matches: (c) => c === 'headwear' },
  {
    key: 'base',
    label: 'SHIRT',
    matches: (c) => c === 'tee' || c === 'collared_shirt',
  },
  { key: 'outer', label: 'JACKET', matches: (c) => c === 'outer' },
  {
    key: 'bottom',
    label: 'PANTS',
    matches: (c) => c === 'pants' || c === 'shorts' || c === 'skirt',
  },
  { key: 'footwear', label: 'SHOES', matches: (c) => c === 'footwear' },
]

export default function TryOn() {
  const insets = useSafeAreaInsets()
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selection, setSelection] = useState<Partial<Record<SlotKey, string>>>({})

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const rows = await client.clothingItem.list()
        if (cancelled) return
        setItems(rows)
        // PM note: there is no empty state — default to white shirt + white
        // pants. We hydrate from the user's wardrobe (closest white items
        // available) until system stock defaults exist.
        const defaultBase =
          rows.find((i) => i.category === 'tee' && i.primaryColor === 'white') ??
          rows.find((i) => i.category === 'tee')
        const defaultBottom =
          rows.find((i) => i.category === 'pants' && i.primaryColor === 'white') ??
          rows.find((i) => i.category === 'pants' && i.primaryColor === 'cream') ??
          rows.find((i) => i.category === 'pants')
        const next: Partial<Record<SlotKey, string>> = {}
        if (defaultBase) next.base = defaultBase.id
        if (defaultBottom) next.bottom = defaultBottom.id
        setSelection(next)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items])

  const filledSlots = SLOTS.map((s) => {
    const id = selection[s.key]
    return { ...s, item: id ? (itemsById.get(id) ?? null) : null }
  })

  const tone = getOutfitTone(filledSlots.flatMap((s) => (s.item ? [s.item.primaryColor] : [])))

  // Per PM: the hero is always the system default figure (white shirt +
  // white pants) until the try-on AI composites a real outfit on top. Slot
  // selections drive the strip and tone gradient but not the figure itself.

  return (
    <ToneBackground tone={tone}>
      <View style={{ flex: 1 }}>
        {/* Header — absolutely positioned so the figure can sit underneath
         *  it in the normal flow without the layout reflowing. */}
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: insets.top + 8,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 20,
            height: 48,
          }}
        >
          <View style={{ width: 24 }} />
          <Image
            source={require('@/assets/logomark.png')}
            style={{
              width: 104,
              height: 40,
              borderRadius: 4,
              tintColor: 'white',
            }}
            resizeMode="contain"
          />
          <Pressable>
            <List width={24} height={24} color="white" />
          </Pressable>
        </View>

        {/* Hero (composite — placeholder until try-on AI is wired)
         * TODO: replace default_man with the user's AI-generated avatar
         * produced during onboarding (height/weight/face photo step). The
         * production source should come from user.profile.avatarImageUrl,
         * with selected slot items composited on top via the try-on
         * rendering pipeline.
         *
         * Positioned absolutely starting 8px from the safe-area top so the
         * figure overlaps (and visually sits in front of) the logo header,
         * per Figma. Bottom-bounded so the slot strip stays clear. */}
        {loading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color="white" />
          </View>
        ) : (
          <HeroFloor
            source={require('@/assets/default_man.png')}
            topOffset={insets.top + 8}
            maxHeight={520}
          />
        )}

        {/* Side icons (bookmark + share) */}
        <View
          pointerEvents="box-none"
          style={{
            position: 'absolute',
            left: 20,
            bottom: 160,
            width: 48,
            height: 108,
            gap: 12,
          }}
        >
          <Pressable
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              paddingTop: 20,
              paddingRight: 10,
              paddingBottom: 20,
              paddingLeft: 10,
              gap: 10,
              backgroundColor: 'rgba(255,255,255,0.15)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <BookmarkSimple width={24} height={24} color="#000" />
          </Pressable>
          <Pressable
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              paddingTop: 20,
              paddingRight: 10,
              paddingBottom: 20,
              paddingLeft: 10,
              gap: 10,
              backgroundColor: 'rgba(255,255,255,0.15)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ShareFat width={24} height={24} color="#000" />
          </Pressable>
        </View>

        <SlotStrip
          onAdd={() => {}}
          slots={filledSlots
            .filter((s) => s.item)
            .map((s) => ({
              key: s.key,
              label: s.label,
              item: s.item,
            }))}
        />
      </View>

      {error ? (
        <View style={{ position: 'absolute', top: 80, alignSelf: 'center' }}>
          <Text style={{ color: '#ef4444' }}>{error}</Text>
        </View>
      ) : null}
    </ToneBackground>
  )
}
