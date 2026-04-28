import MaskedView from "@react-native-masked-view/masked-view";
import { LinearGradient } from "expo-linear-gradient";
import { useState } from "react";
import {
  Dimensions,
  Image,
  type ImageSourcePropType,
  View,
} from "react-native";

const SCREEN_WIDTH = Dimensions.get("window").width;

/**
 * Renders the hero figure with a soft floor lighting effect (ellipse glow +
 * angled silhouette shadow). Used by Try On and Saved Outfit detail.
 *
 * The floor is sized off the figure's measured layout box width so it stays
 * proportional regardless of figure height. Tweak knobs at the call site by
 * passing `topOffset`.
 */
export function HeroFloor({
  source,
  /** When set, top-aligns the figure that many pixels below the parent's top
   *  edge. Otherwise bottom-aligns via flex-end. */
  topOffset,
  maxHeight,
}: {
  source: ImageSourcePropType;
  topOffset?: number;
  maxHeight?: number;
}) {
  const [box, setBox] = useState<{
    width: number;
    height: number;
    y: number;
  } | null>(null);
  const topAligned = topOffset !== undefined;

  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: topAligned ? "flex-start" : "flex-end",
        paddingTop: topAligned ? topOffset : 0,
        overflow: "visible",
      }}
    >
      {box ? (
        <>
          <Image
            source={require("@/assets/ellipse.png")}
            style={{
              position: "absolute",
              top: box.y + box.height - box.width * 0.6,
              left: SCREEN_WIDTH / 2 - box.width,
              width: box.width * 2,
              height: box.width,
              opacity: 0.9,
            }}
            resizeMode="stretch"
          />
          <MaskedView
            style={{
              position: "absolute",
              top: box.y + box.height - box.width * 1.2,
              left: SCREEN_WIDTH / 2 - 20,
              width: box.width,
              height: box.height,
            }}
            maskElement={
              <LinearGradient
                colors={["rgba(0,0,0,1)", "rgba(0,0,0,0)"]}
                start={{ x: 0, y: 1 }}
                end={{ x: 1, y: 0 }}
                style={{ flex: 1 }}
              />
            }
          >
            <Image
              source={source}
              style={{
                width: "100%",
                height: "100%",
                opacity: 0.3,
                tintColor: "#000",
                transform: [
                  { perspective: 700 },
                  { rotateX: "82deg" },
                  { rotateZ: "35deg" },
                  { scaleY: 1.8 },
                ],
              }}
              resizeMode="contain"
            />
          </MaskedView>
        </>
      ) : null}
      <Image
        source={source}
        style={{ height: "100%", maxHeight: maxHeight }}
        resizeMode="contain"
        onLayout={(e) =>
          setBox({
            width: e.nativeEvent.layout.width,
            height: e.nativeEvent.layout.height,
            y: e.nativeEvent.layout.y,
          })
        }
      />
    </View>
  );
}
