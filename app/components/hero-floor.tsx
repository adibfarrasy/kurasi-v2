import { Image as ExpoImage } from 'expo-image'
import { useEffect, useState } from 'react'
import { Dimensions, Image, type ImageSourcePropType, View } from 'react-native'

const SCREEN_WIDTH = Dimensions.get('window').width

/**
 * Renders the hero figure with a cast shadow on the floor. The shadow is the
 * figure itself, tinted black and projected flat — pivot at the figure's
 * bottom-left, skewed horizontally so the head extends to the right, then
 * compressed vertically so it lies along the ground. No pixel scanning, no
 * SVG, no Skia — just two transforms applied to a second copy of the image.
 *
 * Used by Try On and Saved Outfit detail.
 */
export function HeroFloor({
  source,
  /** When set, top-aligns the figure that many pixels below the parent's top
   *  edge. Otherwise bottom-aligns via flex-end. */
  topOffset,
  maxHeight,
}: {
  source: ImageSourcePropType
  topOffset?: number
  maxHeight?: number
}) {
  const [box, setBox] = useState<{
    width: number
    height: number
    y: number
  } | null>(null)
  const [loaded, setLoaded] = useState(false)
  // For remote-URI sources we need an aspectRatio so `contentFit="contain"`
  // can letterbox correctly (without it ExpoImage collapses to width=0).
  // Seed with the dress-avatar pipeline's fixed 832×1248 canvas so the
  // figure renders immediately; refine via Image.getSize once the network
  // roundtrip resolves (cheap follow-up if the canvas ever changes).
  const PIPELINE_ASPECT = 832 / 1248
  const [aspectRatio, setAspectRatio] = useState<number>(PIPELINE_ASPECT)
  useEffect(() => {
    if (typeof source === 'object' && source !== null && 'uri' in source && source.uri) {
      setAspectRatio(PIPELINE_ASPECT)
      Image.getSize(
        source.uri,
        (w, h) => setAspectRatio(h > 0 ? w / h : PIPELINE_ASPECT),
        () => {},
      )
    } else {
      // Local require() — ExpoImage doesn't infer intrinsic dimensions for
      // height-only styled containers, so fall back to the pipeline aspect
      // ratio (default_man.png matches this portrait canvas).
      setAspectRatio(PIPELINE_ASPECT)
    }
    setLoaded(false)
  }, [source])
  const topAligned = topOffset !== undefined

  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: topAligned ? 'flex-start' : 'flex-end',
        paddingTop: topAligned ? topOffset : 0,
        overflow: 'visible',
      }}
    >
      {/* Floor glow: soft ellipse PNG anchored under the figure's feet. */}
      {box && loaded ? (
        <Image
          source={require('@/assets/ellipse.png')}
          style={{
            position: 'absolute',
            top: box.y + box.height - box.width * 0.6,
            left: SCREEN_WIDTH / 2 - box.width + 18,
            width: box.width * 2,
            height: box.width,
            opacity: 0.8,
          }}
          resizeMode="stretch"
        />
      ) : null}
      <ExpoImage
        source={source}
        style={{
          height: '100%',
          maxHeight,
          aspectRatio,
        }}
        contentFit="contain"
        // expo-image caches both in-memory and on-disk. With memory-disk
        // policy a URL fetched once on the My Fit list is reused
        // instantly when the user opens detail.
        cachePolicy="memory-disk"
        transition={150}
        onLoad={() => setLoaded(true)}
        onLayout={(e) =>
          setBox({
            width: e.nativeEvent.layout.width,
            height: e.nativeEvent.layout.height,
            y: e.nativeEvent.layout.y,
          })
        }
      />
    </View>
  )
}
