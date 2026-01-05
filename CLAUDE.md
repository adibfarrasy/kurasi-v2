# Slow Fashion App - Requirements & Vision

## 1. Core Concept
A personal wardrobe management and style discovery platform that helps fashion enthusiasts:
- Build intentional, cohesive wardrobes aligned with their personal style vision
- Discover pieces that work with their existing wardrobe
- Develop and refine their signature style through data-driven insights

**Target Audience:** Fashion enthusiasts & collectors who care about curating intentional wardrobes

---

## 2. User Journey & Onboarding

### Initial Setup (First-Time Experience)
Users go through a guided onboarding flow to establish their style foundation:

1. **Visual Preference Capture** - Users upload 3-5 photos of:
   - Pieces they already own and love
   - Outfits they feel confident in
   - Any items that represent their style

2. **Style Reference** - Users select from predefined style categories OR upload custom moodboards:
   - Predefined options: Streetwear, Oversize, Minimalist, Smart Casual, etc.
   - Custom: Upload own Pinterest boards, mood images, style references
   - Multiple selections allowed (users can be multi-style)

3. **Semantic Foundation** - System analyzes:
   - Visual patterns from uploaded pieces (colors, silhouettes, textures)
   - Style semantics from moodboard selections
   - Creates a "style profile" that drives all future recommendations

---

## 3. Core Features

### 3.1 Wardrobe Inventory
**What users track:**
- **Photos** - Clear images of each item (front, detail views)
- **Metadata** - Color, size, material, brand, category (top/bottom/outerwear/etc)
- **Optional fields** - Price paid, purchase date, source, care notes

**Functionality:**
- Add items manually (photo upload + info)
- Browse/search/filter their entire wardrobe
- Organize by category, color, material, brand
- Mark items as favorites or seasonal (available/archived)

### 3.2 Outfit Tracking & History
**Functionality:**
- Create outfits by combining pieces from their wardrobe
- Save outfit combinations with photos
- Tag outfits (occasion: casual, work, date night, gym, etc.)
- View outfit history to see what they've worn
- Rate outfits (loved it, okay, didn't work)

**Why it matters:** Outfit history becomes training data for personalized recommendations

### 3.3 AI-Powered Recommendations
**Three recommendation types:**

#### A) Gap-Filling Recommendations
- System identifies missing pieces that would complement existing wardrobe
- Based on: gaps in color palette, missing silhouettes, underutilized pieces
- Example: "You have 4 jackets but only 2 pairs of neutral bottoms - consider adding..."

#### B) Outfit Generation
- Suggests new outfit combinations from existing pieces
- Learns from saved outfit history (what the user tends to pair)
- Helps discover pieces already in closet in new ways
- Example: "You've worn this shirt with X and Y, but it would also pair great with Z"

#### C) (Future/Premium) Trend Alignment
- What's trending in their identified style categories
- Suggests pieces that match their aesthetic + current trends
- Optional: links to brands/retailers (if integrated)

**Recommendation Engine Logic:**
- Uses visual semantics from onboarding photos (colors, silhouettes, textures)
- Weighted by style profile (streetwear vs minimalist = different recommendations)
- Learns from outfit ratings and history
- Continuously improves as user adds items and rates outfits

---

## 4. Monetization & Premium Features

### Trial Period (7 Days)
- **Full access to everything** for first 7 days
- All features unlocked: wardrobe inventory, outfit creation, AI recommendations, social sharing, everything
- No limits, no restrictions

### After 7-Day Trial
- **Options:**
  1. **Subscribe (Monthly)** - Continue using all features for monthly fee
  2. **Stop using** - App becomes inaccessible after trial expires without payment

**Pricing Model:** Monthly subscription after 7-day free trial (users pay or lose access)

---

## 5. Brand Partnerships & Sponsorship
- Partner brands can integrate with the platform (optional, premium feature)
- Brands matching user's style get recommended in premium tier
- Commission: % of referred purchases or flat sponsorship fees
- Example: A minimalist brand partners and gets recommended to minimalist-style users

---

## 6. User Flows to Refine

### 6.1 Social Sharing & Virality
**Strategy:** Like Strava/Nike Run Club, make wardrobe sharing a viral growth driver

**Share Requirements:**
- Minimum 5-10 items in wardrobe to unlock sharing
- Can share individual outfits or entire wardrobe showcases

**Shareable Content Formats:**
1. **Full outfit photo simulation** - AI generates or mockup of how outfit looks when worn
2. **Visual outfit grid/collage** - Neat grid layout showing all pieces (effective for collection flexing)
3. **Wardrobe showcase (multiple modes):**
   - By category (e.g., "All My Shirts")
   - By color (e.g., "All My Blues")
   - By style (organized by their aesthetic vibe)
   - Entire wardrobe grid (all items in one view)
4. **Outfit card** - Digital card format with outfit photo + style tags

**Social Integration:**
- One-click share to Instagram, TikTok, Twitter/X
- Auto-generated captions with style tags and hashtags
- Trackable links back to app (for acquisition)
- Pre-filled share copy optimized for each platform

**Engagement Driver: Shareable Stats (Wardrobe Wrapped)**
- Annual or custom-period style stats (like Spotify Wrapped)
  - # of outfits created
  - Most-worn pieces / pieces worn together
  - Style consistency score
  - Color/category breakdown
  - Fashion preferences analysis
- Users love sharing quantified self metrics
- Example: "I created 47 unique outfits from 62 pieces this year"

**Viral Mechanics:**
- Encourage collection counting and sharing
- Outfit grid sharing is particularly shareable (collection flex)
- Monthly themed challenges (optional, future)
- Hashtag tracking for discoverability (#MySlowFashion)

### 6.2 No Shopping Integration (Pure Wardrobe Management)
- App stays focused on wardrobe management, not e-commerce
- Recommendations stay internal (gap-filling, outfit generation)
- No marketplace or external shopping links
- Cleaner user experience, faster MVP

### 6.3 Platform Strategy: Mobile-First
- **Primary launch:** iOS/Android native app
- **Rationale:** Easy photo uploading, on-the-go wardrobe access, seamless social sharing
- **Future:** Can add web version for wardrobe management/admin

### 6.4 Pure Style Management (No Sustainability Tracking)
- Focus entirely on style curation and discovery
- No condition tracking or lifecycle logging
- Keeps MVP scope tight and UX simple
- Users manage their wardrobe for style, not durability metrics

### 6.5 Recommendation Engine Prioritization
**The algorithm prioritizes suggestions by:**
1. **Silhouette & Proportions** - Suggest pieces with complementary cuts/fits
   - If user wears oversized tops, recommend fitted bottoms (balance)
   - If user wears structured pieces, suggest how to balance with flow
2. **Style Match (Moodboard)** - Pieces that align with their identified aesthetic
   - A minimalist user gets minimal recommendations
   - A streetwear user gets pieces with streetwear vibe

**Note:** Color theory is secondary to silhouette + style match in v1

**Recommendation Availability:**
- **Minimum threshold:** Users need 5-10 items in their wardrobe before recommendations activate
- **Refresh rate:** On-demand (user taps "Get recommendations" button)
  - Not daily notifications (keeps it focused, not spammy)
  - User controls when they explore suggestions

---

## 6.6 Additional Feature Details

### Outfit Creation Flow
- Users can create outfits by selecting pieces from their wardrobe
- Save outfit with optional name/description
- Assign tags (occasion: casual, work, date; season; vibe)
- Rate outfit (loved, okay, didn't work) - improves recommendations
- Option to take/upload a full outfit photo (optional)

### Recommendation Responses
- Users can like/save recommendations or dismiss them
- Feedback helps algorithm learn over time
- "I like this" = suggest similar pieces
- "Not for me" = adjust future recommendations

### Wardrobe Organization
- Browse by category (tops, bottoms, outerwear, accessories, etc.)
- Filter by color, material, brand
- Search by name/tags
- Favorite items for quick access
- Archive items (seasonal or no longer worn)

---

## 7. Infrastructure & Data Requirements

### Authentication & Accounts
- **Required:** Users must create account to use app
- **Why:** Enables premium subscriptions, cloud sync, social sharing, recommendations
- **Methods:** Email/password, Google OAuth, Apple ID signup
- **Privacy:** User wardrobe data is private by default (not visible to other users unless explicitly shared)

### Data Sync
- **Cloud synchronization:** Wardrobe data syncs across all user devices
- **Enabled by:** Account requirement
- **Use case:** User takes photo on phone, can access wardrobe on tablet, recommendations everywhere
- **Offline support:** Can view cached wardrobe offline, sync when reconnected

### Data Privacy
- User can export their data (privacy compliance)
- User can delete account (all data removed)
- No third-party ad tracking of wardrobe (keep it private)

---

## 8. Non-Functional Requirements (To Consider)
- **Performance:** Fast image uploads and wardrobe loading
- **Privacy:** User wardrobe data should be private by default
- **Accessibility:** Mobile-friendly, easy photo uploading
- **Data:** High-quality image processing for visual recommendation accuracy
- **Scalability:** If successful, handle growth in users and recommendation compute

---

## 9. Success Metrics (KPIs)
- **Retention:** % of users returning weekly/monthly
- **Conversion:** % of free users → premium subscribers
- **Engagement:**
  - Avg # of outfits created per user
  - Recommendation ratings/saves
  - Avg items added per user
- **Viral growth:**
  - # of shares per user
  - Click-through rate on shared links
  - New user acquisition from shares
- **Recommendation quality:** % of recommendations user likes/saves

---

## 10. MVP Scope (Phase 1)

**Must Have:**
1. User onboarding (style profile + mood images)
2. Wardrobe inventory management (add, browse, organize items)
3. Outfit creation & saving
4. Gap-filling recommendations (with 5+ items minimum)
5. Cloud sync & authentication
6. Share outfits & wardrobe showcases (to social media)
7. Shareable stats (basic wardrobe analytics)
8. 7-day trial → monthly subscription paywall
9. Payment processing & subscription management

**Nice to Have (Post-MVP):**
- Outfit generation recommendations
- Advanced analytics dashboard
- Trend alignment recommendations
- Brand partnerships/sponsored content
- Monthly challenges
- Wardrobe Wrapped (annual stats)
- Community features (future exploration)

---

## 11. Competitive Advantages & Differentiation

**Why this works:**
1. **Focused scope** - Pure wardrobe curation, not resale/shopping (faster to build, clearer UX)
2. **Social virality** - Built-in sharing mechanics (collection flexing is viral-worthy)
3. **AI-powered** - Smart recommendations based on visual + style semantics
4. **Style-first** - For fashion enthusiasts, not budget shoppers (higher willingness to pay)
5. **Quantified self** - Shareable stats (Wardrobe Wrapped) drives engagement and word-of-mouth

**Similar to:** Strava (social sharing) + Spotify (analytics) + Outfit planning apps, but focused on personal style discovery + viral sharing

---

## 12. Next Steps for Development Team

1. **Design phase:** Wireframe onboarding, wardrobe browse, outfit creation, share screens
2. **Tech stack selection:** Decide iOS native vs React Native vs Flutter for mobile
3. **Backend architecture:** Database schema, cloud sync, recommendation engine skeleton
4. **ML/Vision strategy:** How to process images for visual semantics and recommendations
5. **Social integration:** OAuth for sharing to Instagram, TikTok, Twitter
6. **Subscription implementation:** 7-day trial flow, payment processing (Apple In-App Purchase, Google Play Billing), paywall, subscription management

---

## 13. Development Workflow & GitHub CLI Best Practices

To maintain code quality and streamline development, follow these GitHub CLI and Git best practices:

### 13.1 Authentication & Setup

**Initial Setup:**
```bash
gh auth login --git-protocol ssh
# Recommended: Use SSH for better security and convenience
```

**For CI/CD and Automation:**
- Use environment variable `GH_TOKEN` with a Personal Access Token
- Tokens should have minimal required scopes (principle of least privilege)
- Rotate tokens regularly and never commit them

### 13.2 Repository Synchronization Workflow

**Always follow this sequence before pushing:**

1. **Fetch latest changes from remote**
   ```bash
   git fetch origin
   ```

2. **Review changes before integrating**
   ```bash
   git log origin/main  # Review commits
   git diff origin/main # Review code changes
   ```

3. **Pull changes into your branch**
   ```bash
   git pull origin main
   # Equivalent to: git fetch + git merge
   ```

4. **Resolve conflicts if they occur**
   - Look for conflict markers: `<<<<<<<`, `=======`, `>>>>>>>`
   - Manually edit files to resolve
   - Test thoroughly after conflict resolution

5. **Push your changes**
   ```bash
   git push origin <branch-name>
   ```

**Key Principle:** Always fetch before push to avoid rejections and reduce conflict risk.

### 13.3 Issue-Based Development

**Recommended workflow for feature development:**

```bash
# Create feature branch from issue (single command)
gh issue develop -c <issue-number>
# This automatically creates a branch named after the issue

# Make your changes and commit
git add .
git commit -m "Fixes #<issue-number>: Description"

# Create PR with auto-filled details
gh pr create --fill
# PR automatically links to issue, creates seamless workflow
```

### 13.4 Pull Request Best Practices

**Creating PRs:**
- Use `gh pr create --fill` when commit messages are descriptive
- Use `gh pr create --draft` for work-in-progress
- Use `gh pr create -w` for complex configurations (opens browser)

**Before Merging:**
- Checkout PR locally to test: `gh pr checkout <pr-number>`
- Ensure all CI/CD checks pass
- Require at least one review before merge

**Merging:**
```bash
# Interactive merge (allows method selection: squash, rebase, merge commit)
gh pr merge <pr-number>

# With automatic branch deletion
gh pr merge <pr-number> --delete-branch
```

### 13.5 Essential GitHub CLI Commands

**Repository Operations:**
```bash
gh repo create <name>           # Create new repository
gh repo clone <owner>/<repo>    # Clone with fork support
gh repo view                    # Show current repo info
gh browse                       # Open repo in browser
gh browse path/to/file:42       # Open file at specific line
```

**Issue Management:**
```bash
gh issue list                   # List open issues
gh issue view <number>          # View issue details
gh issue develop -c <num>       # Create branch from issue
gh issue close <num>            # Close an issue
```

**Pull Request Operations:**
```bash
gh pr list                      # List all PRs
gh pr view <number>             # View PR details
gh pr checkout <number>         # Checkout PR locally
gh pr create                    # Create new PR
gh pr merge <number>            # Merge PR
gh pr diff <number>             # View PR diff
```

**Workflow & CI/CD:**
```bash
gh workflow list                # List all workflows
gh workflow run <name>          # Trigger workflow manually
gh run list                     # List recent workflow runs
gh run watch <run-id>           # Watch run progress in terminal
```

### 13.6 Branching Strategy

**Branch Naming Convention:**
- Feature: `feature/<issue-number>-description` (e.g., `feature/42-onboarding-flow`)
- Bug fix: `fix/<issue-number>-description` (e.g., `fix/105-auth-token-expiry`)
- Documentation: `docs/<description>` (e.g., `docs/api-endpoints`)

**Main Branches:**
- `main` - Production-ready code, all releases cut from here
- `develop` - Integration branch for features (optional, depends on workflow)

### 13.7 Commit Message Best Practices

**Write descriptive commits for better `gh pr create --fill` functionality:**

Format:
```
<type>(<scope>): <subject>

<body>

Fixes #<issue-number>
```

Examples:
```
feat(onboarding): add biometric data entry form

Implements height, weight, and optional face photo capture.
Validates input ranges and provides user-friendly error messages.

Fixes #42
```

```
fix(auth): resolve token expiration handling

Store token refresh time and check before API calls.
Add retry mechanism for expired token scenarios.

Fixes #105
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

### 13.8 Efficient Workflow Tips

1. **Reduce Context Switching** - Stay in terminal, minimize browser usage
   - Use `gh browse` instead of manually navigating to GitHub.com
   - Use `gh run watch` instead of refreshing web UI

2. **Automate Repetitive Tasks**
   - Create Makefile targets for common workflows
   - Example: `make pr-create` → `gh pr create --fill`

3. **Chain Commands**
   ```bash
   gh issue develop -c 42 && git add . && git commit -m "Progress" && gh pr create --fill
   ```

4. **Use Environment Variables**
   ```bash
   export GH_REPO=ryanditjia/still-unnamed
   # Now gh commands default to this repo
   ```

5. **Monitor CI/CD in Terminal**
   ```bash
   gh run watch --exit-status
   # Exits with non-zero if checks fail
   # Useful for build pipelines
   ```

### 13.9 Security Reminders

- ✅ Use SSH protocol for better security
- ✅ Never commit API keys, tokens, or secrets
- ✅ Use `.gitignore` for sensitive files
- ✅ Rotate Personal Access Tokens regularly
- ✅ Require branch protection rules (code review, status checks)
- ✅ Sign commits when possible: `git commit -S`

### 13.10 Troubleshooting Common Issues

**"rejected...need to fetch first"**
```bash
git fetch origin
git pull origin <branch>
git push origin <branch>
```

**"untracked working tree files would be overwritten"**
```bash
git clean -fd          # Remove untracked files
git reset --hard HEAD  # Discard all changes (use carefully)
```

**"divergent branches"**
```bash
git pull origin main --rebase  # Rebase instead of merge
```

**"Permission denied (publickey)"** (SSH issue)
```bash
ssh -T git@github.com   # Test SSH connection
gh auth refresh -h ssh  # Refresh SSH credentials
```

---

**Remember:** Good git hygiene prevents most problems. Fetch early, commit often, and push frequently.

### 13.11 Using GitHub CLI Across Multiple Repositories

GitHub CLI is now installed and authenticated globally. You have access to all your repositories.

**Using gh across all repos:**

1. **No need to cd into repo directory** - Use `-R` flag to specify repo
   ```bash
   gh issue list -R mhfawwazy/reverse-souls
   gh pr create -R ryanditjia/still-unnamed
   gh issue view 10 -R mhfawwazy/dieter-mams
   ```

2. **Set default repo to reduce typing**
   ```bash
   gh repo set-default ryanditjia/still-unnamed
   # Now all gh commands default to this repo
   gh issue list                    # Lists issues in still-unnamed
   gh pr create                     # Creates PR in still-unnamed
   ```

3. **Switch between repos easily**
   ```bash
   gh repo set-default mhfawwazy/reverse-souls
   gh issue list                    # Now lists issues in reverse-souls
   ```

4. **Access repos without setting default**
   ```bash
   gh repo view ryanditjia/still-unnamed              # View repo info
   gh repo clone mhfawwazy/reverse-souls              # Clone a repo
   gh issue list -R mhfawwazy/dieter-mams             # List issues in any repo
   ```

**Your repositories:**
- `ryanditjia/still-unnamed` (Slow Fashion App - primary)
- `mhfawwazy/reverse-souls`
- `mhfawwazy/dieter-mams`

**Authentication Status:**
✅ GitHub CLI authenticated via SSH
✅ Full access to all repositories
✅ Ready for cross-repo operations