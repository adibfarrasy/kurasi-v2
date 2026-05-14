import {
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetView,
} from '@gorhom/bottom-sheet'
import { useQuery } from '@tanstack/react-query'
import { BlurView } from 'expo-blur'
import { useRouter } from 'expo-router'
import { forwardRef, useImperativeHandle, useRef } from 'react'
import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { interpolate, useAnimatedProps, useAnimatedStyle } from 'react-native-reanimated'
import { LightbulbFilament, TShirtUpload, X as XIcon } from '@/components/textured-icons'
import { TopFlair } from '@/components/top-flair'
import { orpc } from '@/lib/orpc-client'

const AnimatedBlurView = Animated.createAnimatedComponent(BlurView)

const INSUFFICIENT_RED = '#FF0D00'

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

export type PlusModalHandle = {
  present: () => void
  dismiss: () => void
}

type IconKind = 'lightbulb' | 'upload'

type Action = {
  title: string
  subtitle: string
  icon: IconKind
  // Credit cost for the action. The row goes into "insufficient" state
  // when balance < cost.
  cost: number
  unit?: string
  onPress: () => void
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
      cost: 6,
      onPress: onStealTheLook,
    },
    {
      title: 'Add Clothes',
      subtitle: 'Add items into your wardrobe collection',
      icon: 'upload',
      cost: 1,
      unit: '/image',
      onPress: onAddClothes,
    },
  ]
}

function ActionRow({ action, balance }: { action: Action; balance: number }) {
  const Icon = ICON_MAP[action.icon]
  // Insufficient balance: strike through title, redden the cost, swap
  // the subtitle for an explanatory error, and disable the press.
  const insufficient = balance < action.cost
  return (
    <Pressable
      onPress={insufficient ? undefined : action.onPress}
      disabled={insufficient}
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
          <Text
            className="font-funnel font-normal text-[16px] leading-[22px] tracking-[-0.16px] text-black"
            style={insufficient ? { textDecorationLine: 'line-through', color: '#666666' } : null}
          >
            {action.title}
          </Text>
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
            <Text
              className="font-funnel font-bold text-[14px] leading-[18px]"
              style={{ color: insufficient ? INSUFFICIENT_RED : '#000' }}
            >
              {action.cost}
            </Text>
            {action.unit ? (
              <Text
                className="font-funnel font-normal text-[12px] leading-[16px] text-[#666666]"
                style={{ letterSpacing: 0.06 }}
              >
                {action.unit}
              </Text>
            ) : null}
          </View>
        </View>
        <Text
          className="font-funnel font-normal text-[12px] leading-[16px] tracking-[0.06px]"
          style={{ color: insufficient ? INSUFFICIENT_RED : '#666666' }}
        >
          {insufficient ? 'Insufficient AI balance. Purchase more to continue' : action.subtitle}
        </Text>
      </View>
      <View
        style={{
          width: 40,
          height: 40,
          alignItems: 'center',
          justifyContent: 'center',
          // 40% opacity is the disabled-icon affordance — the textured
          // PNG keeps its colours, just fades, so the icon stays
          // recognisable while reading as "not available".
          opacity: insufficient ? 0.4 : 1,
        }}
      >
        <Icon width={32} height={32} color="#000" />
      </View>
    </Pressable>
  )
}

function BalanceRow({ balance, onAdd }: { balance: number; onAdd: () => void }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'stretch',
        maxWidth: 353,
        paddingTop: 8,
        paddingBottom: 8,
        gap: 12,
      }}
    >
      <Image
        source={require('@/assets/star.png')}
        style={{
          width: 24,
          height: 24,
          shadowColor: '#000',
          shadowOffset: { width: 0.5, height: 1 },
          shadowOpacity: 0.4,
          shadowRadius: 1,
        }}
        resizeMode="contain"
      />
      <View style={{ flex: 1 }}>
        <Text className="font-funnel font-normal text-[16px] leading-[22px] tracking-[-0.16px] text-black">
          AI balance
        </Text>
        <Text
          className="font-funnel font-bold text-black"
          style={{ fontSize: 20, lineHeight: 24, letterSpacing: -0.3 }}
        >
          {balance}
        </Text>
      </View>
      <Pressable
        onPress={onAdd}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          backgroundColor: '#000',
          paddingLeft: 12,
          paddingRight: 16,
          paddingVertical: 8,
          borderRadius: 999,
        }}
      >
        <Text style={{ color: '#fff', fontSize: 18, lineHeight: 18 }}>＋</Text>
        <Text
          className="font-funnel font-normal"
          style={{ color: '#fff', fontSize: 16, lineHeight: 22, letterSpacing: -0.16 }}
        >
          Add
        </Text>
      </Pressable>
    </View>
  )
}

function Divider() {
  return <View style={{ height: 1, backgroundColor: '#E5E5E5', marginHorizontal: -20 }} />
}

export const PlusModal = forwardRef<PlusModalHandle>((_props, ref) => {
  const sheetRef = useRef<BottomSheetModal>(null)
  const router = useRouter()
  const balanceQuery = useQuery(orpc.credit.getBalance.queryOptions())
  const balance = balanceQuery.data?.balance ?? 0

  useImperativeHandle(ref, () => ({
    present: () => {
      // Refetch so the insufficient-state check reflects any recent
      // spend/grant before the sheet opens.
      balanceQuery.refetch()
      sheetRef.current?.present()
    },
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

  function onAddCredits() {
    sheetRef.current?.dismiss()
    router.push('/ai-balance')
  }

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
          {actions.flatMap((a) => [
            <Divider key={`before-${a.title}`} />,
            <ActionRow key={a.title} action={a} balance={balance} />,
          ])}
          <Divider />
          <BalanceRow balance={balance} onAdd={onAddCredits} />
          <Divider />
        </View>
      </BottomSheetView>
    </BottomSheetModal>
  )
})

PlusModal.displayName = 'PlusModal'
