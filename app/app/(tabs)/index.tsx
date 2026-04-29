import { useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { client } from '@/lib/orpc-client'

type Outfit = Awaited<ReturnType<typeof client.outfit.list>>[number]
type Item = Awaited<ReturnType<typeof client.clothingItem.list>>[number]

function pickCoverItem(outfit: Outfit, itemsById: Map<string, Item>): Item | null {
  const ids = [outfit.outerId, outfit.baseId, outfit.bottomId, outfit.headwearId, outfit.footwearId]
  for (const id of ids) {
    if (id) {
      const item = itemsById.get(id)
      if (item) return item
    }
  }
  return null
}

function OutfitCard({
  outfit,
  index,
  cover,
}: {
  outfit: Outfit
  index: number
  cover: Item | null
}) {
  const router = useRouter()
  const visibleTags = outfit.tags.slice(0, 2)
  const extra = outfit.tags.length - visibleTags.length

  return (
    <Pressable
      onPress={() =>
        router.push({ pathname: '/outfit/[id]', params: { id: outfit.id, n: String(index + 1) } })
      }
      style={{
        width: 170,
        height: 221,
        padding: 12,
        gap: 7,
        borderRadius: 4,
        backgroundColor: '#FFFFFF',
        margin: 6,
        shadowColor: '#000',
        shadowOpacity: 0.4,
        shadowRadius: 1,
        shadowOffset: { width: 0.5, height: 1 },
        elevation: 2,
      }}
    >
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        {cover ? (
          <Image
            source={{ uri: cover.imageUrl }}
            style={{ width: '100%', height: '100%' }}
            resizeMode="contain"
          />
        ) : null}
        <Text
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            color: '#9ca3af',
            fontFamily: 'Kirang',
            fontSize: 24,
            lineHeight: 24,
          }}
        >
          #{index + 1}
        </Text>
      </View>
      <Text
        style={{
          fontSize: 16,
          lineHeight: 22,
          fontWeight: '700',
          letterSpacing: -0.16,
          color: 'black',
        }}
        numberOfLines={1}
      >
        {outfit.name ?? 'Untitled'}
      </Text>
      <Text
        style={{
          fontFamily: 'Inter',
          fontSize: 12,
          lineHeight: 16,
          letterSpacing: 0.06,
          color: '#848484',
          marginTop: 2,
        }}
        numberOfLines={1}
      >
        {visibleTags.map((t) => `#${t}`).join(' ')}
        {extra > 0 ? ` +${extra}` : ''}
      </Text>
    </Pressable>
  )
}

export default function SavedOutfits() {
  const [outfits, setOutfits] = useState<Outfit[]>([])
  const [itemsById, setItemsById] = useState<Map<string, Item>>(new Map())
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    const [outfitRows, itemRows] = await Promise.all([
      client.outfit.list(),
      client.clothingItem.list(),
    ])
    const map = new Map<string, Item>()
    for (const i of itemRows) map.set(i.id, i)
    setItemsById(map)
    setOutfits(outfitRows)
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: TODO
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        if (!cancelled) await load()
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  async function onRefresh() {
    setRefreshing(true)
    try {
      await load()
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <View className="flex-1 pt-16" style={{ backgroundColor: '#EBEBEB' }}>
      <View className="px-6 mb-4">
        <Text className="font-bebas text-[48px] leading-[52px] text-black">
          S<Text className="font-kirang text-[58px] leading-[52px]">A</Text>VED OU
          <Text className="font-kirang text-[58px] leading-[52px]">T</Text>FITS
        </Text>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : error || outfits.length === 0 ? (
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={{
            flexGrow: 1,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 32,
          }}
        >
          {error ? (
            <Text className="text-red-500 text-center">{error}</Text>
          ) : (
            <Text className="text-gray-500">No saved outfits yet</Text>
          )}
        </ScrollView>
      ) : (
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            justifyContent: 'center',
            paddingHorizontal: 12,
            paddingBottom: 100,
          }}
        >
          {outfits.map((o, index) => (
            <OutfitCard key={o.id} outfit={o} index={index} cover={pickCoverItem(o, itemsById)} />
          ))}
          {Array.from({ length: (2 - (outfits.length % 2)) % 2 }).map((_, i) => (
            <View
              key={`phantom-${
                // biome-ignore lint/suspicious/noArrayIndexKey: TODO
                i
              }`}
              style={{ width: 170, height: 221, margin: 6, maxWidth: '50%' }}
            />
          ))}
        </ScrollView>
      )}
    </View>
  )
}
