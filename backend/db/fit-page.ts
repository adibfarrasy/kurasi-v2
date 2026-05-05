import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import { user } from './auth-schema.gen'
import { clothingItem, outfit } from './wardrobe'

// Aligned to specs/fit-page.allium UserBiometrics entity. One row per user
// (enforced by userId as PK).
export const userBiometrics = pgTable('user_biometrics', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  heightCm: integer('height_cm').notNull(),
  weightKg: integer('weight_kg').notNull(),
  facePhotoUrl: text('face_photo_url'),
  // Full-body avatar produced by the normalize-user pipeline (height/weight/
  // face → posed body). Used as the input to dress-avatar compositing. Until
  // that pipeline is wired up for real users, the seed populates this with
  // the bundled `default_man.png`.
  defaultAvatarUrl: text('default_avatar_url'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at')
    .$onUpdate(() => new Date())
    .notNull()
    .defaultNow(),
})

// Aligned to specs/fit-page.allium FitAdjustment entity (lines 81-90).
// Per-(user, item) sizing note. Unique on (userId, itemId) — one adjustment
// per user/item pair (OneFitAdjustmentPerUserItem invariant, lines 272-276).
// Enum values mirror the spec exactly.
export const fitAdjustment = pgTable(
  'fit_adjustment',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    itemId: uuid('item_id')
      .notNull()
      .references(() => clothingItem.id, { onDelete: 'cascade' }),
    length: text('length', { enum: ['shorter', 'true_to_size', 'longer'] }),
    width: text('width', { enum: ['tighter', 'true_to_size', 'looser'] }),
    sleeve: text('sleeve', { enum: ['too_short', 'true_to_size', 'too_long'] }),
    rise: text('rise', { enum: ['low_rise', 'mid_rise', 'high_rise'] }),
    customNotes: text('custom_notes'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => new Date())
      .notNull()
      .defaultNow(),
  },
  (t) => [unique('fit_adjustment_user_item_unique').on(t.userId, t.itemId)],
)

// Aligned to specs/fit-page.allium SharedOutfit entity (lines 92-106).
//
// Singleton per Outfit (invariant OneSharedOutfitPerOutfit, lines 283-287):
// unique on outfitId. Decision re: the spec's open question (line 381) — we
// treat SharedOutfit as a singleton per Outfit. Re-publishing an already
// unpublished SharedOutfit transitions it back to 'published' and updates
// anonymisation/showUsername in place (see PublishOutfit handler).
export const sharedOutfit = pgTable(
  'shared_outfit',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    outfitId: uuid('outfit_id')
      .notNull()
      .unique()
      .references(() => outfit.id, { onDelete: 'cascade' }),
    faceAnonymisation: text('face_anonymisation', {
      enum: ['none', 'blur_face', 'block_eyes'],
    }).notNull(),
    showUsername: boolean('show_username').notNull(),
    status: text('status', { enum: ['published', 'unpublished'] })
      .notNull()
      .default('published'),
    sharedAt: timestamp('shared_at').notNull().defaultNow(),
    unpublishedAt: timestamp('unpublished_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => new Date())
      .notNull()
      .defaultNow(),
  },
  (t) => [index('shared_outfit_status_idx').on(t.status, t.sharedAt)],
)

// Aligned to specs/fit-page.allium OutfitRecommendationRequest (lines 108-112)
// and RequestRecommendations rule (lines 227-244). A lightweight request
// record — the recommendation engine itself is deferred (see spec lines
// 300-302 and recommendation handler). Status machine mirrors a typical
// job queue: pending -> computed | failed. A background worker would
// transition rows; the handler here only writes 'pending'.
export const outfitRecommendationRequest = pgTable(
  'outfit_recommendation_request',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['gap_filling', 'outfit_generation'] }).notNull(),
    basedOnOutfitId: uuid('based_on_outfit_id').references(() => outfit.id, {
      onDelete: 'cascade',
    }),
    status: text('status', { enum: ['pending', 'computed', 'failed'] })
      .notNull()
      .default('pending'),
    requestedAt: timestamp('requested_at').notNull().defaultNow(),
    computedAt: timestamp('computed_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => new Date())
      .notNull()
      .defaultNow(),
  },
  (t) => [index('outfit_recommendation_user_idx').on(t.userId, t.requestedAt)],
)
