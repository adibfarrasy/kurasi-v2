import {
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetView,
} from '@gorhom/bottom-sheet'
import { BlurView } from 'expo-blur'
import { useRouter } from 'expo-router'
import { forwardRef, useImperativeHandle, useRef } from 'react'
import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { interpolate, useAnimatedProps, useAnimatedStyle } from 'react-native-reanimated'
import { LightbulbFilament, TShirtUpload, X as XIcon } from '@/components/textured-icons'
import { TopFlair } from '@/components/top-flair'

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
    <Animated.View style={[style, StyleSheet.absoluteFillObject, tintStyle]}>
      <Pressable style={StyleSheet.absoluteFillObject} onPress={onPress}>
        <AnimatedBlurView
          tint="light"
          animatedProps={blurProps}
          style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(255,255,255,0.1)' }]}
        />
      </Pressable>
    </Animated.View>
  )
}

export type PlusModalHandle = {
  present: () => void
  dismiss: () => void
}

type IconKind = 'lightbulb' | 'upload'

type Action = {
  title: string
  subtitle: string
  icon: IconKind
  withStar?: boolean
  count?: number
  unit?: string
  onPress?: () => void
}

const ICON_MAP: Record<
  IconKind,
  React.ComponentType<{ width: number; height: number; color: string }>
> = {
  lightbulb: LightbulbFilament,
  upload: TShirtUpload,
}

function buildActions(onStealTheLook: () => void, onAddClothes: () => void): Action[] {
  return [
    {
      title: 'Steal the Look',
      subtitle: 'Upload an inspiration, and the AI will analyze it for you',
      icon: 'lightbulb',
      withStar: true,
      count: 6,
      onPress: onStealTheLook,
    },
    {
      title: 'Add Clothes',
      subtitle: 'Add items into your wardrobe collection',
      icon: 'upload',
      withStar: true,
      count: 1,
      unit: '/image',
      onPress: onAddClothes,
    },
  ]
}

function ActionRow({ action }: { action: Action }) {
  const Icon = ICON_MAP[action.icon]
  return (
    <Pressable
      onPress={action.onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'stretch',
        maxWidth: 353,
        paddingTop: 8,
        paddingBottom: 8,
        gap: 24,
        borderRadius: 15,
      }}
    >
      <View style={{ flex: 1, gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text className="font-funnel font-normal text-[16px] leading-[22px] tracking-[-0.16px] text-black">
            {action.title}
          </Text>
          {action.withStar ? (
            <View
              style={{
                flexDirection: 'row',
                height: 18,
                gap: 4,
                alignItems: 'center',
              }}
            >
              <Image
                source={require('@/assets/star.png')}
                style={{
                  width: 14,
                  height: 14,
                  shadowColor: '#000',
                  shadowOffset: { width: 0.33, height: 0.44 },
                  shadowOpacity: 0.66,
                  shadowRadius: 0,
                }}
                resizeMode="contain"
              />
              {action.count !== undefined ? (
                <Text className="font-funnel font-bold text-[14px] leading-[18px] text-black">
                  {action.count}
                </Text>
              ) : null}
              {action.unit ? (
                <Text
                  className="font-funnel font-normal text-[12px] leading-[16px] text-[#666666]"
                  style={{ letterSpacing: 0.06 }}
                >
                  {action.unit}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
        <Text className="font-funnel font-normal text-[12px] leading-[16px] tracking-[0.06px] text-[#666666]">
          {action.subtitle}
        </Text>
      </View>
      <View style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
        <Icon width={32} height={32} color="#000" />
      </View>
    </Pressable>
  )
}

function Divider() {
  return <View style={{ height: 1, backgroundColor: '#E5E5E5', marginHorizontal: -20 }} />
}

export const PlusModal = forwardRef<PlusModalHandle>((_props, ref) => {
  const sheetRef = useRef<BottomSheetModal>(null)
  const router = useRouter()

  useImperativeHandle(ref, () => ({
    present: () => sheetRef.current?.present(),
    dismiss: () => sheetRef.current?.dismiss(),
  }))

  const actions = buildActions(
    () => {
      sheetRef.current?.dismiss()
      router.push('/steal-the-look')
    },
    () => {
      sheetRef.current?.dismiss()
      router.push('/upload-wardrobe-guide')
    },
  )

  return (
    <BottomSheetModal
      ref={sheetRef}
      enableDynamicSizing
      enablePanDownToClose
      // Transparent sheet bg + a backgroundComponent whose `top` offset
      // matches the FULL handle height (X close button row + TopFlair).
      // That keeps the entire handle stack — including the torn-paper
      // flair — rendered over the blurred backdrop instead of over a
      // white card, so the flair reads transparent. AddItemSheet uses
      // the same pattern with a smaller (12px) offset since its handle
      // is only the flair.
      backgroundStyle={{ backgroundColor: 'transparent', borderRadius: 0 }}
      backgroundComponent={({ style }) => (
        <View
          style={[style, { backgroundColor: '#fff', top: 72, borderRadius: 0 }]}
          pointerEvents="none"
        />
      )}
      handleComponent={() => (
        <View>
          <View
            style={{
              height: 60,
              alignItems: 'flex-end',
              justifyContent: 'flex-start',
              paddingHorizontal: 20,
            }}
          >
            <Pressable
              onPress={() => sheetRef.current?.dismiss()}
              hitSlop={8}
              style={{
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
      )}
      backdropComponent={(props) => (
        <BlurBackdrop {...props} onPress={() => sheetRef.current?.dismiss()} />
      )}
    >
      <BottomSheetView>
        <View
          style={{
            paddingTop: 11,
            paddingRight: 20,
            paddingBottom: 50,
            paddingLeft: 20,
            gap: 11,
          }}
        >
          {actions.flatMap((a, i) => [
            <Divider key={`d${i}`} />,
            <ActionRow key={a.title} action={a} />,
          ])}
          <Divider />
        </View>
      </BottomSheetView>
    </BottomSheetModal>
  )
})

PlusModal.displayName = 'PlusModal'
