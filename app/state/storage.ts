import Constants from 'expo-constants'
import { createJSONStorage } from 'jotai/utils'
import { createMMKV } from 'react-native-mmkv'

const storagePrefix = (Constants.expoConfig?.scheme as string) || 'kurasi'

export const mmkv = createMMKV({
  id: `${storagePrefix}-state`,
})

const mmkvStringStorage = {
  getItem: (key: string) => {
    const value = mmkv.getString(key)
    return value ?? null
  },
  setItem: (key: string, value: string) => {
    mmkv.set(key, value)
  },
  removeItem: (key: string) => {
    mmkv.remove(key)
  },
}

export function createMMKVJSONStorage<T>() {
  return createJSONStorage<T>(() => mmkvStringStorage)
}
