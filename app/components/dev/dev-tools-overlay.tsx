import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
} from '@gorhom/bottom-sheet'
import { useAtom } from 'jotai'
import { useEffect, useRef, useState } from 'react'
import { Animated, PanResponder, Text, useWindowDimensions, View } from 'react-native'
import { DevToolsPanel, getDevToolsStorageSnapshot } from '@/components/dev/dev-tools-panel'
import { debugBubblePositionAtom } from '@/state/onboarding'

const SNAP_POINTS = ['40%']
const BUBBLE_SIZE = 56
const EDGE_PADDING = 12
const TAP_DISTANCE_PX = 8
/** Ignore spurious “taps” on the FAB for a short window after the sheet closes (backdrop / nav residue). */
const OPEN_SUPPRESS_MS = 350

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max))
}

type DebugFloatingButtonProps = {
  sheetOpen: boolean
  onTapOpen: () => void
  onBubbleInteractionStart: () => void
}

function DebugFloatingButton({
  sheetOpen,
  onTapOpen,
  onBubbleInteractionStart,
}: DebugFloatingButtonProps) {
  const { width, height } = useWindowDimensions()
  const [bubblePosition, setBubblePosition] = useAtom(debugBubblePositionAtom)
  const bubblePositionRef = useRef(bubblePosition)
  const widthRef = useRef(width)
  const heightRef = useRef(height)
  const pan = useRef(new Animated.ValueXY(bubblePosition)).current

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !sheetOpen,
      onMoveShouldSetPanResponder: () => !sheetOpen,
      onPanResponderGrant: () => {
        onBubbleInteractionStart()
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
        if (movedDistance < TAP_DISTANCE_PX) {
          onTapOpen()
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
    <Animated.View
      {...panResponder.panHandlers}
      className="absolute"
      pointerEvents={sheetOpen ? 'none' : 'auto'}
      style={{
        transform: [{ translateX: pan.x }, { translateY: pan.y }],
        zIndex: sheetOpen ? 0 : 50,
        elevation: sheetOpen ? 0 : 8,
      }}
    >
      <View className="size-14 rounded-full bg-black/90 items-center justify-center">
        <Text className="text-white text-[11px] font-semibold">DEBUG</Text>
      </View>
    </Animated.View>
  )
}

export function DevToolsOverlay() {
  const sheetRef = useRef<BottomSheetModal>(null)
  const suppressOpenUntilRef = useRef(0)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [storageRows, setStorageRows] = useState<Array<{ key: string; value: string }>>([])

  function refreshStorage() {
    setStorageRows(getDevToolsStorageSnapshot())
  }

  function handleSheetFullyClosed() {
    suppressOpenUntilRef.current = Date.now() + OPEN_SUPPRESS_MS
    setSheetOpen(false)
  }

  function clearOpenSuppress() {
    suppressOpenUntilRef.current = 0
  }

  function openSheet() {
    if (Date.now() < suppressOpenUntilRef.current) {
      return
    }
    refreshStorage()
    setSheetOpen(true)
    requestAnimationFrame(() => {
      sheetRef.current?.present()
    })
  }

  /** Programmatic close: native swipe/backdrop already dismiss — never call dismiss() again from an effect when `sheetOpen` flips. */
  function closeSheet() {
    sheetRef.current?.dismiss()
  }

  return (
    <>
      <DebugFloatingButton
        sheetOpen={sheetOpen}
        onTapOpen={openSheet}
        onBubbleInteractionStart={clearOpenSuppress}
      />

      <BottomSheetModal
        ref={sheetRef}
        snapPoints={SNAP_POINTS}
        enablePanDownToClose
        onChange={(index) => {
          if (index < 0) {
            handleSheetFullyClosed()
          }
        }}
        onDismiss={handleSheetFullyClosed}
        backdropComponent={(props: BottomSheetBackdropProps) => (
          <BottomSheetBackdrop
            {...props}
            appearsOnIndex={0}
            disappearsOnIndex={-1}
            pressBehavior="close"
          />
        )}
      >
        <DevToolsPanel
          onClose={closeSheet}
          storageRows={storageRows}
          onRefreshStorage={refreshStorage}
        />
      </BottomSheetModal>
    </>
  )
}
