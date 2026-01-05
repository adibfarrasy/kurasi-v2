# Feature Documentation Index

This folder contains detailed Product Requirement Documents (PRDs) for each major feature of the Slow Fashion App.

## Features

### 1. **[Onboarding Flow](01-ONBOARDING.md)**
New user signup and setup experience. Includes authentication, platform introduction, biometric data collection, initial wardrobe upload, and style selection.

**Key sections:**
- Sign up / Auth flow
- Platform USP carousel (2-3 screens)
- Biometric data entry (height, weight, optional face photo)
- Starter wardrobe upload (5 items minimum)
- Style selection (5 style categories)
- Redirect to main app

**User flow:** Sign up → USPs → Biometrics → Wardrobe → Styles → Main app

---

### 2. **[Style Board](02-STYLE-BOARD.md)**
Curated, swipe-based inspiration discovery feed. Users "like" styles they resonate with, building a personal mood board. No user uploads (curated content only).

**Key sections:**
- Swipe interaction (like/skip cards)
- Search & filter by keyword
- Personal saved styles collection
- Community discovery (view other users' style boards)
- Engagement mechanics (trending, social proof)

**User flow:** Browse feed → Swipe/like → Save to board → View collection → Discover others' boards

---

### 3. **[Wardrobe Page](03-WARDROBE.md)**
Personal clothing inventory management. Users upload clothing items with photos; AI auto-fills tags (category, color). Users can edit, organize, and manage all their pieces.

**Key sections:**
- Grid/list view of all items
- Upload new item (camera/gallery)
- AI auto-tagging (category, color detection)
- Item detail view & editing
- Filter & search functionality
- Favorites management

**User flow:** View all items → Upload photo → AI pre-fills tags → Edit/confirm → Save → Browse/filter

---

### 4. **[Fit Page (Main App Homepage)](04-FIT-PAGE.md)**
The core "dress-up" experience. Users build outfits on a 3D/2D avatar (based on height, weight, face). Includes fit adjustment feature to account for individual garment variations (looser, longer, etc.).

**Key sections:**
- Avatar display (generated from biometrics)
- Piece selection (build outfit from wardrobe)
- **Fit Adjustment feature** (note how items actually fit: tighter, looser, longer, etc.)
- Outfit preview on avatar
- Outfit saving & library
- AI recommendations integration

**User flow:** View avatar → Select pieces → Preview outfit → Adjust fit → Save outfit OR Get recommendations

---

### 5. **[Social Share Mechanism](05-SOCIAL-SHARE.md)** (External Platforms)
Viral sharing to Instagram, Snapchat, TikTok, Twitter. Users create beautiful, branded social cards showcasing outfits, wardrobe collections, or style stats. Different from "Share to Feed" (internal public feed), this generates optimized cards for external platforms with trackable deep links.

**Key sections:**
- Three share types: Outfit card, Wardrobe showcase (by category/color/style), Style stats (Wardrobe Wrapped)
- Card customization (caption, colors, theme)
- Social platform integration (Instagram Stories, Snapchat, TikTok, Twitter, copy link)
- Auto-generated captions with hashtags
- Trackable deep links for referral tracking
- Share analytics dashboard

**User flow:** Create outfit/view wardrobe → Tap share → Choose share type → Customize card → Select platform → Share with trackable link

---

### 6. **Share to Feed** (Internal Discovery - Fit Page Feature)
Users can share their saved outfits to a public "Discover" feed within the app. This is integrated into the Outfit Library (in Fit Page) as a quick-share option.

**Key features:**
- Share saved fits to public Discover feed (future feature)
- Face anonymization options: Show full face, blur face, or block eyes
- Optional username display
- Like/save counter on shared fits
- "Try this on" CTA for other users to load outfit
- Can delete/unshare anytime

**User flow:** View saved outfit → Tap "Share to Feed" → Anonymize face (optional) → Confirm → Published to Discover feed

---

## Data Flow Across Features

```
Onboarding
  ├─ Captures: biometrics (height, weight, face)
  ├─ Captures: initial wardrobe items (5+)
  └─ Captures: style preferences
           ↓
         Avatar
      (Fit Page)
           ↓
    [User browses Style Board]
     [Adds to Style Board]
           ↓
    [User adds items]
    [Wardrobe Page]
           ↓
    [Wardrobe + Style Profile]
    [Feeds AI engine]
           ↓
    [Recommendations on Fit Page]
```

---

## MVP Feature Prioritization

**Phase 1 (MVP Launch):**
1. ✅ Onboarding (required for setup)
2. ✅ Wardrobe (core feature, manage items)
3. ✅ Fit Page (core experience, outfit building)
4. ✅ Basic Style Board (curated feed, no community yet)

**Phase 2 (Post-MVP Enhancements):**
- Advanced recommendations (outfit generation)
- Outfit sharing to social
- Community discovery (view others' boards)
- Fit adjustment refinements
- Advanced analytics / Wardrobe Wrapped

**Phase 3 (Long-term):**
- Brand partnerships / sponsored content
- Shopping integration
- Social profiles / followers
- Custom style collections

---

## Cross-Feature Integration Points

| Feature A | Feature B | Integration |
|-----------|-----------|-------------|
| Onboarding | Wardrobe | Initial items populate wardrobe |
| Onboarding | Fit Page | Avatar created from biometrics |
| Onboarding | Style Board | User's selected styles filter board feed |
| Style Board | Wardrobe | Liked styles inform AI tagging priorities |
| Wardrobe | Fit Page | Items available for outfit building |
| Fit Page | Recommendations | Avatar + wardrobe analyzed for suggestions |
| Fit Page | Social Share | Outfit cards generated and shared from Fit page |
| Wardrobe | Social Share | Wardrobe showcase cards generated from Wardrobe page |
| Social Share | Onboarding | Trackable links drive new user signup via referrals |

---

## File Structure

```
features/
├── README.md (this file)
├── 01-ONBOARDING.md
├── 02-STYLE-BOARD.md
├── 03-WARDROBE.md
├── 04-FIT-PAGE.md
└── 05-SOCIAL-SHARE.md
```

---

## Next Steps for Development

1. **Design phase:** Wireframe screens for each feature using these PRDs
2. **Technical spec:** Backend API design, database schema
3. **Mobile development:** Start with Onboarding → Wardrobe → Fit Page flow
4. **Integration:** Wire features together, test user flows
5. **Testing:** QA, user testing with early beta users
6. **Launch:** MVP with 4 core features

---

## Questions to Resolve Before Dev Starts

- [ ] Avatar rendering technology (2D illustrated vs. 3D vs. AI-generated)?
- [ ] Content moderation strategy for Style Board?
- [ ] Image optimization/CDN for photo uploads?
- [ ] Payment processor for trial → subscription flow?
- [ ] Analytics framework for tracking feature usage?
- [ ] Push notification strategy (if any)?
