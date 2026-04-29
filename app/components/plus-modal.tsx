import {
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetView,
} from '@gorhom/bottom-sheet'
import { BlurView } from 'expo-blur'
import { useRouter } from 'expo-router'
import { forwardRef, useImperativeHandle, useRef } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { interpolate, useAnimatedProps, useAnimatedStyle } from 'react-native-reanimated'

const AnimatedBlurView = Animated.createAnimatedComponent(BlurView)

function BlurBackdrop({
  style,
  animatedIndex,
  onPress,
}: BottomSheetBackdropProps & { onPress?: () => void }) {
  // Fade the backdrop as the sheet slides from 0 (open) to -1 (closed).
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

import LightbulbFilament from '@/assets/icons/LightbulbFilament.svg'
import NewFit from '@/assets/icons/NewFit.svg'
import TShirt from '@/assets/icons/TShirt.svg'
import TShirtUpload from '@/assets/icons/TShirtUpload.svg'
import XIcon from '@/assets/icons/X.svg'

export type PlusModalHandle = {
  present: () => void
  dismiss: () => void
}

type IconKind = 'lightbulb' | 'newfit' | 'upload' | 'tshirt'

type Action = {
  title: string
  subtitle: string
  icon: IconKind
  onPress?: () => void
}

function buildActions(onStealTheLook: () => void): Action[] {
  return [
    {
      title: 'Steal the Look',
      subtitle: 'Upload an inspiration, and the AI will analyze it for you',
      icon: 'lightbulb',
      onPress: onStealTheLook,
    },
    {
      title: 'Try New Fit',
      subtitle: 'Found something you like in the store? Try it on virtually with our AI',
      icon: 'newfit',
    },
    {
      title: 'Upload Wardrobe',
      subtitle: 'Add items into your wardrobe collection',
      icon: 'upload',
    },
    {
      title: 'Describe a clothing',
      subtitle: 'Our AI will create it for you',
      icon: 'tshirt',
    },
  ]
}

const ICON_MAP: Record<
  IconKind,
  React.ComponentType<{ width: number; height: number; color: string }>
> = {
  lightbulb: LightbulbFilament,
  newfit: NewFit,
  upload: TShirtUpload,
  tshirt: TShirt,
}

function ActionRow({ action }: { action: Action }) {
  return (
    <Pressable
      onPress={action.onPress}
      style={{
        maxWidth: 353,
        width: '100%',
        alignSelf: 'center',
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff',
        borderRadius: 15,
        paddingTop: 16,
        paddingRight: 24,
        paddingBottom: 16,
        paddingLeft: 24,
        gap: 24,
      }}
    >
      <View style={{ width: 241, height: 56, gap: 2, justifyContent: 'center' }}>
        <Text
          style={{
            fontFamily: 'FunnelSans_400Regular',
            fontSize: 16,
            lineHeight: 22,
            letterSpacing: -0.16,
            color: '#000',
          }}
        >
          {action.title}
        </Text>
        <Text
          style={{
            fontFamily: 'Inter',
            fontSize: 12,
            lineHeight: 16,
            letterSpacing: 0.06,
            color: '#6b7280',
          }}
        >
          {action.subtitle}
        </Text>
      </View>
      <View style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
        {(() => {
          const Icon = ICON_MAP[action.icon]
          return <Icon width={40} height={40} color="#000" />
        })()}
      </View>
    </Pressable>
  )
}

export const PlusModal = forwardRef<PlusModalHandle>((_props, ref) => {
  const sheetRef = useRef<BottomSheetModal>(null)
  const router = useRouter()

  useImperativeHandle(ref, () => ({
    present: () => sheetRef.current?.present(),
    dismiss: () => sheetRef.current?.dismiss(),
  }))

  const actions = buildActions(() => {
    sheetRef.current?.dismiss()
    router.push('/steal-the-look')
  })

  return (
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={['100%']}
      enablePanDownToClose
      handleComponent={null}
      backgroundStyle={{ backgroundColor: 'transparent' }}
      backdropComponent={(props) => (
        <BlurBackdrop {...props} onPress={() => sheetRef.current?.dismiss()} />
      )}
    >
      <BottomSheetView
        style={{
          flex: 1,
          padding: 16,
          gap: 10,
          justifyContent: 'flex-end',
          paddingBottom: 52,
        }}
      >
        {actions.map((a) => (
          <ActionRow key={a.title} action={a} />
        ))}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 12,
            marginTop: 4,
          }}
        >
          <Text
            style={{
              fontFamily: 'FunnelSans_400Regular',
              fontSize: 20,
              lineHeight: 24,
              letterSpacing: -0.3,
              color: '#000',
            }}
          >
            Close
          </Text>
          <Pressable
            onPress={() => sheetRef.current?.dismiss()}
            style={{
              width: 64,
              height: 48,
              borderRadius: 99,
              backgroundColor: '#000',
              borderWidth: 2,
              borderColor: 'rgba(255,255,255,0.25)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <XIcon width={24} height={24} color="#fff" />
          </Pressable>
        </View>
      </BottomSheetView>
    </BottomSheetModal>
  )
})
