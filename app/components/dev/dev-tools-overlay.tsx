import { BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet'
import { usePathname, useRouter } from 'expo-router'
import { useAtom } from 'jotai'
import { useEffect, useRef, useState } from 'react'
import {
  Animated,
  PanResponder,
  ScrollView,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native'
import { useAuth } from '@/contexts/auth-context'
import { useOnboarding } from '@/hooks/use-onboarding'
import { debugBubblePositionAtom } from '@/state/onboarding'
import { mmkv } from '@/state/storage'

const BUBBLE_SIZE = 56
const EDGE_PADDING = 12
const SNAP_POINTS = ['40%']

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max))
}

export function DevToolsOverlay() {
  const { width, height } = useWindowDimensions()
  const [bubblePosition, setBubblePosition] = useAtom(debugBubblePositionAtom)
  const bubblePositionRef = useRef(bubblePosition)
  const widthRef = useRef(width)
  const heightRef = useRef(height)
  const { hasOnboarded, completeOnboarding, resetOnboarding } = useOnboarding()
  const { isAuthenticated } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const bottomSheetRef = useRef<BottomSheetModal>(null)
  const openSheetRef = useRef<() => void>(() => {})
  const pan = useRef(new Animated.ValueXY(bubblePosition)).current
  const [storageRows, setStorageRows] = useState<Array<{ key: string; value: string }>>([])

  function refreshStorage() {
    const keys = mmkv.getAllKeys().sort()
    const rows = keys.map((key) => {
      const raw = mmkv.getString(key)
      if (!raw) return { key, value: '(non-string or empty)' }

      try {
        const parsed = JSON.parse(raw)
        return { key, value: JSON.stringify(parsed) }
      } catch {
        return { key, value: raw }
      }
    })
    setStorageRows(rows)
  }

  function openSheet() {
    refreshStorage()
    bottomSheetRef.current?.present()
  }

  openSheetRef.current = openSheet

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        pan.setOffset({
          x: bubblePositionRef.current.x,
          y: bubblePositionRef.current.y,
        })
        pan.setValue({ x: 0, y: 0 })
      },
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], {
        useNativeDriver: false,
      }),
      onPanResponderRelease: (_evt, gesture) => {
        pan.flattenOffset()
        const movedDistance = Math.abs(gesture.dx) + Math.abs(gesture.dy)
        if (movedDistance < 8) {
          openSheetRef.current()
          pan.setValue(bubblePositionRef.current)
          return
        }

        const nextX = clamp(
          bubblePositionRef.current.x + gesture.dx,
          EDGE_PADDING,
          Math.max(EDGE_PADDING, widthRef.current - BUBBLE_SIZE - EDGE_PADDING),
        )
        const nextY = clamp(
          bubblePositionRef.current.y + gesture.dy,
          EDGE_PADDING + 24,
          Math.max(EDGE_PADDING + 24, heightRef.current - BUBBLE_SIZE - EDGE_PADDING),
        )
        setBubblePosition({ x: nextX, y: nextY })
        pan.setValue({ x: nextX, y: nextY })
      },
    }),
  ).current

  useEffect(() => {
    widthRef.current = width
    heightRef.current = height
  }, [width, height])

  useEffect(() => {
    bubblePositionRef.current = bubblePosition
    pan.setValue(bubblePosition)
  }, [bubblePosition, pan])

  return (
    <>
      <Animated.View
        {...panResponder.panHandlers}
        className="absolute z-50"
        style={{
          transform: [{ translateX: pan.x }, { translateY: pan.y }],
        }}
      >
        <View className="size-14 rounded-full bg-black/90 items-center justify-center">
          <Text className="text-white text-[11px] font-semibold">DEBUG</Text>
        </View>
      </Animated.View>

      <BottomSheetModal ref={bottomSheetRef} snapPoints={SNAP_POINTS}>
        <BottomSheetView className="px-6 py-4 gap-3">
          <Text className="text-[18px] font-semibold text-black">Dev Tools</Text>
          <Text className="text-[14px] text-gray-700">
            Onboarding complete: {hasOnboarded ? 'true' : 'false'}
          </Text>
          <Text className="text-[14px] text-gray-700">
            Authenticated: {isAuthenticated ? 'true' : 'false'}
          </Text>
          <Text className="text-[14px] text-gray-700">Route: {pathname}</Text>

          <TouchableOpacity
            className="h-11 rounded-full bg-black/90 items-center justify-center"
            onPress={() => {
              completeOnboarding()
              refreshStorage()
            }}
            activeOpacity={0.85}
          >
            <Text className="text-white text-[15px] font-medium">Set onboarding: true</Text>
          </TouchableOpacity>

          <TouchableOpacity
            className="h-11 rounded-full bg-gray-200 items-center justify-center"
            onPress={() => {
              resetOnboarding()
              refreshStorage()
            }}
            activeOpacity={0.85}
          >
            <Text className="text-black text-[15px] font-medium">Set onboarding: false</Text>
          </TouchableOpacity>

          <View className="flex-row gap-2">
            <TouchableOpacity
              className="flex-1 h-10 rounded-full bg-gray-100 items-center justify-center"
              onPress={() => router.replace('/onboarding-1')}
              activeOpacity={0.85}
            >
              <Text className="text-[13px] text-black">Onboarding</Text>
            </TouchableOpacity>
            <TouchableOpacity
              className="flex-1 h-10 rounded-full bg-gray-100 items-center justify-center"
              onPress={() => router.replace('/login')}
              activeOpacity={0.85}
            >
              <Text className="text-[13px] text-black">Login</Text>
            </TouchableOpacity>
            <TouchableOpacity
              className="flex-1 h-10 rounded-full bg-gray-100 items-center justify-center"
              onPress={() => router.replace('/')}
              activeOpacity={0.85}
            >
              <Text className="text-[13px] text-black">Home</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            className="h-10 rounded-full bg-gray-100 items-center justify-center"
            onPress={refreshStorage}
            activeOpacity={0.85}
          >
            <Text className="text-[13px] text-black">Refresh Storage</Text>
          </TouchableOpacity>

          <View className="border border-gray-200 rounded-xl p-3">
            <Text className="text-[14px] font-semibold text-black mb-2">MMKV Storage</Text>
            <ScrollView className="max-h-36">
              {storageRows.length === 0 ? (
                <Text className="text-[12px] text-gray-500">(empty)</Text>
              ) : (
                storageRows.map((row) => (
                  <View key={row.key} className="mb-2">
                    <Text className="text-[12px] font-semibold text-black">{row.key}</Text>
                    <Text className="text-[12px] text-gray-700">{row.value}</Text>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </BottomSheetView>
      </BottomSheetModal>
    </>
  )
}
