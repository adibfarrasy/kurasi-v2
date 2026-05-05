import { relations } from 'drizzle-orm'
import { boolean, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { user } from './auth-schema.gen'

// Aligned to specs/wardrobe.allium WardrobeItem.
export const clothingItem = pgTable('clothing_item', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  // Cleaned + canvas-anchored PNG produced by the analyze-clothing
  // pipeline. This is the canonical wardrobe-grid thumbnail and the
  // try-on compositing source.
  imageUrl: text('image_url').notNull(),
  // The raw photo the user uploaded. Kept around so the review form
  // can display the original alongside the cleaned-up version, and so
  // the cleanup can be re-run in the future if the pipeline changes.
  // Nullable: AI items promoted from steal-the-look saves don't have a
  // user-supplied original photo.
  originalImageUrl: text('original_image_url'),
  category: text('category', {
    enum: ['headwear', 'shirt', 'jacket', 'pants', 'footwear'],
  }).notNull(),
  colors: jsonb('colors')
    .$type<{ name: string; hex: string; ratio: number }[]>()
    .notNull()
    .default([]),
  brand: text('brand'),
  fit: text('fit', { enum: ['skinny', 'regular', 'relaxed', 'oversize'] }),
  // length is meaningful only for jacket and pants. The enum unions both
  // ranges (jacket: cropped..full-length; pants: thigh-shorts..full-length)
  // and the API/spec layer enforces which subset is valid per category.
  length: text('length', {
    enum: [
      'cropped',
      'waist',
      'hip',
      'thigh',
      'knee',
      'full-length',
      'thigh-shorts',
      'knee-shorts',
      'ankle-length',
    ],
  }),
  // User-supplied display name for the item (e.g. "Black Hoodie"). Set
  // from the upload-wardrobe review form's editable header. Nullable for
  // legacy rows + AI items promoted from steal-the-look saves.
  name: text('name'),
  customNotes: text('custom_notes'),
  // `owned=false` flags wishlist-style items the user has NOT purchased yet
  // (e.g. AI items promoted from a steal-the-look save where the user wanted
  // to record the look without claiming ownership). Default true since most
  // wardrobe additions are real items the user has.
  owned: boolean('owned').notNull().default(true),
  status: text('status', { enum: ['active', 'removed'] })
    .notNull()
    .default('active'),
  removedAt: timestamp('removed_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at')
    .$onUpdate(() => new Date())
    .notNull()
    .defaultNow(),
})

// Aligned to specs/wardrobe.allium Outfit entity.
export const outfit = pgTable(
  'outfit',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name'),
    // Rendered try-on hero image (dress-avatar pipeline output). Persisted
    // when the user saves from Try On so the My Fit card can show the
    // composited avatar wearing the look. Null when the outfit was saved
    // without ever running the pipeline (e.g. seed data) — UI falls back
    // to the first slot item's thumbnail.
    heroImageUrl: text('hero_image_url'),
    // Slot FKs: ON DELETE SET NULL so the outfit survives item deletion but
    // loses the slot — matches spec RemoveItemPreservingOutfits semantics.
    headwearId: uuid('headwear_id').references(() => clothingItem.id, { onDelete: 'set null' }),
    baseId: uuid('base_id').references(() => clothingItem.id, { onDelete: 'set null' }),
    outerId: uuid('outer_id').references(() => clothingItem.id, { onDelete: 'set null' }),
    bottomId: uuid('bottom_id').references(() => clothingItem.id, { onDelete: 'set null' }),
    footwearId: uuid('footwear_id').references(() => clothingItem.id, { onDelete: 'set null' }),
    tags: text('tags').array().notNull().default([]),
    notes: text('notes'),
    rating: text('rating', { enum: ['loved', 'ok', 'didnt_work'] }),
    wornAt: timestamp('worn_at'),
    status: text('status', { enum: ['active', 'deleted'] })
      .notNull()
      .default('active'),
    deletedAt: timestamp('deleted_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => new Date())
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('outfit_user_id_idx').on(t.userId),
    index('outfit_headwear_id_idx').on(t.headwearId),
    index('outfit_base_id_idx').on(t.baseId),
    index('outfit_outer_id_idx').on(t.outerId),
    index('outfit_bottom_id_idx').on(t.bottomId),
    index('outfit_footwear_id_idx').on(t.footwearId),
  ],
)

export const outfitRelations = relations(outfit, ({ one }) => ({
  owner: one(user, { fields: [outfit.userId], references: [user.id] }),
  headwear: one(clothingItem, {
    fields: [outfit.headwearId],
    references: [clothingItem.id],
    relationName: 'outfit_headwear',
  }),
  base: one(clothingItem, {
    fields: [outfit.baseId],
    references: [clothingItem.id],
    relationName: 'outfit_base',
  }),
  outer: one(clothingItem, {
    fields: [outfit.outerId],
    references: [clothingItem.id],
    relationName: 'outfit_outer',
  }),
  bottom: one(clothingItem, {
    fields: [outfit.bottomId],
    references: [clothingItem.id],
    relationName: 'outfit_bottom',
  }),
  footwear: one(clothingItem, {
    fields: [outfit.footwearId],
    references: [clothingItem.id],
    relationName: 'outfit_footwear',
  }),
}))
