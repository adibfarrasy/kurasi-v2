import { BottomSheetScrollView } from '@gorhom/bottom-sheet'
import { usePathname, useRouter } from 'expo-router'
import { useAtom } from 'jotai'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { useAuth } from '@/contexts/auth-context'
import { useOnboarding } from '@/hooks/use-onboarding'
import { devSkipGatesAtom } from '@/state/onboarding'
import { mmkv } from '@/state/storage'

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

const PRESSED_OPACITY = { opacity: 0.85 as const }

function pressStyle(base: object) {
  return ({ pressed }: { pressed: boolean }) => [base, pressed && PRESSED_OPACITY]
}

function DevToolsRouteLine() {
  const pathname = usePathname()
  return <Text className="text-[14px] text-gray-700">Route: {pathname}</Text>
}

export function getDevToolsStorageSnapshot(): Array<{ key: string; value: string }> {
  const keys = mmkv.getAllKeys().sort()
  return keys.map((key) => {
    const raw = mmkv.getString(key)
    if (!raw) return { key, value: '(non-string or empty)' }

    try {
      const parsed = JSON.parse(raw)
      return { key, value: JSON.stringify(parsed) }
    } catch {
      return { key, value: raw }
    }
  })
}

export type DevToolsPanelProps = {
  onClose: () => void
  storageRows: Array<{ key: string; value: string }>
  onRefreshStorage: () => void
}

export function DevToolsPanel({ onClose, storageRows, onRefreshStorage }: DevToolsPanelProps) {
  const router = useRouter()
  const [skipGates, setSkipGates] = useAtom(devSkipGatesAtom)
  const { hasOnboarded, completeOnboarding, resetOnboarding } = useOnboarding()
  const { isAuthenticated } = useAuth()

  return (
    <BottomSheetScrollView
      className="px-6"
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View className="gap-3 pb-6">
        <Text className="text-[18px] font-semibold text-black">Dev Tools</Text>
        <Text className="text-[14px] text-gray-700">
          Onboarding complete: {hasOnboarded ? 'true' : 'false'}
        </Text>
        <Text className="text-[14px] text-gray-700">
          Authenticated: {isAuthenticated ? 'true' : 'false'}
        </Text>
        <DevToolsRouteLine />

        <Pressable
          style={({ pressed }) => [
            skipGates ? btn.primary : btn.secondary,
            pressed && PRESSED_OPACITY,
          ]}
          onPress={() => {
            setSkipGates(!skipGates)
            onClose()
          }}
        >
          <Text style={skipGates ? btn.primaryText : btn.secondaryText}>
            Dev mode: {skipGates ? 'ON' : 'OFF'}
          </Text>
        </Pressable>

        <Pressable
          style={pressStyle(btn.primary)}
          onPress={() => {
            completeOnboarding()
            onRefreshStorage()
          }}
        >
          <Text style={btn.primaryText}>Set onboarding: true</Text>
        </Pressable>

        <Pressable
          style={pressStyle(btn.secondary)}
          onPress={() => {
            resetOnboarding()
            onRefreshStorage()
          }}
        >
          <Text style={btn.secondaryText}>Set onboarding: false</Text>
        </Pressable>

        <View style={btn.row}>
          <Pressable
            style={pressStyle(btn.pill)}
            onPress={() => {
              router.replace('/onboarding-1')
              onClose()
            }}
          >
            <Text style={btn.pillText}>Onboarding 1</Text>
          </Pressable>
          <Pressable
            style={pressStyle(btn.pill)}
            onPress={() => {
              router.replace('/onboarding-2')
              onClose()
            }}
          >
            <Text style={btn.pillText}>Onboarding 2</Text>
          </Pressable>
          <Pressable
            style={pressStyle(btn.pill)}
            onPress={() => {
              router.replace('/login')
              onClose()
            }}
          >
            <Text style={btn.pillText}>Login</Text>
          </Pressable>
          <Pressable
            style={pressStyle(btn.pill)}
            onPress={() => {
              router.replace('/')
              onClose()
            }}
          >
            <Text style={btn.pillText}>Saved</Text>
          </Pressable>
        </View>

        <Text className="text-[12px] font-semibold text-gray-500 mt-2">Steal the Look</Text>
        <View style={btn.row}>
          <Pressable
            style={pressStyle(btn.pill)}
            onPress={() => {
              router.push('/steal-the-look')
              onClose()
            }}
          >
            <Text style={btn.pillText}>Upload</Text>
          </Pressable>
          <Pressable
            style={pressStyle(btn.pill)}
            onPress={() => {
              router.push('/steal-the-look/analyzing')
              onClose()
            }}
          >
            <Text style={btn.pillText}>Analyzing</Text>
          </Pressable>
          <Pressable
            style={pressStyle(btn.pill)}
            onPress={() => {
              router.push('/steal-the-look/failed')
              onClose()
            }}
          >
            <Text style={btn.pillText}>Failed</Text>
          </Pressable>
        </View>

        <Pressable style={pressStyle(btn.refresh)} onPress={onRefreshStorage}>
          <Text style={btn.pillText}>Refresh Storage</Text>
        </Pressable>

        <View className="border border-gray-200 rounded-xl p-3">
          <Text className="text-[14px] font-semibold text-black mb-2">MMKV Storage</Text>
          <ScrollView className="max-h-36" nestedScrollEnabled>
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
      </View>
    </BottomSheetScrollView>
  )
}
