import { relations } from 'drizzle-orm'
import { index, pgTable, primaryKey, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { user } from './auth-schema.gen'

// Aligned to specs/style-board.allium StyleTag entity. Labels are unique so
// curators don't duplicate categories.
export const styleTag = pgTable('style_tag', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  label: text('label').notNull().unique(),
  category: text('category', {
    enum: ['aesthetic', 'color', 'silhouette', 'occasion', 'season'],
  }).notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

// Aligned to specs/style-board.allium StyleCard entity. Retirement is a soft
// status change (status='retired', retiredAt set) so that SavedStyle rows
// referencing the card can still be read — per spec decision, saves persist
// after retirement.
export const styleCard = pgTable('style_card', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  imageUrl: text('image_url').notNull(),
  sourceAttribution: text('source_attribution').notNull(),
  status: text('status', { enum: ['active', 'retired'] })
    .notNull()
    .default('active'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  retiredAt: timestamp('retired_at'),
})

// Join: StyleCard -> StyleTag. Composite PK (cardId, tagId).
export const styleCardTag = pgTable(
  'style_card_tag',
  {
    cardId: uuid('card_id')
      .notNull()
      .references(() => styleCard.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => styleTag.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.cardId, t.tagId] })],
)

// StyleInteraction — permanent record of a user's like/skip on a card.
// AtMostOneInteractionPerUserCard invariant is enforced at the handler layer
// (we check before inserting); the index makes the lookup cheap.
export const styleInteraction = pgTable(
  'style_interaction',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    cardId: uuid('card_id')
      .notNull()
      .references(() => styleCard.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['liked', 'skipped'] }).notNull(),
    occurredAt: timestamp('occurred_at').notNull().defaultNow(),
  },
  (t) => [
    index('style_interaction_user_card_idx').on(t.userId, t.cardId),
    index('style_interaction_user_kind_idx').on(t.userId, t.kind),
  ],
)

// SavedStyle — an entry in the user's personal style board. Unique on
// (userId, cardId) — can't save the same card twice. Retiring the card does
// NOT delete the SavedStyle (retirement is a status change, not a row delete).
export const savedStyle = pgTable(
  'saved_style',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    cardId: uuid('card_id')
      .notNull()
      .references(() => styleCard.id, { onDelete: 'cascade' }),
    savedAt: timestamp('saved_at').notNull().defaultNow(),
  },
  (t) => [unique('saved_style_user_card_unique').on(t.userId, t.cardId)],
)

export const styleCardRelations = relations(styleCard, ({ many }) => ({
  tags: many(styleCardTag),
}))

export const styleTagRelations = relations(styleTag, ({ many }) => ({
  cards: many(styleCardTag),
}))

export const styleCardTagRelations = relations(styleCardTag, ({ one }) => ({
  card: one(styleCard, { fields: [styleCardTag.cardId], references: [styleCard.id] }),
  tag: one(styleTag, { fields: [styleCardTag.tagId], references: [styleTag.id] }),
}))
