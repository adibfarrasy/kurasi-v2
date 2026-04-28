import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetView,
} from '@gorhom/bottom-sheet'
import { usePathname, useRouter } from 'expo-router'
import { useAtom } from 'jotai'
import { useEffect, useRef, useState } from 'react'
import {
  Animated,
  PanResponder,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from 'react-native'
import { TouchableOpacity } from 'react-native-gesture-handler'
import { useAuth } from '@/contexts/auth-context'
import { useOnboarding } from '@/hooks/use-onboarding'
import { debugBubblePositionAtom, devSkipGatesAtom } from '@/state/onboarding'
import { mmkv } from '@/state/storage'

const BUBBLE_SIZE = 56
const EDGE_PADDING = 12

const btn = {
  row: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8 },
  primary: {
    height: 44,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.9)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  primaryText: { color: 'white', fontSize: 15, fontWeight: '500' as const },
  secondary: {
    height: 44,
    borderRadius: 999,
    backgroundColor: '#e5e7eb',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  secondaryText: { color: 'black', fontSize: 15, fontWeight: '500' as const },
  pill: {
    flex: 1,
    height: 40,
    borderRadius: 999,
    backgroundColor: '#f3f4f6',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    minWidth: 80,
  },
  refresh: {
    height: 40,
    borderRadius: 999,
    backgroundColor: '#f3f4f6',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  pillText: { color: 'black', fontSize: 13 },
}
const SNAP_POINTS = ['40%']

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max))
}

export function DevToolsOverlay() {
  const { width, height } = useWindowDimensions()
  const [bubblePosition, setBubblePosition] = useAtom(debugBubblePositionAtom)
  const [skipGates, setSkipGates] = useAtom(devSkipGatesAtom)
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

      <BottomSheetModal
        ref={bottomSheetRef}
        snapPoints={SNAP_POINTS}
        enablePanDownToClose
        backdropComponent={(props: BottomSheetBackdropProps) => (
          <BottomSheetBackdrop
            {...props}
            appearsOnIndex={0}
            disappearsOnIndex={-1}
            pressBehavior="close"
          />
        )}
      >
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
            style={skipGates ? btn.primary : btn.secondary}
            onPress={() => {
              setSkipGates(!skipGates)
              bottomSheetRef.current?.dismiss()
            }}
            activeOpacity={0.85}
          >
            <Text style={skipGates ? btn.primaryText : btn.secondaryText}>
              Dev mode: {skipGates ? 'ON' : 'OFF'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={btn.primary}
            onPress={() => {
              completeOnboarding()
              refreshStorage()
            }}
            activeOpacity={0.85}
          >
            <Text style={btn.primaryText}>Set onboarding: true</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={btn.secondary}
            onPress={() => {
              resetOnboarding()
              refreshStorage()
            }}
            activeOpacity={0.85}
          >
            <Text style={btn.secondaryText}>Set onboarding: false</Text>
          </TouchableOpacity>

          <View style={btn.row}>
            <TouchableOpacity
              style={btn.pill}
              onPress={() => {
                router.replace('/onboarding-1')
                bottomSheetRef.current?.dismiss()
              }}
              activeOpacity={0.85}
            >
              <Text style={btn.pillText}>Onboarding 1</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={btn.pill}
              onPress={() => {
                router.replace('/onboarding-2')
                bottomSheetRef.current?.dismiss()
              }}
              activeOpacity={0.85}
            >
              <Text style={btn.pillText}>Onboarding 2</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={btn.pill}
              onPress={() => {
                router.replace('/login')
                bottomSheetRef.current?.dismiss()
              }}
              activeOpacity={0.85}
            >
              <Text style={btn.pillText}>Login</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={btn.pill}
              onPress={() => {
                router.replace('/')
                bottomSheetRef.current?.dismiss()
              }}
              activeOpacity={0.85}
            >
              <Text style={btn.pillText}>Saved</Text>
            </TouchableOpacity>
          </View>

          <Text className="text-[12px] font-semibold text-gray-500 mt-2">Steal the Look</Text>
          <View style={btn.row}>
            <TouchableOpacity
              style={btn.pill}
              onPress={() => {
                router.push('/steal-the-look')
                bottomSheetRef.current?.dismiss()
              }}
              activeOpacity={0.85}
            >
              <Text style={btn.pillText}>Upload</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={btn.pill}
              onPress={() => {
                router.push('/steal-the-look/analyzing')
                bottomSheetRef.current?.dismiss()
              }}
              activeOpacity={0.85}
            >
              <Text style={btn.pillText}>Analyzing</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={btn.pill}
              onPress={() => {
                router.push('/steal-the-look/failed')
                bottomSheetRef.current?.dismiss()
              }}
              activeOpacity={0.85}
            >
              <Text style={btn.pillText}>Failed</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={btn.refresh}
            onPress={refreshStorage}
            activeOpacity={0.85}
          >
            <Text style={btn.pillText}>Refresh Storage</Text>
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
