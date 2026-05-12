import { useQueries } from '@tanstack/react-query'
import { Image as ExpoImage } from 'expo-image'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  type FlatList as FlatListType,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  Text,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { HeroFloor } from '@/components/hero-floor'
import { SlotStrip } from '@/components/slot-strip'
import { PencilLine, Share as ShareFat, X as XIcon } from '@/components/textured-icons'
import { ToneBackground } from '@/components/tone-background'
import { type client, orpc } from '@/lib/orpc-client'
import { getOutfitTone } from '@/lib/outfit-tone'

type Outfit = Awaited<ReturnType<typeof client.outfit.list>>[number]
type Item = Awaited<ReturnType<typeof client.clothingItem.list>>[number]

const SLOTS: Array<{ key: keyof Outfit; label: string }> = [
  { key: 'baseId', label: 'SHIRT' },
  { key: 'outerId', label: 'JACKET' },
  { key: 'bottomId', label: 'PANTS' },
  { key: 'footwearId', label: 'SHOES' },
  { key: 'headwearId', label: 'HAT' },
]

const SCREEN_WIDTH = Dimensions.get('window').width
const PAGE_WIDTH = SCREEN_WIDTH - 190
const PAGE_GUTTER = (SCREEN_WIDTH - PAGE_WIDTH) / 2

function CellWrapper({ style, children }: { style: unknown; children: React.ReactNode }) {
  return <View style={[style as object, { overflow: 'visible' }]}>{children}</View>
}

function slotItemsFor(outfit: Outfit, itemsById: Map<string, Item>) {
  return SLOTS.map((s) => {
    const itemId = outfit[s.key] as string | null
    return itemId ? { label: s.label, item: itemsById.get(itemId) ?? null } : null
  }).filter((x): x is { label: string; item: Item } => x !== null && x.item !== null)
}

function HeroPage({
  index,
  scrollX,
  showFloor,
  heroImageUrl,
}: {
  index: number
  scrollX: Animated.Value
  showFloor: boolean
  heroImageUrl: string | null
}) {
  // React Compiler does not stabilize Animated interpolation nodes; keeping
  // useMemo avoids recreated interpolations resetting native-driver scroll UX.
  const { scale, translateY, opacity } = useMemo(() => {
    const inputRange = [(index - 1) * PAGE_WIDTH, index * PAGE_WIDTH, (index + 1) * PAGE_WIDTH]
    return {
      scale: scrollX.interpolate({
        inputRange,
        outputRange: [0.78, 1, 0.78],
        extrapolate: 'clamp',
      }),
      translateY: scrollX.interpolate({
        inputRange,
        outputRange: [-54, 0, -54],
        extrapolate: 'clamp',
      }),
      opacity: scrollX.interpolate({
        inputRange,
        outputRange: [0.5, 1, 0.5],
        extrapolate: 'clamp',
      }),
    }
  }, [index, scrollX])

  return (
    <Animated.View
      style={{
        width: PAGE_WIDTH,
        alignItems: 'center',
        overflow: 'visible',
        zIndex: showFloor ? 10 : 0,
        elevation: showFloor ? 10 : 0,
        transform: [{ scale }, { translateY }],
        opacity,
      }}
    >
      {showFloor ? (
        <View
          style={{
            width: SCREEN_WIDTH,
            height: 520,
            marginTop: -120,
            overflow: 'visible',
          }}
        >
          <HeroFloor
            source={heroImageUrl ? { uri: heroImageUrl } : require('@/assets/default-man.png')}
            topOffset={0}
            maxHeight={520}
          />
        </View>
      ) : (
        <ExpoImage
          source={heroImageUrl ? { uri: heroImageUrl } : require('@/assets/default-man.png')}
          style={{
            // ExpoImage doesn't infer width from height — neither for URI
            // sources nor for local require()s the way RN Image does. Pin
            // to the pipeline's 832×1248 aspect (the default_man asset
            // matches this portrait ratio too) so the carousel pages
            // don't collapse to width=0.
            height: 520,
            aspectRatio: 832 / 1248,
            marginTop: -120,
          }}
          contentFit="contain"
          cachePolicy="memory-disk"
        />
      )}
    </Animated.View>
  )
}

export default function OutfitDetail() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const [outfitsQuery, itemsQuery] = useQueries({
    queries: [
      orpc.outfit.list.queryOptions(),
      orpc.clothingItem.list.queryOptions({
        input: {},
      }),
    ],
  })

  const loading = outfitsQuery.isPending || itemsQuery.isPending
  const outfits = outfitsQuery.data ?? []
  const items = itemsQuery.data ?? []

  const [activeIndex, setActiveIndex] = useState(0)
  const flatListRef = useRef<FlatListType<Outfit>>(null)
  const scrollX = useRef(new Animated.Value(0)).current
  const [isScrolling, setIsScrolling] = useState(false)

  // When list data or deep-link id resolves, align index + scroll before paint.
  useLayoutEffect(() => {
    if (loading || outfits.length === 0) return
    const idx = outfits.findIndex((o) => o.id === id)
    if (idx < 0) return
    setActiveIndex(idx)
    scrollX.setValue(idx * PAGE_WIDTH)
  }, [loading, outfits, id, scrollX])

  // Prefetch every outfit's hero into expo-image's shared cache so
  // swiping through the carousel doesn't stall on cold fetches. Same
  // cache the <ExpoImage> below reads from, so repeat calls are no-ops.
  useEffect(() => {
    const urls = outfits.map((o) => o.heroImageUrl).filter((u): u is string => !!u)
    if (urls.length > 0) ExpoImage.prefetch(urls, 'memory-disk')
  }, [outfits])

  const itemsById = new Map(items.map((i) => [i.id, i]))
  const activeOutfit = outfits[activeIndex] ?? null
  const activeSlots = activeOutfit ? slotItemsFor(activeOutfit, itemsById) : []
  const tone = getOutfitTone(activeSlots.map((s) => s.item.colors[0]?.name))
  const padded = String(activeIndex + 1).padStart(2, '0')

  function onMomentumEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const idx = Math.round(e.nativeEvent.contentOffset.x / PAGE_WIDTH)
    if (idx !== activeIndex) setActiveIndex(idx)
    setIsScrolling(false)
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ToneBackground tone={tone}>
        <View style={{ flex: 1, paddingTop: insets.top + 12 }}>
          <View
            style={{
              paddingHorizontal: 24,
              marginBottom: 8,
              height: 160,
              position: 'relative',
            }}
          >
            <Text
              pointerEvents="none"
              className="font-bebas absolute left-6 top-[-10px] h-[70px] w-[52px] text-[64px] leading-[70px] text-white opacity-20"
            >
              {padded}
            </Text>
            <Text
              style={{ letterSpacing: -0.36 }}
              className="font-funnel mt-2 font-bold text-[24px] leading-[24px] text-white"
            >
              {activeOutfit?.name ?? 'Outfit'}
            </Text>
          </View>

          {loading ? (
            <View
              style={{
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ActivityIndicator color="white" />
            </View>
          ) : (
            <View style={{ flex: 1 }}>
              <Animated.FlatList
                ref={flatListRef}
                data={outfits}
                horizontal
                initialScrollIndex={activeIndex}
                // Only the visible page on first render. Adjacent pages
                // mount lazily as the user starts scrolling — otherwise
                // every hero image races to fetch at once and the active
                // one ends up queued behind the rest, causing a multi-
                // second delay before anything appears.
                initialNumToRender={1}
                windowSize={3}
                maxToRenderPerBatch={1}
                showsHorizontalScrollIndicator={false}
                keyExtractor={(o: Outfit) => o.id}
                onMomentumScrollEnd={onMomentumEnd}
                onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
                  useNativeDriver: true,
                })}
                scrollEventThrottle={16}
                snapToInterval={PAGE_WIDTH}
                snapToAlignment="start"
                decelerationRate="fast"
                contentContainerStyle={{ paddingHorizontal: PAGE_GUTTER }}
                getItemLayout={(_: unknown, index: number) => ({
                  length: PAGE_WIDTH,
                  offset: PAGE_WIDTH * index,
                  index,
                })}
                style={{ flex: 1, overflow: 'visible' }}
                CellRendererComponent={CellWrapper}
                renderItem={({ item, index }: { item: Outfit; index: number }) => {
                  return (
                    <HeroPage
                      index={index}
                      scrollX={scrollX}
                      showFloor={!isScrolling && index === activeIndex}
                      heroImageUrl={item.heroImageUrl}
                    />
                  )
                }}
                onScrollBeginDrag={() => setIsScrolling(true)}
                extraData={`${itemsById.size}-${activeIndex}`}
              />
            </View>
          )}

          <View style={{ paddingBottom: 50 }}>
            <SlotStrip
              slots={activeSlots.map((s) => ({
                key: s.label,
                label: s.label,
                item: { ...s.item, aiGenerated: !s.item.owned },
              }))}
            />

            <View
              style={{
                flexDirection: 'row',
                gap: 12,
                height: 64,
                paddingTop: 8,
                paddingLeft: 20,
                paddingRight: 20,
              }}
            >
              <Pressable
                onPress={() =>
                  activeOutfit &&
                  router.push({
                    pathname: '/outfit/edit/[id]',
                    params: { id: activeOutfit.id },
                  })
                }
                style={{
                  flex: 1,
                  height: 48,
                  borderRadius: 99,
                  backgroundColor: 'white',
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                <ShareFat width={18} height={18} color="#000" />
                <Text className="font-semibold text-black">Share</Text>
              </Pressable>
              <Pressable
                onPress={() => router.push('/tryon')}
                style={{
                  flex: 1,
                  height: 48,
                  borderRadius: 99,
                  backgroundColor: 'black',
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                <PencilLine width={18} height={18} color="#fff" />
                <Text className="font-semibold text-white">Edit</Text>
              </Pressable>
            </View>
          </View>

          <Pressable
            onPress={() => router.back()}
            style={{
              position: 'absolute',
              top: insets.top + 12,
              right: 24,
              width: 24,
              height: 24,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <XIcon width={24} height={24} color="#fff" />
          </Pressable>
        </View>
      </ToneBackground>
    </>
  )
}
