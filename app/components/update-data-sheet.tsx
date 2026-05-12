import type { BottomSheetModal } from '@gorhom/bottom-sheet'
import { BottomSheetScrollView, BottomSheetTextInput } from '@gorhom/bottom-sheet'
import { useAtom } from 'jotai'
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import {
  Dimensions,
  Image,
  Keyboard,
  type KeyboardEvent,
  Pressable,
  Text,
  View,
} from 'react-native'
import { FlairSheet } from '@/components/flair-sheet'
import { X as XIcon } from '@/components/textured-icons'
import { TopFlair } from '@/components/top-flair'
import { WHEEL_ITEM_HEIGHT, WHEEL_VISIBLE_COUNT, WheelPicker } from '@/components/wheel-picker'
import { cardNameAtom } from '@/state/membership'
import { heightAtom, weightAtom } from '@/state/onboarding-profile'

export type UpdateDataSheetHandle = {
  present: () => void
  dismiss: () => void
}

type Mode = 'form' | 'height' | 'weight'

const HEIGHTS = Array.from({ length: 220 - 140 + 1 }, (_, i) => 140 + i)
const WEIGHTS = Array.from({ length: 150 - 40 + 1 }, (_, i) => 40 + i)

// Sheet opened by the profile sheet's "Update Data" row. Lets the user
// edit name + height + weight. Height and weight tap into a wheel picker
// inside the same sheet (no nested-sheet juggling). Save commits to the
// jotai atoms and returns to the form (or dismisses when saved from form).
export const UpdateDataSheet = forwardRef<UpdateDataSheetHandle>((_props, ref) => {
  const sheetRef = useRef<BottomSheetModal>(null)
  const [name, setName] = useAtom(cardNameAtom)
  const [height, setHeight] = useAtom(heightAtom)
  const [weight, setWeight] = useAtom(weightAtom)
  const [mode, setMode] = useState<Mode>('form')
  // Draft values for the wheel pickers — committed to the atoms on Save.
  // Keeping them local means cancelling (X out) doesn't write back.
  const [draftHeight, setDraftHeight] = useState(height)
  const [draftWeight, setDraftWeight] = useState(weight)
  // Keyboard-avoidance via dynamic top padding. The content is shorter
  // than the available space, so scrolling can't move Name *lower* on
  // the viewport. Instead we PUSH the content down with extra paddingTop
  // when the keyboard appears, so Name lands 20pt above the keyboard
  // top (and Height/Weight, which is below Name in layout, gets pushed
  // below the keyboard and becomes hidden).
  const nameInputBoxRef = useRef<View>(null)
  const [extraTopPadding, setExtraTopPadding] = useState(0)
  // Tracks whether the keyboard is *actually* open. iOS re-fires
  // keyboardDidShow when the predictive bar resizes on each keystroke,
  // and re-firing the measure-and-pad routine while padding is already
  // applied would stack additional padding and jitter the sheet. We
  // only compute once per real show-cycle.
  const keyboardOpenRef = useRef(false)
  const GAP_ABOVE_KEYBOARD = 20

  useEffect(() => {
    function onShow(e: KeyboardEvent) {
      if (keyboardOpenRef.current) return
      keyboardOpenRef.current = true
      const kb = e.endCoordinates.height
      const box = nameInputBoxRef.current
      if (!box) return
      box.measureInWindow((_x, y, _w, h) => {
        const currentBottomScreenY = y + h
        const targetBottomScreenY = Dimensions.get('window').height - kb - GAP_ABOVE_KEYBOARD
        const delta = targetBottomScreenY - currentBottomScreenY
        setExtraTopPadding(Math.max(0, delta))
      })
    }
    function onHide() {
      // Only act once per real hide cycle. Without this, willHide +
      // didHide + onBlur all fire and we'd snapToIndex three times.
      if (!keyboardOpenRef.current) return
      keyboardOpenRef.current = false
      setExtraTopPadding(0)
      // Force the sheet back to its 100% snap point. gorhom's
      // keyboardBlurBehavior="restore" sometimes leaves the sheet at
      // an intermediate height — explicit snapToIndex(0) guarantees
      // we land at the only snap point we configured.
      sheetRef.current?.snapToIndex(0)
    }
    // Listen for both `Will` and `Did` — iOS occasionally skips `Did`
    // when the keyboard is dismissed via tap-outside or chevron. The
    // `Will` event fires reliably for those paths.
    const willHideSub = Keyboard.addListener('keyboardWillHide', onHide)
    const showSub = Keyboard.addListener('keyboardDidShow', onShow)
    const hideSub = Keyboard.addListener('keyboardDidHide', onHide)
    return () => {
      willHideSub.remove()
      showSub.remove()
      hideSub.remove()
    }
  }, [])

  useImperativeHandle(ref, () => ({
    present: () => {
      setMode('form')
      setDraftHeight(height)
      setDraftWeight(weight)
      sheetRef.current?.present()
    },
    dismiss: () => sheetRef.current?.dismiss(),
  }))

  // Same custom handle as ProfileSheet: blurred avatar zone above (the
  // backdrop blur shows the underlying tryon avatar), 48×48 white X pill,
  // then TopFlair. Locked-from-Figma magic numbers identical so the two
  // sheets feel like one component.
  const handleComponent = useCallback(
    () => (
      <View style={{ overflow: 'visible' }}>
        <View style={{ height: 220, alignItems: 'flex-end', paddingHorizontal: 20 }}>
          <Pressable
            onPress={() => sheetRef.current?.dismiss()}
            hitSlop={8}
            style={{
              position: 'absolute',
              top: 161,
              right: 20,
              width: 48,
              height: 48,
              borderRadius: 99,
              backgroundColor: '#fff',
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: '#000',
              shadowOffset: { width: 0.5, height: 1 },
              shadowOpacity: 0.4,
              shadowRadius: 1,
              elevation: 1,
            }}
          >
            <XIcon width={24} height={24} color="#000" />
          </Pressable>
        </View>
        <TopFlair />
      </View>
    ),
    [],
  )

  // backgroundComponent starts after the handle (220 avatar + 12 flair).
  const backgroundComponent = useCallback(
    // biome-ignore lint/suspicious/noExplicitAny: gorhom prop type not worth importing
    ({ style }: any) => (
      <View
        style={[style, { backgroundColor: '#fff', top: 232, borderRadius: 0 }]}
        pointerEvents="none"
      />
    ),
    [],
  )

  function onSave() {
    if (mode === 'height') {
      setHeight(draftHeight)
      setMode('form')
      return
    }
    if (mode === 'weight') {
      setWeight(draftWeight)
      setMode('form')
      return
    }
    sheetRef.current?.dismiss()
  }

  const heightIndex = Math.max(0, HEIGHTS.indexOf(draftHeight))
  const weightIndex = Math.max(0, WEIGHTS.indexOf(draftWeight))

  return (
    <FlairSheet
      ref={sheetRef}
      snapPoints={['100%']}
      topInset={0}
      // Disable content-pan-to-close while a wheel picker is on screen.
      // gorhom's content gesture handler otherwise treats vertical
      // ScrollView drags inside the sheet as a sheet drag, which fights
      // the wheel scroll and starts dismissing the sheet mid-spin. The X
      // button (and pan-down on the handle) still dismiss.
      enableContentPanningGesture={mode === 'form'}
      // When the soft keyboard dismisses, restore the sheet to its
      // pre-keyboard snap point. Without this gorhom leaves the sheet
      // in the keyboard-adjusted position, so tapping outside the
      // keyboard would shrink the sheet permanently for that present.
      keyboardBlurBehavior="restore"
      handleComponent={handleComponent}
      backgroundComponent={backgroundComponent}
    >
      <BottomSheetScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Outer wrapper has NO horizontal padding so the divider lines
            and the wheel-picker highlight band can extend to the device
            edges. Inner sections re-apply paddingHorizontal: 24. The 15px
            spacing between every divider and its neighbouring content is
            locked from Figma. extraTopPadding pushes the content down
            when the keyboard is up so Name lands above the keyboard. */}
        <View style={{ paddingTop: extraTopPadding, paddingBottom: 40 }}>
          {/* Top divider — 15px below the TopFlair's bottom edge. */}
          <View style={{ height: 1, backgroundColor: '#E5E5E5', marginTop: 15 }} />
          <View style={{ paddingHorizontal: 24, paddingTop: 15 }}>
            <Text className="font-bebas text-black" style={{ fontSize: 36, lineHeight: 40 }}>
              <Text className="font-kirang" style={{ fontSize: 44, lineHeight: 40 }}>
                U
              </Text>
              PDAT
              <Text className="font-kirang" style={{ fontSize: 44, lineHeight: 40 }}>
                E
              </Text>{' '}
              D
              <Text className="font-kirang" style={{ fontSize: 44, lineHeight: 40 }}>
                A
              </Text>
              TA
            </Text>
          </View>
          <View style={{ height: 1, backgroundColor: '#E5E5E5', marginTop: 15 }} />

          {mode === 'form' ? (
            <View style={{ paddingHorizontal: 24 }}>
              <FormBody
                name={name}
                onChangeName={setName}
                height={height}
                weight={weight}
                onPickHeight={() => setMode('height')}
                onPickWeight={() => setMode('weight')}
                nameInputBoxRef={nameInputBoxRef}
                onNameBlur={() => {
                  // Belt-and-braces: even if keyboard events don't fire,
                  // losing focus means the keyboard is going away. Reset
                  // padding AND force the sheet snap back to 100%.
                  if (!keyboardOpenRef.current) return
                  keyboardOpenRef.current = false
                  setExtraTopPadding(0)
                  sheetRef.current?.snapToIndex(0)
                }}
              />
            </View>
          ) : (
            <PickerBody
              mode={mode}
              heightIndex={heightIndex}
              weightIndex={weightIndex}
              onChangeHeight={(i) => setDraftHeight(HEIGHTS[i] ?? draftHeight)}
              onChangeWeight={(i) => setDraftWeight(WEIGHTS[i] ?? draftWeight)}
            />
          )}

          <View style={{ paddingHorizontal: 24 }}>
            <Pressable
              onPress={onSave}
              style={{
                marginTop: 32,
                height: 56,
                borderRadius: 99,
                backgroundColor: '#000',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                gap: 10,
              }}
            >
              <Image
                source={require('@/assets/check.png')}
                style={{ width: 18, height: 18, tintColor: '#fff' }}
                resizeMode="contain"
              />
              <Text
                className="font-funnel font-medium text-white"
                style={{ fontSize: 16, lineHeight: 24, letterSpacing: -0.24 }}
              >
                Save
              </Text>
            </Pressable>
          </View>
        </View>
      </BottomSheetScrollView>
    </FlairSheet>
  )
})

UpdateDataSheet.displayName = 'UpdateDataSheet'

function FormBody({
  name,
  onChangeName,
  height,
  weight,
  onPickHeight,
  onPickWeight,
  nameInputBoxRef,
  onNameBlur,
}: {
  name: string
  onChangeName: (v: string) => void
  height: number
  weight: number
  onPickHeight: () => void
  onPickWeight: () => void
  nameInputBoxRef: React.RefObject<View | null>
  onNameBlur: () => void
}) {
  return (
    <View style={{ gap: 16, marginTop: 15 }}>
      <FieldLabel>Name</FieldLabel>
      <View ref={nameInputBoxRef}>
        <BottomSheetTextInput
          value={name}
          onChangeText={onChangeName}
          onBlur={onNameBlur}
          // 75-char cap on the displayed name. The OS enforces this at
          // the platform layer so paste of a longer string is truncated
          // server-side too.
          maxLength={75}
          placeholder="Your name"
          placeholderTextColor="#9A9A9A"
          // Match the ai-balance "Other" input: brand-red caret on iOS
          // (selectionColor) and Android (cursorColor).
          selectionColor="#FF0D00"
          cursorColor="#FF0D00"
          style={{
            backgroundColor: '#F0F0F0',
            borderRadius: 4,
            paddingHorizontal: 16,
            paddingVertical: 14,
            fontSize: 16,
            color: '#000',
          }}
        />
      </View>

      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1, gap: 8 }}>
          <FieldLabel>Height</FieldLabel>
          <UnitField value={String(height)} unit="cm" onPress={onPickHeight} />
        </View>
        <View style={{ flex: 1, gap: 8 }}>
          <FieldLabel>Weight</FieldLabel>
          <UnitField value={String(weight)} unit="kg" onPress={onPickWeight} />
        </View>
      </View>
    </View>
  )
}

function PickerBody({
  mode,
  heightIndex,
  weightIndex,
  onChangeHeight,
  onChangeWeight,
}: {
  mode: 'height' | 'weight'
  heightIndex: number
  weightIndex: number
  onChangeHeight: (i: number) => void
  onChangeWeight: (i: number) => void
}) {
  const title = mode === 'height' ? 'Height (cm)' : 'Weight (kg)'
  // Wheel height = visible-count × item-height. Highlight band sits at
  // the geometric center row.
  const wheelHeight = WHEEL_ITEM_HEIGHT * WHEEL_VISIBLE_COUNT
  const bandTop = WHEEL_ITEM_HEIGHT * Math.floor(WHEEL_VISIBLE_COUNT / 2)

  return (
    <View style={{ marginTop: 15 }}>
      <Text
        className="font-funnel font-bold text-black"
        style={{
          fontSize: 16,
          lineHeight: 22,
          textAlign: 'center',
          paddingHorizontal: 24,
        }}
      >
        {title}
      </Text>
      {/* No horizontal padding here so the selection-row highlight band
          can extend to the device edges. */}
      <View style={{ height: wheelHeight, marginTop: 16, position: 'relative' }}>
        {/* Selected-row highlight band, behind the wheel. */}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: bandTop,
            left: 0,
            right: 0,
            height: WHEEL_ITEM_HEIGHT,
            backgroundColor: '#F0F0F0',
          }}
        />
        {mode === 'height' ? (
          <WheelPicker
            items={HEIGHTS}
            initialIndex={heightIndex}
            onChange={onChangeHeight}
            renderLabel={(v) => String(v)}
          />
        ) : (
          <WheelPicker
            items={WEIGHTS}
            initialIndex={weightIndex}
            onChange={onChangeWeight}
            renderLabel={(v) => String(v)}
          />
        )}
      </View>
    </View>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text
      className="font-funnel font-bold text-black"
      style={{ fontSize: 12, lineHeight: 16, letterSpacing: 0.06 }}
    >
      {children}
    </Text>
  )
}

function UnitField({ value, unit, onPress }: { value: string; unit: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        backgroundColor: '#F0F0F0',
        borderRadius: 4,
        paddingHorizontal: 16,
        paddingVertical: 14,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <Text className="font-funnel font-normal text-black" style={{ fontSize: 16, lineHeight: 22 }}>
        {value}
      </Text>
      <Text
        className="font-funnel font-normal"
        style={{ fontSize: 14, lineHeight: 18, color: '#666' }}
      >
        {unit}
      </Text>
    </Pressable>
  )
}
