import * as ImagePicker from 'expo-image-picker'
import { Stack, useRouter } from 'expo-router'
import {
  ActionSheetIOS,
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { CheckCircle, XCircle } from '@/components/textured-icons'
import { TopFlair } from '@/components/top-flair'

function StatusBadge({ kind }: { kind: 'do' | 'dont' }) {
  const Icon = kind === 'do' ? CheckCircle : XCircle
  return <Icon width={20} height={20} />
}

function GuideCard({
  kind,
  title,
  body,
  caption,
}: {
  kind: 'do' | 'dont'
  title: string
  body: string
  caption: string
}) {
  return (
    <View>
      {/* DO card has the torn-paper top edge + white bg. DON'T card sits on
          the page bg with no flair. */}
      {kind === 'do' ? <TopFlair /> : null}
      <View
        style={{
          backgroundColor: kind === 'do' ? '#fff' : 'transparent',
          borderRadius: 4,
          flexDirection: 'row',
          gap: 8,
          paddingTop: 4,
          paddingRight: 16,
          paddingBottom: 4,
          paddingLeft: 4,
        }}
      >
        <View
          style={{
            width: 107,
            height: 160,
            borderRadius: 1,
            backgroundColor: '#e5e5e5',
            overflow: 'hidden',
          }}
        >
          <Image
            source={
              kind === 'do'
                ? require('@/assets/stealthelook-do.png')
                : require('@/assets/stealthelook-dont.png')
            }
            style={{ width: '100%', height: '100%' }}
            resizeMode="cover"
          />
        </View>
        <View
          style={{
            flex: 1,
            justifyContent: 'space-between',
            paddingLeft: 8,
            paddingRight: 8,
            paddingBottom: 4,
          }}
        >
          {/* Top spacer — keeps the title+body group around the vertical
              middle (with caption pinned to the bottom via space-between). */}
          <View />
          <View style={{ gap: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <StatusBadge kind={kind} />
              <Text
                className={`font-funnel text-[16px] leading-[22px] tracking-[-0.16px] ${
                  kind === 'do' ? 'font-bold text-[#089511]' : 'font-normal text-[#E90000]'
                }`}
              >
                {title}
              </Text>
            </View>
            <Text className="font-funnel font-normal text-[16px] leading-[22px] tracking-[-0.16px] text-black">
              {body}
            </Text>
          </View>
          <Text className="font-funnel font-normal text-[12px] leading-[16px] tracking-[0.06px] text-[#666666]">
            {caption}
          </Text>
        </View>
      </View>
    </View>
  )
}

export default function StealTheLookIntro() {
  const insets = useSafeAreaInsets()
  const router = useRouter()

  async function pickFromLibrary() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) {
      Alert.alert(
        'Permission needed',
        'Please allow photo library access to upload an inspiration.',
      )
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.9,
    })
    if (!result.canceled && result.assets[0]) {
      router.push({
        pathname: '/steal-the-look/analyzing',
        params: { uri: result.assets[0].uri },
      })
    }
  }

  async function takePhoto() {
    const perm = await ImagePicker.requestCameraPermissionsAsync()
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Please allow camera access to capture an inspiration.')
      return
    }
    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.9,
      })
      if (!result.canceled && result.assets[0]) {
        router.push({
          pathname: '/steal-the-look/analyzing',
          params: { uri: result.assets[0].uri },
        })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not open the camera.'
      Alert.alert('Camera unavailable', message)
    }
  }

  function onUploadPress() {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancel', 'Take Photo', 'Choose from Library'],
          cancelButtonIndex: 0,
        },
        (idx) => {
          if (idx === 1) takePhoto()
          else if (idx === 2) pickFromLibrary()
        },
      )
    } else {
      Alert.alert('Upload a picture', undefined, [
        { text: 'Take Photo', onPress: takePhoto },
        { text: 'Choose from Library', onPress: pickFromLibrary },
        { text: 'Cancel', style: 'cancel' },
      ])
    }
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ flex: 1, backgroundColor: '#e5e5e5' }}>
        <ScrollView
          contentContainerStyle={{
            paddingTop: insets.top + 24,
            paddingHorizontal: 20,
            paddingBottom: 140,
          }}
        >
          <Text className="font-bebas text-[36px] leading-[40px] tracking-[0.5px] text-black">
            STE<Text className="font-kirang text-[44px] leading-[44px]">A</Text>L T
            <Text className="font-kirang text-[44px] leading-[44px]">H</Text>E{' '}
            <Text className="font-kirang text-[44px] leading-[44px]">L</Text>OOK
          </Text>
          <Text className="mt-1 font-funnel font-normal text-[16px] leading-[22px] tracking-[-0.16px] text-black">
            Upload an outfit inspiration
          </Text>

          <View style={{ marginTop: 32, gap: 17 }}>
            <GuideCard
              kind="do"
              title="DO"
              body={'Have 1 (one) person in\nthe frame.'}
              caption="Even if the background is busy, we can analyze it without problem."
            />
            <GuideCard
              kind="dont"
              title="DON'T"
              body={'Have multiple people\nin the frame.'}
              caption="Which one do you even want?"
            />
          </View>
        </ScrollView>

        <View
          style={{
            position: 'absolute',
            left: 20,
            right: 20,
            bottom: insets.bottom + 16,
          }}
        >
          <Pressable
            onPress={onUploadPress}
            style={{
              height: 56,
              borderRadius: 99,
              backgroundColor: '#000',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              gap: 10,
            }}
          >
            <Image
              source={require('@/assets/picture.png')}
              style={{ width: 24, height: 20, tintColor: '#fff' }}
              resizeMode="contain"
            />
            <Text className="font-funnel font-medium text-[16px] leading-[24px] tracking-[-0.24px] text-white">
              Upload a picture
            </Text>
          </Pressable>
        </View>
      </View>
    </>
  )
}
