import { Redirect, Tabs } from 'expo-router'
import { useAtomValue } from 'jotai'
import { useRef } from 'react'
import { Pressable, Text, View } from 'react-native'
import BookmarkSimple from '@/assets/icons/BookmarkSimple.svg'
import Dresser from '@/assets/icons/Dresser.svg'
import Sparkle from '@/assets/icons/Sparkle.svg'
import { PlusModal, type PlusModalHandle } from '@/components/plus-modal'
import { useAuth } from '@/contexts/auth-context'
import { devSkipGatesAtom } from '@/state/onboarding'

const ICON_SIZE = 26

const tabLabelStyle = (focused: boolean) =>
  ({
    fontFamily: 'Inter',
    fontWeight: '700',
    fontSize: 9,
    lineHeight: 12,
    letterSpacing: 0.18,
    textAlign: 'center',
    marginTop: 4,
    color: '#000',
    opacity: focused ? 1 : 0.3,
  }) as const

function TabBarIcon({ source }: { source: 'sparkle' | 'bookmark' | 'dresser' }) {
  const props = { width: ICON_SIZE, height: ICON_SIZE, color: '#000', fill: '#000' }
  if (source === 'sparkle') return <Sparkle {...props} />
  if (source === 'bookmark') return <BookmarkSimple {...props} />
  return <Dresser {...props} />
}

function PlusTabButton({ onPress }: { onPress?: () => void }) {
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', marginLeft: 24 }}>
      <Pressable
        onPress={onPress}
        style={{
          width: 64,
          height: 48,
          borderRadius: 99,
          backgroundColor: '#000',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4,
        }}
      >
        <Text style={{ color: 'white', fontSize: 24, lineHeight: 26 }}>+</Text>
      </Pressable>
    </View>
  )
}

export default function TabsLayout() {
  const { isAuthenticated, isInitialLoading } = useAuth()
  const skipGates = useAtomValue(devSkipGatesAtom)
  const plusRef = useRef<PlusModalHandle>(null)

  if (isInitialLoading) return null
  if (!isAuthenticated && !skipGates) return <Redirect href="/login" />

  return (
    <>
      <Tabs
        initialRouteName="index"
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: 'white',
            height: 110,
            paddingTop: 12,
            paddingBottom: 50,
            paddingLeft: 20,
            paddingRight: 20,
            borderTopWidth: 1,
            borderTopColor: 'rgba(0,0,0,0.15)',
          },
          tabBarItemStyle: { width: 88.33, height: 42 },
        }}
      >
        <Tabs.Screen
          name="tryon"
          options={{
            title: 'Try On',
            tabBarIcon: ({ focused }) => (
              <View style={{ opacity: focused ? 1 : 0.3 }}>
                <TabBarIcon source="sparkle" />
              </View>
            ),
            tabBarLabel: ({ focused }) => (
              <Text numberOfLines={1} style={tabLabelStyle(focused)}>
                Try On
              </Text>
            ),
          }}
        />
        <Tabs.Screen
          name="index"
          options={{
            title: 'Saved Outfit',
            tabBarIcon: ({ focused }) => (
              <View style={{ opacity: focused ? 1 : 0.3 }}>
                <TabBarIcon source="bookmark" />
              </View>
            ),
            tabBarLabel: ({ focused }) => (
              <Text numberOfLines={1} style={tabLabelStyle(focused)}>
                Saved Outfit
              </Text>
            ),
          }}
        />
        <Tabs.Screen
          name="wardrobe"
          options={{
            title: 'Wardrobe',
            tabBarIcon: ({ focused }) => (
              <View style={{ opacity: focused ? 1 : 0.3 }}>
                <TabBarIcon source="dresser" />
              </View>
            ),
            tabBarLabel: ({ focused }) => (
              <Text numberOfLines={1} style={tabLabelStyle(focused)}>
                Wardrobe
              </Text>
            ),
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
