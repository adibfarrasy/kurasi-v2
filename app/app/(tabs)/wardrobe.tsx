import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import BookmarkSimpleFill from '@/assets/icons/BookmarkSimpleFill.svg'
import DotsNine from '@/assets/icons/DotsNine.svg'
import FunnelSimple from '@/assets/icons/FunnelSimple.svg'
import MagnifyingGlass from '@/assets/icons/MagnifyingGlass.svg'
import ShareFat from '@/assets/icons/ShareFat.svg'
import SquaresFour from '@/assets/icons/SquaresFour.svg'
import { type client, orpc } from '@/lib/orpc-client'

type Item = Awaited<ReturnType<typeof client.clothingItem.list>>[number]
type Category = Item['category']

const CATEGORY_ORDER: Category[] = [
  'tee',
  'collared_shirt',
  'outer',
  'pants',
  'shorts',
  'headwear',
  'footwear',
  'bag',
  'scarf',
  'accessory',
  'dress',
  'skirt',
]

const CATEGORY_LABEL: Record<Category, string> = {
  tee: 'SHIRT',
  collared_shirt: 'COLLARED',
  outer: 'JACKET',
  pants: 'PANTS',
  shorts: 'SHORTS',
  headwear: 'HEADWEAR',
  footwear: 'SHOES',
  bag: 'BAG',
  scarf: 'SCARF',
  accessory: 'ACCESSORY',
  dress: 'DRESS',
  skirt: 'SKIRT',
}

function groupActiveItemsByCategory(query: string, items: Item[]): Map<Category, Item[]> {
  const q = query.trim().toLowerCase()
  const matches = (item: Item) => {
    if (!q) return true
    const words = [
      item.brand ?? '',
      item.primaryColor,
      item.secondaryColor ?? '',
      item.customNotes ?? '',
      CATEGORY_LABEL[item.category],
      ...(item.materials ?? []),
      ...(item.occasions ?? []),
    ]
      .join(' ')
      .toLowerCase()
      .split(/\s+/)
    return words.some((w) => w.startsWith(q))
  }
  const map = new Map<Category, Item[]>()
  for (const item of items) {
    if (item.status !== 'active') continue
    if (!matches(item)) continue
    const bucket = map.get(item.category) ?? []
    bucket.push(item)
    map.set(item.category, bucket)
  }
  return map
}

function ItemCellCompact({ item }: { item: Item }) {
  return (
    <View style={{ width: 80 }}>
      <View
        style={{
          aspectRatio: 1,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        <Image
          source={{ uri: item.imageUrl }}
          style={{ width: '100%', height: '100%' }}
          resizeMode="contain"
        />
      </View>
      <Text
        numberOfLines={2}
        className="mt-1 text-center font-funnel text-[12px] leading-[16px] tracking-[0.06px] text-black"
      >
        {item.brand ?? 'Unbranded'}
      </Text>
    </View>
  )
}

function ItemCellLarge({ item, outfitCount }: { item: Item; outfitCount: number }) {
  const title = item.customNotes ?? `${item.brand ?? ''} ${item.primaryColor}`.trim()
  return (
    <View style={{ width: 168, gap: 4 }}>
      <View
        style={{
          width: 168,
          height: 168,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        <Image
          source={{ uri: item.imageUrl }}
          style={{ width: '90%', height: '90%' }}
          resizeMode="contain"
        />
      </View>
      <View style={{ width: 168, height: 36, gap: 2 }}>
        <Text
          numberOfLines={1}
          className="text-center font-funnel text-[12px] leading-[16px] tracking-[0.06px] text-gray-400"
        >
          {item.brand ?? 'Unbranded'}
        </Text>
        <Text
          numberOfLines={1}
          className="text-center font-funnel font-normal text-[14px] leading-[18px] text-black"
        >
          {title}
        </Text>
      </View>
      {outfitCount > 0 ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            marginTop: 2,
          }}
        >
          <Text className="h-4 w-9 font-funnel font-medium text-[11px] leading-[16px] text-black opacity-50">
            used in
          </Text>
          <BookmarkSimpleFill width={14} height={14} color="#AE0C0C" />
          <Text className="font-funnel font-medium text-[11px] leading-[16px] text-[#AE0C0C]">
            {outfitCount} {outfitCount === 1 ? 'outfit' : 'outfits'}
          </Text>
        </View>
      ) : null}
    </View>
  )
}

type Mode = 'grid' | 'list'

function CategorySection({ label, items, mode }: { label: string; items: Item[]; mode: Mode }) {
  return (
    <View style={{ marginBottom: 20 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          marginBottom: 12,
          paddingHorizontal: 0,
          gap: 8,
        }}
      >
        <View
          style={{
            width: 24,
            height: 1,
            backgroundColor: '#000',
            opacity: 0.1,
          }}
        />
        <Text className="font-funnel font-bold text-[20px] leading-[24px] tracking-[-0.3px] text-black">
          {label}
        </Text>
        <View style={{ flex: 1, height: 1, backgroundColor: '#000', opacity: 0.1 }} />
        <Text className="font-funnel text-[12px] text-black">{items.length}</Text>
        <View
          style={{
            width: 24,
            height: 1,
            backgroundColor: '#000',
            opacity: 0.1,
          }}
        />
      </View>
      {mode === 'list' ? (
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            justifyContent: 'center',
            paddingHorizontal: 20,
            columnGap: 8,
            rowGap: 8,
          }}
        >
          {items.map((item) => (
            <ItemCellCompact key={item.id} item={item} />
          ))}
          {Array.from({ length: (4 - (items.length % 4)) % 4 }).map((_, i) => (
            <View
              key={`phantom-${
                // biome-ignore lint/suspicious/noArrayIndexKey: TODO
                i
              }`}
              style={{ width: 80 }}
            />
          ))}
        </View>
      ) : (
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            justifyContent: 'center',
            paddingHorizontal: 16,
            columnGap: 12,
            rowGap: 20,
          }}
        >
          {items.map((item) => (
            <ItemCellLarge key={item.id} item={item} outfitCount={item.outfitCount ?? 0} />
          ))}
          {Array.from({ length: (2 - (items.length % 2)) % 2 }).map((_, i) => (
            <View
              key={`phantom-${
                // biome-ignore lint/suspicious/noArrayIndexKey: TODO
                i
              }`}
              style={{ width: 168 }}
            />
          ))}
        </View>
      )}
    </View>
  )
}

export default function Wardrobe() {
  const [mode, setMode] = useState<Mode>('grid')
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [keyboardVisible, setKeyboardVisible] = useState(false)
  const itemsQuery = useQuery(orpc.clothingItem.list.queryOptions({ input: {} }))
  const items = itemsQuery.data ?? []
  const loading = itemsQuery.isPending
  const loadError = itemsQuery.error
  const error = loadError
    ? loadError instanceof Error
      ? loadError.message
      : 'Failed to load'
    : null

  useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setKeyboardVisible(true),
    )
    const hide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        setKeyboardVisible(false)
        setSearchOpen(false)
        setQuery('')
      },
    )
    return () => {
      show.remove()
      hide.remove()
    }
  }, [])

  const [refreshing, setRefreshing] = useState(false)

  async function onRefresh() {
    setRefreshing(true)
    try {
      await itemsQuery.refetch()
    } finally {
      setRefreshing(false)
    }
  }

  const grouped = groupActiveItemsByCategory(query, items)

  return (
    <View
      className="pt-16"
      style={{
        flex: 1,
        backgroundColor: '#EBEBEB',
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 20,
          paddingBottom: 16,
        }}
      >
        <Text className="font-bebas text-[48px] leading-[52px] text-black">
          WA
          <Text className="font-kirang text-[58px] leading-[52px]">R</Text>
          DRO
          <Text className="font-kirang text-[58px] leading-[52px]">B</Text>E
        </Text>
        <Pressable
          style={{
            width: 40,
            height: 40,
            borderRadius: 8,
            backgroundColor: '#F2F2F2',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ShareFat width={20} height={20} color="#000" />
        </Pressable>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator />
        </View>
      ) : error ? (
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={{
            flexGrow: 1,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 32,
          }}
        >
          <Text style={{ color: '#ef4444', textAlign: 'center' }}>{error}</Text>
        </ScrollView>
      ) : (
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={{ paddingBottom: 140 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          onScrollBeginDrag={Keyboard.dismiss}
        >
          {CATEGORY_ORDER.filter((c) => (grouped.get(c)?.length ?? 0) > 0).map((c) => (
            <CategorySection
              key={c}
              label={CATEGORY_LABEL[c]}
              items={grouped.get(c) ?? []}
              mode={mode}
            />
          ))}
        </ScrollView>
      )}

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}
      >
        {searchOpen ? (
          <View
            style={{
              height: 72,
              paddingTop: 12,
              paddingRight: 20,
              paddingBottom: 20,
              paddingLeft: 20,
              backgroundColor: '#fff',
              borderTopWidth: 1,
              borderBottomWidth: 1,
              borderColor: 'rgba(0,0,0,0.1)',
              justifyContent: 'center',
            }}
          >
            <View
              style={{
                width: 353,
                height: 40,
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: '#fff',
                borderRadius: 99,
                borderWidth: 1,
                borderColor: 'rgba(173,175,179,0.5)',
                paddingTop: 8,
                paddingBottom: 8,
                paddingLeft: 12,
                paddingRight: 12,
                gap: 8,
              }}
            >
              <MagnifyingGlass width={24} height={24} color="#000" />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search"
                placeholderTextColor="#9ca3af"
                autoFocus
                returnKeyType="search"
                className="flex-1 text-center font-funnel font-normal text-[16px] leading-[22px] tracking-[-0.16px] text-black"
              />
            </View>
          </View>
        ) : null}
        {keyboardVisible ? null : (
          <Toolbar
            mode={mode}
            setMode={setMode}
            onSearchToggle={() => {
              if (searchOpen) {
                setSearchOpen(false)
                setQuery('')
              } else {
                setSearchOpen(true)
              }
            }}
          />
        )}
      </KeyboardAvoidingView>
    </View>
  )
}

function Toolbar({
  mode,
  setMode,
  onSearchToggle,
}: {
  mode: Mode
  setMode: (m: Mode) => void
  onSearchToggle: () => void
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#fff',
        paddingHorizontal: 20,
        paddingVertical: 12,
      }}
    >
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable
          onPress={onSearchToggle}
          style={{
            width: 40,
            height: 40,
            borderRadius: 99,
            borderWidth: 1,
            borderColor: 'rgba(173,175,179,0.5)',
            padding: 8,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <MagnifyingGlass width={22} height={22} color="#000" />
        </Pressable>
        <Pressable
          style={{
            width: 40,
            height: 40,
            borderRadius: 99,
            borderWidth: 1,
            borderColor: 'rgba(173,175,179,0.5)',
            padding: 8,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <FunnelSimple width={22} height={22} color="#000" />
        </Pressable>
      </View>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          backgroundColor: '#E6E6E6',
          borderRadius: 99,
          width: 112,
          height: 40,
          padding: 2,
        }}
      >
        <Pressable
          onPress={() => setMode('grid')}
          style={{
            width: 54,
            height: 36,
            borderRadius: 99,
            backgroundColor: mode === 'grid' ? '#fff' : 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <SquaresFour width={20} height={20} color="#000" />
        </Pressable>
        <Pressable
          onPress={() => setMode('list')}
          style={{
            width: 54,
            height: 36,
            borderRadius: 99,
            backgroundColor: mode === 'list' ? '#fff' : 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <DotsNine width={20} height={20} color="#000" />
        </Pressable>
      </View>
    </View>
  )
}
