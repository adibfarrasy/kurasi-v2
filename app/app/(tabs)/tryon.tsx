import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BlurView } from 'expo-blur'
import { useRouter } from 'expo-router'
import { useAtom } from 'jotai'
import { useEffect, useRef, useState } from 'react'
import { Image, Pressable, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  type AddItemSelections,
  AddItemSheet,
  type AddItemSheetHandle,
  AI_KEY,
} from '@/components/add-item-sheet'
import { HeroFloor } from '@/components/hero-floor'
import { SaveFitSheet, type SaveFitSheetHandle } from '@/components/save-fit-sheet'
import { type SlotEntry, SlotStrip } from '@/components/slot-strip'
import { BookmarkSimple, List, Sparkle } from '@/components/textured-icons'
import { ToneBackground } from '@/components/tone-background'
import { orpc } from '@/lib/orpc-client'
import { getOutfitTone, TONE_ACCENTS } from '@/lib/outfit-tone'
import { stealTheLookDraftAtom } from '@/state/steal-the-look'

type SlotKey = 'headwear' | 'shirt' | 'jacket' | 'pants' | 'footwear'

// Mapping from the app's slot vocabulary (category) to the outfit table's
// slot column names. Used when comparing the current Try On combination
// against the user's saved outfits.
const CATEGORY_TO_OUTFIT_KEY = {
  headwear: 'headwearId',
  shirt: 'baseId',
  jacket: 'outerId',
  pants: 'bottomId',
  footwear: 'footwearId',
} as const

const SLOT_DEFS: Array<{ key: SlotKey; label: string; category: SlotKey }> = [
  { key: 'headwear', label: 'HEADWEAR', category: 'headwear' },
  { key: 'shirt', label: 'SHIRT', category: 'shirt' },
  { key: 'jacket', label: 'JACKET', category: 'jacket' },
  { key: 'pants', label: 'PANTS', category: 'pants' },
  { key: 'footwear', label: 'SHOES', category: 'footwear' },
]

export default function TryOn() {
  const insets = useSafeAreaInsets()
  const tabBarHeight = useBottomTabBarHeight()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [draft, setDraft] = useAtom(stealTheLookDraftAtom)
  const addItemSheetRef = useRef<AddItemSheetHandle>(null)
  const saveFitSheetRef = useRef<SaveFitSheetHandle>(null)
  // Per-slot wardrobe overrides. Keyed by category. `AI_KEY` (or absent)
  // means the AI item from the draft is shown; otherwise the user picked a
  // wardrobe item to swap in. Local state — not persisted.
  const [overrides, setOverrides] = useState<Partial<Record<SlotKey, string>>>({})
  // Manual try-on selections — populated when the user reaches Try On
  // outside the steal-the-look flow and chooses items via the Add Item
  // sheet. Each entry is a wardrobe item id.
  const [manualSelections, setManualSelections] = useState<AddItemSelections>({})
  // Snapshots of the overrides / manualSelections that were "committed"
  // by the most recent Regenerate. While the live state matches these
  // snapshots there's nothing new to regenerate, so the bottom CTA is
  // "Save to My Fit". Diverging from them flips the CTA to "Regenerate
  // my fit"; tapping it re-snaps these snapshots after the dummy delay.
  const [committedOverrides, setCommittedOverrides] = useState<Partial<Record<SlotKey, string>>>({})
  const [committedManual, setCommittedManual] = useState<AddItemSelections>({})
  // Tracks the in-flight regenerate session. While set, we poll the
  // backend's `regenerateFit.progress` every 2s and show the
  // "Building your style…" UI; cleared on done/error.
  const [regenerateSessionId, setRegenerateSessionId] = useState<string | null>(null)
  // Latest hero image produced by a successful regenerate. Takes
  // precedence over draft.heroImageUrl so subsequent views render the
  // newly-built fit. Local state — survives until the user leaves the
  // tab; persisting across reloads can come later.
  const [regenHeroUrl, setRegenHeroUrl] = useState<string | null>(null)
  const regenerating = regenerateSessionId !== null

  const wardrobeQuery = useQuery(orpc.clothingItem.list.queryOptions({ input: {} }))
  const wardrobe = wardrobeQuery.data ?? []
  const outfitsQuery = useQuery(orpc.outfit.list.queryOptions())
  const savedOutfits = outfitsQuery.data ?? []

  // Resolve the current Try On combination to clothing_item ids per slot
  // column, matching the outfit table's shape. AI draft items don't live
  // in clothing_item so they resolve to null — meaning a draft with any
  // unsaved AI item can never match a saved outfit (and shouldn't, since
  // that combination hasn't been persisted yet).
  const currentSlotIds: Record<(typeof CATEGORY_TO_OUTFIT_KEY)[SlotKey], string | null> = {
    headwearId: null,
    baseId: null,
    outerId: null,
    bottomId: null,
    footwearId: null,
  }
  let hasAnyResolvedSlot = false
  let hasUnresolvedAiSlot = false
  for (const def of SLOT_DEFS) {
    const overrideId = overrides[def.key]
    if (overrideId && overrideId !== AI_KEY) {
      currentSlotIds[CATEGORY_TO_OUTFIT_KEY[def.category]] = overrideId
      hasAnyResolvedSlot = true
      continue
    }
    const manualId = manualSelections[def.category]
    if (manualId) {
      currentSlotIds[CATEGORY_TO_OUTFIT_KEY[def.category]] = manualId
      hasAnyResolvedSlot = true
      continue
    }
    // No override / manual → check whether an AI draft item is filling
    // this slot. If so, the slot is occupied by a non-saveable item and
    // the combination can't match any saved outfit.
    const draftItem = draft?.items.find((i) => i.category === def.category)
    if (draftItem) hasUnresolvedAiSlot = true
  }

  const matchedOutfit =
    hasAnyResolvedSlot && !hasUnresolvedAiSlot
      ? (savedOutfits.find(
          (o) =>
            o.headwearId === currentSlotIds.headwearId &&
            o.baseId === currentSlotIds.baseId &&
            o.outerId === currentSlotIds.outerId &&
            o.bottomId === currentSlotIds.bottomId &&
            o.footwearId === currentSlotIds.footwearId,
        ) ?? null)
      : null

  const heroSource = matchedOutfit?.heroImageUrl
    ? { uri: matchedOutfit.heroImageUrl }
    : regenHeroUrl
      ? { uri: regenHeroUrl }
      : draft?.heroImageUrl
        ? { uri: draft.heroImageUrl }
        : require('@/assets/default-man.png')

  // Page tone shifts off neutral once we're actually rendering a
  // composited avatar — either because the current slots already match
  // a saved outfit OR because the user just regenerated this session.
  // While slots are still being edited (no render yet), stay neutral so
  // tone changes track real renders, not transient picks.
  const showsRenderedAvatar = !!matchedOutfit || !!regenHeroUrl
  const tone = showsRenderedAvatar
    ? getOutfitTone(
        SLOT_DEFS.flatMap((def) => {
          // Resolve each slot to a clothing_item (wardrobe override or
          // manual pick) or AI draft item, then read its first color.
          const overrideId = overrides[def.key]
          const overrideItem =
            overrideId && overrideId !== AI_KEY ? wardrobe.find((w) => w.id === overrideId) : null
          const manualId = manualSelections[def.category]
          const manualItem = manualId ? wardrobe.find((w) => w.id === manualId) : null
          const wardrobeItem = overrideItem ?? manualItem
          if (wardrobeItem) {
            const c = wardrobeItem.colors[0]?.name
            return c ? [c] : []
          }
          const aiItem = draft?.items.find((i) => i.category === def.category)
          const c = aiItem?.colors[0]?.name
          return c ? [c] : []
        }),
      )
    : 'neutral'

  // Build the per-category AI items map for the unified edit sheet.
  // Steal-the-look-flow draft items become the "AI generated" section
  // in each category's tab.
  const aiItemsByCategory: Partial<
    Record<SlotKey, { imageUrl: string; title: string; colors: { hex: string; ratio: number }[] }>
  > = {}
  if (draft) {
    for (const it of draft.items) {
      aiItemsByCategory[it.category as SlotKey] = {
        imageUrl: it.imageUrl,
        title: it.title,
        colors: it.colors,
      }
    }
  }

  // Open the edit/add sheet pre-set to a category. Selections come from
  // overrides (AI flow) and manualSelections (manual flow). On Done, we
  // diff and write back to whichever map owns each category.
  function presentEditSheet(initialCategory: SlotKey) {
    // Merge current state into a single selections map. Override > manual.
    const initial: AddItemSelections = {}
    for (const def of SLOT_DEFS) {
      const ov = overrides[def.key]
      const mn = manualSelections[def.category]
      if (ov) initial[def.category] = ov
      else if (mn) initial[def.category] = mn
    }
    addItemSheetRef.current?.present({
      initial,
      aiItems: draft ? aiItemsByCategory : undefined,
      initialActiveCategory: initialCategory,
      onConfirm: (sel) => {
        if (draft) {
          // Steal-the-look flow: the sheet's selection per category is
          // either AI_KEY (use AI item) or a wardrobe item id (override).
          const nextOverrides: Partial<Record<SlotKey, string>> = {}
          for (const def of SLOT_DEFS) {
            const v = sel[def.category]
            if (v) nextOverrides[def.key] = v
          }
          setOverrides(nextOverrides)
        } else {
          // Manual flow: selections directly become manualSelections.
          setManualSelections(sel)
        }
      },
    })
  }

  const slots: SlotEntry[] = SLOT_DEFS.map((def) => {
    const aiItem = draft?.items.find((i) => i.category === def.category) ?? null
    const overrideId = overrides[def.key]
    const overrideItem =
      overrideId && overrideId !== AI_KEY ? wardrobe.find((w) => w.id === overrideId) : null
    // For manual flow: when there's no AI draft, use the user's manual
    // pick from the Add Item sheet.
    const manualId = manualSelections[def.category]
    const manualItem = manualId ? wardrobe.find((w) => w.id === manualId) : null
    const display = overrideItem ?? aiItem ?? manualItem
    // Steal-the-look draft items don't live in clothingItem, so they
    // don't have an `owned` flag — but they're always AI-generated.
    // Wardrobe rows expose `owned`; surface the diamond when it's false.
    const aiGenerated =
      display != null &&
      (display === aiItem || ('owned' in display && display.owned === false))
    return {
      key: def.key,
      label: def.label,
      item: display
        ? {
            id: display.id,
            imageUrl: display.imageUrl,
            brand: display.brand,
            changed:
              (overrides[def.key] ?? null) !== (committedOverrides[def.key] ?? null) ||
              (manualSelections[def.category] ?? null) !== (committedManual[def.category] ?? null),
            aiGenerated,
          }
        : null,
      // Both the slot card and the + Add Item card open the same sheet
      // now (AddItemSheet). The sheet's tabs are tappable so the user
      // can edit any category from a single sheet visit; we just pass
      // `initialActiveCategory` so it opens on the tapped slot.
      onPress: regenerating
        ? undefined
        : aiItem || manualItem
          ? () => presentEditSheet(def.category)
          : undefined,
    }
  }).filter((s) => s.item !== null)

  const hasChanges = slots.some((s) => s.item?.changed)

  // ─── Regenerate flow ──────────────────────────────────────────────────
  // start kicks off the dress-avatar pipeline server-side and returns a
  // sessionId. We poll progress every 2s; on done, swap heroSource and
  // commit the user's selections so the CTA flips back to "Save".
  const startRegenerate = useMutation(orpc.regenerateFit.start.mutationOptions())
  const saveOutfit = useMutation(orpc.outfit.saveFromTryOn.mutationOptions())
  const progressQuery = useQuery({
    ...orpc.regenerateFit.progress.queryOptions({
      input: { sessionId: regenerateSessionId ?? '' },
    }),
    enabled: regenerateSessionId !== null,
    refetchInterval: 2000,
  })

  useEffect(() => {
    const p = progressQuery.data
    if (!p) return
    // Only act on the response while a session is still open. Otherwise
    // the cached `phase: 'done'` re-fires this effect every time
    // overrides or manualSelections change, which silently commits the
    // user's new picks and hides the "changed" red dot.
    if (regenerateSessionId === null) return
    if (p.phase === 'done') {
      setRegenHeroUrl(p.resultUrl)
      setCommittedOverrides(overrides)
      setCommittedManual(manualSelections)
      setRegenerateSessionId(null)
    } else if (p.phase === 'error') {
      console.warn('[regenerate] error:', p.message)
      setRegenerateSessionId(null)
    }
  }, [progressQuery.data, overrides, manualSelections, regenerateSessionId])

  function startRegenerateForCurrentSlots() {
    const itemsForRegen = slots
      .map((s) => {
        const def = SLOT_DEFS.find((d) => d.key === s.key)
        if (!def || !s.item) return null
        // Resolve the source object the slot is currently displaying so we
        // can forward its fit + length metadata to the pipeline:
        //   - wardrobe override (slot picker swap)
        //   - manual selection (Add Item flow, no AI draft)
        //   - AI draft item (steal-the-look)
        const overrideId = overrides[def.key]
        const overrideItem =
          overrideId && overrideId !== AI_KEY ? wardrobe.find((w) => w.id === overrideId) : null
        const manualId = manualSelections[def.category]
        const manualItem = manualId ? wardrobe.find((w) => w.id === manualId) : null
        const aiItem = draft?.items.find((i) => i.category === def.category) ?? null
        const source = overrideItem ?? manualItem ?? aiItem
        return {
          category: def.category,
          imageUrl: s.item.imageUrl,
          fit: source && 'fit' in source ? (source.fit ?? null) : null,
          length: source && 'length' in source ? (source.length ?? null) : null,
        }
      })
      .filter((x) => x !== null)
    if (itemsForRegen.length === 0) return
    startRegenerate.mutate(
      { items: itemsForRegen },
      {
        onSuccess: ({ sessionId }) => {
          setRegenerateSessionId(sessionId)
        },
        onError: (err) => {
          console.warn('[regenerate] start failed:', err)
        },
      },
    )
  }

  return (
    <ToneBackground tone={tone}>
      <View style={{ flex: 1, overflow: 'visible', paddingBottom: tabBarHeight }}>
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: insets.top,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 20,
            height: 48,
          }}
        >
          <View style={{ width: 24 }} />
          {tone === 'neutral' ? (
            <Image
              source={require('@/assets/logomark-dark.png')}
              style={{ width: 104, height: 40, borderRadius: 4 }}
              resizeMode="contain"
            />
          ) : (
            <Image
              source={require('@/assets/logomark.png')}
              style={{ width: 104, height: 40, borderRadius: 4, tintColor: 'white' }}
              resizeMode="contain"
            />
          )}
          <Pressable>
            <List width={24} height={24} color={tone === 'neutral' ? '#000' : 'white'} />
          </Pressable>
        </View>

        <HeroFloor source={heroSource} topOffset={insets.top + 8} maxHeight={520} />

        {regenerating ? (
          <BlurView
            intensity={40}
            tint="default"
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              // Cover from the very top of the screen down through the
              // entire avatar area. Anchoring at insets.top + 8 left a
              // visible gap where the figure's head poked above the
              // blur (the absolute reference frame plus minor SafeArea
              // wrapper offsets pushed the BlurView lower than the
              // figure's actual top).
              top: 0,
              height: insets.top + 8 + 520,
            }}
          />
        ) : null}

        {regenerating ? (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              // Vertically centered on the avatar (520pt tall, anchored at
              // insets.top + 8). 260 ≈ half the avatar frame.
              left: 0,
              right: 0,
              top: insets.top + 8 + 260,
              alignItems: 'center',
              paddingHorizontal: 40,
            }}
          >
            <Text
              style={{
                textShadowColor: '#fff',
                textShadowOffset: { width: 0, height: 0 },
                textShadowRadius: 10,
              }}
              className="font-funnel font-normal text-[12px] leading-[16px] tracking-[0.06px] text-center text-[#666666]"
            >
              While AI is generating the image, you can safely browse another page.
            </Text>
          </View>
        ) : null}

        <SlotStrip
          // Hide the + Add Item card entirely in the steal-the-look flow:
          // the user already has a draft of AI items and the picker
          // already covers per-slot edits.
          onAdd={draft ? undefined : () => presentEditSheet('headwear')}
          // Greyed out (no onPress) while the regenerate pipeline is
          // running so the user can't queue a second build mid-flight.
          addDisabled={regenerating}
          slots={slots}
        />

        <View
          style={{
            paddingLeft: 20,
            paddingRight: 20,
            paddingBottom: 11,
            gap: 12,
            justifyContent: 'flex-start',
          }}
        >
          {slots.length === 0 ? null : regenerating ? (
            <View
              style={{
                height: 40,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
              }}
            >
              <Sparkle width={18} height={18} color="#000" />
              <Text className="font-funnel font-normal text-[16px] leading-[22px] tracking-[-0.16px] text-black">
                Building your style...
              </Text>
            </View>
          ) : matchedOutfit ? (
            // Current combination is already saved. Replace the Regenerate /
            // Save CTA with a passive "✓ My Fit • {name}" indicator tinted
            // to the page tone.
            <View
              style={{
                height: 40,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              <Image
                source={require('@/assets/check.png')}
                style={{
                  width: 16,
                  height: 16,
                  tintColor: TONE_ACCENTS[tone],
                }}
                resizeMode="contain"
              />
              <Text className="font-funnel text-[14px] leading-[18px]">
                <Text style={{ color: TONE_ACCENTS[tone] }}>My Fit • </Text>
                <Text className="text-black">{matchedOutfit.name ?? 'Untitled'}</Text>
              </Text>
            </View>
          ) : (
            <Pressable
              onPress={() => {
                if (hasChanges) {
                  startRegenerateForCurrentSlots()
                  return
                }
                saveFitSheetRef.current?.present({
                  onConfirm: (name) => {
                    // Resolve every visible slot to either a wardrobe id
                    // (real clothing_item) or an AI item payload (server
                    // promotes it to clothing_item with owned=false). The
                    // server then writes a single outfit row referencing
                    // the resolved ids plus the rendered hero.
                    const slotsPayload = slots
                      .map((s) => {
                        const def = SLOT_DEFS.find((d) => d.key === s.key)
                        if (!def || !s.item) return null
                        const overrideId = overrides[def.key]
                        const overrideItem =
                          overrideId && overrideId !== AI_KEY
                            ? wardrobe.find((w) => w.id === overrideId)
                            : null
                        const manualId = manualSelections[def.category]
                        const manualItem = manualId ? wardrobe.find((w) => w.id === manualId) : null
                        const aiItem = draft?.items.find((i) => i.category === def.category) ?? null
                        const wardrobeItem = overrideItem ?? manualItem
                        if (wardrobeItem) {
                          return {
                            category: def.category,
                            wardrobeId: wardrobeItem.id,
                          } as const
                        }
                        if (aiItem) {
                          return {
                            category: def.category,
                            aiItem: {
                              imageUrl: aiItem.imageUrl,
                              category: aiItem.category,
                              brand: aiItem.brand,
                              fit: aiItem.fit,
                              length: aiItem.length,
                              colors: aiItem.colors,
                            },
                          } as const
                        }
                        return null
                      })
                      .filter((x) => x !== null)
                    if (slotsPayload.length === 0) return
                    saveOutfit.mutate(
                      {
                        name: name || null,
                        // Persist the rendered avatar so My Fit can show it
                        // on the saved outfit card. Falls back to the
                        // steal-the-look hero if regenerate wasn't run.
                        heroImageUrl: regenHeroUrl ?? draft?.heroImageUrl ?? null,
                        slots: slotsPayload,
                      },
                      {
                        onSuccess: () => {
                          // Dismiss the save sheet now that the mutation has
                          // landed. Doing this in the sheet's button handler
                          // races with the keyboard close and can leave the
                          // sheet half-presented.
                          saveFitSheetRef.current?.dismiss()
                          // Belt-and-braces: if AddItemSheet was opened
                          // earlier in the session and dismissed via pan
                          // / backdrop (instead of the Done button),
                          // gorhom can leave it in an "in-between" state
                          // that our post-save setState burst flips back
                          // to presented. Force-dismiss it here regardless.
                          addItemSheetRef.current?.dismiss()
                          // Invalidate so the My Fit tab refetches and shows
                          // the new outfit. Also invalidate the wardrobe list
                          // since AI items get promoted to clothing_item.
                          queryClient.invalidateQueries({
                            queryKey: orpc.outfit.list.queryKey(),
                          })
                          queryClient.invalidateQueries({
                            queryKey: orpc.clothingItem.list.queryKey({ input: {} }),
                          })
                          // The draft+dismissAll is only meaningful when
                          // the user reached Try On by pushing from the
                          // steal-the-look flow. In the manual-tab flow
                          // there's no stack to pop, so dismissAll throws
                          // POP_TO_TOP. Just clear local state in that case.
                          if (draft) {
                            setDraft(null)
                            router.dismissAll()
                          } else {
                            setManualSelections({})
                            setCommittedManual({})
                            setOverrides({})
                            setCommittedOverrides({})
                            setRegenHeroUrl(null)
                          }
                        },
                        onError: (err) => {
                          console.warn('[saveFromTryOn] failed:', err)
                        },
                      },
                    )
                  },
                })
              }}
              style={{
                height: 40,
                paddingHorizontal: 4,
                borderRadius: 99,
                backgroundColor: '#fff',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                gap: 10,
              }}
            >
              {hasChanges ? (
                <Sparkle width={18} height={18} color="#000" />
              ) : (
                <BookmarkSimple width={18} height={18} color="#000" />
              )}
              <Text className="font-funnel font-normal text-[14px] leading-[18px] text-black">
                {hasChanges ? 'Regenerate my fit' : 'Save to My Fit'}
              </Text>
            </Pressable>
          )}
        </View>
      </View>
      <AddItemSheet ref={addItemSheetRef} />
      <SaveFitSheet ref={saveFitSheetRef} />
    </ToneBackground>
  )
}
