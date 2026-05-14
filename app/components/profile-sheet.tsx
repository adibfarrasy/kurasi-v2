import type { BottomSheetModal } from '@gorhom/bottom-sheet'
import { BottomSheetScrollView } from '@gorhom/bottom-sheet'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { useAtomValue, useSetAtom } from 'jotai'
import { forwardRef, useCallback, useImperativeHandle, useRef } from 'react'
import { Image, Pressable, Text, View } from 'react-native'
import { FlairSheet } from '@/components/flair-sheet'
import { MembershipCardView } from '@/components/membership-card-view'
import { X as XIcon } from '@/components/textured-icons'
import { TopFlair } from '@/components/top-flair'
import { UpdateDataSheet, type UpdateDataSheetHandle } from '@/components/update-data-sheet'
import { useAuth } from '@/contexts/auth-context'
import { useOnboarding } from '@/hooks/use-onboarding'
import { orpc } from '@/lib/orpc-client'
import { resetAvatarJobAtom } from '@/state/avatar-job'
import { capturedFaceAtom } from '@/state/face-capture'
import { cardNameAtom } from '@/state/membership'
import { signaturePathsAtom } from '@/state/signature'

export type ProfileSheetHandle = {
  present: () => void
  dismiss: () => void
}

// User profile + account-actions bottom sheet. Triggered from the
// hamburger button in the top-right of the try-on tab header. Sliced from
// Figma — the live data plumbing (AI balance number, action handlers)
// remains stubbed until the relevant endpoints land.
export const ProfileSheet = forwardRef<ProfileSheetHandle>((_props, ref) => {
  const sheetRef = useRef<BottomSheetModal>(null)
  const updateDataRef = useRef<UpdateDataSheetHandle>(null)
  const router = useRouter()
  const name = useAtomValue(cardNameAtom)
  const { logout, user } = useAuth()
  const { resetOnboarding } = useOnboarding()
  const resetAvatarJob = useSetAtom(resetAvatarJobAtom)
  const setCapturedFace = useSetAtom(capturedFaceAtom)
  const setCardName = useSetAtom(cardNameAtom)
  const setSignaturePaths = useSetAtom(signaturePathsAtom)
  const balanceQuery = useQuery(orpc.credit.getBalance.queryOptions())
  const balance = balanceQuery.data?.balance ?? 0
  // Dev-only: a "Reset onboarding" action shows up for the dev account.
  // Lets you re-enter the onboarding flow without uninstalling the app
  // (the server-side wipe is `task reset-onboarding:local`; this clears
  // the MMKV flag that the route gate reads).
  const isDevUser = user?.email === 'adibfarrasy@gmail.com'

  useImperativeHandle(ref, () => ({
    present: () => {
      // Refetch credit balance every time the sheet is opened so the
      // displayed number reflects any spends/grants since the last view.
      // Fire-and-forget: the cached value renders immediately while the
      // network refetch happens in the background.
      balanceQuery.refetch()
      sheetRef.current?.present()
    },
    dismiss: () => sheetRef.current?.dismiss(),
  }))

  // Custom sheet handle: blurred avatar banner with the X close button,
  // followed by the torn-paper TopFlair edge. Replaces FlairSheet's
  // default handle (which would have rendered just TopFlair, leaving the
  // blur to sit below the torn edge — wrong by design).
  const handleComponent = useCallback(
    () => (
      // 220px tall transparent strip above the TopFlair. The visual
      // "blurred avatar header" comes entirely from the sheet's backdrop
      // blur showing the tryon-page avatar underneath — we don't render
      // any Image here. overflow: 'visible' so the paperclip can extend
      // down past the handle into the card region.
      <View style={{ overflow: 'visible' }}>
        {/* X close button: visually identical to plus-modal's pattern
            (48×48 white pill, XIcon, shadow). Positioned so its bottom
            edge sits 11px above the TopFlair. Avatar visible region
            occupies the rest of the handle (220 - 48 - 11 = 161px), and
            comes from the sheet's backdrop blur (no Image rendered here). */}
        <View style={{ height: 220, alignItems: 'flex-end', paddingHorizontal: 20 }}>
          <Pressable
            onPress={() => sheetRef.current?.dismiss()}
            hitSlop={8}
            style={{
              position: 'absolute',
              top: 161,
              right: 20,
              width: 48,
              height: 48,
              borderRadius: 99,
              backgroundColor: '#fff',
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: '#000',
              shadowOffset: { width: 0.5, height: 1 },
              shadowOpacity: 0.4,
              shadowRadius: 1,
              elevation: 1,
            }}
          >
            <XIcon width={24} height={24} color="#000" />
          </Pressable>
        </View>
        <TopFlair />
        {/* Paperclip rendered LAST in handle so it draws on top of the
            TopFlair. handle = avatar (220) + TopFlair (12) = 232 tall;
            top: 211 puts the clip's top 21px above the handle's bottom
            edge (i.e. 21px above the card-content boundary). The
            remaining ~101px of the 122-tall clip extends down into the
            scroll content's card region — relies on the outer handle
            View's overflow: visible to not be clipped. */}
        <Image
          source={require('@/assets/paperclip.png')}
          style={{
            position: 'absolute',
            top: 211,
            left: 14,
            width: 68,
            height: 122,
            zIndex: 10,
          }}
          resizeMode="contain"
        />
      </View>
    ),
    [],
  )

  // backgroundComponent starts at top: 232 (= avatar 220 + TopFlair 12)
  // so the white card sits BELOW the entire handle. The TopFlair then
  // renders against the backdrop blur (transparent zone) instead of a
  // white surface — matches AddItemSheet's pattern where the flair sits
  // in a 12px transparent strip above the card. The avatar's own opaque
  // backing comes from the handle's white-bg wrapper.
  const backgroundComponent = useCallback(
    // biome-ignore lint/suspicious/noExplicitAny: gorhom's BottomSheetBackgroundProps style isn't worth importing
    ({ style }: any) => (
      <View
        style={[style, { backgroundColor: '#fff', top: 232, borderRadius: 0 }]}
        pointerEvents="none"
      />
    ),
    [],
  )

  return (
    <FlairSheet
      ref={sheetRef}
      // 100% so the avatar header extends to the top of the device
      // (behind the status bar), matching the design — the status bar
      // glyphs sit on the blurred avatar. topInset: 0 stops gorhom from
      // reserving its default top safe-area offset.
      snapPoints={['100%']}
      topInset={0}
      handleComponent={handleComponent}
      backgroundComponent={backgroundComponent}
    >
      <BottomSheetScrollView showsVerticalScrollIndicator={false}>
        {/* Membership card with paperclip overlay. The card is the same
            visual as the onboarding membership-card; here it's read-only,
            re-using the existing component with editable=false. */}
        <View style={{ paddingHorizontal: 24, paddingTop: 15 }}>
          {/* Paperclip lives in handleComponent (above) so it isn't
              clipped by the handle/scroll z-layering. */}
          <MembershipCardView
            name={name}
            onChangeName={() => {}}
            nameEditable={false}
            showSignatureBox={false}
            hasSignature
          />
        </View>

        {/* AI balance row. Sparkle icon + label on the left, balance +
            Add pill on the right. Number is hard-coded to 150 in this
            slice; wire up to a real balance query when the endpoint is
            ready. */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 24,
            // 15px gap above (card → balance container), locked from Figma.
            paddingTop: 15,
            paddingBottom: 20,
            gap: 12,
          }}
        >
          {/* AI balance icon: star.png with a subtle drop-shadow only.
              Figma's "border: 2px solid white" was visually a no-op
              against the white sheet — applying it as an actual border
              produced a square frame around the star. Shadow alone gives
              the sticker effect the spec intended. */}
          <Image
            source={require('@/assets/star.png')}
            style={{
              width: 24,
              height: 24,
              shadowColor: '#000',
              shadowOffset: { width: 0.5, height: 1 },
              shadowOpacity: 0.4,
              shadowRadius: 1,
            }}
            resizeMode="contain"
          />
          <Text
            className="font-funnel font-normal flex-1"
            style={{ fontSize: 16, lineHeight: 22, letterSpacing: -0.16, color: '#000' }}
          >
            AI balance
          </Text>
          {/* Balance number deliberately KEEPS the larger weight/size to
              match Figma — the only piece of copy on this sheet that
              deviates from the 16/22 Funnel-normal pattern. */}
          {/* Balance: FunnelSans 700, 20/24, letter-spacing -1.5%
              (= 20 × -0.015 = -0.3). Locked from Figma. */}
          <Text
            className="font-funnel font-bold"
            style={{ fontSize: 20, lineHeight: 24, letterSpacing: -0.3, color: '#000' }}
          >
            {balance}
          </Text>
          <Pressable
            onPress={() => {
              // Dismiss first so the AI Balance screen pushes onto a
              // clean stack — without this the sheet stays on top and
              // the user has to manually close it after returning.
              sheetRef.current?.dismiss()
              router.push('/ai-balance')
            }}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              backgroundColor: '#000',
              paddingLeft: 12,
              paddingRight: 16,
              paddingVertical: 8,
              borderRadius: 999,
            }}
          >
            <Text style={{ color: '#fff', fontSize: 18, lineHeight: 18 }}>＋</Text>
            <Text
              className="font-funnel font-normal"
              style={{ color: '#fff', fontSize: 16, lineHeight: 22, letterSpacing: -0.16 }}
            >
              Add
            </Text>
          </Pressable>
        </View>

        {/* Action list. Each row: kebab-case Phosphor-style icon + label.
            Tapping is stubbed for now; handlers will be wired when the
            corresponding routes exist. */}
        <ActionRow
          icon={require('@/assets/user.png')}
          label="Update Data"
          onPress={() => updateDataRef.current?.present()}
        />
        <ActionRow icon={require('@/assets/signature.png')} label="Edit Signature" />
        <ActionRow
          icon={require('@/assets/book-open.png')}
          label="Subscription Plan"
          onPress={() => {
            sheetRef.current?.dismiss()
            router.push('/subscription')
          }}
        />
        <ActionRow icon={require('@/assets/key.png')} label="Change Password" />
        {isDevUser ? (
          <ActionRow
            icon={require('@/assets/key.png')}
            label="Reset onboarding (dev)"
            onPress={() => {
              sheetRef.current?.dismiss()
              // Clear MMKV onboarding flag AND all in-memory onboarding
              // atoms. Jotai's plain `atom` survives the dev reset because
              // it's not MMKV-backed; without an explicit clear, stale
              // values like the previous faceUri trick onboarding-3 into
              // skipping the avatar pipeline ("same photo, reuse session").
              resetOnboarding()
              resetAvatarJob()
              setCapturedFace(null)
              setCardName('')
              setSignaturePaths([])
              router.replace('/onboarding-1')
            }}
          />
        ) : null}
        <ActionRow
          icon={require('@/assets/sign-out.png')}
          label="Log Out"
          onPress={() => {
            sheetRef.current?.dismiss()
            logout()
          }}
        />
        {/* Closing divider line below the last row, matching the
            top-of-each-row dividers above. */}
        <View style={{ height: 1, backgroundColor: '#E5E5E5' }} />

        <View style={{ height: 40 }} />
      </BottomSheetScrollView>
      <UpdateDataSheet ref={updateDataRef} />
    </FlairSheet>
  )
})

ProfileSheet.displayName = 'ProfileSheet'

function ActionRow({
  icon,
  label,
  onPress,
}: {
  icon: number
  label: string
  onPress?: () => void
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
        paddingHorizontal: 24,
        // 15px from divider to row content (locked from Figma).
        paddingVertical: 15,
        borderTopWidth: 1,
        borderTopColor: '#E5E5E5',
      }}
    >
      <Image source={icon} style={{ width: 24, height: 24 }} resizeMode="contain" />
      <Text
        className="font-funnel font-normal"
        style={{ fontSize: 16, lineHeight: 22, letterSpacing: -0.16, color: '#000' }}
      >
        {label}
      </Text>
    </Pressable>
  )
}
