import { useQuery } from '@tanstack/react-query'
import { Image as ExpoImage } from 'expo-image'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import * as Sharing from 'expo-sharing'
import { useEffect, useRef, useState } from 'react'
import { Alert, Animated, Image, Pressable, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { captureRef } from 'react-native-view-shot'
import { SlotCard, type SlotEntry } from '@/components/slot-strip'
import { Background, Canvas, TShirtEdit } from '@/components/textured-icons'
import { ToneBackground } from '@/components/tone-background'
import { orpc } from '@/lib/orpc-client'
import { getOutfitTone } from '@/lib/outfit-tone'

// Edit screen reached from the outfit detail page's Share pill. The
// user re-frames the look (Canvas crop ratio / Background swap / Items
// toggle) and then taps the top-right Share pill to push the final
// composite to a native share sheet.
export default function OutfitEdit() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const outfitsQuery = useQuery(orpc.outfit.list.queryOptions())
  const itemsQuery = useQuery(orpc.clothingItem.list.queryOptions({ input: {} }))

  const outfit = outfitsQuery.data?.find((o) => o.id === id) ?? null
  const items = itemsQuery.data ?? []
  const itemsById = new Map(items.map((i) => [i.id, i]))

  // Mirror the detail-page tone derivation so the Edit canvas backdrop
  // matches the look's dominant slot colour by default.
  const slotIds = outfit
    ? [outfit.headwearId, outfit.baseId, outfit.outerId, outfit.bottomId, outfit.footwearId]
    : []
  const tone = getOutfitTone(
    slotIds
      .map((sid) => (sid ? (itemsById.get(sid)?.colors[0]?.name ?? null) : null))
      .filter((c): c is string => !!c),
  )

  // SlotStrip overlay shown on the canvas when the Items tool is set to
  // "Show". Mirrors the binding used on the outfit detail page; labels
  // follow the Figma order (SHIRT, HEADWEAR, OUTER, PANTS, FOOTWEAR).
  const SLOTS: Array<{
    key: 'baseId' | 'headwearId' | 'outerId' | 'bottomId' | 'footwearId'
    label: string
  }> = [
    { key: 'baseId', label: 'SHIRT' },
    { key: 'headwearId', label: 'HEADWEAR' },
    { key: 'outerId', label: 'OUTER' },
    { key: 'bottomId', label: 'PANTS' },
    { key: 'footwearId', label: 'FOOTWEAR' },
  ]
  // Always emit 5 slot entries so the canvas strip lays out at a
  // consistent scale regardless of how many slots the outfit has
  // filled. Empty slots render as blank cards with just the label.
  const itemSlots: SlotEntry[] = SLOTS.map((s) => {
    const id = outfit ? (outfit[s.key] as string | null) : null
    const it = id ? itemsById.get(id) : null
    return {
      key: s.label,
      label: s.label,
      item: it ? { ...it, aiGenerated: !it.owned } : null,
    }
  })

  const canvasRef = useRef<View>(null)

  // Active editor tool. Tapping the toolbar's Canvas/Background/Items
  // swaps the bottom strip into the matching panel. Save (or back-out)
  // returns to the default toolbar.
  type Tool = 'canvas' | 'background' | 'items' | null
  const [tool, setTool] = useState<Tool>(null)

  // Canvas aspect ratio (width / height). 9:16 is the default — matches
  // the captured-canvas portrait shape used by the existing pipeline.
  const ASPECT_RATIOS: Array<{ label: string; value: number }> = [
    { label: '9:16', value: 9 / 16 },
    { label: '4:5', value: 4 / 5 },
    { label: '3:4', value: 3 / 4 },
    { label: '1:1', value: 1 },
  ]
  const [aspectRatio, setAspectRatio] = useState(ASPECT_RATIOS[0].value)

  // Canvas backdrop. 'transparent' renders against the page bg; the
  // other three map to existing ToneBackground gradients.
  type Background = 'transparent' | 'neutral' | 'cool' | 'warm'
  const [background, setBackground] = useState<Background>('warm')

  // Items panel: Hide/Show toggle for the overlaid clothing-item
  // callouts. We don't render any overlay yet, so this is a stateful
  // placeholder the design wants wired up.
  const [itemsVisible, setItemsVisible] = useState(true)

  // Canvas sizing. The wrapper measures itself via onLayout so the
  // canvas always fits whichever bound (width or height) is reached
  // first — no matter how tall the bottom strip ends up being for the
  // active tool's panel.
  const [wrapper, setWrapper] = useState<{ w: number; h: number }>({ w: 0, h: 0 })
  const canvasWidth = wrapper.w && wrapper.h ? Math.min(wrapper.w, wrapper.h * aspectRatio) : 0
  const canvasHeight = canvasWidth / aspectRatio

  async function onShare() {
    if (!canvasRef.current || !outfit) return
    try {
      const uri = await captureRef(canvasRef, { format: 'png', quality: 1 })
      const available = await Sharing.isAvailableAsync()
      if (!available) {
        Alert.alert('Sharing unavailable on this device')
        return
      }
      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: outfit.name ?? 'My fit',
      })
    } catch (err) {
      Alert.alert('Could not share', err instanceof Error ? err.message : 'Unknown error')
    }
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ flex: 1, backgroundColor: '#EBEBEB', paddingTop: insets.top + 8 }}>
        {/* Header: back · EDIT title · Share pill. Title is absolutely
            centred so it doesn't shift when the left/right widths change. */}
        <View
          style={{
            height: 56,
            paddingHorizontal: 20,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Pressable onPress={() => router.back()} hitSlop={12} style={{ padding: 8 }}>
            <Image
              source={require('@/assets/arrow-left.png')}
              style={{ width: 24, height: 24 }}
              resizeMode="contain"
            />
          </Pressable>
          <Text
            pointerEvents="none"
            className="font-bebas absolute left-0 right-0 text-center text-[36px] leading-[40px] text-black"
            style={{ top: 8 }}
          >
            E<Text className="font-kirang text-[44px] leading-[40px]">D</Text>I
            <Text className="font-kirang text-[44px] leading-[40px]">T</Text>
          </Text>
          {tool === null ? (
            <Pressable
              onPress={onShare}
              hitSlop={8}
              style={{
                paddingTop: 8,
                paddingBottom: 8,
                paddingLeft: 4,
                paddingRight: 4,
                gap: 10,
                flexDirection: 'row',
                borderRadius: 99,
                backgroundColor: 'black',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <View
                style={{
                  paddingHorizontal: 12,
                  gap: 10,
                  height: 18,
                  justifyContent: 'center',
                }}
              >
                <Text
                  className="font-funnel text-[14px] font-normal text-white"
                  style={{ includeFontPadding: false, textAlignVertical: 'center' }}
                >
                  Share
                </Text>
              </View>
            </Pressable>
          ) : null}
        </View>

        {/* Canvas wrapper centers the aspect-ratio-locked box in the
            remaining vertical space. Switching the Canvas tool's ratio
            pill updates `aspectRatio`, which mutates this box live. */}
        <View
          onLayout={(e) =>
            setWrapper({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })
          }
          style={{
            flex: 1,
            marginHorizontal: 20,
            marginTop: 11,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <View
            ref={canvasRef}
            collapsable={false}
            style={{ width: canvasWidth, height: canvasHeight, overflow: 'hidden' }}
          >
            <CanvasBackdrop background={background} tone={tone}>
              <ExpoImage
                source={
                  outfit?.heroImageUrl
                    ? { uri: outfit.heroImageUrl }
                    : require('@/assets/default-man.png')
                }
                style={{ width: '100%', height: '100%' }}
                contentFit="contain"
                cachePolicy="memory-disk"
              />
              {/* Item-card overlay — 5 SlotCards scaled to fit the
                  canvas width with 12px side padding, anchored 36px
                  above the canvas bottom. Gated by Items Hide/Show. */}
              {itemsVisible && itemSlots.length > 0 && canvasWidth > 0 ? (
                <View
                  pointerEvents="box-none"
                  style={{ position: 'absolute', left: 0, right: 0, bottom: 36 }}
                >
                  <CanvasItemsStrip slots={itemSlots} canvasWidth={canvasWidth} />
                </View>
              ) : null}
            </CanvasBackdrop>
          </View>
        </View>

        {/* Bottom strip: default 3-button toolbar swaps into a panel
            when a tool is active. Save (or back) dismisses the panel. */}
        {tool === null ? (
          <View
            style={{
              flexDirection: 'row',
              paddingTop: 46,
              paddingBottom: insets.bottom + 16,
              paddingHorizontal: 20,
            }}
          >
            <ToolbarItem label="Canvas" onPress={() => setTool('canvas')}>
              <Canvas width={28} height={28} color="#666666" />
            </ToolbarItem>
            <ToolbarItem label="Background" onPress={() => setTool('background')}>
              <Background width={28} height={28} color="#666666" />
            </ToolbarItem>
            <ToolbarItem label="Items" onPress={() => setTool('items')}>
              <TShirtEdit width={28} height={28} color="#666666" />
            </ToolbarItem>
          </View>
        ) : (
          <View style={{ marginTop: 20, paddingBottom: insets.bottom + 16 }}>
            <PanelHeader
              icon={
                tool === 'canvas' ? (
                  <Canvas width={20} height={20} color="#1A1A1A" />
                ) : tool === 'background' ? (
                  <Background width={20} height={20} color="#1A1A1A" />
                ) : (
                  <TShirtEdit width={20} height={20} color="#1A1A1A" />
                )
              }
              label={tool === 'canvas' ? 'Canvas' : tool === 'background' ? 'Background' : 'Items'}
              onSave={() => setTool(null)}
            />
            {tool === 'canvas' ? (
              <SegmentedSelector
                options={ASPECT_RATIOS.map((r) => ({ label: r.label, value: r.value }))}
                value={aspectRatio}
                onChange={setAspectRatio}
              />
            ) : tool === 'background' ? (
              <BackgroundSelector value={background} onChange={setBackground} />
            ) : (
              <SegmentedSelector
                options={[
                  { label: 'Hide', value: false },
                  { label: 'Show', value: true },
                ]}
                value={itemsVisible}
                onChange={setItemsVisible}
              />
            )}
          </View>
        )}
      </View>
    </>
  )
}

function ToolbarItem({
  label,
  onPress,
  children,
}: {
  label: string
  onPress: () => void
  children: React.ReactNode
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 }}
    >
      {children}
      <Text className="font-funnel text-[12px] leading-[16px] font-bold tracking-[0.06px] text-[#666666]">
        {label}
      </Text>
    </Pressable>
  )
}

// Canvas backdrop selector: 'transparent' falls through to page bg;
// the other three reuse the studio-style ToneBackground gradients.
function CanvasBackdrop({
  background,
  tone,
  children,
}: {
  background: 'transparent' | 'neutral' | 'cool' | 'warm'
  tone: 'warm' | 'cool' | 'neutral'
  children: React.ReactNode
}) {
  if (background === 'transparent') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>{children}</View>
    )
  }
  // When the user explicitly picks a tone, override the auto-derived
  // one. (We still accept `tone` so the default 'warm' selection reads
  // from the same gradient palette the detail screen uses.)
  const explicitTone = background as 'warm' | 'cool' | 'neutral'
  return (
    <ToneBackground tone={explicitTone === tone ? tone : explicitTone}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>{children}</View>
    </ToneBackground>
  )
}

// Panel header row: tool icon + label on the left, Save pill on the
// right. Reused by Canvas / Background / Items panels.
function PanelHeader({
  icon,
  label,
  onSave,
}: {
  icon: React.ReactNode
  label: string
  onSave: () => void
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 15,
        paddingTop: 4,
        paddingRight: 20,
        paddingBottom: 15,
        paddingLeft: 20,
        borderTopWidth: 1,
        borderStyle: 'dashed',
        borderTopColor: '#C8C8C8',
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {icon}
        <Text className="font-funnel text-[16px] font-bold text-black">{label}</Text>
      </View>
      <Pressable
        onPress={onSave}
        hitSlop={8}
        style={{
          paddingVertical: 8,
          paddingHorizontal: 16,
          borderRadius: 99,
          backgroundColor: 'black',
        }}
      >
        <Text className="font-funnel text-[14px] leading-[18px] text-white">Save</Text>
      </Pressable>
    </View>
  )
}

// Pill-style segmented selector. White pill marks the selected option;
// unselected items render as plain text on the grey strip.
function SegmentedSelector<T>({
  options,
  value,
  onChange,
}: {
  options: Array<{ label: string; value: T }>
  value: T
  onChange: (v: T) => void
}) {
  const PADDING = 2
  const GAP = 4
  const [stripWidth, setStripWidth] = useState(0)
  const cellWidth =
    stripWidth > 0 ? (stripWidth - PADDING * 2 - GAP * (options.length - 1)) / options.length : 0
  const activeIndex = options.findIndex((o) => o.value === value)

  const thumbX = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.spring(thumbX, {
      toValue: activeIndex * (cellWidth + GAP),
      useNativeDriver: true,
      damping: 18,
      stiffness: 220,
      mass: 0.7,
    }).start()
  }, [activeIndex, cellWidth, thumbX])

  return (
    <View
      onLayout={(e) => setStripWidth(e.nativeEvent.layout.width)}
      style={{
        marginHorizontal: 20,
        flexDirection: 'row',
        gap: GAP,
        backgroundColor: '#D6D6D6',
        borderRadius: 40,
        padding: PADDING,
        position: 'relative',
      }}
    >
      {cellWidth > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: PADDING,
            bottom: PADDING,
            left: PADDING,
            width: cellWidth,
            borderRadius: 40,
            backgroundColor: '#FFFFFF',
            transform: [{ translateX: thumbX }],
          }}
        />
      ) : null}
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <Pressable
            key={opt.label}
            onPress={() => onChange(opt.value)}
            style={{
              flex: 1,
              paddingVertical: 12,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text
              className={`font-funnel text-[14px] leading-[18px] font-bold ${active ? 'text-black' : 'text-[#666666]'}`}
            >
              {opt.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

// Background swatch selector — 4 round swatches with labels. The white
// pill "thumb" slides animated between options instead of swapping
// backgroundColor abruptly. Pattern mirrors subscription's PlanSlider.
function BackgroundSelector({
  value,
  onChange,
}: {
  value: 'transparent' | 'neutral' | 'cool' | 'warm'
  onChange: (v: 'transparent' | 'neutral' | 'cool' | 'warm') => void
}) {
  const SWATCH_COLORS = {
    neutral: '#F0F0F0',
    cool: '#A8C4E0',
    warm: '#C9B89D',
  } as const

  const opts: Array<{ label: string; value: 'transparent' | 'neutral' | 'cool' | 'warm' }> = [
    { label: 'Transparent', value: 'transparent' },
    { label: 'Neutral', value: 'neutral' },
    { label: 'Cool', value: 'cool' },
    { label: 'Warm', value: 'warm' },
  ]

  // Measure the strip's width so the thumb can translate to the exact
  // x-offset of each cell instead of relying on percentage math.
  const PADDING = 2
  const GAP = 4
  const [stripWidth, setStripWidth] = useState(0)
  const cellWidth =
    stripWidth > 0 ? (stripWidth - PADDING * 2 - GAP * (opts.length - 1)) / opts.length : 0
  const activeIndex = opts.findIndex((o) => o.value === value)

  // Animated value driving the thumb's translateX. Spring transitions
  // each time the active index changes — feels close to the iOS
  // segmented-control thumb.
  const thumbX = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.spring(thumbX, {
      toValue: activeIndex * (cellWidth + GAP),
      useNativeDriver: true,
      damping: 18,
      stiffness: 220,
      mass: 0.7,
    }).start()
  }, [activeIndex, cellWidth, thumbX])

  return (
    <View
      onLayout={(e) => setStripWidth(e.nativeEvent.layout.width)}
      style={{
        marginHorizontal: 20,
        flexDirection: 'row',
        gap: GAP,
        backgroundColor: '#D6D6D6',
        borderRadius: 10,
        padding: PADDING,
        position: 'relative',
      }}
    >
      {cellWidth > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: PADDING,
            bottom: PADDING,
            left: PADDING,
            width: cellWidth,
            borderRadius: 10,
            backgroundColor: '#FFFFFF',
            transform: [{ translateX: thumbX }],
          }}
        />
      ) : null}
      {opts.map((opt) => {
        const active = opt.value === value
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            style={{
              flex: 1,
              paddingVertical: 10,
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            {opt.value === 'transparent' ? (
              <View
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  borderWidth: 1.5,
                  borderStyle: 'dashed',
                  borderColor: '#9A9A9A',
                }}
              />
            ) : (
              <View
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  backgroundColor: SWATCH_COLORS[opt.value],
                  boxShadow: '0px 0.5px 0.5px 0px rgba(0, 0, 0, 0.66)',
                }}
              />
            )}
            <Text
              className={`font-funnel text-[12px] leading-[16px] tracking-[0.06px] ${active ? 'font-bold text-black' : 'font-normal text-[#666666]'}`}
            >
              {opt.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

// Compact, non-scrolling item-card strip used as the canvas overlay
// when the Items tool is set to Show. Scales SlotCard down so all 5
// cards fit inside the canvas width with 12px side padding.
function CanvasItemsStrip({ slots, canvasWidth }: { slots: SlotEntry[]; canvasWidth: number }) {
  const CARD_W = 88
  const CARD_H = 100
  const SIDE_PADDING = 12
  const GAP = 8
  const n = slots.length
  const available = canvasWidth - SIDE_PADDING * 2 - GAP * (n - 1)
  const scale = Math.min(1, available / (n * CARD_W))
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: GAP,
        paddingLeft: SIDE_PADDING,
        paddingRight: SIDE_PADDING,
      }}
    >
      {slots.map((s, i) => (
        <View
          key={s.key}
          style={{
            width: CARD_W * scale,
            height: CARD_H * scale,
            overflow: 'visible',
          }}
        >
          <View style={{ transform: [{ scale }], transformOrigin: 'top left' }}>
            <SlotCard label={s.label} item={s.item} index={i} onPress={s.onPress} />
          </View>
        </View>
      ))}
    </View>
  )
}
