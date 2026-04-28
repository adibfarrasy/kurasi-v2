import { Stack, useRouter } from "expo-router";
import { Image, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Camera from "@/assets/icons/Camera.svg";
import XIcon from "@/assets/icons/X.svg";

// Inline check + cross marks rendered as small filled circles with glyph
function StatusBadge({ kind }: { kind: "do" | "dont" }) {
  const bg = kind === "do" ? "#089511" : "#E90000";
  const glyph = kind === "do" ? "✓" : "✕";
  return (
    <View
      style={{
        width: 18,
        height: 18,
        borderRadius: 9,
        backgroundColor: bg,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text
        style={{
          color: "white",
          fontSize: 11,
          fontWeight: "700",
          lineHeight: 12,
        }}
      >
        {glyph}
      </Text>
    </View>
  );
}

function GuideCard({
  kind,
  title,
  body,
  caption,
}: {
  kind: "do" | "dont";
  title: string;
  body: string;
  caption: string;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        backgroundColor: kind === "do" ? "white" : "transparent",
        borderRadius: 4,
        overflow: "hidden",
        gap: 16,
        height: 168,
        paddingTop: 4,
        paddingRight: 16,
        paddingBottom: 4,
        paddingLeft: 4,
      }}
    >
      <View
        style={{
          alignSelf: "stretch",
          aspectRatio: 88 / 110,
          backgroundColor: "#e5e5e5",
          overflow: "hidden",
        }}
      >
        <Image
          source={
            kind === "do"
              ? require("@/assets/stealthelook-do.png")
              : require("@/assets/stealthelook-dont.png")
          }
          style={{ width: "100%", height: "100%" }}
          resizeMode="cover"
        />
      </View>
      <View style={{ flex: 1, paddingTop: 32, paddingBottom: 8, gap: 4 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <StatusBadge kind={kind} />
          <Text
            style={{
              color: kind === "do" ? "#089511" : "#E90000",
              fontFamily: "FunnelSans_700Bold",
              fontSize: 13,
              letterSpacing: 0.6,
            }}
          >
            {title}
          </Text>
        </View>
        <Text
          style={{
            fontFamily: "FunnelSans_400Regular",
            fontSize: 16,
            lineHeight: 22,
            letterSpacing: -0.16,
            color: "#000",
          }}
        >
          {body}
        </Text>
        <Text
          style={{
            fontFamily: "Inter",
            fontSize: 12,
            lineHeight: 16,
            letterSpacing: 0.06,
            color: "#6b7280",
            marginTop: "auto",
          }}
        >
          {caption}
        </Text>
      </View>
    </View>
  );
}

export default function StealTheLookIntro() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ flex: 1, backgroundColor: "#e5e5e5" }}>
        <ScrollView
          contentContainerStyle={{
            paddingTop: insets.top + 12,
            paddingHorizontal: 20,
            paddingBottom: 140,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Text
              style={{
                fontFamily: "FunnelSans_400Regular",
                fontSize: 20,
                lineHeight: 24,
                letterSpacing: -0.3,
                color: "#000",
              }}
            >
              Upload
            </Text>
            <Pressable
              onPress={() => router.back()}
              hitSlop={12}
              style={{
                width: 28,
                height: 28,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <XIcon width={20} height={20} color="#000" />
            </Pressable>
          </View>

          <Text
            style={{
              fontFamily: "Bebas",
              fontSize: 48,
              lineHeight: 52,
              color: "#000",
              marginTop: 12,
            }}
          >
            OU
            <Text
              style={{ fontFamily: "Kirang", fontSize: 58, lineHeight: 52 }}
            >
              t
            </Text>
            FIT INSPIR
            <Text
              style={{ fontFamily: "Kirang", fontSize: 58, lineHeight: 52 }}
            >
              At
            </Text>
            ION
          </Text>

          <View style={{ marginTop: 56, gap: 17 }}>
            <GuideCard
              kind="do"
              title="DO"
              body={"Have 1 (one) person in\nthe frame."}
              caption="Even if the background is busy, we can analyze it without problem."
            />
            <GuideCard
              kind="dont"
              title="DON'T"
              body={"Have multiple people\nin the frame."}
              caption="Which one do you even want?"
            />
          </View>
        </ScrollView>

        <View
          style={{
            position: "absolute",
            left: 20,
            right: 20,
            bottom: insets.bottom + 16,
          }}
        >
          <Pressable
            onPress={() => router.push("/steal-the-look/analyzing")}
            style={{
              height: 56,
              borderRadius: 99,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.15)",
              backgroundColor: "#000",
              paddingTop: 12,
              paddingRight: 12,
              paddingBottom: 14,
              paddingLeft: 12,
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "row",
              gap: 10,
            }}
          >
            <Camera width={20} height={20} color="#fff" fill="#fff" />
            <Text
              style={{
                color: "white",
                fontFamily: "FunnelSans_500Medium",
                fontSize: 16,
                lineHeight: 24,
                letterSpacing: -0.24,
              }}
            >
              Upload a picture
            </Text>
          </Pressable>
        </View>
      </View>
    </>
  );
}
