import {
  boolean, doublePrecision, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid,
} from 'drizzle-orm/pg-core';

const id = () => uuid('id').primaryKey().defaultRandom();
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const users = pgTable('users', {
  id: id(),
  phone: text('phone'),
  email: text('email'),
  googleSub: text('google_sub'),
  appleSub: text('apple_sub'),
  name: text('name'),
  gender: text('gender'),
  language: text('language').notNull().default('hi'),
  theme: text('theme').notNull().default('system'),
  goal: text('goal'),
  role: text('role').notNull().default('user'), // user | admin
  balancePaise: integer('balance_paise').notNull().default(0),
  freeSecondsRemaining: integer('free_seconds_remaining').notNull().default(0),
  freeGranted: boolean('free_granted').notNull().default(false),
  deviceId: text('device_id'),
  pushToken: text('push_token'),
  notificationPrefs: jsonb('notification_prefs').$type<Record<string, boolean>>().notNull().default({}),
  aiProfileConsent: boolean('ai_profile_consent').notNull().default(true),
  blocked: boolean('blocked').notNull().default(false),
  // Consent records (DPDP Act): what the user agreed to and when. Marketing is a separate, opt-in choice.
  termsVersion: text('terms_version'),
  termsAcceptedAt: timestamp('terms_accepted_at', { withTimezone: true }),
  ageConfirmedAt: timestamp('age_confirmed_at', { withTimezone: true }),
  marketingConsent: boolean('marketing_consent').notNull().default(false),
  // Bumped on "log out of all devices" and on account deletion; tokens carry it and are rejected when stale.
  tokenVersion: integer('token_version').notNull().default(0),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex('users_phone_uq').on(t.phone),
  uniqueIndex('users_google_uq').on(t.googleSub),
  uniqueIndex('users_apple_uq').on(t.appleSub),
]);

export const birthProfiles = pgTable('birth_profiles', {
  id: id(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  relation: text('relation').notNull().default('self'),
  date: text('date').notNull(),
  time: text('time'),
  timeAccuracy: text('time_accuracy').notNull().default('exact'), // exact | approx | unknown
  placeName: text('place_name').notNull(),
  lat: doublePrecision('lat').notNull(),
  lon: doublePrecision('lon').notNull(),
  tzOffsetMinutes: integer('tz_offset_minutes').notNull(),
  isPrimary: boolean('is_primary').notNull().default(false),
  createdAt: createdAt(),
}, (t) => [index('birth_profiles_user_idx').on(t.userId)]);

export const pandits = pgTable('pandits', {
  id: id(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  displayName: text('display_name').notNull(),
  photoUrl: text('photo_url'),
  bio: text('bio').notNull().default(''),
  experienceYears: integer('experience_years').notNull().default(0),
  specializations: jsonb('specializations').$type<string[]>().notNull().default([]),
  languages: jsonb('languages').$type<string[]>().notNull().default([]),
  replyLanguage: text('reply_language').notNull().default('hi'),
  status: text('status').notNull().default('pending'), // pending | approved | rejected | suspended | deleted
  conductAcceptedAt: timestamp('conduct_accepted_at', { withTimezone: true }),
  chatRatePaise: integer('chat_rate_paise').notNull().default(2000),
  voiceRatePaise: integer('voice_rate_paise').notNull().default(2500),
  videoRatePaise: integer('video_rate_paise').notNull().default(3000),
  participatesInFree: boolean('participates_in_free').notNull().default(true),
  online: boolean('online').notNull().default(false),
  busy: boolean('busy').notNull().default(false),
  ratingSum: integer('rating_sum').notNull().default(0),
  ratingCount: integer('rating_count').notNull().default(0),
  totalSessions: integer('total_sessions').notNull().default(0),
  totalSeconds: integer('total_seconds').notNull().default(0),
  earningsPaise: integer('earnings_paise').notNull().default(0),
  weeklyAvailability: jsonb('weekly_availability').$type<Record<string, { start: string; end: string }[]>>().notNull().default({}),
  createdAt: createdAt(),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
}, (t) => [uniqueIndex('pandits_user_uq').on(t.userId), index('pandits_status_online_idx').on(t.status, t.online)]);

export const verifications = pgTable('verifications', {
  id: id(),
  panditId: uuid('pandit_id').notNull().references(() => pandits.id, { onDelete: 'cascade' }),
  fullName: text('full_name').notNull(),
  email: text('email'),
  address: text('address').notNull(),
  idDocType: text('id_doc_type').notNull(),
  idDocUrl: text('id_doc_url').notNull(),
  certificateUrls: jsonb('certificate_urls').$type<string[]>().notNull().default([]),
  // Never store raw bank account numbers here: store the payout provider's fund-account id and a masked hint.
  payoutAccountRef: text('payout_account_ref'),
  payoutAccountHint: text('payout_account_hint'),
  status: text('status').notNull().default('pending'),
  reviewNote: text('review_note'),
  reviewedBy: uuid('reviewed_by'),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  createdAt: createdAt(),
});

export const sessions = pgTable('sessions', {
  id: id(),
  userId: uuid('user_id').notNull().references(() => users.id),
  panditId: uuid('pandit_id').references(() => pandits.id),
  profileId: uuid('profile_id').references(() => birthProfiles.id),
  palmReadingId: uuid('palm_reading_id'),   // set for "AI Palm Expert" chats
  kind: text('kind').notNull(),             // ai | pandit
  mode: text('mode').notNull(),             // chat | voice | video
  status: text('status').notNull(),         // requested | active | awaiting_consent | paused | ended | rejected | missed
  billingMode: text('billing_mode').notNull().default('per_minute'), // per_minute | per_message
  ratePaise: integer('rate_paise').notNull(), // per minute (or per message)
  userLanguage: text('user_language').notNull(),
  freeEligible: boolean('free_eligible').notNull().default(false),
  freeSecondsUsed: integer('free_seconds_used').notNull().default(0),
  paidSeconds: integer('paid_seconds').notNull().default(0),
  chargedPaise: integer('charged_paise').notNull().default(0),
  panditEarnedPaise: integer('pandit_earned_paise').notNull().default(0),
  warningsSent: jsonb('warnings_sent').$type<string[]>().notNull().default([]),
  requestedAt: createdAt(),
  startedAt: timestamp('started_at', { withTimezone: true }),
  lastTickAt: timestamp('last_tick_at', { withTimezone: true }),
  lastActivityAt: timestamp('last_activity_at', { withTimezone: true }),
  consentDeadline: timestamp('consent_deadline', { withTimezone: true }),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  endReason: text('end_reason'),
  // Set when the AI detects a person in distress: no further charges, and charges so far are refunded.
  billingWaived: boolean('billing_waived').notNull().default(false),
}, (t) => [
  index('sessions_user_idx').on(t.userId, t.requestedAt),
  index('sessions_pandit_idx').on(t.panditId, t.requestedAt),
  index('sessions_status_idx').on(t.status),
]);

export const messages = pgTable('messages', {
  id: id(),
  sessionId: uuid('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  sender: text('sender').notNull(), // user | pandit | ai | system
  text: text('text').notNull(),
  lang: text('lang'),
  translations: jsonb('translations').$type<Record<string, string>>().notNull().default({}),
  audioUrl: text('audio_url'),
  createdAt: createdAt(),
}, (t) => [index('messages_session_idx').on(t.sessionId, t.createdAt)]);

// Append-only money ledger. account: user | pandit | platform. Balance columns are caches updated in the same transaction.
export const ledger = pgTable('ledger', {
  id: id(),
  account: text('account').notNull(),
  ownerId: uuid('owner_id'),
  type: text('type').notNull(), // topup | session_charge | refund | adjustment | pandit_earning | free_minutes_payout | payout | report_purchase
  amountPaise: integer('amount_paise').notNull(), // signed
  balanceAfter: integer('balance_after'),
  sessionId: uuid('session_id'),
  paymentId: uuid('payment_id'),
  note: text('note'),
  createdAt: createdAt(),
}, (t) => [index('ledger_owner_idx').on(t.account, t.ownerId, t.createdAt), index('ledger_session_idx').on(t.sessionId)]);

export const payments = pgTable('payments', {
  id: id(),
  userId: uuid('user_id').notNull().references(() => users.id),
  provider: text('provider').notNull().default('razorpay'),
  providerOrderId: text('provider_order_id').notNull(),
  providerPaymentId: text('provider_payment_id'),
  creditPaise: integer('credit_paise').notNull(),
  gstPaise: integer('gst_paise').notNull(),
  totalPaise: integer('total_paise').notNull(),
  status: text('status').notNull().default('created'), // created | paid | failed | refunded
  createdAt: createdAt(),
  paidAt: timestamp('paid_at', { withTimezone: true }),
}, (t) => [uniqueIndex('payments_order_uq').on(t.providerOrderId)]);

export const payouts = pgTable('payouts', {
  id: id(),
  panditId: uuid('pandit_id').notNull().references(() => pandits.id),
  amountPaise: integer('amount_paise').notNull(),
  status: text('status').notNull().default('requested'), // requested | processing | paid | failed
  providerRef: text('provider_ref'),
  createdAt: createdAt(),
});

export const reviews = pgTable('reviews', {
  id: id(),
  sessionId: uuid('session_id').notNull().references(() => sessions.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  panditId: uuid('pandit_id').notNull().references(() => pandits.id),
  rating: integer('rating').notNull(),
  text: text('text'),
  hidden: boolean('hidden').notNull().default(false),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('reviews_session_uq').on(t.sessionId)]);

export const complaints = pgTable('complaints', {
  id: id(),
  userId: uuid('user_id').notNull().references(() => users.id),
  sessionId: uuid('session_id'),
  messageId: uuid('message_id'),
  reviewId: uuid('review_id'),
  panditId: uuid('pandit_id'),
  category: text('category').notNull(),
  text: text('text').notNull(),
  status: text('status').notNull().default('open'),
  resolution: text('resolution'),
  createdAt: createdAt(),
});

export const horoscopes = pgTable('horoscopes', {
  sign: integer('sign').notNull(),
  period: text('period').notNull(),     // daily | weekly | monthly | yearly
  periodKey: text('period_key').notNull(), // 2026-10-21 | 2026-W43 | 2026-10 | 2026
  lang: text('lang').notNull(),
  content: jsonb('content').notNull(),
  createdAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.sign, t.period, t.periodKey, t.lang] })]);

export const reports = pgTable('reports', {
  id: id(),
  userId: uuid('user_id').notNull().references(() => users.id),
  profileId: uuid('profile_id').notNull().references(() => birthProfiles.id),
  partnerProfileId: uuid('partner_profile_id'),
  kind: text('kind').notNull(), // birth_chart | marriage | career | finance | yearly | compatibility
  lang: text('lang').notNull(),
  pricePaise: integer('price_paise').notNull(),
  status: text('status').notNull().default('generating'), // generating | ready | failed
  content: jsonb('content'),
  createdAt: createdAt(),
});

export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const otpCodes = pgTable('otp_codes', {
  phone: text('phone').primaryKey(),
  codeHash: text('code_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  attempts: integer('attempts').notNull().default(0),
  // Send throttling (SMS pumping / OTP bombing protection)
  lastSentAt: timestamp('last_sent_at', { withTimezone: true }),
  windowStartedAt: timestamp('window_started_at', { withTimezone: true }),
  sendCount: integer('send_count').notNull().default(0),
});

export const notifications = pgTable('notifications', {
  id: id(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  data: jsonb('data').notNull().default({}),
  readAt: timestamp('read_at', { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index('notifications_user_idx').on(t.userId, t.createdAt)]);

export const translationCache = pgTable('translation_cache', {
  hash: text('hash').primaryKey(),
  result: text('result').notNull(),
  createdAt: createdAt(),
});

export const analyticsEvents = pgTable('analytics_events', {
  id: id(),
  userId: uuid('user_id'),
  name: text('name').notNull(),
  props: jsonb('props').notNull().default({}),
  createdAt: createdAt(),
}, (t) => [index('analytics_name_idx').on(t.name, t.createdAt)]);

export const favorites = pgTable('favorites', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  panditId: uuid('pandit_id').notNull().references(() => pandits.id, { onDelete: 'cascade' }),
  createdAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.userId, t.panditId] })]);

export const palmReadings = pgTable('palm_readings', {
  id: id(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  hand: text('hand').notNull(),               // left | right
  imagePath: text('image_path').notNull(),    // private upload, never public
  mediaType: text('media_type').notNull(),
  lang: text('lang').notNull(),
  quick: jsonb('quick'),                      // free reading
  detailed: jsonb('detailed'),                // paid reading
  detailedPricePaise: integer('detailed_price_paise'),
  status: text('status').notNull().default('ready'), // ready | detailed_generating | failed
  createdAt: createdAt(),
}, (t) => [index('palm_user_idx').on(t.userId, t.createdAt)]);

/** A user can block a Pandit: the Pandit disappears from their lists and cannot be consulted again. */
export const userBlocks = pgTable('user_blocks', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  panditId: uuid('pandit_id').notNull().references(() => pandits.id, { onDelete: 'cascade' }),
  createdAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.userId, t.panditId] })]);

/** Phones (hashed) that already received free minutes, so deleting and re-creating an account doesn't grant them again. */
export const freeGrants = pgTable('free_grants', {
  phoneHash: text('phone_hash').primaryKey(),
  createdAt: createdAt(),
});

/** Every state-changing admin action, for accountability (money, approvals, blocks, settings). */
export const adminAudit = pgTable('admin_audit', {
  id: id(),
  adminId: uuid('admin_id').notNull(),
  method: text('method').notNull(),
  path: text('path').notNull(),
  body: jsonb('body').notNull().default({}),
  createdAt: createdAt(),
}, (t) => [index('admin_audit_created_idx').on(t.createdAt)]);
