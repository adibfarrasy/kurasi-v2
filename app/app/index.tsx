import { Redirect } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useAuth } from '@/contexts/auth-context'
import { client } from '@/lib/orpc-client'

export default function App() {
  const { isAuthenticated, isInitialLoading, user, logout } = useAuth()
  const [helloWorld, setHelloWorld] = useState<string | null>(null)

  if (isInitialLoading) {
    return null
  }

  if (!isAuthenticated) {
    return <Redirect href="/login" />
  }

  return (
    <View className="flex-1 bg-white dark:bg-black items-center justify-center px-8">
      <Text className="text-2xl font-bold text-gray-800 dark:text-white mb-2">
        Welcome, {user?.name}
      </Text>
      <Text className="text-base text-blue-500 mt-4" onPress={logout}>
        Log out
      </Text>

      <View>
        <Pressable
          onPress={async () => {
            console.log('Querying Hello World')
            const result = await client.helloWorld()
            console.log('Result:', result)
            setHelloWorld(result)
          }}
        >
          <Text className="text-blue-500">{helloWorld ?? 'Query Hello World'}</Text>
        </Pressable>
      </View>
      <StatusBar style="auto" />
    </View>
  )
}
