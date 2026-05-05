import { Image, View } from 'react-native'

const PAPER_SOURCE = require('@/assets/top-flair.png')
const EDGE_SOURCE = require('@/assets/top-flair-edge.png')
// Asset is 393×12px. Treat as @1x point size — one tile is 393pt wide.
const TILE_W = 393
const TILE_H = 12

/**
 * Renders the torn-paper top edge by repeating the asset at its native point
 * size as many times as needed to cover the container width, clipping the
 * overflow. Avoids `resizeMode="repeat"` since RN's tile size is determined
 * by intrinsic point size and produced visible vertical seams when the
 * asset's @1x intrinsic height is shorter than the rendered height.
 *
 * `variant="paper"` (default) renders the full asset including the paper
 * fill — use when sitting at the top of a white card so the paper merges
 * into the card body. `variant="edge"` renders only the dark torn stroke
 * marks on transparency — use when sitting on a non-paper backdrop
 * (e.g. a sheet handle above a blurred backdrop).
 */
export function TopFlair({ variant = 'paper' }: { variant?: 'paper' | 'edge' }) {
  const source = variant === 'edge' ? EDGE_SOURCE : PAPER_SOURCE
  return (
    <View style={{ flexDirection: 'row', gap: 6, height: TILE_H, overflow: 'hidden' }}>
      <Image source={source} style={{ width: TILE_W, height: TILE_H }} resizeMode="stretch" />
      <Image source={source} style={{ width: TILE_W, height: TILE_H }} resizeMode="stretch" />
    </View>
  )
}
