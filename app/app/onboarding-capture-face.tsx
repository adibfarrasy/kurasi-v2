import { Asset } from 'expo-asset'
import { CameraView, useCameraPermissions } from 'expo-camera'
import Constants from 'expo-constants'
import { useRouter } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useSetAtom } from 'jotai'
import { useRef } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Silhouette from '@/assets/silhouette.svg'
import { avatarJobSourceUriAtom } from '@/state/avatar-job'
import { capturedFaceAtom } from '@/state/face-capture'

const FRAME_INSET_X = 24
const FRAME_INSET_TOP = 20

export default function CaptureFace() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const [permission, requestPermission] = useCameraPermissions()
  const cameraRef = useRef<CameraView>(null)
  const setFace = useSetAtom(capturedFaceAtom)
  // Invalidate the previous avatar job's source pointer whenever a new
  // shot is taken. The camera / simulator's ImagePicker often returns the
  // SAME URI for a re-capture (same temp path, same library asset), so a
  // plain URI-equality check on Continue can't detect "retake." Clearing
  // the source URI here guarantees the next Continue press re-fires the
  // backend call.
  const invalidateAvatarSource = useSetAtom(avatarJobSourceUriAtom)

  if (!permission) {
    return <View className="flex-1 bg-black" />
  }

  if (!permission.granted) {
    return (
      <View
        className="flex-1 bg-black items-center justify-center px-8"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      >
        <StatusBar style="light" />
        <Text className="text-white text-center text-[16px] mb-6">
          Camera access is required to add your face.
        </Text>
        <Pressable onPress={requestPermission} className="bg-white px-6 py-3 rounded-full">
          <Text className="text-black text-[14px] font-medium">Grant access</Text>
        </Pressable>
      </View>
    )
  }

  async function loadTestFace() {
    // Bundled test photo for simulator runs. Resolved via expo-asset so the
    // require() handle becomes a real file:// URI that image-manipulator
    // can read on the next page (it can't read Metro asset URLs).
    const asset = Asset.fromModule(require('@/assets/test-face.png'))
    await asset.downloadAsync()
    const uri = asset.localUri ?? asset.uri
    invalidateAvatarSource(null)
    setFace(uri)
    router.back()
  }

  async function takeShot() {
    // The simulator's camera returns success with a fully black frame
    // rather than throwing — so we can't rely on a try/catch to detect
    // "no real camera." Branch on isDevice instead: any non-physical
    // device always loads the bundled test face, regardless of what
    // CameraView pretends to capture.
    if (!Constants.isDevice) {
      await loadTestFace()
      return
    }
    try {
      const pic = await cameraRef.current?.takePictureAsync({ quality: 0.9, skipProcessing: true })
      if (pic?.uri) {
        invalidateAvatarSource(null)
        setFace(pic.uri)
        router.back()
      }
    } catch {
      await loadTestFace()
    }
  }

  return (
    <View className="flex-1 bg-black">
      <StatusBar style="light" />

      <View
        className="flex-1"
        style={{
          marginHorizontal: FRAME_INSET_X,
          marginTop: insets.top + FRAME_INSET_TOP,
        }}
      >
        <CameraView ref={cameraRef} facing="front" style={StyleSheet.absoluteFill} />

        <Corner pos="topLeft" />
        <Corner pos="topRight" />
        <Corner pos="bottomLeft" />
        <Corner pos="bottomRight" />

        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}
        >
          <Silhouette width="78%" height="78%" />
        </View>
      </View>

      <View
        className="items-center px-6"
        style={{ paddingTop: 24, paddingBottom: insets.bottom + 24 }}
      >
        <Text className="text-white text-[18px] font-semibold text-center">
          Follow the guideline and take a picture
        </Text>
        <Text className="text-white/70 text-[14px] text-center mt-2 leading-[20px]">
          Make sure your face is clearly visible. Please remove hats and glasses.
        </Text>
        <Pressable
          onPress={takeShot}
          className="mt-6 w-[72px] h-[72px] rounded-full bg-white items-center justify-center"
          hitSlop={16}
        >
          <View className="w-[60px] h-[60px] rounded-full bg-white border-2 border-black/10" />
        </Pressable>
      </View>
    </View>
  )
}

const CORNER_SIZE = 26
const CORNER_STROKE = 3

function Corner({ pos }: { pos: 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight' }) {
  const base = {
    position: 'absolute' as const,
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    borderColor: 'white',
  }
  const variants = {
    topLeft: { top: 0, left: 0, borderTopWidth: CORNER_STROKE, borderLeftWidth: CORNER_STROKE },
    topRight: { top: 0, right: 0, borderTopWidth: CORNER_STROKE, borderRightWidth: CORNER_STROKE },
    bottomLeft: {
      bottom: 0,
      left: 0,
      borderBottomWidth: CORNER_STROKE,
      borderLeftWidth: CORNER_STROKE,
    },
    bottomRight: {
      bottom: 0,
      right: 0,
      borderBottomWidth: CORNER_STROKE,
      borderRightWidth: CORNER_STROKE,
    },
  }
  return <View style={[base, variants[pos]]} />
}
