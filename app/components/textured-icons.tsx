import { Image, type ImageSourcePropType, type ImageStyle, type StyleProp } from 'react-native'

// Pre-rasterized PNGs of the Phosphor-style icons with the Figma
// hand-drawn `feTurbulence` + `feDisplacementMap` texture baked in.
// react-native-svg silently drops those filters, so any icon that's
// rendered large enough for the wobble to read as design intent is
// shipped as a PNG and tinted via `tintColor`.

type IconProps = {
  width: number
  height: number
  color?: string
  // Accepted for API parity with the SVG variants (which forwarded
  // `fill` to the underlying <Svg>). Ignored — `tintColor` paints any
  // non-transparent pixel a single colour, which matches the SVG
  // `fill="currentColor"` behaviour.
  fill?: string
  // Forwarded to the Image, merged after sizing/tint so callers can
  // position the icon (e.g. absolute placement). Matches the prop name
  // the SVG variants accepted.
  style?: StyleProp<ImageStyle>
}

function makeIcon(source: ImageSourcePropType) {
  return function Icon({ width, height, color, style }: IconProps) {
    const sizing = color ? { width, height, tintColor: color } : { width, height }
    return (
      <Image
        source={source}
        // Only apply tintColor when a colour is explicitly requested. On
        // iOS leaving `tintColor` set (even to undefined) can cause the
        // platform's default tint to bleed through and recolour the
        // image — so omit the key entirely when we want the PNG's native
        // colours to render.
        style={[sizing, style]}
        resizeMode="contain"
      />
    )
  }
}

export const Sparkle = makeIcon(require('@/assets/sparkle.png'))
export const BookmarkSimple = makeIcon(require('@/assets/bookmark-simple.png'))
export const BookmarkSimpleFill = makeIcon(require('@/assets/bookmark-simple-filled.png'))
export const Dresser = makeIcon(require('@/assets/dresser.png'))
export const EllipseSelect = makeIcon(require('@/assets/ellipse-select.png'))
export const LightbulbFilament = makeIcon(require('@/assets/lightbulb-filament.png'))
export const AddItem = makeIcon(require('@/assets/add-item.png'))
// `CoatHanger` is the standalone hanger glyph used inside the upload tile —
// the corresponding SVG was named `AddItemGlyph` (a crop of AddItem without
// the dashed bounding box).
export const AddItemGlyph = makeIcon(require('@/assets/coat-hanger.png'))
export const TShirt = makeIcon(require('@/assets/t-shirt.png'))
// `TShirtUpload` is the t-shirt glyph framed by a dashed bounding box,
// used as the textured icon for the "Add Clothes" entry in plus-modal.
export const TShirtUpload = makeIcon(require('@/assets/t-shirt-upload.png'))
export const DotsNine = makeIcon(require('@/assets/dots-nine.png'))
export const List = makeIcon(require('@/assets/list.png'))
export const MagnifyingGlass = makeIcon(require('@/assets/magnifying-glass.png'))
// `Sort` replaces the FunnelSimple SVG — backed by `sort.png`, the
// textured filter/sort glyph used next to the wardrobe search.
export const Sort = makeIcon(require('@/assets/sort.png'))
export const PencilLine = makeIcon(require('@/assets/pencil-line.png'))
export const Reset = makeIcon(require('@/assets/reset.png'))
// `Share` replaces the ShareFat SVG.
export const Share = makeIcon(require('@/assets/share.png'))
// `X` is the close glyph used in modal dismiss buttons. SVG was named
// X.svg and imported as `XIcon`; consumers can keep that local alias.
export const X = makeIcon(require('@/assets/x.png'))
export const Camera = makeIcon(require('@/assets/camera.png'))
export const CheckCircle = makeIcon(require('@/assets/check-circle.png'))
export const XCircle = makeIcon(require('@/assets/x-circle.png'))
