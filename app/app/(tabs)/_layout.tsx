import { LinearGradient } from 'expo-linear-gradient'
import { Redirect, Tabs } from 'expo-router'
import { useRef, useState } from 'react'
import { Image, Pressable, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { PlusModal, type PlusModalHandle } from '@/components/plus-modal'
import { BookmarkSimple, Dresser, Sparkle } from '@/components/textured-icons'
import { useAuth } from '@/contexts/auth-context'
import { TAB_BAR_BOTTOM_GAP, TAB_BAR_ITEM_BAND, TAB_BAR_PADDING_TOP } from '@/lib/layout'

const ICON_SIZE = 26
const ACTIVE = '#FF0D00'
const INACTIVE_ICON = '#666666'
const INACTIVE_TEXT = '#8F8F8F'

type IconKind = 'sparkle' | 'bookmark' | 'dresser'

function TabBarIcon({ source, color }: { source: IconKind; color: string }) {
  const props = { width: ICON_SIZE, height: ICON_SIZE, color, fill: color }
  if (source === 'sparkle') return <Sparkle {...props} />
  if (source === 'bookmark') return <BookmarkSimple {...props} />
  return <Dresser {...props} />
}

function TabLabel({ label, focused }: { label: string; focused: boolean }) {
  const [textWidth, setTextWidth] = useState(0)
  return (
    <View style={{ alignItems: 'center' }}>
      <Text
        numberOfLines={1}
        onLayout={(e) => setTextWidth(e.nativeEvent.layout.width)}
        className="font-funnel font-bold text-center text-[9px] leading-[12px] tracking-[0.18px]"
        style={{ color: focused ? ACTIVE : INACTIVE_TEXT, marginTop: 4 }}
      >
        {label}
      </Text>
      {focused && textWidth > 0 ? (
        <Image
          source={require('@/assets/underline.png')}
          style={{ width: textWidth, height: 4, marginTop: 2 }}
          resizeMode="stretch"
        />
      ) : null}
    </View>
  )
}

function PlusTabButton({ onPress }: { onPress?: () => void }) {
  const SIZE = 56
  return (
    // Tab bar has paddingTop: TAB_BAR_PADDING_TOP (11), and the spec
    // wants the plus button 4px down from the bar's top edge — so we
    // pull this cell up by (11 - 4) = 7px.
    <View style={{ alignItems: 'center', justifyContent: 'flex-start', marginTop: -7 }}>
      <View
        style={{
          width: SIZE,
          height: SIZE,
          borderRadius: SIZE / 2,
          shadowColor: '#000',
          shadowOffset: { width: 0.5, height: 1 },
          shadowOpacity: 0.4,
          shadowRadius: 1,
          elevation: 1,
        }}
      >
        {/* 1px gradient "border" via wrapping LinearGradient ring. */}
        <LinearGradient
          colors={['rgba(255,255,255,0.5)', 'rgba(255,255,255,0.1)', 'rgba(255,255,255,0.25)']}
          locations={[0, 0.5, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={{
            width: SIZE,
            height: SIZE,
            borderRadius: SIZE / 2,
            padding: 1,
          }}
        >
          <Pressable
            onPress={onPress}
            hitSlop={8}
            style={{
              flex: 1,
              borderRadius: SIZE / 2 - 1,
              overflow: 'hidden',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Image
              source={require('@/assets/plus-button.png')}
              style={{ width: SIZE - 2, height: SIZE - 2 }}
              resizeMode="contain"
            />
          </Pressable>
        </LinearGradient>
      </View>
    </View>
  )
}

export default function TabsLayout() {
  const { isAuthenticated, isInitialLoading } = useAuth()
  const plusRef = useRef<PlusModalHandle>(null)
  const insets = useSafeAreaInsets()

  if (isInitialLoading) return null
  if (!isAuthenticated) return <Redirect href="/login" />

  // Tab-bar geometry derived from the device's bottom inset so the visible
  // 16pt gap above the home indicator (or screen edge on devices without
  // one) is preserved regardless of safe-area size.
  const tabBarPaddingBottom = insets.bottom + TAB_BAR_BOTTOM_GAP
  const tabBarHeight = TAB_BAR_PADDING_TOP + TAB_BAR_ITEM_BAND + tabBarPaddingBottom

  return (
    <>
      <Tabs
        initialRouteName="index"
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: 'transparent',
            position: 'absolute',
            elevation: 0,
            height: tabBarHeight,
            paddingTop: TAB_BAR_PADDING_TOP,
            paddingBottom: tabBarPaddingBottom,
            paddingLeft: 20,
            paddingRight: 20,
            gap: 24,
            borderTopWidth: 0,
          },
          tabBarItemStyle: { height: 42 },
        }}
      >
        <Tabs.Screen
          name="tryon"
          options={{
            title: 'Try On',
            tabBarIcon: ({ focused }) => (
              <TabBarIcon source="sparkle" color={focused ? ACTIVE : INACTIVE_ICON} />
            ),
            tabBarLabel: ({ focused }) => <TabLabel label="Try On" focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="index"
          options={{
            title: 'My Fit',
            tabBarIcon: ({ focused }) => (
              <TabBarIcon source="bookmark" color={focused ? ACTIVE : INACTIVE_ICON} />
            ),
            tabBarLabel: ({ focused }) => <TabLabel label="My Fit" focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="wardrobe"
          options={{
            title: 'Wardrobe',
            tabBarIcon: ({ focused }) => (
              <TabBarIcon source="dresser" color={focused ? ACTIVE : INACTIVE_ICON} />
            ),
            tabBarLabel: ({ focused }) => <TabLabel label="Wardrobe" focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="plus"
          options={{
            title: '',
            tabBarLabel: () => null,
            tabBarIcon: () => null,
            tabBarButton: () => <PlusTabButton onPress={() => plusRef.current?.present()} />,
          }}
          listeners={{
            tabPress: (e) => {
              e.preventDefault()
              plusRef.current?.present()
            },
          }}
        />
      </Tabs>
      <PlusModal ref={plusRef} />
    </>
  )
}
