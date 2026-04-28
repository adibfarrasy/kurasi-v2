import PencilLine from "@/assets/icons/PencilLine.svg";
import ShareFat from "@/assets/icons/ShareFat.svg";
import XIcon from "@/assets/icons/X.svg";
import { HeroFloor } from "@/components/hero-floor";
import { SlotStrip } from "@/components/slot-strip";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  type FlatList as FlatListType,
  Image,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ToneBackground } from "@/components/tone-background";
import { client } from "@/lib/orpc-client";
import { getOutfitTone } from "@/lib/outfit-tone";

type Outfit = Awaited<ReturnType<typeof client.outfit.list>>[number];
type Item = Awaited<ReturnType<typeof client.clothingItem.list>>[number];

const SLOTS: Array<{ key: keyof Outfit; label: string }> = [
  { key: "baseId", label: "SHIRT" },
  { key: "outerId", label: "JACKET" },
  { key: "bottomId", label: "PANTS" },
  { key: "footwearId", label: "SHOES" },
  { key: "headwearId", label: "HAT" },
];

const SCREEN_WIDTH = Dimensions.get("window").width;
const PAGE_WIDTH = SCREEN_WIDTH - 190;
const PAGE_GUTTER = (SCREEN_WIDTH - PAGE_WIDTH) / 2;

function CellWrapper({
  style,
  children,
}: {
  style: unknown;
  children: React.ReactNode;
}) {
  return (
    <View style={[style as object, { overflow: "visible" }]}>{children}</View>
  );
}

function slotItemsFor(outfit: Outfit, itemsById: Map<string, Item>) {
  return SLOTS.map((s) => {
    const itemId = outfit[s.key] as string | null;
    return itemId
      ? { label: s.label, item: itemsById.get(itemId) ?? null }
      : null;
  }).filter(
    (x): x is { label: string; item: Item } => x !== null && x.item !== null,
  );
}

const HeroPage = memo(_HeroPage);

function _HeroPage({
  index,
  scrollX,
  showFloor,
}: {
  index: number;
  scrollX: Animated.Value;
  showFloor: boolean;
}) {
  // Memoised so the Animated transform array gets a stable reference across
  // re-renders — otherwise every parent re-render creates fresh interpolated
  // nodes and the native-driver scroll-linked animation visibly resets.
  const { scale, translateY, opacity } = useMemo(() => {
    const inputRange = [
      (index - 1) * PAGE_WIDTH,
      index * PAGE_WIDTH,
      (index + 1) * PAGE_WIDTH,
    ];
    return {
      scale: scrollX.interpolate({
        inputRange,
        outputRange: [0.78, 1, 0.78],
        extrapolate: "clamp",
      }),
      translateY: scrollX.interpolate({
        inputRange,
        outputRange: [-54, 0, -54],
        extrapolate: "clamp",
      }),
      opacity: scrollX.interpolate({
        inputRange,
        outputRange: [0.5, 1, 0.5],
        extrapolate: "clamp",
      }),
    };
  }, [index, scrollX]);

  return (
    <Animated.View
      style={{
        width: PAGE_WIDTH,
        alignItems: "center",
        overflow: "visible",
        zIndex: showFloor ? 10 : 0,
        elevation: showFloor ? 10 : 0,
        transform: [{ scale }, { translateY }],
        opacity,
      }}
    >
      {showFloor ? (
        <View
          style={{
            width: SCREEN_WIDTH,
            height: 520,
            marginTop: -120,
            overflow: "visible",
          }}
        >
          <HeroFloor
            source={require("@/assets/default_man.png")}
            topOffset={0}
            maxHeight={520}
          />
        </View>
      ) : (
        <Image
          source={require("@/assets/default_man.png")}
          style={{ maxHeight: 520, marginTop: -120 }}
          resizeMode="contain"
        />
      )}
    </Animated.View>
  );
}

export default function OutfitDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [outfits, setOutfits] = useState<Outfit[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const flatListRef = useRef<FlatListType<Outfit>>(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const [isScrolling, setIsScrolling] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [outfitRows, itemRows] = await Promise.all([
          client.outfit.list(),
          client.clothingItem.list(),
        ]);
        if (cancelled) return;
        setOutfits(outfitRows);
        setItems(itemRows);
        const startIdx = outfitRows.findIndex((o) => o.id === id);
        if (startIdx >= 0) setActiveIndex(startIdx);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Prime scrollX to the deep-linked index BEFORE first paint so transform
  // interpolations don't render with scrollX=0 (which would briefly scale the
  // active item down to 0.78 then snap back to 1 on the first effect tick).
  useLayoutEffect(() => {
    if (!loading && outfits.length > 0) {
      scrollX.setValue(activeIndex * PAGE_WIDTH);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  const itemsById = useMemo(
    () => new Map(items.map((i) => [i.id, i])),
    [items],
  );
  const activeOutfit = outfits[activeIndex] ?? null;
  const activeSlots = activeOutfit ? slotItemsFor(activeOutfit, itemsById) : [];
  const tone = getOutfitTone(activeSlots.map((s) => s.item.primaryColor));
  const padded = String(activeIndex + 1).padStart(2, "0");

  function onMomentumEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const idx = Math.round(e.nativeEvent.contentOffset.x / PAGE_WIDTH);
    if (idx !== activeIndex) setActiveIndex(idx);
    setIsScrolling(false);
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ToneBackground tone={tone}>
        <View style={{ flex: 1, paddingTop: insets.top + 12 }}>
          <View
            style={{
              paddingHorizontal: 24,
              marginBottom: 8,
              height: 160,
              position: "relative",
            }}
          >
            <Text
              pointerEvents="none"
              style={{
                position: "absolute",
                left: 24,
                top: -10,
                width: 52,
                height: 70,
                fontFamily: "Bebas",
                fontSize: 64,
                lineHeight: 70,
                color: "white",
                opacity: 0.2,
              }}
            >
              {padded}
            </Text>
            <Text
              style={{
                marginTop: 5,
                fontFamily: "Kirang",
                fontSize: 28,
                lineHeight: 28,
                color: "white",
                textTransform: "uppercase",
              }}
            >
              {activeOutfit?.name ?? "Outfit"}
            </Text>
            <Text
              style={{
                fontFamily: "Inter",
                fontSize: 11,
                lineHeight: 14,
                color: "rgba(255,255,255,0.55)",
                marginTop: 43,
              }}
            >
              tags
            </Text>
            {activeOutfit?.tags.map((t) => (
              <Text
                key={t}
                style={{
                  fontFamily: "Inter",
                  fontSize: 12,
                  lineHeight: 16,
                  color: "rgba(255,255,255,0.7)",
                }}
              >
                #{t}
              </Text>
            ))}
          </View>

          {loading ? (
            <View
              style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <ActivityIndicator color="white" />
            </View>
          ) : (
            <View style={{ flex: 1 }}>
              <Animated.FlatList
                ref={flatListRef}
                data={outfits}
                horizontal
                initialScrollIndex={activeIndex}
                initialNumToRender={outfits.length}
                showsHorizontalScrollIndicator={false}
                keyExtractor={(o: Outfit) => o.id}
                onMomentumScrollEnd={onMomentumEnd}
                onScroll={Animated.event(
                  [{ nativeEvent: { contentOffset: { x: scrollX } } }],
                  { useNativeDriver: true },
                )}
                scrollEventThrottle={16}
                snapToInterval={PAGE_WIDTH}
                snapToAlignment="start"
                decelerationRate="fast"
                contentContainerStyle={{ paddingHorizontal: PAGE_GUTTER }}
                getItemLayout={(_: unknown, index: number) => ({
                  length: PAGE_WIDTH,
                  offset: PAGE_WIDTH * index,
                  index,
                })}
                style={{ flex: 1, overflow: "visible" }}
                CellRendererComponent={CellWrapper}
                renderItem={({ index }: { item: Outfit; index: number }) => {
                  return (
                    <HeroPage
                      index={index}
                      scrollX={scrollX}
                      showFloor={!isScrolling && index === activeIndex}
                    />
                  );
                }}
                onScrollBeginDrag={() => setIsScrolling(true)}
                extraData={`${itemsById.size}-${activeIndex}`}
              />
            </View>
          )}

          <View style={{ paddingBottom: 50 }}>
            <SlotStrip
              slots={activeSlots.map((s) => ({
                key: s.label,
                label: s.label,
                item: s.item,
              }))}
            />

            <View
              style={{
                flexDirection: "row",
                gap: 12,
                height: 64,
                paddingTop: 8,
                paddingLeft: 20,
                paddingRight: 20,
              }}
            >
              <Pressable
                style={{
                  flex: 1,
                  height: 48,
                  borderRadius: 99,
                  backgroundColor: "white",
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                <ShareFat width={18} height={18} color="#000" />
                <Text style={{ fontWeight: "600", color: "black" }}>Share</Text>
              </Pressable>
              <Pressable
                onPress={() => router.push("/tryon")}
                style={{
                  flex: 1,
                  height: 48,
                  borderRadius: 99,
                  backgroundColor: "black",
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                <PencilLine width={18} height={18} color="#fff" />
                <Text style={{ fontWeight: "600", color: "white" }}>Edit</Text>
              </Pressable>
            </View>
          </View>

          <Pressable
            onPress={() => router.back()}
            style={{
              position: "absolute",
              top: insets.top + 12,
              right: 24,
              width: 24,
              height: 24,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <XIcon width={24} height={24} color="#fff" />
          </Pressable>
        </View>
      </ToneBackground>
    </>
  );
}
