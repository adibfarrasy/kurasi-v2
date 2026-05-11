import { useRouter } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useAtom, useSetAtom } from 'jotai'
import { useState } from 'react'
import { Image, Pressable, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { TopFlair } from '@/components/top-flair'
import { WHEEL_ITEM_HEIGHT, WHEEL_VISIBLE_COUNT, WheelPicker } from '@/components/wheel-picker'
import { TAB_BAR_BOTTOM_GAP } from '@/lib/layout'
import { startAvatarJob } from '@/lib/start-avatar-job'
import {
  avatarJobErrorAtom,
  avatarJobPhaseAtom,
  avatarJobResultUrlAtom,
  avatarJobSessionIdAtom,
  avatarJobSourceUriAtom,
} from '@/state/avatar-job'
import { capturedFaceAtom } from '@/state/face-capture'
import { genderAtom, heightAtom, weightAtom } from '@/state/onboarding-profile'

const GENDERS = ['Male', 'Female'] as const
const HEIGHTS = Array.from({ length: 220 - 140 + 1 }, (_, i) => 140 + i)
const WEIGHTS = Array.from({ length: 150 - 40 + 1 }, (_, i) => 40 + i)

export default function Onboarding3() {
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const [gender, setGender] = useAtom(genderAtom)
  const [height, setHeight] = useAtom(heightAtom)
  const [weight, setWeight] = useAtom(weightAtom)
  const [faceUri, setFaceUri] = useAtom(capturedFaceAtom)
  const setAvatarSessionId = useSetAtom(avatarJobSessionIdAtom)
  const setAvatarPhase = useSetAtom(avatarJobPhaseAtom)
  const setAvatarResultUrl = useSetAtom(avatarJobResultUrlAtom)
  const setAvatarError = useSetAtom(avatarJobErrorAtom)
  const [avatarSourceUri, setAvatarSourceUri] = useAtom(avatarJobSourceUriAtom)
  const [pillWidth, setPillWidth] = useState(0)
  const [continueBusy, setContinueBusy] = useState(false)

  const genderIndex = Math.max(0, GENDERS.indexOf(gender))
  const heightIndex = Math.max(0, HEIGHTS.indexOf(height))
  const weightIndex = Math.max(0, WEIGHTS.indexOf(weight))

  async function onContinue() {
    if (continueBusy) return
    // No face uploaded — skip the backend call entirely; the membership-card
    // page will keep showing the static mannequin.
    if (!faceUri) {
      router.push('/onboarding-membership-card')
      return
    }
    // Same photo as the in-flight (or completed) job → don't restart, just
    // navigate. Lets back-and-forth without a retake reuse the existing
    // session.
    if (faceUri === avatarSourceUri) {
      router.push('/onboarding-membership-card')
      return
    }
    // New photo (or first run) → discard any prior job and kick off a fresh
    // one. We `await` start() so the sessionId is in the atom by the time
    // the membership-card page mounts and starts polling.
    setContinueBusy(true)
    setAvatarSessionId(null)
    setAvatarPhase(null)
    setAvatarResultUrl(null)
    setAvatarError(null)
    try {
      const { sessionId } = await startAvatarJob({
        faceUri,
        gender,
        heightCm: height,
        weightKg: weight,
      })
      setAvatarSessionId(sessionId)
      setAvatarPhase('classify')
      setAvatarSourceUri(faceUri)
      router.push('/onboarding-membership-card')
    } catch (err) {
      console.warn('[onboarding-3] normalizeAvatar.start failed:', err)
      setAvatarError('Could not start avatar generation. The card will show your photo.')
      // Still proceed — the loading state on the membership-card page will
      // fall back to the static mannequin when no sessionId is present.
      router.push('/onboarding-membership-card')
    } finally {
      setContinueBusy(false)
    }
  }

  return (
    <View className="flex-1 bg-[#EFEFEF]">
      <StatusBar style="dark" />

      <View className="flex-1 pb-4 items-center" style={{ paddingTop: insets.top + 30 }}>
        <Image
          source={require('@/assets/mannequin.png')}
          style={{ flex: 1, width: '100%', height: undefined }}
          resizeMode="contain"
        />
      </View>

      <View
        className="absolute items-center"
        style={{ top: insets.top + 30, left: 0, right: 0, height: 60, zIndex: 10 }}
        pointerEvents="box-none"
      >
        <Pressable
          className="flex-row items-center bg-white rounded-full shadow-sm"
          style={{
            paddingVertical: 8,
            paddingLeft: faceUri ? 16 : 4,
            paddingRight: faceUri ? 16 : 12,
            gap: faceUri ? 0 : 8,
          }}
          onLayout={(e) => setPillWidth(e.nativeEvent.layout.width)}
          onPress={() => router.push('/onboarding-capture-face')}
        >
          {!faceUri && (
            <Image
              source={require('@/assets/smiley-face.png')}
              className="w-[18px] h-[18px]"
              resizeMode="contain"
            />
          )}
          <Text
            style={{
              fontSize: 14,
              fontWeight: '400',
              lineHeight: 18,
              letterSpacing: 0,
              color: '#000',
            }}
          >
            {faceUri ? 'Change' : 'Add Face'}
          </Text>
        </Pressable>

        {faceUri && pillWidth > 0 && (
          <Pressable
            onLongPress={__DEV__ ? () => setFaceUri(null) : undefined}
            style={{
              position: 'absolute',
              top: -7,
              right: '50%',
              marginRight: pillWidth / 2 + 5,
            }}
          >
            <Image
              source={{ uri: faceUri }}
              style={{
                width: 48,
                height: 48,
                borderRadius: 2,
                borderWidth: 2,
                borderColor: '#fff',
                shadowColor: '#000',
                shadowOffset: { width: 0.5, height: 1 },
                shadowOpacity: 0.4,
                shadowRadius: 1,
              }}
            />
          </Pressable>
        )}
      </View>

      <View className="bg-white">
        <View
          className="absolute left-0 right-0"
          style={{ top: -12, backgroundColor: 'transparent' }}
          pointerEvents="none"
        >
          <TopFlair />
        </View>

        <Text className="text-[16px] tracking-[-0.16px] text-[#666] text-center mt-5 mb-10">
          Design an avatar that looks just like you.
        </Text>

        <View className="px-6">
          <View className="flex-row">
            <Text className="flex-1 text-[16px] font-bold text-black text-center">Gender</Text>
            <Text className="flex-1 text-[16px] font-bold text-black text-center">Height (cm)</Text>
            <Text className="flex-1 text-[16px] font-bold text-black text-center">Weight (kg)</Text>
          </View>

          <View
            className="relative mt-2"
            style={{ height: WHEEL_ITEM_HEIGHT * WHEEL_VISIBLE_COUNT }}
          >
            <View
              pointerEvents="none"
              className="absolute bg-[#F5F5F5]"
              style={{
                top: WHEEL_ITEM_HEIGHT * Math.floor(WHEEL_VISIBLE_COUNT / 2),
                height: WHEEL_ITEM_HEIGHT,
                left: -24,
                right: -24,
              }}
            />

            <View className="flex-row">
              <WheelPicker
                items={[...GENDERS]}
                initialIndex={genderIndex}
                onChange={(i) => setGender(GENDERS[i])}
                renderLabel={(v) => v}
              />
              <WheelPicker
                items={HEIGHTS}
                initialIndex={heightIndex}
                onChange={(i) => setHeight(HEIGHTS[i])}
                renderLabel={(v) => String(v)}
              />
              <WheelPicker
                items={WEIGHTS}
                initialIndex={weightIndex}
                onChange={(i) => setWeight(WEIGHTS[i])}
                renderLabel={(v) => String(v)}
              />
            </View>
          </View>
        </View>

        <Pressable
          className="mx-[30px] mt-10 h-[56px] rounded-full items-center justify-center"
          style={{
            backgroundColor: continueBusy ? '#9A9A9A' : 'rgba(0,0,0,0.9)',
            marginBottom: insets.bottom + TAB_BAR_BOTTOM_GAP,
          }}
          disabled={continueBusy}
          onPress={onContinue}
        >
          <Text className="text-white text-[16px] font-medium tracking-[-0.24px]">Continue</Text>
        </Pressable>
      </View>
    </View>
  )
}
