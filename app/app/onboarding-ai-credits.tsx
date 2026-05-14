import { useRouter } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { Dimensions, Image, Pressable, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useOnboarding } from '@/hooks/use-onboarding'
import { TAB_BAR_BOTTOM_GAP } from '@/lib/layout'

const { width: SCREEN_W } = Dimensions.get('window')

// Last onboarding screen — appears after the membership-card flow.
// Shows a "welcome gift: 15 free AI credits" collage and exits to the
// main app on tap. Decorative collage assets are positioned at the four
// corners (tl/tr/bl/br) above the central credit medallion.
export default function OnboardingAiCredits() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { completeOnboarding } = useOnboarding()

  function onContinue() {
    completeOnboarding()
    router.replace('/')
  }

  return (
    <View className="flex-1 bg-[#EFEFEF]">
      <StatusBar style="dark" />

      {/* Collage region. All four corner stickers and the central
          medallion are sized at 1/3 of their source pixel dimensions
          (source exports are 3x retina), giving 1x logical display sizes
          that RN auto-renders at the correct DPR. */}
      <View style={{ height: 420, marginTop: insets.top }}>
        <Image
          source={require('@/assets/onboarding-credits-tl-coat-man.png')}
          style={{ position: 'absolute', top: 0, left: 0, width: 143, height: 185 }}
          resizeMode="contain"
        />
        <Image
          source={require('@/assets/onboarding-credits-tr-loafers.png')}
          style={{ position: 'absolute', top: 60, right: 0, width: 138, height: 109 }}
          resizeMode="contain"
        />
        <Image
          source={require('@/assets/onboarding-credits-bl-denim-jacket.png')}
          style={{ position: 'absolute', top: 200, left: 0, width: 168, height: 182 }}
          resizeMode="contain"
        />
        <Image
          source={require('@/assets/onboarding-credits-br-models-pair.png')}
          style={{ position: 'absolute', top: 180, right: 0, width: 149, height: 205 }}
          resizeMode="contain"
        />

        {/* Centered AI-credit medallion — single pre-composited asset
            (scribble ellipse + sparkle + "15" all baked in by design). */}
        <View
          style={{
            position: 'absolute',
            top: 160,
            left: 0,
            right: 0,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Image
            source={require('@/assets/onboarding-credits-center.png')}
            style={{ width: 146, height: 98 }}
            resizeMode="contain"
          />
        </View>
      </View>

      {/* Welcome-gift banner: white pill with "Welcome gift from" + the
          Kurasi script logomark. */}
      <View
        style={{
          alignSelf: 'center',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          backgroundColor: '#fff',
          paddingHorizontal: 16,
          paddingVertical: 8,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.08,
          shadowRadius: 2,
        }}
      >
        <Text
          className="font-funnel font-normal text-black text-center text-[12px] leading-[16px]"
          style={{ letterSpacing: 0.06 }}
        >
          Welcome gift from
        </Text>
        <Image
          source={require('@/assets/logomark-dark.png')}
          style={{ width: 72, height: 24 }}
          resizeMode="contain"
        />
      </View>

      {/* Headline (Bebas 48/52 + Kirang accents 58/52, all
          letter-spacing 0) + body copy (FunnelSans 14/18, ls 0).
          Specs locked from Figma. */}
      <View style={{ paddingHorizontal: 30, marginTop: 24 }}>
        <Text
          className="font-bebas text-black text-center"
          style={{ fontSize: 48, lineHeight: 52, letterSpacing: 0 }}
        >
          15 FR
          <Text className="font-kirang" style={{ fontSize: 58, lineHeight: 52, letterSpacing: 0 }}>
            E
          </Text>
          E{' '}
          <Text className="font-kirang" style={{ fontSize: 58, lineHeight: 52, letterSpacing: 0 }}>
            A
          </Text>
          I CR
          <Text className="font-kirang" style={{ fontSize: 58, lineHeight: 52, letterSpacing: 0 }}>
            E
          </Text>
          DI
          <Text className="font-kirang" style={{ fontSize: 58, lineHeight: 52, letterSpacing: 0 }}>
            T
          </Text>{' '}
          FOR YO
          <Text className="font-kirang" style={{ fontSize: 58, lineHeight: 52, letterSpacing: 0 }}>
            U
          </Text>
        </Text>
        <Text
          className="font-funnel font-normal text-black text-center text-[14px] leading-[18px]"
          style={{
            marginTop: 20,
            letterSpacing: 0,
            // Soft white halo behind the text for legibility on top of
            // the collage's busy background. From Figma:
            // box-shadow: 0px 1px 10px 0px rgba(255,255,255,1).
            textShadowColor: 'rgba(255,255,255,1)',
            textShadowOffset: { width: 0, height: 1 },
            textShadowRadius: 10,
          }}
        >
          Your AI tailor needs AI credits to create your perfect look. Here's a free gift from us to
          kickstart your style journey. Let's get you looking amazing!
        </Text>
      </View>

      <Pressable
        onPress={onContinue}
        // 40px gap above (locked from Figma spec).
        className="mx-[30px] h-[56px] rounded-full items-center justify-center"
        style={{
          backgroundColor: 'rgba(0,0,0,0.9)',
          marginTop: 40,
          marginBottom: insets.bottom + TAB_BAR_BOTTOM_GAP,
        }}
      >
        <Text className="text-white text-[16px] font-medium tracking-[-0.24px]">
          Sweet! Let's go!
        </Text>
      </Pressable>
    </View>
  )
}

// Suppress unused-warning for SCREEN_W; intentionally imported in case
// of future responsive tuning of the collage positions.
void SCREEN_W
