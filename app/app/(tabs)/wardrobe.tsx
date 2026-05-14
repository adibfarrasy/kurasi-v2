import { type BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet'
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs'
import { useQuery } from '@tanstack/react-query'
import { forwardRef, memo, useEffect, useImperativeHandle, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Dimensions,
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
import { FlairSheet } from '@/components/flair-sheet'
import { ProfileSheet, type ProfileSheetHandle } from '@/components/profile-sheet'
import {
  BookmarkSimpleFill,
  DotsNine,
  List,
  MagnifyingGlass,
  Share as ShareFat,
  Sort,
  TShirt,
} from '@/components/textured-icons'
import { type client, orpc } from '@/lib/orpc-client'

type Item = Awaited<ReturnType<typeof client.clothingItem.list>>[number]
type Category = Item['category']
type Filter = Category | 'all'

const CATEGORY_ORDER: Category[] = ['headwear', 'shirt', 'jacket', 'pants', 'footwear']

const CATEGORY_LABEL: Record<Category, string> = {
  headwear: 'HEADWEAR',
  shirt: 'SHIRT',
  jacket: 'JACKET',
  pants: 'PANTS',
  footwear: 'SHOES',
}

// Display labels for the filter sheet rows + the toolbar's filter
// pill. Capitalised English instead of the screaming-uppercase used as
// section headers elsewhere; "Outer" is the user-facing alias for the
// "jacket" category.
const FILTER_LABEL: Record<Filter, string> = {
  all: 'All',
  headwear: 'Headwear',
  shirt: 'Shirt',
  jacket: 'Jacket',
  pants: 'Pants',
  footwear: 'Footwear',
}
const FILTER_ORDER: Filter[] = ['all', ...CATEGORY_ORDER]

// Split `text` into segments and wrap occurrences of `query`
// (case-insensitive, exact substring) in a Text node with a white pill
// background so matched search terms stand out against the grey wardrobe
// canvas. Used inside ItemCellCompact / ItemCellLarge when search is on.
function highlightMatches(text: string, query: string): React.ReactNode[] {
  const q = query.trim()
  if (!q) return [text]
  const lc = text.toLowerCase()
  const lcq = q.toLowerCase()
  const out: React.ReactNode[] = []
  let i = 0
  let key = 0
  while (i < text.length) {
    const idx = lc.indexOf(lcq, i)
    if (idx === -1) {
      if (i < text.length) out.push(text.slice(i))
      break
    }
    if (idx > i) out.push(text.slice(i, idx))
    out.push(
      <Text key={`hl-${key++}`} style={{ backgroundColor: '#fff' }}>
        {text.slice(idx, idx + q.length)}
      </Text>,
    )
    i = idx + q.length
  }
  return out
}

function groupActiveItemsByCategory(query: string, items: Item[]): Map<Category, Item[]> {
  const q = query.trim().toLowerCase()
  const matches = (item: Item) => {
    if (!q) return true
    const words = [item.name ?? '', item.brand ?? '', ...item.colors.map((c) => c.name)]
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

function ItemCellCompact({ item, query }: { item: Item; query: string }) {
  const label = item.name ?? item.brand ?? 'Unnamed'
  // Highlight only when the displayed label IS the item's name —
  // matches on brand/color shouldn't pill-highlight the brand fallback.
  const highlightable = item.name != null
  return (
    <View style={{ width: 110 }}>
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
        {highlightable ? highlightMatches(label, query) : label}
      </Text>
    </View>
  )
}

const CATEGORY_NAME: Record<Category, string> = {
  headwear: 'Headwear',
  shirt: 'Shirt',
  jacket: 'Jacket',
  pants: 'Pants',
  footwear: 'Footwear',
}

/**
 * Full-width pager card. Renders the hanger image with a horizontal bar
 * across the top half (split at center so the hook visually wraps over
 * it) and the item metadata below: name, used-in count, category•brand,
 * description.
 */
function ItemCardLarge({
  item,
  outfitCount,
  query,
  width,
}: {
  item: Item
  outfitCount: number
  query: string
  width: number
}) {
  const name = item.name ?? item.brand ?? 'Unnamed'
  // Highlight only when the displayed heading IS the item's name —
  // brand fallbacks aren't search-matched against the heading.
  const nameHighlightable = item.name != null
  const subtitle = [CATEGORY_NAME[item.category], item.brand].filter(Boolean).join(' • ')
  const description = item.customNotes ?? ''
  // Bar sits across the top of the garment where the hanger hook
  // crosses it. Left half renders BEFORE the image so the hook visibly
  // wraps over it; right half renders AFTER so it sits in front of the
  // garment shoulder for that "hung on a rod" feel.
  const BAR_TOP = 16 + 36
  // Headwear / footwear don't hang from a hanger, so the bar overlay
  // would look odd. Show it only for hung garments.
  const showBar = item.category !== 'headwear' && item.category !== 'footwear'
  return (
    <View style={{ width, paddingHorizontal: 20, alignItems: 'stretch' }}>
      <View style={{ height: 1, backgroundColor: '#D8D8D8' }} />
      <View
        style={{
          alignItems: 'center',
          justifyContent: 'center',
          paddingTop: 16,
          paddingBottom: 16,
        }}
      >
        {showBar ? (
          <View
            style={{
              position: 'absolute',
              left: 0,
              width: '50%',
              top: BAR_TOP,
              height: 8,
              overflow: 'hidden',
            }}
          >
            <Image
              source={require('@/assets/bar.png')}
              style={{ width: '200%', height: 8 }}
              resizeMode="stretch"
            />
          </View>
        ) : null}
        <Image
          source={{ uri: item.imageUrl }}
          style={{ width: '100%', height: 320 }}
          resizeMode="contain"
        />
        {showBar ? (
          <View
            style={{
              position: 'absolute',
              right: 0,
              width: '50%',
              top: BAR_TOP,
              height: 8,
              overflow: 'hidden',
            }}
          >
            <Image
              source={require('@/assets/bar.png')}
              style={{ width: '200%', height: 8, marginLeft: '-100%' }}
              resizeMode="stretch"
            />
          </View>
        ) : null}
      </View>
      <Text
        numberOfLines={1}
        style={{ letterSpacing: -0.3 }}
        className="text-center font-funnel font-bold text-[20px] leading-[24px] text-black"
      >
        {nameHighlightable ? highlightMatches(name, query) : name}
      </Text>
      {outfitCount > 0 ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            marginTop: 6,
          }}
        >
          <Text
            style={{ letterSpacing: 0.06 }}
            className="font-funnel font-normal text-[12px] leading-[16px] text-black opacity-50"
          >
            Used in
          </Text>
          <BookmarkSimpleFill width={14} height={14} color="#FF0D00" />
          <Text
            style={{ letterSpacing: 0.06 }}
            className="font-funnel font-normal text-[12px] leading-[16px] text-[#FF0D00]"
          >
            {outfitCount} {outfitCount === 1 ? 'outfit' : 'outfits'}
          </Text>
        </View>
      ) : null}
      {subtitle ? (
        <Text
          numberOfLines={1}
          className="mt-1 text-center font-funnel font-normal text-[14px] leading-[18px] text-black"
        >
          {subtitle}
        </Text>
      ) : null}
      {description ? (
        <Text
          numberOfLines={3}
          className="mt-4 text-center font-funnel font-normal text-[14px] leading-[18px] text-[#8F8F8F]"
        >
          {description}
        </Text>
      ) : null}
    </View>
  )
}

type Mode = 'grid' | 'list'

function CategorySection({ label, items, query }: { label: string; items: Item[]; query: string }) {
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
        <View style={{ width: 24, height: 1, backgroundColor: '#000', opacity: 0.1 }} />
        <Text className="font-funnel font-bold text-[14px] leading-[18px] text-black">{label}</Text>
        <View style={{ flex: 1, height: 1, backgroundColor: '#000', opacity: 0.1 }} />
        <Text className="font-funnel text-[12px] leading-[12px] text-[#666666]">
          {query.trim()
            ? `${items.length} ${items.length === 1 ? 'result' : 'results'}`
            : items.length}
        </Text>
        <View style={{ width: 24, height: 1, backgroundColor: '#000', opacity: 0.1 }} />
      </View>
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          paddingHorizontal: 20,
          rowGap: 8,
        }}
      >
        {items.map((item) => (
          <ItemCellCompact key={item.id} item={item} query={query} />
        ))}
        {Array.from({ length: (3 - (items.length % 3)) % 3 }).map((_, i) => (
          <View
            key={`phantom-${
              // biome-ignore lint/suspicious/noArrayIndexKey: TODO
              i
            }`}
            style={{ width: 110 }}
          />
        ))}
      </View>
    </View>
  )
}

/**
 * Grid-mode horizontal pager. Each page is one full-width ItemCardLarge
 * — so the user swipes between items rather than scrolling a grid. Cards
 * snap to screen width with `pagingEnabled`, neighbours peek at the
 * edges via padding inside the inner card.
 */
function ItemPager({ items, query }: { items: Item[]; query: string }) {
  const width = Dimensions.get('window').width
  return (
    <ScrollView
      horizontal
      pagingEnabled
      showsHorizontalScrollIndicator={false}
      decelerationRate="fast"
    >
      {items.map((item) => (
        <ItemCardLarge
          key={item.id}
          item={item}
          outfitCount={item.outfitCount ?? 0}
          query={query}
          width={width}
        />
      ))}
    </ScrollView>
  )
}

export default function Wardrobe() {
  const tabBarHeight = useBottomTabBarHeight()
  const [mode, setMode] = useState<Mode>('grid')
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [keyboardVisible, setKeyboardVisible] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')
  const filterSheetHandleRef = useRef<FilterSheetHandle>(null)
  const profileSheetRef = useRef<ProfileSheetHandle>(null)
  const itemsQuery = useQuery(orpc.clothingItem.list.queryOptions({ input: {} }))
  // Wardrobe only surfaces things the user actually has. Unowned rows
  // (e.g. AI items promoted by a saved outfit) live in clothingItem so
  // the Try On flow can reference them, but they don't belong in the
  // closet view.
  const items = (itemsQuery.data ?? []).filter((it) => it.owned)
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
    // Only flip `keyboardVisible` here — do NOT close the search input.
    // Earlier the hide listener also called `setSearchOpen(false)`, which
    // produced this flicker: open search → autoFocus shows keyboard →
    // toolbar layout changes → TextInput briefly loses focus → keyboard
    // hides → listener closes the search before the user typed anything.
    // Closing the search is now solely the user's responsibility (back
    // tap on the search button or scroll-dismiss on the list).
    const hide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardVisible(false),
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
        backgroundColor: '#E5E5E5',
        paddingBottom: tabBarHeight,
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
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <Pressable hitSlop={8}>
            <ShareFat width={24} height={24} color="#000" />
          </Pressable>
          <Pressable hitSlop={8} onPress={() => profileSheetRef.current?.present()}>
            <List width={24} height={24} color="#000" />
          </Pressable>
        </View>
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
      ) : mode === 'grid' ? (
        // Grid mode: flat horizontal pager across all visible items. The
        // category filter still applies; sections + per-category headers
        // are dropped here to match design/wardrobe1.png (one item full-
        // bleed, swipe between).
        <ItemPager
          items={CATEGORY_ORDER.filter((c) => filter === 'all' || c === filter).flatMap(
            (c) => grouped.get(c) ?? [],
          )}
          query={query}
        />
      ) : (
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={{ paddingBottom: 140 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          onScrollBeginDrag={Keyboard.dismiss}
        >
          {CATEGORY_ORDER.filter((c) => (grouped.get(c)?.length ?? 0) > 0)
            .filter((c) => filter === 'all' || c === filter)
            .map((c) => (
              <CategorySection
                key={c}
                label={CATEGORY_LABEL[c]}
                items={grouped.get(c) ?? []}
                query={query}
              />
            ))}
        </ScrollView>
      )}

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ position: 'absolute', left: 0, right: 0, bottom: tabBarHeight }}
      >
        {searchOpen ? (
          <View
            style={{
              height: 72,
              paddingTop: 12,
              paddingRight: 20,
              paddingBottom: 20,
              paddingLeft: 20,
              backgroundColor: '#E5E5E5',
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
                selectionColor="#FF0D00"
                cursorColor="#FF0D00"
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
            setMode={(m) => {
              // Switching to grid mode hides the search button, so close
              // the search bar (and clear the query) before the toggle so
              // the input doesn't linger orphaned with no way to dismiss.
              if (m === 'grid' && searchOpen) {
                setSearchOpen(false)
                setQuery('')
                Keyboard.dismiss()
              }
              // Grid pager pins a single category; "All" doesn't apply,
              // so collapse to the first non-empty category on entry.
              if (m === 'grid' && filter === 'all') {
                const firstWithItems = CATEGORY_ORDER.find((c) => (grouped.get(c)?.length ?? 0) > 0)
                setFilter(firstWithItems ?? 'shirt')
              }
              setMode(m)
            }}
            filter={filter}
            onSearchToggle={() => {
              if (searchOpen) {
                setSearchOpen(false)
                setQuery('')
              } else {
                setSearchOpen(true)
              }
            }}
            onSortPress={() => {
              filterSheetHandleRef.current?.present({ excludeAll: mode === 'grid' })
            }}
          />
        )}
      </KeyboardAvoidingView>

      <FilterSheet ref={filterSheetHandleRef} initialFilter={filter} onSave={setFilter} />
      <ProfileSheet ref={profileSheetRef} />
    </View>
  )
}

type FilterSheetHandle = { present: (options?: { excludeAll?: boolean }) => void }

// Self-contained filter sheet, memoized so the parent's mode/search state
// changes don't trigger a re-render here. The previous inline render
// caused the sheet to flicker open on every navbar tap because gorhom's
// BottomSheetModal saw the parent re-render as a reason to re-evaluate
// internal state. With its own state + memo boundary, the sheet only
// re-renders when its own props (initialFilter, onSave) actually change.
const FilterSheet = memo(
  forwardRef<FilterSheetHandle, { initialFilter: Filter; onSave: (f: Filter) => void }>(
    function FilterSheet({ initialFilter, onSave }, ref) {
      const sheetRef = useRef<BottomSheetModal>(null)
      const [pending, setPending] = useState<Filter>(initialFilter)
      // `excludeAll` set imperatively at present-time (not via props) so
      // toggling wardrobe mode doesn't invalidate this memo and trigger
      // a phantom re-presentation of the dismissed sheet.
      const [excludeAll, setExcludeAll] = useState(false)
      useImperativeHandle(
        ref,
        () => ({
          present: (options) => {
            setPending(initialFilter)
            setExcludeAll(options?.excludeAll ?? false)
            sheetRef.current?.present()
          },
        }),
        [initialFilter],
      )
      return (
        <FlairSheet ref={sheetRef} enableDynamicSizing>
          <BottomSheetView style={{ paddingBottom: 24 }}>
            <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12 }}>
              <Text className="text-black">
                <Text className="font-kirang text-[44px] leading-[40px]">F</Text>
                <Text className="font-bebas text-[36px] leading-[40px]">IL</Text>
                <Text className="font-kirang text-[44px] leading-[40px]">T</Text>
                <Text className="font-bebas text-[36px] leading-[40px]">ER</Text>
              </Text>
            </View>
            <View style={{ height: 1, backgroundColor: '#E5E5E5' }} />
            {FILTER_ORDER.filter((opt) => !excludeAll || opt !== 'all').map((opt) => {
              const selected = opt === pending
              return (
                <Pressable
                  key={opt}
                  onPress={() => setPending(opt)}
                  style={{
                    paddingHorizontal: 20,
                    paddingVertical: 18,
                    borderBottomWidth: 1,
                    borderBottomColor: '#E5E5E5',
                    flexDirection: 'row',
                    alignItems: 'flex-start',
                  }}
                >
                  <View style={{ overflow: 'visible' }}>
                    <Text
                      className={`font-funnel text-[16px] leading-[22px] tracking-[-0.16px] ${
                        selected ? 'font-bold text-[#FF0D00]' : 'text-black'
                      }`}
                    >
                      {FILTER_LABEL[opt]}
                    </Text>
                    {selected ? (
                      <Image
                        source={require('@/assets/underline.png')}
                        style={{
                          position: 'absolute',
                          left: 0,
                          bottom: -4,
                          width: '100%',
                          height: 4,
                        }}
                        resizeMode="stretch"
                      />
                    ) : null}
                  </View>
                </Pressable>
              )
            })}
            <View style={{ paddingHorizontal: 20, paddingTop: 20 }}>
              <Pressable
                onPress={() => {
                  onSave(pending)
                  sheetRef.current?.dismiss()
                }}
                style={{
                  height: 56,
                  borderRadius: 99,
                  backgroundColor: '#000',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'row',
                  gap: 8,
                }}
              >
                <Image
                  source={require('@/assets/check.png')}
                  style={{ width: 18, height: 18, tintColor: '#fff' }}
                  resizeMode="contain"
                />
                <Text className="font-funnel font-medium text-[16px] leading-[24px] tracking-[-0.24px] text-white">
                  Save
                </Text>
              </Pressable>
            </View>
          </BottomSheetView>
        </FlairSheet>
      )
    },
  ),
)

function Toolbar({
  mode,
  setMode,
  filter,
  onSearchToggle,
  onSortPress,
}: {
  mode: Mode
  setMode: (m: Mode) => void
  filter: Filter
  onSearchToggle: () => void
  onSortPress: () => void
}) {
  const filterLabel = FILTER_LABEL[filter]
  return (
    <View
      style={{
        height: 64,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#E5E5E5',
        paddingTop: 12,
        paddingRight: 20,
        paddingBottom: 12,
        paddingLeft: 20,
      }}
    >
      {/* Left: mode toggle pill (TShirt = grid, DotsNine = list). */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          backgroundColor: 'rgba(209, 209, 209, 1)',
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
          <TShirt width={20} height={20} color="#000" />
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

      {/* Right: sort + filter label, plus search (list mode only). */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Pressable
          onPress={onSortPress}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
          hitSlop={8}
        >
          <Sort width={22} height={22} color="#000" />
          <Text className="font-funnel text-[16px] leading-[22px] tracking-[-0.16px] text-black">
            {filterLabel}
          </Text>
        </Pressable>
        {mode === 'list' ? (
          <Pressable
            onPress={onSearchToggle}
            style={{ padding: 8, alignItems: 'center', justifyContent: 'center' }}
          >
            <MagnifyingGlass width={22} height={22} color="#000" />
          </Pressable>
        ) : null}
      </View>
    </View>
  )
}
