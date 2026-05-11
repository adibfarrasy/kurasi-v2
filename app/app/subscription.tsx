import { Stack, useRouter } from 'expo-router'
import { useState } from 'react'
import { Image, Pressable, ScrollView, Text, View } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

type Plan = 'chrome' | 'gold'

const PLAN_FEATURES = [
  'Add **10 AI credits** / week',
  'Easily visualize clothing items combination',
  'Upload an outfit inspiration and see how it looks on you',
  'Show off your OOTD to your Instagram followers',
]

// Subscription / billing screen. Navigated to from the profile sheet's
// "Subscription Plan" row. Two plans (Chrome = current, Gold = upgrade)
// toggle via a segmented pill at the top. Plan data is hard-coded here
// pending the billing endpoint; the renewal date / cancel actions are
// stubbed.
export default function Subscription() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const [plan, setPlan] = useState<Plan>('chrome')

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ flex: 1, backgroundColor: '#E5E5E5' }}>
        {/* Header — back arrow on the left, Kurasi script logomark
            centered. Locked to a 333px column so it lines up with the
            scroll content below (same width as ai-balance.tsx). */}
        <View
          style={{
            width: 333,
            alignSelf: 'center',
            paddingTop: insets.top + 8,
            paddingBottom: 12,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            style={{ position: 'absolute', left: 0, top: insets.top + 8, padding: 8 }}
          >
            <Image
              source={require('@/assets/arrow-left.png')}
              style={{ width: 24, height: 24 }}
              resizeMode="contain"
            />
          </Pressable>
          <Image
            source={require('@/assets/logomark-dark.png')}
            style={{ width: 160, height: 40 }}
            resizeMode="contain"
          />
        </View>

        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
          showsVerticalScrollIndicator={false}
        >
          <View style={{ width: 333, alignSelf: 'center' }}>
            {/* Segmented pill toggle — inset 20px on each side from the
                333px column. The white "thumb" is an absolutely-positioned
                animated layer that slides between the two halves; the tab
                Pressables sit above it transparently. */}
            <PlanSlider plan={plan} onChange={setPlan} />

            {/* Plan card. Gold tab adds a soft yellow halo around the
                card to match the Figma — boxShadow with a warm color
                gives the glow without needing a separate gradient layer. */}
            <View
              style={{
                marginTop: 28,
                backgroundColor: '#fff',
                borderRadius: 8,
                // Clip children to the rounded border so the "Your Plan"
                // badge's red ink doesn't bleed past the card's top-right
                // corner. RN's `boxShadow` is a filter that renders
                // outside the layer regardless of overflow, so the gold
                // glow is unaffected.
                overflow: 'hidden',
                paddingHorizontal: 24,
                paddingTop: 24,
                paddingBottom: 32,
                // Gold plan uses the same 3-layer Figma stack but with a
                // metallic-gold tone (mapped from the conic gradient's
                // dominant stop) instead of black — that's how the Figma
                // "gold halo" effect is achieved.
                boxShadow:
                  plan === 'gold'
                    ? '1px 8px 15px -4px rgba(206,160,80,0.6), 0px 2px 6px -2px rgba(206,160,80,0.7), 0px 1px 3px 0px rgba(194,133,10,0.8)'
                    : '0 1px 3px 0 rgba(0,0,0,0.08)',
              }}
            >
              {/* "Your Plan" red-pen badge — only on the current plan
                  (Chrome here). Positioned absolute top-right of card. */}
              {plan === 'chrome' && (
                <Image
                  source={require('@/assets/your-plan.png')}
                  style={{ position: 'absolute', top: 0, right: 0, width: 49, height: 44 }}
                  resizeMode="contain"
                />
              )}

              <Image
                source={
                  plan === 'chrome'
                    ? require('@/assets/pro-button.png')
                    : require('@/assets/gold-button.png')
                }
                style={{ width: 56, height: 60 }}
                resizeMode="contain"
              />

              {/* Title + price container. From Figma: 8px gap between
                  title and price row, 8px horizontal padding (Spacing/S
                  each side). Width/height auto. */}
              <View style={{ paddingHorizontal: 8, gap: 8, marginTop: 16 }}>
                <Text
                  className="font-funnel font-bold text-black"
                  style={{ fontSize: 24, lineHeight: 28, letterSpacing: -0.36 }}
                >
                  {plan === 'chrome' ? 'Pro Button' : 'Gold Button'}
                </Text>

                {/* Price row — dollar amount is large; ".99" smaller; "/ week" muted. */}
                <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                  <Text
                    className="font-funnel font-bold text-black"
                    style={{ fontSize: 36, lineHeight: 40, letterSpacing: -0.54 }}
                  >
                    $1
                  </Text>
                  <Text
                    className="font-funnel font-bold text-black"
                    style={{ fontSize: 18, lineHeight: 22, letterSpacing: -0.27 }}
                  >
                    .99
                  </Text>
                  <Text
                    className="font-funnel font-normal"
                    style={{ fontSize: 16, lineHeight: 22, color: '#666', marginLeft: 6 }}
                  >
                    / week
                  </Text>
                </View>
              </View>

              {/* Feature list container. Figma spec: 11px row gap, 4px
                  (Spacing/XS) horizontal padding. */}
              <View style={{ marginTop: 40, gap: 11, paddingHorizontal: 4 }}>
                {PLAN_FEATURES.map((f) => (
                  <FeatureRow key={f} text={f} />
                ))}
              </View>
            </View>

            {/* Chrome tab: current-subscription controls (Type + renewal).
                Gold tab: skip these, the bottom CTA handles the action. */}
            {plan === 'chrome' && (
              <>
                <View
                  style={{
                    marginTop: 28,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <View>
                    <Text
                      className="font-funnel font-normal"
                      style={{ fontSize: 12, lineHeight: 16, color: '#666' }}
                    >
                      Type
                    </Text>
                    <Text
                      className="font-funnel font-normal text-black"
                      style={{ fontSize: 16, lineHeight: 22, marginTop: 2 }}
                    >
                      Weekly
                    </Text>
                  </View>
                  <OutlinePill label="Change" />
                </View>

                <View style={{ marginTop: 16 }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <View>
                      <Text
                        className="font-funnel font-normal"
                        style={{ fontSize: 12, lineHeight: 16, color: '#666' }}
                      >
                        Next Renewal Date
                      </Text>
                      <Text
                        className="font-funnel font-normal text-black"
                        style={{ fontSize: 16, lineHeight: 22, marginTop: 2 }}
                      >
                        November 17, 2026
                      </Text>
                    </View>
                    <OutlinePill label="Cancel" />
                  </View>
                  <Text
                    className="font-funnel font-normal"
                    style={{ fontSize: 14, lineHeight: 18, color: '#666', marginTop: 8 }}
                  >
                    If you cancel, you can keep using your remaining AI credits
                  </Text>
                </View>
              </>
            )}
          </View>
        </ScrollView>

        {/* Bottom CTA — only on Gold tab. */}
        {plan === 'gold' && (
          <View style={{ position: 'absolute', left: 20, right: 20, bottom: insets.bottom + 16 }}>
            <Pressable
              style={{
                height: 56,
                borderRadius: 99,
                backgroundColor: '#000',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text
                className="font-funnel font-medium text-white"
                style={{ fontSize: 16, lineHeight: 24, letterSpacing: -0.24 }}
              >
                Upgrade to Max Plan
              </Text>
            </Pressable>
          </View>
        )}
      </View>
    </>
  )
}

// Segmented Chrome/Gold pill with an animated white "thumb" that slides
// between the two halves. Thumb width = half of the slider's inner width
// (minus the 4px padding on each side). Driven by a Reanimated shared
// value so the spring/timing happens on the UI thread.
const SLIDER_WIDTH = 333 - 40 // 333 column − 20px margin each side
const SLIDER_PADDING = 4
const TAB_WIDTH = (SLIDER_WIDTH - SLIDER_PADDING * 2) / 2

function PlanSlider({ plan, onChange }: { plan: Plan; onChange: (p: Plan) => void }) {
  const offset = useSharedValue(plan === 'chrome' ? 0 : TAB_WIDTH)

  function selectChrome() {
    offset.value = withTiming(0, { duration: 220 })
    onChange('chrome')
  }
  function selectGold() {
    offset.value = withTiming(TAB_WIDTH, { duration: 220 })
    onChange('gold')
  }

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.value }],
  }))

  return (
    <View
      style={{
        marginTop: 12,
        marginHorizontal: 20,
        width: SLIDER_WIDTH,
        height: 52,
        backgroundColor: '#D9D9D9',
        borderRadius: 999,
        padding: SLIDER_PADDING,
        flexDirection: 'row',
      }}
    >
      <Animated.View
        style={[
          {
            position: 'absolute',
            top: SLIDER_PADDING,
            left: SLIDER_PADDING,
            width: TAB_WIDTH,
            height: 52 - SLIDER_PADDING * 2,
            backgroundColor: '#fff',
            borderRadius: 999,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.12,
            shadowRadius: 2,
            elevation: 2,
          },
          thumbStyle,
        ]}
      />
      <Pressable
        onPress={selectChrome}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
      >
        <Text
          className={`font-funnel ${plan === 'chrome' ? 'font-bold text-black' : 'font-normal'}`}
          style={{ fontSize: 16, lineHeight: 22, color: plan === 'chrome' ? '#000' : '#666' }}
        >
          Chrome
        </Text>
      </Pressable>
      <Pressable
        onPress={selectGold}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
      >
        <Text
          className={`font-funnel ${plan === 'gold' ? 'font-bold text-black' : 'font-normal'}`}
          style={{ fontSize: 16, lineHeight: 22, color: plan === 'gold' ? '#000' : '#666' }}
        >
          Gold
        </Text>
      </Pressable>
    </View>
  )
}

function FeatureRow({ text }: { text: string }) {
  // Inline-bold via **markers** so the source list reads cleanly. Each
  // segment between '**' flips bold. Sparkle token "✨" (an embedded
  // unicode sparkle in the source) is replaced with the star image.
  const parts = text.split('**')
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 11 }}>
      <Image
        source={require('@/assets/check.png')}
        // tintColor forces the glyph to render black regardless of the
        // asset's native channels — keeps the check visible against the
        // white card background.
        style={{ width: 20, height: 20, tintColor: '#000' }}
        resizeMode="contain"
      />
      <Text
        className="font-funnel text-black"
        style={{ flex: 1, fontSize: 14, lineHeight: 18, letterSpacing: 0 }}
      >
        {parts.map((p, i) => {
          // Inline sparkle for "10 AI credits" — render the star.png
          // sticker just before "10". Keys derive from index here because
          // the array is a stable split of a static string — order can
          // never change at runtime, so index-as-key is safe.
          if (p === '10 AI credits') {
            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: stable split
              <Text key={i}>
                <Text>
                  <Image
                    source={require('@/assets/star.png')}
                    style={{ width: 16, height: 16 }}
                    resizeMode="contain"
                  />{' '}
                </Text>
                <Text style={{ fontWeight: '700' }}>{p}</Text>
              </Text>
            )
          }
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: stable split
            <Text key={i} style={i % 2 === 1 ? { fontWeight: '700' } : undefined}>
              {p}
            </Text>
          )
        })}
      </Text>
    </View>
  )
}

function OutlinePill({ label }: { label: string }) {
  return (
    <Pressable
      style={{
        paddingHorizontal: 20,
        paddingVertical: 10,
        backgroundColor: '#fff',
        borderRadius: 999,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.12,
        shadowRadius: 2,
        elevation: 2,
      }}
    >
      <Text className="font-funnel font-normal text-black" style={{ fontSize: 16, lineHeight: 22 }}>
        {label}
      </Text>
    </Pressable>
  )
}
