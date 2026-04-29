import { useQueries } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { type client, orpc } from '@/lib/orpc-client'

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
        <Text className="font-kirang absolute left-0 top-0 text-[24px] leading-6 text-gray-400">
          #{index + 1}
        </Text>
      </View>
      <Text
        className="text-base leading-[22px] font-bold tracking-[-0.16px] text-black"
        numberOfLines={1}
      >
        {outfit.name ?? 'Untitled'}
      </Text>
      <Text
        className="font-funnel mt-0.5 text-[12px] leading-[16px] tracking-[0.06px] text-[#848484]"
        numberOfLines={1}
      >
        {visibleTags.map((t) => `#${t}`).join(' ')}
        {extra > 0 ? ` +${extra}` : ''}
      </Text>
    </Pressable>
  )
}

export default function SavedOutfits() {
  const [outfitsQuery, itemsQuery] = useQueries({
    queries: [
      orpc.outfit.list.queryOptions(),
      orpc.clothingItem.list.queryOptions({
        input: {},
      }),
    ],
  })

  const loading = outfitsQuery.isPending || itemsQuery.isPending
  const loadError = outfitsQuery.error ?? itemsQuery.error

  const outfits = outfitsQuery.data ?? []
  const rows = itemsQuery.data ?? []
  const itemsById = new Map<string, Item>(rows.map((i) => [i.id, i]))

  const [refreshing, setRefreshing] = useState(false)

  async function onRefresh() {
    setRefreshing(true)
    try {
      await Promise.all([outfitsQuery.refetch(), itemsQuery.refetch()])
    } finally {
      setRefreshing(false)
    }
  }

  const errText = loadError
    ? loadError instanceof Error
      ? loadError.message
      : 'Failed to load'
    : null

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
      ) : errText || outfits.length === 0 ? (
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={{
            flexGrow: 1,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 32,
          }}
        >
          {errText ? (
            <Text className="text-red-500 text-center">{errText}</Text>
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
                // biome-ignore lint/suspicious/noArrayIndexKey: placeholder cell
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
