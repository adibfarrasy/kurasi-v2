import {
  type BottomSheetBackdropProps,
  BottomSheetFooter,
  type BottomSheetFooterProps,
  BottomSheetModal,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet'
import { useQuery } from '@tanstack/react-query'
import { BlurView } from 'expo-blur'
import { LinearGradient } from 'expo-linear-gradient'
import { forwardRef, useImperativeHandle, useRef, useState } from 'react'
import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { interpolate, useAnimatedProps, useAnimatedStyle } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { EllipseSelect, Reset } from '@/components/textured-icons'
import { TopFlair } from '@/components/top-flair'
import { TAB_BAR_BOTTOM_GAP } from '@/lib/layout'
import { orpc } from '@/lib/orpc-client'

const AnimatedBlurView = Animated.createAnimatedComponent(BlurView)

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

// Categories shown as static tabs at the top of the sheet — same set
// and labels as AddItemSheet so the two read consistently. The active
// tab is decorative here (the sheet edits a single slot at a time);
// switching slots is owned by the parent page.
const SHEET_CATEGORIES = ['headwear', 'shirt', 'jacket', 'pants', 'footwear'] as const
const SHEET_TAB_LABEL: Record<(typeof SHEET_CATEGORIES)[number], string> = {
  headwear: 'Headwear',
  shirt: 'Shirt',
  jacket: 'Jacket',
  pants: 'Pants',
  footwear: 'Footwear',
}

export type SlotPickerInput = {
  category: string
  /** AI-generated item shown above the wardrobe grid. Only present when the
   *  user reached the picker via the steal-the-look flow. */
  aiItem?: { imageUrl: string; title: string }
  /** Item currently bound to this slot. `AI_KEY` means the AI item is bound;
   *  otherwise a wardrobe item id, or `null` if nothing is bound yet. */
  initialSelectedId: string | null
  /** Called when the user taps Done. `selectedId` is `AI_KEY` if the AI
   *  item is chosen, a wardrobe item id otherwise. */
  onConfirm: (selectedId: string | null) => void
}

export type SlotPickerHandle = {
  present: (input: SlotPickerInput) => void
  dismiss: () => void
}

type Context = SlotPickerInput | null

export const AI_KEY = '__ai__'

export const SlotPickerSheet = forwardRef<SlotPickerHandle>((_props, ref) => {
  const sheetRef = useRef<BottomSheetModal>(null)
  const insets = useSafeAreaInsets()
  const [ctx, setCtx] = useState<Context>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useImperativeHandle(ref, () => ({
    present: (input) => {
      setCtx(input)
      setSelectedId(input.initialSelectedId)
      sheetRef.current?.present()
    },
    dismiss: () => sheetRef.current?.dismiss(),
  }))

  const itemsQuery = useQuery(orpc.clothingItem.list.queryOptions({ input: {} }))
  const items = itemsQuery.data ?? []
  const categoryItems = ctx ? items.filter((i) => i.category === ctx.category) : []
  const hasChanged = ctx ? selectedId !== ctx.initialSelectedId : false

  function renderFooter(props: BottomSheetFooterProps) {
    if (!ctx || !hasChanged) return null
    return (
      <BottomSheetFooter {...props} bottomInset={0}>
        <LinearGradient
          colors={['rgba(255,255,255,0)', '#FFFFFF']}
          locations={[0, 0.15]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={{
            paddingHorizontal: 20,
            paddingTop: 12,
            paddingBottom: insets.bottom + TAB_BAR_BOTTOM_GAP,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <Pressable
            onPress={() => setSelectedId(ctx.initialSelectedId)}
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
              ctx.onConfirm(selectedId)
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
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={['85%']}
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
        {ctx ? (
          <>
            <View style={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 12 }}>
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
              {SHEET_CATEGORIES.map((c) => {
                const active = c === ctx.category
                return (
                  <View key={c}>
                    <Text
                      className={`font-funnel text-[16px] leading-[22px] tracking-[-0.16px] ${
                        active ? 'font-bold text-[#FF0D00]' : 'font-normal text-[#666666]'
                      }`}
                    >
                      {SHEET_TAB_LABEL[c]}
                    </Text>
                    {active ? (
                      <View style={{ height: 1, backgroundColor: '#FF0D00', marginTop: 2 }} />
                    ) : null}
                  </View>
                )
              })}
            </View>

            <View style={{ height: 1, backgroundColor: '#E5E5E5' }} />

            {ctx.aiItem ? (
              <>
                <View
                  style={{
                    height: 32,
                    paddingTop: 8,
                    paddingRight: 12,
                    paddingBottom: 8,
                    paddingLeft: 12,
                    gap: 4,
                  }}
                >
                  <Text className="font-funnel font-normal text-[12px] leading-[16px] tracking-[0.06px] text-black">
                    <Text style={{ fontStyle: 'italic' }}>AI generated</Text>
                    <Text> • {ctx.aiItem.title}</Text>
                  </Text>
                </View>

                <View style={{ paddingHorizontal: 20, paddingBottom: 11 }}>
                  <Pressable
                    onPress={() => setSelectedId((prev) => (prev === AI_KEY ? null : AI_KEY))}
                    style={{ width: 110, height: 110, overflow: 'visible' }}
                  >
                    <Image
                      source={{ uri: ctx.aiItem.imageUrl }}
                      style={{ width: 110, height: 110 }}
                      resizeMode="contain"
                    />
                    {selectedId === AI_KEY ? (
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

            <View
              style={{
                paddingHorizontal: 20,
                paddingTop: 16,
                flexDirection: 'row',
                flexWrap: 'wrap',
                gap: 12,
              }}
            >
              {categoryItems.length === 0 ? (
                <Text className="font-funnel text-[14px] text-[#666666]">
                  No {ctx.category} items in your wardrobe yet.
                </Text>
              ) : (
                categoryItems.map((it) => (
                  <Pressable
                    key={it.id}
                    // Tap toggles: tapping the currently-selected item
                    // again deselects it (selection becomes null).
                    onPress={() => setSelectedId((prev) => (prev === it.id ? null : it.id))}
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
                    {selectedId === it.id ? (
                      <EllipseSelect
                        width={110}
                        height={110}
                        style={{ position: 'absolute', left: -5, top: -5 }}
                      />
                    ) : null}
                  </Pressable>
                ))
              )}
            </View>
          </>
        ) : null}
      </BottomSheetScrollView>
    </BottomSheetModal>
  )
})

SlotPickerSheet.displayName = 'SlotPickerSheet'
