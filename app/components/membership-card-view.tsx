import { BottomSheetTextInput } from '@gorhom/bottom-sheet'
import { LinearGradient } from 'expo-linear-gradient'
import { useAtomValue } from 'jotai'
import type { Ref } from 'react'
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { capturedFaceAtom } from '@/state/face-capture'
import { genderAtom, heightAtom, weightAtom } from '@/state/onboarding-profile'
import { signaturePathsAtom } from '@/state/signature'

type Props = {
  name: string
  onChangeName: (next: string) => void
  nameEditable: boolean
  showSignatureBox: boolean
  hasSignature: boolean
  onPressSigBox?: () => void
  sigBoxRef?: Ref<View>
  // Suppress the saved-signature SVG overlay. Set to true when the
  // SignaturePad is mounted to avoid double-rendering the strokes.
  hideSavedSignature?: boolean
  // When true, the name field is rendered via BottomSheetTextInput so
  // that gorhom's keyboardBehavior on the parent BottomSheetModal can
  // shift the sheet up on focus. The page-level zoom copy of this card
  // (which is *not* inside a sheet) must keep regular TextInput because
  // BottomSheetTextInput throws without a sheet context.
  insideBottomSheet?: boolean
}

/**
 * The visual membership card — photo + 4 right-column rows + issued-on row,
 * plus the optional dashed signature box overlay. Reads gender/height/weight
 * /face from atoms so a second instance (used for the zoom overlay) stays in
 * sync with the sheet copy without prop drilling.
 */
export function MembershipCardView({
  name,
  onChangeName,
  nameEditable,
  showSignatureBox,
  hasSignature,
  onPressSigBox,
  sigBoxRef,
  hideSavedSignature = false,
  insideBottomSheet = false,
}: Props) {
  const NameInput = insideBottomSheet ? BottomSheetTextInput : TextInput
  const gender = useAtomValue(genderAtom)
  const height = useAtomValue(heightAtom)
  const weight = useAtomValue(weightAtom)
  const faceUri = useAtomValue(capturedFaceAtom)
  const signaturePaths = useAtomValue(signaturePathsAtom)

  return (
    <View style={{ position: 'relative' }}>
      <View
        pointerEvents="none"
        style={{ position: 'absolute', top: 5, left: 5, right: -5, bottom: -5 }}
      >
        <Image
          source={require('@/assets/card-shadow.png')}
          style={{ width: '100%', height: '100%' }}
          resizeMode="stretch"
        />
      </View>
      {/* Paper-texture gradient card body. From Figma:
            linear-gradient(97.73deg, #F0F0F0 14.95%, #FFFFFF 50.01%, #F0F0F0 75.05%)
          The angle is nearly horizontal with a slight downward tilt;
          start/end coords below approximate 97.73° in expo-linear-gradient
          space (start ≈ left-of-center, end ≈ right-of-center, tilted). */}
      <LinearGradient
        colors={['#F0F0F0', '#F0F0F0', '#FFFFFF', '#F0F0F0', '#F0F0F0']}
        locations={[0, 0.1495, 0.5001, 0.7505, 1]}
        start={{ x: 0, y: 0.43 }}
        end={{ x: 1, y: 0.57 }}
        className="overflow-hidden"
        style={{
          borderRadius: 8,
          padding: 15,
          transform: [{ rotate: '-0.5deg' }],
        }}
      >
        <View className="overflow-hidden" style={{ borderWidth: 1, borderColor: '#8F8F8F' }}>
          <View className="flex-row items-stretch">
            <View className="w-[110px] bg-[#EEE] overflow-hidden">
              {faceUri ? (
                <Image
                  source={{ uri: faceUri }}
                  style={StyleSheet.absoluteFill}
                  resizeMode="cover"
                />
              ) : (
                <View style={StyleSheet.absoluteFill} className="bg-[#DDD]" />
              )}
            </View>

            <View className="flex-1">
              <View
                className="justify-center border-b border-[#8F8F8F]"
                style={{
                  paddingTop: 11,
                  paddingRight: 11,
                  paddingBottom: 11,
                  paddingLeft: 11,
                  gap: 10,
                  transform: [{ rotate: '0.5deg' }],
                }}
              >
                <NameInput
                  editable={nameEditable}
                  value={name}
                  onChangeText={(t) => onChangeName(t.replace(/\n/g, ' '))}
                  placeholder="Insert your name"
                  placeholderTextColor="#9A9A9A"
                  cursorColor="#FF0D00"
                  selectionColor="#FF0D00"
                  // biome-ignore lint/suspicious/noExplicitAny: tintColor is iOS-only and not in RN style types
                  style={
                    {
                      fontSize: 20,
                      fontWeight: '700',
                      lineHeight: 24,
                      letterSpacing: -0.3,
                      color: '#000',
                      padding: 0,
                      tintColor: '#FF0D00',
                    } as any
                  }
                />
              </View>
              <View
                className="flex-row items-center border-b border-[#8F8F8F]"
                style={{
                  paddingTop: 4,
                  paddingRight: 11,
                  paddingBottom: 4,
                  paddingLeft: 11,
                  gap: 10,
                }}
              >
                <Image
                  source={require('@/assets/logomark-dark.png')}
                  style={{ width: 50, height: 18 }}
                  resizeMode="contain"
                />
                <Text className="text-[14px] text-[#666]">model</Text>
              </View>
              <View
                className="justify-center border-b border-[#8F8F8F]"
                style={{
                  paddingTop: 4,
                  paddingRight: 11,
                  paddingBottom: 4,
                  paddingLeft: 11,
                  gap: 10,
                }}
              >
                <Text className="text-[14px] text-[#666]">{gender}</Text>
              </View>
              <View
                className="justify-center"
                style={{
                  paddingTop: 4,
                  paddingRight: 11,
                  paddingBottom: 4,
                  paddingLeft: 11,
                  gap: 10,
                }}
              >
                <Text className="text-[14px] text-[#666]">
                  {height}cm • {weight}kg
                </Text>
              </View>
            </View>
          </View>

          <View
            className="justify-center border-t border-[#8F8F8F]"
            style={{
              paddingTop: 8,
              paddingRight: 8,
              paddingBottom: 8,
              paddingLeft: 11,
              gap: 8,
            }}
          >
            <Text className="text-[12px] text-[#666]">Issued on {formatIssueDate()}</Text>
          </View>
        </View>

        {showSignatureBox && (
          <Pressable
            ref={sigBoxRef}
            onPress={onPressSigBox}
            style={{ position: 'absolute', right: 4, bottom: 4, width: 100, height: 60 }}
          >
            <Image
              source={require('@/assets/signature-box.png')}
              style={{
                position: 'absolute',
                width: 100,
                height: 60,
                opacity: hasSignature ? 0.5 : 1,
              }}
              resizeMode="contain"
            />
          </Pressable>
        )}
        {/* Saved signature strokes — rendered independently of the
            (editable) signature box so the signature still appears on
            read-only views of the card (e.g. profile sheet). */}
        {!hideSavedSignature && signaturePaths.length > 0 && (
          <Svg
            width={100}
            height={60}
            viewBox="0 0 300 180"
            style={{ position: 'absolute', right: 4, bottom: 4 }}
          >
            {signaturePaths.map((d) => (
              <Path
                key={d}
                d={d}
                stroke="#000"
                strokeWidth={3}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
          </Svg>
        )}
      </LinearGradient>
    </View>
  )
}

function formatIssueDate() {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${mm}/${dd}/${d.getFullYear()}`
}
