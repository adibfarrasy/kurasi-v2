import {
  BottomSheetFooter,
  type BottomSheetFooterProps,
  type BottomSheetModal,
  BottomSheetTextInput,
  BottomSheetView,
} from '@gorhom/bottom-sheet'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Image, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Path } from 'react-native-svg'
import { FlairSheet } from '@/components/flair-sheet'
import { MagnifyingGlass, PencilLine } from '@/components/textured-icons'
import { orpc } from '@/lib/orpc-client'

function ChevronDown({ size = 16 }: { size?: number }) {
  return (
    <Image
      source={require('@/assets/caretdown.png')}
      style={{ width: size, height: size }}
      resizeMode="contain"
    />
  )
}

function ArrowRight({ size = 18, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18" fill="none">
      <Path
        d="M3 9 H15 M10 4 L15 9 L10 14"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

function FieldLabel({ children }: { children: string }) {
  return (
    <Text className="font-funnel text-[12px] leading-[16px] tracking-[0.06px] text-[#3C3C3C]">
      {children}
    </Text>
  )
}

function SelectField({
  label,
  value,
  placeholder,
  onPress,
}: {
  label: string
  value?: string
  placeholder?: string
  onPress?: () => void
}) {
  return (
    <View style={{ gap: 6 }}>
      <FieldLabel>{label}</FieldLabel>
      <Pressable
        onPress={onPress}
        style={{
          height: 48,
          paddingTop: 12,
          paddingBottom: 12,
          paddingLeft: 15,
          paddingRight: 15,
          gap: 10,
          backgroundColor: '#fff',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Text
          className={`font-funnel text-[16px] leading-[22px] tracking-[-0.16px] ${
            value ? 'text-black' : 'text-[#999]'
          }`}
        >
          {value ?? placeholder ?? ''}
        </Text>
        <ChevronDown />
      </Pressable>
    </View>
  )
}

function ColorBar({ segments }: { segments: { color: string; label: string; pct: number }[] }) {
  return (
    <View style={{ gap: 10 }}>
      <View
        style={{
          height: 10,
          borderRadius: 4,
          flexDirection: 'row',
          overflow: 'hidden',
          backgroundColor: '#E5E5E5',
        }}
      >
        {segments.map((s) => (
          <View key={s.label} style={{ width: `${s.pct}%`, backgroundColor: s.color }} />
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
        {segments.map((s) => (
          <View key={s.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View
              style={{
                width: 14,
                height: 14,
                borderRadius: 7,
                backgroundColor: s.color,
                borderWidth: s.color === '#FFFFFF' ? 1 : 0,
                borderColor: '#CCC',
              }}
            />
            <Text className="font-funnel text-[14px] leading-[18px] text-black">{s.label}</Text>
            <Text className="font-funnel text-[14px] leading-[18px] text-[#888]">{s.pct}%</Text>
          </View>
        ))}
      </View>
    </View>
  )
}

// Map backend (snake/lowercase) values onto the form's Title-case strings.
const TYPE_MAP: Record<string, string> = {
  headwear: 'Headwear',
  shirt: 'Shirt',
  jacket: 'Jacket',
  pants: 'Pants',
  footwear: 'Footwear',
}
const FIT_MAP: Record<string, string> = {
  skinny: 'Skinny',
  regular: 'Regular',
  relaxed: 'Relaxed',
  oversize: 'Oversize',
}
const LENGTH_MAP: Record<string, string> = {
  cropped: 'Cropped',
  waist: 'Waist',
  hip: 'Hip',
  thigh: 'Thigh',
  knee: 'Knee',
  'full-length': 'Full-length',
  'thigh-shorts': 'Thigh shorts',
  'knee-shorts': 'Knee shorts',
  'ankle-length': 'Ankle length',
}

const REVERSE_TYPE_MAP: Record<string, 'headwear' | 'shirt' | 'jacket' | 'pants' | 'footwear'> = {
  Headwear: 'headwear',
  Shirt: 'shirt',
  Jacket: 'jacket',
  Pants: 'pants',
  Footwear: 'footwear',
}
type BackendFit = 'skinny' | 'regular' | 'relaxed' | 'oversize'
const REVERSE_FIT_MAP: Record<string, BackendFit> = {
  Skinny: 'skinny',
  Regular: 'regular',
  Relaxed: 'relaxed',
  Oversize: 'oversize',
}
type BackendLength =
  | 'cropped'
  | 'waist'
  | 'hip'
  | 'thigh'
  | 'knee'
  | 'full-length'
  | 'thigh-shorts'
  | 'knee-shorts'
  | 'ankle-length'
const REVERSE_LENGTH_MAP: Record<string, BackendLength> = {
  Cropped: 'cropped',
  Waist: 'waist',
  Hip: 'hip',
  Thigh: 'thigh',
  Knee: 'knee',
  'Full-length': 'full-length',
  'Thigh shorts': 'thigh-shorts',
  'Knee shorts': 'knee-shorts',
  'Ankle length': 'ankle-length',
}
const FIT_RELEVANT_TYPES = new Set(['Shirt', 'Jacket', 'Pants'])
const LENGTH_RELEVANT_TYPES = new Set(['Jacket', 'Pants'])

type PrefillItem = {
  title: string
  category: string
  fit: string | null
  length: string | null
  colors: { name: string; hex: string; ratio: number }[]
  /** Backend's analyzed processedImageUrl — the cleaned-up
   *  canvas-anchored PNG. Stored as `imageUrl` on save. */
  processedImageUrl?: string
  /** Backend's originalImageUrl — the raw fal upload. Stored as
   *  `originalImageUrl` on save. */
  originalImageUrl?: string
}

type PageState = {
  name: string
  type: string
  brand: string | undefined
  fit: string
  length: string
  describe: string
}

function parsePrefills(raw: string | undefined): PrefillItem[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as PrefillItem[]) : []
  } catch {
    return []
  }
}

function parseUriList(raw: string | undefined): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((u): u is string => typeof u === 'string') : []
  } catch {
    return []
  }
}

export default function UploadWardrobeReview() {
  const insets = useSafeAreaInsets()
  const params = useLocalSearchParams<{
    prefill?: string
    prefills?: string
    uri?: string
    uris?: string
  }>()
  // Accept both the multi-image flow (`uris` + `prefills` JSON arrays)
  // and the legacy single-image flow (`uri` + `prefill`) so dev-tools
  // entry points and direct deep links still work.
  const prefills = useMemo(() => {
    const arr = parsePrefills(params.prefills)
    if (arr.length > 0) return arr
    if (params.prefill) {
      try {
        const single = JSON.parse(params.prefill) as PrefillItem
        return [single]
      } catch {
        return []
      }
    }
    return []
  }, [params.prefill, params.prefills])
  const uriList = useMemo(() => {
    const arr = parseUriList(params.uris)
    if (arr.length > 0) return arr
    return params.uri ? [params.uri] : []
  }, [params.uri, params.uris])

  const router = useRouter()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const TOTAL = Math.max(uriList.length, prefills.length, 1)
  const activeIndex = Math.min(page - 1, TOTAL - 1)
  const prefill = prefills[activeIndex] ?? null
  // Show the analyzer's cleaned-up PNG (background removed, canvas-anchored)
  // when available. Fall back to the user's original photo only on the
  // legacy single-image deep-link path that doesn't supply a prefill.
  const activeUri = prefill?.processedImageUrl ?? uriList[activeIndex]

  // Per-page editable state. Initialized once on first render from the
  // prefills so the user's edits on page 1 survive a Next/Back round
  // trip to page 2 and back. Each pages[i] gets written through whenever
  // the active SelectField/TextInput updates; the active UI reads from
  // pages[activeIndex].
  const [pages, setPages] = useState<PageState[]>(() => {
    const seed = (p: PrefillItem | undefined): PageState => ({
      name: p?.title ?? 'Some Hoodie Name',
      type: (p?.category && TYPE_MAP[p.category]) || 'Jacket',
      brand: undefined,
      fit: (p?.fit && FIT_MAP[p.fit]) || 'Regular',
      length: (p?.length && LENGTH_MAP[p.length]) || 'Hip',
      describe: '',
    })
    if (prefills.length === 0) return [seed(undefined)]
    return prefills.map((p) => seed(p))
  })
  const updatePage = (patch: Partial<PageState>) => {
    setPages((prev) => prev.map((s, i) => (i === activeIndex ? { ...s, ...patch } : s)))
  }
  const active: PageState = pages[activeIndex] ?? {
    name: 'Some Hoodie Name',
    type: 'Jacket',
    brand: undefined,
    fit: 'Regular',
    length: 'Hip',
    describe: '',
  }
  const name = active.name
  const setName = (v: string) => updatePage({ name: v })
  const type = active.type
  const setType = (v: string) => updatePage({ type: v })
  const brand = active.brand
  const setBrand = (v: string | undefined) => updatePage({ brand: v })
  const fit = active.fit
  const setFit = (v: string) => updatePage({ fit: v })
  const length = active.length
  const setLength = (v: string) => updatePage({ length: v })
  const describe = active.describe
  const setDescribe = (v: string) => updatePage({ describe: v })

  const [editingName, setEditingName] = useState(false)
  const nameInputRef = useRef<TextInput>(null)

  // Page change → exit editing mode for the name field. All other state
  // is per-page (in `pages`), so it persists automatically.
  useEffect(() => {
    setEditingName(false)
  }, [activeIndex])

  // Dismiss every open sheet BEFORE navigating between pages. Doing it
  // here (rather than in an activeIndex effect) ensures dismissal hits
  // the still-mounted refs; once the page changes, the keyed remount
  // swaps in fresh refs and an effect-driven dismiss would no-op,
  // leaving the prior presentation orphaned in BottomSheetModalProvider's
  // stack — which is what causes sheets to pop back open on Next/Back.
  const dismissAllSheets = () => {
    typeSheetRef.current?.dismiss()
    brandSheetRef.current?.dismiss()
    fitSheetRef.current?.dismiss()
    lengthSheetRef.current?.dismiss()
  }
  const [brandQuery, setBrandQuery] = useState('')
  const [pendingBrand, setPendingBrand] = useState<string | undefined>(undefined)
  // Sheet-local pending selections — the user can tap rows without
  // committing; only Save writes back to the field state.
  const [pendingType, setPendingType] = useState(type)
  const [pendingFit, setPendingFit] = useState(fit)
  const [pendingLength, setPendingLength] = useState(length)
  const typeSheetRef = useRef<BottomSheetModal>(null)
  const brandSheetRef = useRef<BottomSheetModal>(null)
  const fitSheetRef = useRef<BottomSheetModal>(null)
  const lengthSheetRef = useRef<BottomSheetModal>(null)

  const pickType = () => {
    setPendingType(type)
    typeSheetRef.current?.present()
  }
  const pickBrand = () => {
    setBrandQuery('')
    setPendingBrand(brand)
    brandSheetRef.current?.present()
  }
  const pickFit = () => {
    setPendingFit(fit)
    fitSheetRef.current?.present()
  }
  const pickLength = () => {
    // If the current `length` doesn't apply to the active type's option
    // set (e.g. carrying "Hip" over after switching from Jacket to
    // Pants), fall back to the type's default before opening.
    const validInitial = LENGTH_OPTIONS.includes(length) ? length : LENGTH_FALLBACK
    setPendingLength(validInitial)
    lengthSheetRef.current?.present()
  }

  const TYPE_OPTIONS = ['Headwear', 'Shirt', 'Jacket', 'Pants', 'Footwear']
  // Brand list comes from the backend now: bundled global list ∪ this
  // user's previously-saved brands. After Save, the query is
  // invalidated so any new user-typed brand reappears in subsequent
  // sessions (Option A: derived from clothing_item.brand, no separate
  // user_brand table).
  const brandsQuery = useQuery(orpc.brand.list.queryOptions())
  const BRAND_OPTIONS = brandsQuery.data ?? []

  // Stable reference for the brand sheet's footerComponent. Inline render
  // props produce a fresh function identity on every parent re-render —
  // when an UNRELATED state change happens (e.g. fit sheet's Save calls
  // setFit), gorhom sees the brand sheet's footerComponent change,
  // re-evaluates its render-prop chain, and re-presents the dismissed
  // brand sheet. Same hazard FlairSheet itself memoizes against.
  const renderBrandFooter = useCallback(
    (props: BottomSheetFooterProps) => (
      <BottomSheetFooter {...props} bottomInset={0}>
        <View style={{ backgroundColor: '#fff' }}>
          <View style={{ height: 1, backgroundColor: '#E5E5E5' }} />
          <View
            style={{
              paddingHorizontal: 20,
              paddingTop: 15,
              paddingBottom: insets.bottom + 16,
            }}
          >
            <Pressable
              onPress={() => {
                const q = brandQuery.trim()
                const filtered = q
                  ? BRAND_OPTIONS.filter((b) => b.toLowerCase().includes(q.toLowerCase()))
                  : BRAND_OPTIONS
                const next = q && filtered.length === 0 ? q : pendingBrand
                if (next) setBrand(next)
                brandSheetRef.current?.dismiss()
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
        </View>
      </BottomSheetFooter>
    ),
    [insets.bottom, brandQuery, BRAND_OPTIONS, pendingBrand, setBrand],
  )

  // Stable reference for the brand sheet's snapPoints. A new array
  // literal on every render gives gorhom's BottomSheetModal a fresh
  // `snapPoints` prop, which can re-trigger its snap-to-index logic
  // and re-present a previously dismissed modal whenever ANY parent
  // state updates (typing in the name field, for example).
  const BRAND_SNAP_POINTS = useMemo(() => ['100%'], [])

  const saveMutation = useMutation(
    orpc.clothingItem.saveFromUpload.mutationOptions({
      onSuccess: () => {
        // The new items + any newly-typed brand should be visible in
        // the wardrobe and brand picker on next visit.
        queryClient.invalidateQueries({
          queryKey: orpc.clothingItem.list.queryKey({ input: {} }),
        })
        queryClient.invalidateQueries({ queryKey: orpc.brand.list.queryKey() })
        router.replace('/(tabs)/wardrobe')
      },
      onError: (err) => {
        const message = err instanceof Error ? err.message : 'Save failed'
        Alert.alert('Save failed', message)
      },
    }),
  )
  const FIT_OPTIONS = ['Skinny', 'Regular', 'Relaxed', 'Oversize']
  const LENGTH_OPTIONS_JACKET = ['Cropped', 'Waist', 'Hip', 'Thigh', 'Knee', 'Full-length']
  const LENGTH_OPTIONS_PANTS = ['Thigh shorts', 'Knee shorts', 'Ankle length', 'Full length']
  const LENGTH_VARIANT_JACKET: Record<string, number> = {
    Cropped: require('@/assets/variant-cropped.png'),
    Waist: require('@/assets/variant-waist.png'),
    Hip: require('@/assets/variant-hip.png'),
    Thigh: require('@/assets/variant-thigh.png'),
    Knee: require('@/assets/variant-knee.png'),
    'Full-length': require('@/assets/variant-full-length.png'),
  }
  const LENGTH_VARIANT_PANTS: Record<string, number> = {
    'Thigh shorts': require('@/assets/variant-thigh-shorts.png'),
    'Knee shorts': require('@/assets/variant-knee-shorts.png'),
    'Ankle length': require('@/assets/variant-ankle-length.png'),
    'Full length': require('@/assets/variant-full-length-pants.png'),
  }
  const isPants = type === 'Pants'
  const LENGTH_OPTIONS = isPants ? LENGTH_OPTIONS_PANTS : LENGTH_OPTIONS_JACKET
  const LENGTH_VARIANT = isPants ? LENGTH_VARIANT_PANTS : LENGTH_VARIANT_JACKET
  const LENGTH_FALLBACK = isPants ? 'Full length' : 'Hip'

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ flex: 1, backgroundColor: '#EBEBEB' }}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingTop: insets.top + 8,
            paddingBottom: insets.bottom + 120,
          }}
        >
          <Text className="text-center font-funnel text-[14px] leading-[18px] text-[#444]">
            {page} of {TOTAL}
          </Text>

          <View style={{ height: 1, backgroundColor: '#D8D8D8', marginTop: 12 }} />

          <View
            style={{
              alignItems: 'center',
              justifyContent: 'center',
              paddingTop: 16,
              paddingBottom: 24,
              backgroundColor: '#EBEBEB',
            }}
          >
            {/* Bar split left/right so the hanger's hook visually wraps
                around it: left half draws BEHIND the image (hook covers
                it), right half draws IN FRONT (covers the hook tail). Each
                slice clips a horizontal half of the full-width bar.
                Hidden for Headwear/Footwear since they don't hang. */}
            {type !== 'Headwear' && type !== 'Footwear' ? (
              <View
                style={{
                  position: 'absolute',
                  left: 0,
                  width: '50%',
                  top: 16 + 44,
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
              source={activeUri ? { uri: activeUri } : require('@/assets/default-man.png')}
              style={{ width: 240, height: 320 }}
              resizeMode="contain"
            />
            {type !== 'Headwear' && type !== 'Footwear' ? (
              <View
                style={{
                  position: 'absolute',
                  right: 0,
                  width: '50%',
                  top: 16 + 44,
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

          <View style={{ paddingHorizontal: 20, paddingBottom: 50, gap: 16 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              {editingName ? (
                <TextInput
                  ref={nameInputRef}
                  value={name}
                  onChangeText={setName}
                  onBlur={() => setEditingName(false)}
                  onSubmitEditing={() => setEditingName(false)}
                  returnKeyType="done"
                  selectTextOnFocus
                  autoFocus
                  selectionColor="#000"
                  cursorColor="#000"
                  style={{
                    flex: 1,
                    fontFamily: 'FunnelSans-Bold',
                    fontSize: 20,
                    lineHeight: 26,
                    letterSpacing: -0.2,
                    color: '#000',
                    padding: 0,
                  }}
                />
              ) : (
                <Text
                  className="flex-1 font-funnel font-bold text-[20px] leading-[26px] tracking-[-0.2px] text-black"
                  numberOfLines={1}
                >
                  {name}
                </Text>
              )}
              <Pressable
                hitSlop={8}
                onPress={() => {
                  if (editingName) {
                    nameInputRef.current?.blur()
                  } else {
                    setEditingName(true)
                  }
                }}
              >
                <PencilLine width={20} height={20} color="#000" />
              </Pressable>
            </View>

            <SelectField label="Type" value={type} onPress={pickType} />
            <SelectField
              label="Brand"
              value={brand}
              placeholder="Select or type here"
              onPress={pickBrand}
            />
            {/* Fit applies to garments worn on the torso/legs — Jacket,
                Shirt, Pants. Headwear and Footwear use sizing instead, so
                this row is hidden for them. */}
            {type === 'Jacket' || type === 'Shirt' || type === 'Pants' ? (
              <SelectField label="Fit" value={fit} onPress={pickFit} />
            ) : null}
            {/* Length is only meaningful for Jacket / Pants (hem position,
                inseam). Hidden for Shirt / Headwear / Footwear. */}
            {type === 'Jacket' || type === 'Pants' ? (
              <SelectField label="Length" value={length} onPress={pickLength} />
            ) : null}

            <View style={{ gap: 8 }}>
              <FieldLabel>Color</FieldLabel>
              <ColorBar
                segments={
                  prefill?.colors.length
                    ? (() => {
                        // Backend returns ratios on a 0..1 scale that sum
                        // to ~1. Scale to integer percentages and absorb
                        // any rounding drift into the dominant color so
                        // the bar always totals exactly 100.
                        const raw = prefill.colors.map((c) => ({
                          color: c.hex,
                          label: c.name,
                          pct: Math.round(c.ratio * 100),
                        }))
                        const drift = 100 - raw.reduce((a, c) => a + c.pct, 0)
                        if (drift !== 0 && raw[0]) raw[0].pct += drift
                        return raw
                      })()
                    : [
                        { color: '#000000', label: 'Black', pct: 96 },
                        { color: '#C0C0C0', label: 'Silver', pct: 4 },
                      ]
                }
              />
            </View>

            <View style={{ gap: 6 }}>
              <FieldLabel>Describe</FieldLabel>
              <TextInput
                value={describe}
                onChangeText={setDescribe}
                placeholder="Tell us what you like and dislike about it. Any special care instructions? Share your thoughts!"
                placeholderTextColor="#999"
                multiline
                selectionColor="#000"
                cursorColor="#000"
                style={{
                  minHeight: 96,
                  paddingTop: 12,
                  paddingBottom: 12,
                  paddingLeft: 15,
                  paddingRight: 15,
                  backgroundColor: '#fff',
                  fontFamily: 'FunnelSans-Regular',
                  fontSize: 14,
                  lineHeight: 20,
                  color: '#000',
                  textAlignVertical: 'top',
                }}
              />
            </View>
          </View>
        </ScrollView>

        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            paddingHorizontal: 20,
            paddingTop: 12,
            paddingBottom: insets.bottom + 16,
            backgroundColor: '#EBEBEB',
          }}
        >
          {(() => {
            const isLast = page >= TOTAL
            const showBack = page > 1
            const ctaLabel = isLast ? 'Save' : 'Next'
            const onCtaPress = () => {
              if (isLast) {
                if (saveMutation.isPending) return
                // Build the per-item payload from the per-page state +
                // the analyzer's processed/original URLs. Drop fit /
                // length when the chosen Type doesn't take them.
                const items = pages
                  .map((p, i) => {
                    const pf = prefills[i]
                    const imageUrl = pf?.processedImageUrl
                    if (!imageUrl) return null
                    const cat = REVERSE_TYPE_MAP[p.type]
                    if (!cat) return null
                    return {
                      imageUrl,
                      originalImageUrl: pf?.originalImageUrl ?? null,
                      category: cat,
                      name: p.name.trim() ? p.name.trim() : null,
                      brand: p.brand?.trim() ? p.brand.trim() : null,
                      fit: FIT_RELEVANT_TYPES.has(p.type) ? (REVERSE_FIT_MAP[p.fit] ?? null) : null,
                      length: LENGTH_RELEVANT_TYPES.has(p.type)
                        ? (REVERSE_LENGTH_MAP[p.length] ?? null)
                        : null,
                      customNotes: p.describe.trim() ? p.describe.trim() : null,
                      colors: pf?.colors ?? [],
                    }
                  })
                  .filter((x): x is NonNullable<typeof x> => x !== null)
                if (items.length === 0) {
                  Alert.alert('Nothing to save', 'No analyzed items to write.')
                  return
                }
                saveMutation.mutate({ items })
                return
              }
              dismissAllSheets()
              setPage((p) => Math.min(p + 1, TOTAL))
            }
            return (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                {showBack ? (
                  <Pressable
                    onPress={() => {
                      dismissAllSheets()
                      setPage((p) => Math.max(p - 1, 1))
                    }}
                    hitSlop={8}
                    style={{
                      height: 56,
                      paddingTop: 12,
                      paddingRight: 20,
                      paddingBottom: 14,
                      paddingLeft: 20,
                      borderRadius: 99,
                      backgroundColor: '#FFFFFF',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text className="font-funnel font-medium text-[16px] leading-[24px] tracking-[-0.24px] text-black">
                      Back
                    </Text>
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={onCtaPress}
                  style={{
                    flex: 1,
                    height: 56,
                    borderRadius: 99,
                    backgroundColor: '#000',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'row',
                    gap: 10,
                  }}
                >
                  {isLast ? (
                    <Image
                      source={require('@/assets/check.png')}
                      style={{ width: 18, height: 18, tintColor: '#fff' }}
                      resizeMode="contain"
                    />
                  ) : (
                    <ArrowRight />
                  )}
                  <Text className="font-funnel font-medium text-[16px] leading-[24px] tracking-[-0.24px] text-white">
                    {ctaLabel}
                  </Text>
                </Pressable>
              </View>
            )
          })()}
        </View>
      </View>

      <FlairSheet key={`type-${activeIndex}`} ref={typeSheetRef} enableDynamicSizing>
        <BottomSheetView style={{ paddingBottom: 24 }}>
          <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12 }}>
            <Text className="text-black">
              <Text className="font-kirang text-[44px] leading-[40px]">T</Text>
              <Text className="font-bebas text-[36px] leading-[40px]">YP</Text>
              <Text className="font-bebas text-[36px] leading-[40px]">E</Text>
            </Text>
          </View>
          <View style={{ height: 1, backgroundColor: '#E5E5E5' }} />
          {TYPE_OPTIONS.map((opt) => {
            const selected = opt === pendingType
            return (
              <Pressable
                key={opt}
                onPress={() => setPendingType(opt)}
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
                    {opt}
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
                setType(pendingType)
                // The Pants and Jacket option sets don't overlap, so
                // reset Length to its new default whenever the type
                // category changes.
                if ((pendingType === 'Pants') !== (type === 'Pants')) {
                  setLength(pendingType === 'Pants' ? 'Full length' : 'Hip')
                }
                typeSheetRef.current?.dismiss()
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

      {/* Brand sheet — fixed full-height (100% minus top safe-area) so
          there's room for both the brand list and the keyboard-aware
          search bar without content jumping. Sticky search row + Save in
          a BottomSheetFooter so neither moves while the list scrolls. */}
      <FlairSheet
        key={`brand-${activeIndex}`}
        ref={brandSheetRef}
        snapPoints={BRAND_SNAP_POINTS}
        enableDynamicSizing={false}
        topInset={insets.top}
        keyboardBehavior="interactive"
        // `restore` re-presents the sheet whenever its keyboard blurs
        // — which fires both on Save (search input blurs as the sheet
        // dismisses) and when the user opens any OTHER sheet (brand's
        // input loses focus). Use `none` so a dismissed brand sheet
        // stays dismissed.
        keyboardBlurBehavior="none"
        footerComponent={renderBrandFooter}
      >
        {/* Regular View with flex:1 instead of BottomSheetView. With a
            fixed snapPoint (100%) BottomSheetView's content-driven sizing
            collapses to the intrinsic height of its non-scrollable
            children, leaving the inner ScrollView with no remaining
            height to scroll within. A plain flex container fills the
            sheet's content area. */}
        <View style={{ flex: 1 }}>
          <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12 }}>
            <Text className="text-black">
              <Text className="font-bebas text-[36px] leading-[40px]">B</Text>
              <Text className="font-kirang text-[44px] leading-[40px]">R</Text>
              <Text className="font-kirang text-[44px] leading-[40px]">A</Text>
              <Text className="font-bebas text-[36px] leading-[40px]">ND</Text>
            </Text>
          </View>

          {/* Search row — kept OUTSIDE the BottomSheetScrollView. Earlier
              we tried sticky-header inside the scroll view, but RN's
              sticky-clone wrapper collapsed the row layout (icon + input
              stacked vertically). With it parked above the scroll view
              the row stays pinned naturally and lays out correctly. */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              paddingHorizontal: 20,
              paddingVertical: 8,
              borderTopWidth: 1,
              borderBottomWidth: 1,
              borderColor: '#B0B0B0',
              backgroundColor: '#fff',
            }}
          >
            <MagnifyingGlass width={22} height={22} color="#000" />
            <BottomSheetTextInput
              value={brandQuery}
              onChangeText={setBrandQuery}
              placeholder="Type brand name here"
              placeholderTextColor="#999999"
              selectionColor="#FF0D00"
              autoCorrect={false}
              autoCapitalize="words"
              style={{
                flex: 1,
                fontFamily: 'FunnelSans-Regular',
                fontSize: 16,
                letterSpacing: -0.16,
                color: '#000',
                padding: 0,
              }}
            />
          </View>

          {(() => {
            const q = brandQuery.trim().toLowerCase()
            const filtered = q
              ? BRAND_OPTIONS.filter((b) => b.toLowerCase().includes(q))
              : BRAND_OPTIONS
            const noMatch = q.length > 0 && filtered.length === 0
            if (noMatch) {
              return (
                <View style={{ paddingHorizontal: 20, paddingTop: 15, flex: 1 }}>
                  <Text className="font-funnel text-[16px] leading-[22px] tracking-[-0.16px] text-[#666]">
                    No brand with the matching name was found in our database. Tap the Save button
                    to add &ldquo;{brandQuery.trim()}&rdquo; as a new brand.
                  </Text>
                </View>
              )
            }
            return (
              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{
                  paddingHorizontal: 20,
                  paddingTop: 0,
                  paddingBottom: 16,
                }}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {filtered.map((opt) => {
                  const selected = opt === pendingBrand
                  return (
                    <Pressable
                      key={opt}
                      onPress={() => setPendingBrand(opt)}
                      style={{ paddingVertical: 14 }}
                    >
                      <Text
                        className={`font-funnel text-[16px] leading-[22px] tracking-[-0.16px] ${
                          selected ? 'font-bold text-[#FF0D00]' : 'text-black'
                        }`}
                      >
                        {opt}
                      </Text>
                    </Pressable>
                  )
                })}
              </ScrollView>
            )
          })()}
        </View>
      </FlairSheet>

      {/* Fit sheet — different visual: Bebas display title, list rows
          separated by hairline dividers, selection is pending until the
          user presses Save (red text + hand-drawn underline). */}
      <FlairSheet key={`fit-${activeIndex}`} ref={fitSheetRef} enableDynamicSizing>
        <BottomSheetView style={{ paddingBottom: 24 }}>
          <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12 }}>
            <Text className="text-black">
              <Text className="font-kirang text-[44px] leading-[40px]">F</Text>
              <Text className="font-bebas text-[36px] leading-[40px]">I</Text>
              <Text className="font-kirang text-[44px] leading-[40px]">T</Text>
            </Text>
          </View>
          <View style={{ height: 1, backgroundColor: '#E5E5E5' }} />
          {FIT_OPTIONS.map((opt) => {
            const selected = opt === pendingFit
            return (
              <Pressable
                key={opt}
                onPress={() => setPendingFit(opt)}
                style={{
                  paddingHorizontal: 20,
                  paddingVertical: 18,
                  borderBottomWidth: 1,
                  borderBottomColor: '#E5E5E5',
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                }}
              >
                {/* Wrapper sized to the text so the underline (width:100%)
                    matches the text width rather than the row width.
                    Same pattern used by AddItemSheet's tab underline. */}
                <View style={{ overflow: 'visible' }}>
                  <Text
                    className={`font-funnel text-[16px] leading-[22px] tracking-[-0.16px] ${
                      selected ? 'font-bold text-[#FF0D00]' : 'text-black'
                    }`}
                  >
                    {opt}
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
                setFit(pendingFit)
                fitSheetRef.current?.dismiss()
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

      {/* Length sheet — Jacket variant. Two-column layout: figure on the
          left swaps to match the pendingLength row on the right. Pants
          will get its own variant once those assets land.
          Keyed by `activeIndex` so the modal fully remounts on every
          page change. Without this, the absolute-positioned variant
          image swap inside dynamic-sized BottomSheetView fights with
          gorhom's height recalculation and the sheet pops back open
          after Next/Back. The remount clears that internal state. */}
      <FlairSheet key={`length-${activeIndex}`} ref={lengthSheetRef} enableDynamicSizing>
        <BottomSheetView style={{ paddingBottom: 24 }}>
          <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12 }}>
            <Text className="text-black">
              <Text className="font-bebas text-[36px] leading-[40px]">L</Text>
              <Text className="font-kirang text-[44px] leading-[40px]">E</Text>
              <Text className="font-bebas text-[36px] leading-[40px]">NG</Text>
              <Text className="font-kirang text-[44px] leading-[40px]">T</Text>
              <Text className="font-bebas text-[36px] leading-[40px]">H</Text>
            </Text>
          </View>
          <View style={{ height: 1, backgroundColor: '#E5E5E5' }} />

          {/* Full-width rows with hairline dividers spanning edge-to-edge.
              The figure illustration overlays the left half via absolute
              positioning, sitting BEHIND the dividers so the lines read
              as continuous across the entire sheet. */}
          <View style={{ position: 'relative' }}>
            {LENGTH_OPTIONS.map((opt) => {
              const selected = opt === pendingLength
              return (
                <Pressable
                  key={opt}
                  onPress={() => setPendingLength(opt)}
                  style={{
                    paddingTop: 14,
                    paddingBottom: 14,
                    paddingLeft: 260,
                    paddingRight: 20,
                    borderBottomWidth: 1,
                    borderBottomColor: '#E5E5E5',
                    flexDirection: 'row',
                    alignItems: 'flex-start',
                    minHeight: 60,
                    zIndex: 1,
                  }}
                >
                  <View style={{ overflow: 'visible' }}>
                    <Text
                      className={`font-funnel text-[16px] leading-[22px] tracking-[-0.16px] ${
                        selected ? 'font-bold text-[#FF0D00]' : 'text-black'
                      }`}
                    >
                      {opt}
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
            {/* Figure overlays the rows (zIndex 2) so it sits on top of
                the divider lines. pointerEvents="none" lets taps fall
                through to the option rows underneath. */}
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: 20,
                top: 0,
                bottom: 0,
                width: 220,
                zIndex: 2,
              }}
            >
              <Image
                source={LENGTH_VARIANT[pendingLength] ?? LENGTH_VARIANT[LENGTH_FALLBACK]}
                style={{ width: '100%', height: '100%' }}
                resizeMode="contain"
              />
            </View>
          </View>

          <View style={{ paddingHorizontal: 20, paddingTop: 20 }}>
            <Pressable
              onPress={() => {
                setLength(pendingLength)
                lengthSheetRef.current?.dismiss()
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
    </>
  )
}
