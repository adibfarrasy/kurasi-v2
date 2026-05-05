import { type BottomSheetModal, BottomSheetTextInput, BottomSheetView } from '@gorhom/bottom-sheet'
import { forwardRef, useImperativeHandle, useRef, useState } from 'react'
import { Keyboard, Pressable, Text, View } from 'react-native'
import { FlairSheet } from '@/components/flair-sheet'
import { BookmarkSimple } from '@/components/textured-icons'

export type SaveFitSheetInput = {
  onConfirm: (name: string) => void
}

export type SaveFitSheetHandle = {
  present: (input: SaveFitSheetInput) => void
  dismiss: () => void
}

export const SaveFitSheet = forwardRef<SaveFitSheetHandle>((_props, ref) => {
  const sheetRef = useRef<BottomSheetModal>(null)
  const [name, setName] = useState('')
  const [onConfirmFn, setOnConfirmFn] = useState<((name: string) => void) | null>(null)

  useImperativeHandle(ref, () => ({
    present: (input) => {
      setName('')
      setOnConfirmFn(() => input.onConfirm)
      sheetRef.current?.present()
    },
    dismiss: () => sheetRef.current?.dismiss(),
  }))

  return (
    <FlairSheet
      ref={sheetRef}
      enableDynamicSizing
      keyboardBehavior="interactive"
      // `restore` re-snaps the sheet open when the keyboard blurs — which
      // happens during the dismiss-after-save flow if the TextInput still
      // has focus, causing a phantom re-present. Use `none` so the
      // dismiss is final.
      keyboardBlurBehavior="none"
    >
      <BottomSheetView>
        <View style={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 15 }}>
          {/* SAVE TO MY FIT — Bebas + Kirang mix matching TRY ON / RESET THE FIT.
              T's get Kirang (taller, hand-drawn); rest are Bebas. */}
          <Text className="text-black">
            <Text className="font-bebas text-[36px] leading-[40px]">SA</Text>
            <Text className="font-kirang text-[44px] leading-[40px]">V</Text>
            <Text className="font-bebas text-[36px] leading-[40px]">E </Text>
            <Text className="font-kirang text-[44px] leading-[40px]">T</Text>
            <Text className="font-bebas text-[36px] leading-[40px]">O </Text>
            <Text className="font-kirang text-[44px] leading-[40px]">M</Text>
            <Text className="font-bebas text-[36px] leading-[40px]">Y </Text>
            <Text className="font-kirang text-[44px] leading-[40px]">F</Text>
            <Text className="font-bebas text-[36px] leading-[40px]">IT</Text>
          </Text>
        </View>

        <View style={{ height: 1, backgroundColor: '#E5E5E5' }} />

        <View style={{ paddingHorizontal: 20, paddingVertical: 15 }}>
          <BottomSheetTextInput
            value={name}
            onChangeText={setName}
            placeholder="Name the fit"
            placeholderTextColor="#999999"
            style={{
              height: 56,
              borderRadius: 8,
              backgroundColor: '#F2F2F2',
              paddingHorizontal: 16,
              fontFamily: 'Funnel',
              fontSize: 16,
              lineHeight: 22,
              color: '#000',
            }}
          />
        </View>

        <View style={{ height: 1, backgroundColor: '#E5E5E5' }} />

        <View style={{ paddingHorizontal: 20, paddingTop: 15, paddingBottom: 50 }}>
          <Pressable
            onPress={() => {
              // Hand off to the parent — it owns the mutation and will
              // dismiss this sheet via the ref on success. Dismissing
              // synchronously here while the keyboard is still focused
              // races with gorhom's keyboard handling and can leave the
              // sheet half-presented (snapping back open after blur).
              Keyboard.dismiss()
              const trimmed = name.trim()
              onConfirmFn?.(trimmed)
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
            <BookmarkSimple width={20} height={20} color="#fff" />
            <Text className="font-funnel font-medium text-[16px] leading-[24px] tracking-[-0.24px] text-white">
              Save to My Fit
            </Text>
          </Pressable>
        </View>
      </BottomSheetView>
    </FlairSheet>
  )
})

SaveFitSheet.displayName = 'SaveFitSheet'
