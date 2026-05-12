import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Stack, useRouter } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Alert,
  Dimensions,
  Image,
  Keyboard,
  type KeyboardEvent,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { orpc } from '@/lib/orpc-client'

type PackageId = '20' | '50' | '100' | 'other'

// Credit package catalog. Discount percentages are baked into the price
// (price = credits * unit - discount); we still surface the % to drive
// the "Save X%" badge AND the discount line in the summary box.
const PACKAGES: {
  id: PackageId
  credits: number | null
  price: number | null
  discountPct: number
}[] = [
  { id: '20', credits: 20, price: 18, discountPct: 10 },
  { id: '50', credits: 50, price: 40, discountPct: 20 },
  { id: '100', credits: 100, price: 70, discountPct: 30 },
  { id: 'other', credits: null, price: null, discountPct: 0 },
]

// AI Balance / top-up screen. Navigated to from the Add button on the
// profile sheet's AI balance row. Selection state is local — purchase
// flow itself is stubbed pending the IAP / Stripe wiring.
export default function AiBalance() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [selectedId, setSelectedId] = useState<PackageId>('20')
  const [customAmount, setCustomAmount] = useState<string>('')
  const scrollRef = useRef<ScrollView>(null)
  // Ref to the input-box View so we can measure its absolute screen Y on
  // focus / keyboard-show. Using `measureInWindow` instead of `onLayout`
  // because layout-Y is in the ScrollView's content space, which doesn't
  // account for the screen-space offset of the ScrollView itself (the
  // AI-BALANCE header above it).
  const inputBoxRef = useRef<View>(null)
  // Current scroll offset, tracked via onScroll so we can compute deltas
  // when the keyboard appears.
  const scrollYRef = useRef<number>(0)
  const keyboardHeightRef = useRef<number>(0)
  const GAP_ABOVE_KEYBOARD = 20

  const scrollInputAboveKeyboard = useCallback(() => {
    const kb = keyboardHeightRef.current
    const box = inputBoxRef.current
    if (!kb || !box) return
    box.measureInWindow((_x, y, _w, h) => {
      const currentBottomScreenY = y + h
      const targetBottomScreenY = Dimensions.get('window').height - kb - GAP_ABOVE_KEYBOARD
      const delta = currentBottomScreenY - targetBottomScreenY
      const next = scrollYRef.current + delta
      scrollRef.current?.scrollTo({ y: Math.max(0, next), animated: true })
    })
  }, [])

  useEffect(() => {
    function onShow(e: KeyboardEvent) {
      keyboardHeightRef.current = e.endCoordinates.height
      scrollInputAboveKeyboard()
    }
    function onHide() {
      keyboardHeightRef.current = 0
    }
    const showSub = Keyboard.addListener('keyboardDidShow', onShow)
    const hideSub = Keyboard.addListener('keyboardDidHide', onHide)
    return () => {
      showSub.remove()
      hideSub.remove()
    }
  }, [scrollInputAboveKeyboard])
  const balanceQuery = useQuery(orpc.credit.getBalance.queryOptions())
  const balance = balanceQuery.data?.balance ?? 0
  // Mock payment: no IAP yet. Server records the grant + bumps balance.
  const purchaseMutation = useMutation(orpc.credit.purchase.mutationOptions())

  const selected = PACKAGES.find((p) => p.id === selectedId)!
  const isOther = selectedId === 'other'
  const parsedCustom = isOther ? parseInt(customAmount, 10) : Number.NaN
  // Effective credits about to be purchased — fixed for the 3 packs,
  // the user-entered integer for "Other".
  const purchaseCredits = isOther
    ? Number.isFinite(parsedCustom) && parsedCustom > 0
      ? parsedCustom
      : 0
    : (selected.credits ?? 0)
  // "Other" pricing: $1/credit, with a 10% discount once the base cost
  // reaches $10. The fixed packs have their own pre-baked prices.
  const baseCost = purchaseCredits * 1
  const otherDiscountPct = baseCost >= 10 ? 10 : 0
  const otherDiscountAmount = (baseCost * otherDiscountPct) / 100
  const discountAmount = isOther
    ? otherDiscountAmount
    : selected.price != null
      ? baseCost - selected.price
      : 0
  const totalDue = isOther ? baseCost - otherDiscountAmount : (selected.price ?? 0)
  const discountPctDisplay = isOther ? otherDiscountPct : selected.discountPct
  const canPurchase = purchaseCredits > 0 && !purchaseMutation.isPending

  async function onContinue() {
    if (!canPurchase) return
    try {
      await purchaseMutation.mutateAsync({ amount: purchaseCredits })
      // Refresh the balance everywhere — profile sheet, this screen, any
      // other consumer.
      queryClient.invalidateQueries({ queryKey: orpc.credit.getBalance.queryKey() })
      Alert.alert('Purchase complete', `+${purchaseCredits} AI credits added.`, [
        { text: 'OK', onPress: () => router.back() },
      ])
    } catch (err) {
      Alert.alert('Purchase failed', err instanceof Error ? err.message : 'Please try again.')
    }
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ flex: 1, backgroundColor: '#E5E5E5' }}>
        {/* Header row: back arrow on the left, centered Bebas wordmark.
            Same visual rhythm as upload-wardrobe-guide's header but with
            the title centered (back arrow absolutely positioned). */}
        <View
          style={{
            paddingTop: insets.top + 8,
            paddingHorizontal: 20,
            paddingBottom: 12,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            style={{ position: 'absolute', left: 20, top: insets.top + 8, padding: 8 }}
          >
            <Image
              source={require('@/assets/arrow-left.png')}
              style={{ width: 24, height: 24 }}
              resizeMode="contain"
            />
          </Pressable>
          <Text
            className="font-bebas text-black"
            style={{ fontSize: 32, lineHeight: 36, letterSpacing: 0 }}
          >
            AI B
            <Text className="font-kirang" style={{ fontSize: 38, lineHeight: 36 }}>
              A
            </Text>
            LAN
            <Text className="font-kirang" style={{ fontSize: 38, lineHeight: 36 }}>
              C
            </Text>
            E
          </Text>
        </View>

        <ScrollView
          ref={scrollRef}
          onScroll={(e) => {
            scrollYRef.current = e.nativeEvent.contentOffset.y
          }}
          scrollEventThrottle={16}
          contentContainerStyle={{
            paddingTop: 16,
            // Bottom padding leaves room for the absolute Continue CTA
            // *and* enough headroom to scroll the input above the numpad
            // when "Other" is selected.
            paddingBottom: 460,
          }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* All page content (except the bottom CTA) is locked to a
              333px column and center-aligned, matching the Figma frame
              width. The CTA stays full-width with its own 20px margins. */}
          <View style={{ width: 333, alignSelf: 'center' }}>
            <Text
              className="font-funnel font-normal"
              style={{
                fontSize: 12,
                lineHeight: 16,
                height: 16,
                letterSpacing: 0.06,
                color: '#666',
              }}
            >
              Current Balance
            </Text>
            {/* Balance container — wraps the "150" numeral and the star
              icon as a single Figma frame. flex-direction row + center
              alignment matches the Figma component spec. */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                marginTop: 8,
                height: 60,
              }}
            >
              <Text
                className="font-funnel font-bold text-black"
                style={{ fontSize: 60, lineHeight: 60, letterSpacing: -0.9 }}
              >
                {balance}
              </Text>
              <Image
                source={require('@/assets/star.png')}
                style={{
                  width: 32,
                  height: 32,
                  // Funnel's cap-height sits in the upper half of the line
                  // box, so geometric center of the row puts the star below
                  // the optical center of "150". Nudge up to match.
                  transform: [{ translateY: -8 }],
                }}
                resizeMode="contain"
              />
            </View>

            <Text
              className="font-funnel font-bold text-black"
              style={{ fontSize: 20, lineHeight: 24, letterSpacing: -0.3, marginTop: 20 }}
            >
              Buy Extra AI Credit
            </Text>

            {/* 2×2 package grid. 15px gap between cards both horizontally
              and vertically. Width comes from the outer 333px column. */}
            <View style={{ flexDirection: 'row', gap: 15, marginTop: 15 }}>
              <PackageCard
                pkg={PACKAGES[0]}
                selected={selectedId === '20'}
                onPress={() => setSelectedId('20')}
              />
              <PackageCard
                pkg={PACKAGES[1]}
                selected={selectedId === '50'}
                onPress={() => setSelectedId('50')}
              />
            </View>
            <View style={{ flexDirection: 'row', gap: 15, marginTop: 15 }}>
              <PackageCard
                pkg={PACKAGES[2]}
                selected={selectedId === '100'}
                onPress={() => setSelectedId('100')}
              />
              <PackageCard
                pkg={PACKAGES[3]}
                selected={selectedId === 'other'}
                onPress={() => setSelectedId('other')}
              />
            </View>

            {/* Custom-amount input — visible only when "Other" is selected.
                Numpad keyboard so users get a clean digit-only entry.
                Box border is Monochrome-5 grey (#8F8F8F); only the caret
                uses the Monochrome-Highlight-3 red (#FF0D00). */}
            {isOther ? (
              <View
                ref={inputBoxRef}
                style={{
                  marginTop: 20,
                  height: 48,
                  borderWidth: 1,
                  borderColor: '#8F8F8F',
                  backgroundColor: '#fff',
                  paddingTop: 12,
                  paddingBottom: 12,
                  paddingLeft: 15,
                  paddingRight: 15,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <TextInput
                  value={customAmount}
                  onChangeText={(t) => setCustomAmount(t.replace(/[^0-9]/g, ''))}
                  placeholder="0"
                  placeholderTextColor="#8F8F8F"
                  keyboardType="number-pad"
                  inputMode="numeric"
                  autoFocus
                  onFocus={() => {
                    // Fallback for cases where the keyboard is already
                    // open (e.g. user re-selects Other after dismissing).
                    // The Keyboard.didShow listener will re-fire normally
                    // when the keyboard transitions from hidden → shown.
                    scrollInputAboveKeyboard()
                  }}
                  // selectionColor controls the caret + selection highlight
                  // on both iOS and Android. cursorColor is Android-only and
                  // newer (>= RN 0.71) — included as a belt-and-braces for
                  // older simulator OS images.
                  selectionColor="#FF0D00"
                  cursorColor="#FF0D00"
                  className="font-funnel font-bold text-black flex-1"
                  style={{ fontSize: 20, lineHeight: 24, letterSpacing: -0.3 }}
                />
                <Text
                  className="font-funnel font-normal"
                  style={{ fontSize: 16, lineHeight: 22, letterSpacing: -0.16, color: '#666' }}
                >
                  AI Credit
                </Text>
              </View>
            ) : null}

            {/* Summary box. Thin gray border, light fill, three rows with a
              divider between the discount line and the total. When the
              custom-amount input is showing (Other selected), the gap to
              this summary is 20px; otherwise 32px from the cards row. */}
            <View
              style={{
                marginTop: isOther ? 20 : 32,
                borderWidth: 1,
                borderColor: '#8F8F8F',
                backgroundColor: 'transparent',
                padding: 15, // Spacing/L
                gap: 15,
              }}
            >
              <SummaryRow label="AI credit" value={`$${baseCost.toFixed(2)}`} />
              <SummaryRow
                label={
                  <Text
                    className="font-funnel font-normal text-black"
                    style={{ fontSize: 16, lineHeight: 22, letterSpacing: -0.16 }}
                  >
                    Discount • <Text className="font-bold">{discountPctDisplay}%</Text>
                  </Text>
                }
                value={`$${discountAmount.toFixed(2)}`}
              />
              <View style={{ height: 1, backgroundColor: '#8F8F8F' }} />
              <SummaryRow label="Total due" value={`$${totalDue.toFixed(2)}`} valueBold />
            </View>
          </View>
        </ScrollView>

        {/* Continue CTA pinned to bottom, matching upload-wardrobe-guide. */}
        <View style={{ position: 'absolute', left: 20, right: 20, bottom: insets.bottom + 16 }}>
          <Pressable
            onPress={onContinue}
            disabled={!canPurchase}
            style={{
              height: 56,
              borderRadius: 99,
              backgroundColor: canPurchase ? '#000' : '#8F8F8F',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text
              className="font-funnel font-medium text-white"
              style={{ fontSize: 16, lineHeight: 24, letterSpacing: -0.24 }}
            >
              {purchaseMutation.isPending ? 'Processing…' : 'Continue'}
            </Text>
          </Pressable>
        </View>
      </View>
    </>
  )
}

function PackageCard({
  pkg,
  selected,
  onPress,
}: {
  pkg: (typeof PACKAGES)[number]
  selected: boolean
  onPress: () => void
}) {
  const isOther = pkg.id === 'other'
  return (
    <Pressable
      onPress={onPress}
      style={{
        width: 159,
        // Shadow lives on the OUTER (non-clipping) wrapper. iOS won't
        // render a shadow on a view with `overflow: hidden`, so the
        // border-radius + clip lives on the inner View instead.
        // Selected uses a 3-layer boxShadow per Figma; unselected uses
        // the single-layer 0/1/1/0.33 base shadow.
        boxShadow: selected
          ? '1px 8px 20px -8px rgba(0,0,0,0.75), 0px 2px 6px -4px rgba(0,0,0,0.5), 0px 1px 3px -2px rgba(0,0,0,0.25)'
          : '0px 1px 1px 0px rgba(0,0,0,0.33)',
        elevation: selected ? 6 : 1,
        // Selected lifts 8px. Always pass a populated transform array —
        // RN's transform validator crashes on null/undefined entries.
        transform: [{ translateY: selected ? -8 : 0 }],
      }}
    >
      <View
        style={{
          borderRadius: 4, // Spacing/XS
          overflow: 'hidden',
          backgroundColor: '#fff',
          // 4px gap between the number/price block and the bottom band.
          gap: 4,
        }}
      >
        <View
          style={{
            paddingTop: 11, // Spacing/M
            paddingBottom: 11,
            paddingHorizontal: 15, // Spacing/L
            alignItems: 'center',
            gap: 11,
          }}
        >
          {isOther ? (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text
                  className="font-funnel font-bold text-black"
                  style={{ fontSize: 28, lineHeight: 34, letterSpacing: -0.42 }}
                >
                  Other
                </Text>
                <Image
                  source={require('@/assets/star.png')}
                  style={{ width: 16, height: 16 }}
                  resizeMode="contain"
                />
              </View>
              <Text
                className="font-funnel font-normal"
                style={{ fontSize: 14, lineHeight: 18, color: '#666' }}
              >
                Specify amount
              </Text>
            </>
          ) : (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text
                  className="font-funnel font-bold text-black"
                  style={{ fontSize: 28, lineHeight: 34, letterSpacing: -0.42 }}
                >
                  {pkg.credits}
                </Text>
                <Image
                  source={require('@/assets/star.png')}
                  style={{ width: 16, height: 16 }}
                  resizeMode="contain"
                />
              </View>
              <Text
                className="font-funnel font-normal"
                style={{ fontSize: 14, lineHeight: 18, letterSpacing: 0, color: '#000' }}
              >
                ${pkg.price}
              </Text>
            </>
          )}
        </View>
        <View
          style={{
            backgroundColor: '#EDEDED',
            paddingVertical: 10,
            alignItems: 'center',
          }}
        >
          <Text
            className="font-funnel font-normal"
            style={{ fontSize: 12, lineHeight: 16, letterSpacing: 0.06, color: '#000' }}
          >
            {isOther ? 'Discount starts at $10' : `Save ${pkg.discountPct}%`}
          </Text>
        </View>
      </View>
    </Pressable>
  )
}

function SummaryRow({
  label,
  value,
  valueBold,
}: {
  label: React.ReactNode
  value: string
  valueBold?: boolean
}) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      {typeof label === 'string' ? (
        <Text
          className="font-funnel font-normal text-black"
          style={{ fontSize: 16, lineHeight: 22, letterSpacing: -0.16 }}
        >
          {label}
        </Text>
      ) : (
        label
      )}
      <Text
        className={`font-funnel ${valueBold ? 'font-bold' : 'font-normal'} text-black`}
        style={{
          fontSize: valueBold ? 20 : 16,
          lineHeight: valueBold ? 24 : 22,
          letterSpacing: valueBold ? -0.3 : -0.16,
        }}
      >
        {value}
      </Text>
    </View>
  )
}
