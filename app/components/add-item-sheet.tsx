import {
  type BottomSheetBackdropProps,
  BottomSheetFooter,
  type BottomSheetFooterProps,
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetView,
} from '@gorhom/bottom-sheet'
import { useQuery } from '@tanstack/react-query'
import { BlurView } from 'expo-blur'
import { LinearGradient } from 'expo-linear-gradient'
import { forwardRef, useImperativeHandle, useRef, useState } from 'react'
import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { interpolate, useAnimatedProps, useAnimatedStyle } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AddItemGlyph, EllipseSelect, Reset } from '@/components/textured-icons'
import { TopFlair } from '@/components/top-flair'
import {
  bucketForSimilarity,
  colorPaletteSimilarity,
  type PaletteColor,
} from '@/lib/color-similarity'
import { TAB_BAR_BOTTOM_GAP } from '@/lib/layout'
import { orpc } from '@/lib/orpc-client'

const AnimatedBlurView = Animated.createAnimatedComponent(BlurView)

const CATEGORIES = ['headwear', 'shirt', 'jacket', 'pants', 'footwear'] as const
type Category = (typeof CATEGORIES)[number]

const TAB_LABEL: Record<Category, string> = {
  headwear: 'Headwear',
  shirt: 'Shirt',
  jacket: 'Jacket',
  pants: 'Pants',
  footwear: 'Footwear',
}

function BlurBackdrop({
  style,
  animatedIndex,
  onPress,
}: BottomSheetBackdropProps & { onPress?: () => void }) {
  const tintStyle = useAnimatedStyle(() => ({
    opacity: interpolate(animatedIndex.value, [-1, 0], [0, 1], 'clamp'),
  }))
  const blurProps = useAnimatedProps(() => ({
    intensity: interpolate(animatedIndex.value, [-1, 0], [0, 40], 'clamp'),
  }))
  return (
    <Animated.View style={[style, StyleSheet.absoluteFill, tintStyle]}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onPress}>
        <AnimatedBlurView
          tint="light"
          animatedProps={blurProps}
          style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.1)' }]}
        />
      </Pressable>
    </Animated.View>
  )
}

export type AddItemSelections = Partial<Record<Category, string>>

// Sentinel value used in `selections` when the user picks the AI item
// for a category instead of a wardrobe item. Kept identical to
// slot-picker-sheet's AI_KEY so call sites can share the literal.
export const AI_KEY = '__ai__'

export type AiItem = {
  imageUrl: string
  title: string
  /** Ratio-weighted dominant colors of the AI item, used to bucket the
   *  user's wardrobe into "identical" / "alternative" matches. Optional
   *  so callers from the manual flow (no draft) don't have to fabricate
   *  a palette — when absent, items render in a single ungrouped list. */
  colors?: PaletteColor[]
}

export type AddItemSheetInput = {
  initial?: AddItemSelections
  onConfirm: (selections: AddItemSelections) => void
  /** Optional per-category AI item. When present, renders an "AI
   *  generated" section above the wardrobe grid for that category and
   *  lets the user select it (selection value: AI_KEY). */
  aiItems?: Partial<Record<Category, AiItem>>
  /** Pre-selects which tab the sheet opens on. Defaults to 'headwear'. */
  initialActiveCategory?: Category
}

export type AddItemSheetHandle = {
  present: (input: AddItemSheetInput) => void
  dismiss: () => void
}

export const AddItemSheet = forwardRef<AddItemSheetHandle>((_props, ref) => {
  const sheetRef = useRef<BottomSheetModal>(null)
  // Separate modal for the destructive-action confirmation. Slides up
  // OVER the main sheet from the bottom — feels like an alert dialog
  // rather than the main content suddenly mutating.
  const confirmRef = useRef<BottomSheetModal>(null)
  const insets = useSafeAreaInsets()
  const [activeCategory, setActiveCategory] = useState<Category>('headwear')
  const [selections, setSelections] = useState<AddItemSelections>({})
  const [aiItems, setAiItems] = useState<Partial<Record<Category, AiItem>>>({})
  const [onConfirmFn, setOnConfirmFn] = useState<((sel: AddItemSelections) => void) | null>(null)

  useImperativeHandle(ref, () => ({
    present: (input) => {
      setSelections(input.initial ?? {})
      setAiItems(input.aiItems ?? {})
      setOnConfirmFn(() => input.onConfirm)
      setActiveCategory(input.initialActiveCategory ?? 'headwear')
      sheetRef.current?.present()
    },
    dismiss: () => sheetRef.current?.dismiss(),
  }))

  const itemsQuery = useQuery(orpc.clothingItem.list.queryOptions({ input: {} }))
  const items = itemsQuery.data ?? []
  // Only the user's actual wardrobe shows in the picker grid — unowned
  // rows (AI items promoted by saved outfits) belong in the "AI
  // generated" section above the grid, not as fake wardrobe matches.
  const categoryItems = items.filter((i) => i.category === activeCategory && i.owned)
  const hasSelection = Object.values(selections).some(Boolean)
  // Steal-the-look context = caller passed at least one AI item. Tabs
  // for categories without an AI match get struck through so the user
  // sees at a glance which slots the AI didn't fill.
  const inStealMode = Object.keys(aiItems).length > 0

  // Bucket the user's wardrobe by perceptual color similarity to the
  // AI item for this slot. Identical (≥0.9) and alternative (0.5–0.9)
  // get their own labelled sections; everything else falls into the
  // generic "All ___ you have" tail. Without an AI palette there's
  // nothing to compare against — render a single tail group.
  const aiPalette = aiItems[activeCategory]?.colors
  type Bucketed = {
    identical: typeof categoryItems
    alternative: typeof categoryItems
    other: typeof categoryItems
  }
  const buckets: Bucketed = aiPalette
    ? categoryItems.reduce<Bucketed>(
        (acc, it) => {
          const sim = colorPaletteSimilarity(aiPalette, it.colors)
          acc[bucketForSimilarity(sim)].push(it)
          return acc
        },
        { identical: [], alternative: [], other: [] },
      )
    : { identical: [], alternative: [], other: categoryItems }

  function renderFooter(props: BottomSheetFooterProps) {
    if (!hasSelection) return null
    return (
      <BottomSheetFooter {...props} bottomInset={0}>
        <LinearGradient
          // 360deg in CSS = bottom→top, so transparent sits at the top edge
          // and pure white starts at 15% down. expo-linear-gradient takes
          // start={top} → end={bottom}, hence locations [0, 0.15] with
          // colors [transparent, white].
          colors={['rgba(255,255,255,0)', '#FFFFFF']}
          locations={[0, 0.15]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={{
            paddingHorizontal: 20,
            paddingTop: 12,
            // Matches the bottom tab bar's paddingBottom so the action
            // buttons sit on the same horizontal line as the tab bar
            // items across every device size.
            paddingBottom: insets.bottom + TAB_BAR_BOTTOM_GAP,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <Pressable
            // Reset is destructive — open the confirmation modal first;
            // actual clearing happens inside its Yes button.
            onPress={() => confirmRef.current?.present()}
            hitSlop={8}
            style={{
              height: 56,
              borderRadius: 99,
              paddingTop: 12,
              paddingRight: 12,
              paddingBottom: 14,
              paddingLeft: 12,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Reset width={20} height={20} color="#000" />
            <Text className="font-funnel font-medium text-[16px] leading-[22px] tracking-[-0.16px] text-black">
              Reset
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              onConfirmFn?.(selections)
              sheetRef.current?.dismiss()
            }}
            style={{
              flex: 1,
              height: 56,
              borderRadius: 99,
              paddingTop: 12,
              paddingRight: 12,
              paddingBottom: 14,
              paddingLeft: 12,
              backgroundColor: '#000',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text className="font-funnel font-medium text-[16px] leading-[24px] tracking-[-0.24px] text-white">
              Done
            </Text>
          </Pressable>
        </LinearGradient>
      </BottomSheetFooter>
    )
  }

  return (
    <>
      <BottomSheetModal
        ref={sheetRef}
        snapPoints={['80%']}
        enableDynamicSizing={false}
        enablePanDownToClose
        backgroundStyle={{ backgroundColor: 'transparent', borderRadius: 0 }}
        backgroundComponent={({ style }) => (
          <View
            style={[style, { backgroundColor: '#fff', top: 12, borderRadius: 0 }]}
            pointerEvents="none"
          />
        )}
        handleComponent={() => <TopFlair />}
        backdropComponent={(props) => (
          <BlurBackdrop {...props} onPress={() => sheetRef.current?.dismiss()} />
        )}
        footerComponent={renderFooter}
      >
        <BottomSheetScrollView contentContainerStyle={{ paddingBottom: 110 }}>
          <View style={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 12 }}>
            {/* Mixed display fonts per Figma: T and N → Kirang 44/40,
              other letters → Bebas 36/40. */}
            <Text className="text-black">
              <Text className="font-kirang text-[44px] leading-[40px]">T</Text>
              <Text className="font-bebas text-[36px] leading-[40px]">RY</Text>
              <Text className="font-bebas text-[36px] leading-[40px]"> O</Text>
              <Text className="font-kirang text-[44px] leading-[40px]">N</Text>
            </Text>
          </View>

          <View
            style={{
              flexDirection: 'row',
              paddingHorizontal: 20,
              gap: 16,
              paddingBottom: 12,
            }}
          >
            {CATEGORIES.map((c) => {
              const active = c === activeCategory
              const hasItem = !!selections[c]
              // In steal-the-look mode, categories without an AI match
              // are struck through and not navigable — there's no AI
              // reference for those slots so the picker has nothing to
              // bucket against.
              const struck = inStealMode && !aiItems[c]
              // Tab text colour:
              //   active        → red (FF0D00) regardless of selection
              //   inactive+pick → black, signalling "you've made a selection here"
              //   inactive+none → grey, default
              //   struck        → mid-grey, regardless of active
              const textColorClass = struck
                ? 'text-[#999999]'
                : active
                  ? 'text-[#FF0D00]'
                  : hasItem
                    ? 'text-black'
                    : 'text-[#666666]'
              const fontWeightClass = active ? 'font-bold' : 'font-normal'
              return (
                <Pressable
                  key={c}
                  onPress={struck ? undefined : () => setActiveCategory(c)}
                  disabled={struck}
                  // overflow:visible so the underline can sit below the
                  // text baseline without padding the row height.
                  style={{ overflow: 'visible' }}
                >
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'flex-start',
                      gap: 2,
                    }}
                  >
                    {/* Text + its underline live in the SAME inner view so
                      the underline's width matches the text width, not
                      the Pressable's content width (which would otherwise
                      include the checkcircle icon). */}
                    <View style={{ overflow: 'visible' }}>
                      <Text
                        style={struck ? { textDecorationLine: 'line-through' } : undefined}
                        className={`font-funnel text-[16px] leading-[22px] tracking-[-0.16px] ${fontWeightClass} ${textColorClass}`}
                      >
                        {TAB_LABEL[c]}
                      </Text>
                      {active ? (
                        <Image
                          source={require('@/assets/tab-underline.png')}
                          // RN's <Image> doesn't honour `left:0 right:0`
                          // for sizing the way <View> does — it falls back
                          // to the asset's intrinsic width. width:'100%'
                          // is the reliable way to span the parent (which
                          // is sized to the text).
                          style={{
                            position: 'absolute',
                            left: 0,
                            bottom: -2,
                            width: '100%',
                            height: 4,
                          }}
                          resizeMode="stretch"
                        />
                      ) : null}
                    </View>
                    {hasItem ? (
                      <Image
                        source={require('@/assets/checkcircle.png')}
                        style={{
                          width: 12,
                          height: 12,
                          marginTop: 2,
                          tintColor: active ? '#FF0D00' : '#000',
                        }}
                        resizeMode="contain"
                      />
                    ) : null}
                  </View>
                </Pressable>
              )
            })}
          </View>

          <View style={{ height: 1, backgroundColor: '#E5E5E5' }} />

          {aiItems[activeCategory] ? (
            <>
              <View
                style={{
                  paddingTop: 8,
                  paddingRight: 12,
                  paddingBottom: 8,
                  paddingLeft: 20,
                }}
              >
                <Text className="font-funnel font-normal text-[12px] leading-[16px] tracking-[0.06px] text-black">
                  <Text style={{ fontStyle: 'italic' }}>AI generated</Text>
                  <Text> • {aiItems[activeCategory]?.title}</Text>
                </Text>
              </View>

              <View style={{ paddingHorizontal: 20, paddingBottom: 11 }}>
                <Pressable
                  onPress={() =>
                    setSelections((prev) => {
                      const next = { ...prev }
                      if (prev[activeCategory] === AI_KEY) {
                        delete next[activeCategory]
                      } else {
                        next[activeCategory] = AI_KEY
                      }
                      return next
                    })
                  }
                  style={{ width: 110, height: 110, overflow: 'visible' }}
                >
                  <Image
                    source={{ uri: aiItems[activeCategory]?.imageUrl }}
                    style={{ width: 110, height: 110 }}
                    resizeMode="contain"
                  />
                  {selections[activeCategory] === AI_KEY ? (
                    <EllipseSelect
                      width={120}
                      height={120}
                      style={{ position: 'absolute', left: -5, top: -5 }}
                    />
                  ) : null}
                </Pressable>
              </View>

              <View style={{ height: 1, backgroundColor: '#E5E5E5' }} />
            </>
          ) : null}

          {(() => {
            const renderItem = (it: (typeof categoryItems)[number]) => {
              const selected = selections[activeCategory] === it.id
              return (
                <Pressable
                  key={it.id}
                  // Tapping a selected item again clears the selection for
                  // this category — same toggle UX as the slot picker.
                  onPress={() =>
                    setSelections((prev) => {
                      const next = { ...prev }
                      if (prev[activeCategory] === it.id) {
                        delete next[activeCategory]
                      } else {
                        next[activeCategory] = it.id
                      }
                      return next
                    })
                  }
                  style={{
                    width: 100,
                    height: 100,
                    borderRadius: 4,
                    backgroundColor: '#fff',
                    alignItems: 'center',
                    justifyContent: 'center',
                    shadowColor: '#000',
                    shadowOpacity: 0.1,
                    shadowRadius: 2,
                    shadowOffset: { width: 0, height: 1 },
                    overflow: 'visible',
                  }}
                >
                  <Image
                    source={{ uri: it.imageUrl }}
                    style={{ width: '100%', height: '100%' }}
                    resizeMode="contain"
                  />
                  {selected ? (
                    <EllipseSelect
                      width={110}
                      height={110}
                      style={{ position: 'absolute', left: -5, top: -5 }}
                    />
                  ) : null}
                </Pressable>
              )
            }

            const uploadTile = (
              <Pressable
                key="__upload__"
                onPress={() => {
                  // TODO: hook up the upload-new-item flow.
                }}
                style={{
                  width: 100,
                  height: 100,
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                  padding: 8,
                }}
              >
                <Image
                  source={require('@/assets/itembox.png')}
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    width: 100,
                    height: 100,
                  }}
                  resizeMode="stretch"
                />
                <AddItemGlyph width={24} height={24} />
                <Text className="font-funnel text-[10px] leading-[12px] text-center text-[#3C3C3C]">
                  Upload new {TAB_LABEL[activeCategory]}
                </Text>
              </Pressable>
            )

            const Section = ({ label, children }: { label: string; children: React.ReactNode }) => (
              <>
                <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 }}>
                  <View
                    style={{
                      alignSelf: 'flex-start',
                      paddingHorizontal: 10,
                      paddingVertical: 4,
                      borderRadius: 4,
                      backgroundColor: '#EEEEEE',
                    }}
                  >
                    <Text className="font-funnel font-normal text-[14px] leading-[18px] tracking-[-0.14px] text-black">
                      {label}
                    </Text>
                  </View>
                </View>
                <View
                  style={{
                    paddingHorizontal: 20,
                    paddingBottom: 4,
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    gap: 12,
                  }}
                >
                  {children}
                </View>
              </>
            )

            // No AI palette → no buckets to label, so render an
            // unlabelled grid (Upload tile first, then every wardrobe
            // item) just like the original Try On flow.
            if (!aiPalette) {
              return (
                <View
                  style={{
                    paddingHorizontal: 20,
                    paddingTop: 16,
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    gap: 12,
                  }}
                >
                  {uploadTile}
                  {buckets.other.map(renderItem)}
                </View>
              )
            }

            const tabLabel = TAB_LABEL[activeCategory]
            // Surface the empty-state copy only when there's no
            // *similar* match — identical AND alternative both empty.
            // Alternatives count as similar, so their presence
            // suppresses the "no similar item" message.
            const showEmptyMessage =
              buckets.identical.length === 0 && buckets.alternative.length === 0

            return (
              <>
                {showEmptyMessage ? (
                  <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 4 }}>
                    <Text className="font-funnel font-normal text-[16px] leading-[22px] tracking-[-0.16px] text-black">
                      You don't have any similar item in your wardrobe.
                    </Text>
                  </View>
                ) : null}
                {buckets.identical.length > 0 ? (
                  <Section label={`${buckets.identical.length} identical items`}>
                    {buckets.identical.map(renderItem)}
                  </Section>
                ) : null}
                {buckets.alternative.length > 0 ? (
                  <Section label={`${buckets.alternative.length} alternative items`}>
                    {buckets.alternative.map(renderItem)}
                  </Section>
                ) : null}
                {buckets.other.length > 0 ? (
                  <Section label={`All ${tabLabel} you have`}>
                    {buckets.other.map(renderItem)}
                  </Section>
                ) : null}
              </>
            )
          })()}
        </BottomSheetScrollView>
      </BottomSheetModal>

      {/* Reset confirmation. Lives in its own BottomSheetModal so it
        slides up over the main sheet and dismisses cleanly without
        mutating the main sheet's content/animation. */}
      <BottomSheetModal
        ref={confirmRef}
        enableDynamicSizing
        enablePanDownToClose
        backgroundStyle={{ backgroundColor: 'transparent', borderRadius: 0 }}
        backgroundComponent={({ style }) => (
          <View
            style={[style, { backgroundColor: '#fff', top: 12, borderRadius: 0 }]}
            pointerEvents="none"
          />
        )}
        handleComponent={() => <TopFlair />}
        backdropComponent={(props) => (
          <BlurBackdrop {...props} onPress={() => confirmRef.current?.dismiss()} />
        )}
      >
        <BottomSheetView>
          <View style={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 15 }}>
            {/* RESET THE FIT — same Bebas + Kirang mix pattern as TRY ON.
                T's get Kirang (taller, hand-drawn); rest are Bebas. */}
            <Text className="text-black">
              <Text className="font-bebas text-[36px] leading-[40px]">R</Text>
              <Text className="font-kirang text-[44px] leading-[40px]">E</Text>
              <Text className="font-bebas text-[36px] leading-[40px]">SE</Text>
              <Text className="font-kirang text-[44px] leading-[40px]">T</Text>
              <Text className="font-bebas text-[36px] leading-[40px]"> T</Text>
              <Text className="font-kirang text-[44px] leading-[40px]">H</Text>
              <Text className="font-bebas text-[36px] leading-[40px]">E </Text>
              <Text className="font-kirang text-[44px] leading-[40px]">F</Text>
              <Text className="font-bebas text-[36px] leading-[40px]">IT</Text>
            </Text>
          </View>

          <View style={{ height: 1, backgroundColor: '#E5E5E5' }} />

          <View style={{ paddingHorizontal: 20, paddingVertical: 15 }}>
            <Text className="font-funnel font-normal text-[16px] leading-[22px] tracking-[-0.16px] text-black">
              Resetting will restore all five categories to default. Proceed?
            </Text>
          </View>

          <View style={{ height: 1, backgroundColor: '#E5E5E5' }} />

          <View
            style={{
              paddingHorizontal: 20,
              paddingTop: 15,
              paddingBottom: 50,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <Pressable
              onPress={() => confirmRef.current?.dismiss()}
              hitSlop={8}
              style={{
                flex: 1,
                height: 56,
                paddingHorizontal: 12,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text className="font-funnel font-normal text-[16px] leading-[22px] tracking-[-0.16px] text-black">
                No, Cancel
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setSelections({})
                confirmRef.current?.dismiss()
              }}
              style={{
                flex: 1,
                height: 56,
                borderRadius: 99,
                paddingHorizontal: 12,
                backgroundColor: '#000',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text className="font-funnel font-medium text-[16px] leading-[24px] tracking-[-0.24px] text-white">
                Yes, Reset
              </Text>
            </Pressable>
          </View>
        </BottomSheetView>
      </BottomSheetModal>
    </>
  )
})

AddItemSheet.displayName = 'AddItemSheet'
