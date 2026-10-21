# Taara — Combined Product Spec

Working name **Taara** (तारा, "star"). One codebase → one iOS app + one Android app, plus a backend and a web admin panel.

This spec merges the two source prompts:

- **Prompt 1** (modern, user-friendly astrology app): beginner-first UX, "Explain Simply", Simple vs Detailed views, compatibility, reports, design system, dark mode, analytics.
- **Prompt 2** (Indian multilingual AI + Pandit app): 22 Scheduled Languages, Pandit marketplace with own pricing, 60 free minutes, ₹5/min AI chat & voice, wallet, live billing, Pandit dashboard, verification.

Where they conflict, Prompt 2 wins (it is more specific to the Indian market). Every price is an **admin setting**, never a hard-coded number.

---

## 1. One app, three roles

| Role | Where | What they see |
|---|---|---|
| User | Mobile app (default) | Home, Horoscope, Kundli, Consult (AI + Pandits), Profile |
| Pandit Ji | Same mobile app, "Pandit mode" after verification | Dashboard, requests, chat, earnings, pricing, availability |
| Admin | Web panel (`/admin`) | Users, Pandit verification, pricing rules, payments, refunds, languages, analytics |

A Pandit installs the same app, taps **"Join as Pandit Ji"** in Profile, submits the verification form, and once approved gets a **Switch to Pandit mode** toggle. One app to publish, one to maintain.

## 2. Sitemap (user)

```
Onboarding: Language → Name → DOB → Birth time (exact / approx / unknown) → Birth place → Goal → (optional) Gender
Bottom tabs:
  Home        greeting, Rashi/Moon/Nakshatra/Lagna, Today's Energy, 4 quick actions
  Horoscope   12 rashis · Yesterday|Today|Tomorrow · Daily|Weekly|Monthly|Yearly · Panchang
  Kundli      North/South chart · planets table · Simple|Detailed · Dasha · Doshas · Matching · Reports
  Consult     AI (chat / voice) · Pandit marketplace (filter by language, specialty, price, online)
  Profile     birth details · wallet · history · reports · language · theme · notifications · legal · Join as Pandit
```

Everything important is reachable in 1–2 taps from Home.

## 3. Pricing rules (all admin-configurable)

| Setting key | Default | Notes |
|---|---|---|
| `ai.rate_per_min_paise` | 500 (₹5) | AI chat and AI voice |
| `ai.billing_mode` | `per_minute` | `per_minute` or `per_message` (recommended for text) |
| `ai.rate_per_message_paise` | 200 (₹2) | used only in `per_message` mode |
| `free.pandit_minutes` | 60 | one-time per user, chat only, participating Pandits |
| `free.warn_at_minutes` | [10, 5, 1] | warnings before free time ends |
| `pandit.min_rate_paise` / `max_rate_paise` | 500 / 20000 | Pandit sets own price inside this band |
| `pandit.platform_commission_pct` | 30 | platform share of paid minutes |
| `free.pandit_payout_paise_per_min` | 300 | what the platform pays a participating Pandit for each free minute (the free hour is a marketing cost — it must be funded) |
| `wallet.topups_paise` | [10000, 25000, 50000, 100000] | ₹100/250/500/1000 |
| `wallet.low_balance_minutes` | 3 | "balance running low" when < 3 minutes remain at current rate |
| `gst.pct` | 18 | shown on top-up and invoices |

**Billing rules**

- Billing is **server-authoritative**. The phone shows a live timer, but the server ticks and debits once per minute (partial minutes are charged pro-rata per second, so ₹42.67 for 8m32s at ₹5/min).
- A session cannot start unless the wallet covers **at least 1 minute** (or free minutes remain).
- Free minutes are consumed first; the switch to paid happens mid-session without disconnecting, after a visible warning and a "Continue at ₹X/min?" confirmation.
- When the wallet hits zero the session ends gracefully with a summary; nothing is ever charged beyond the balance.
- Free-minute abuse control: one grant per **verified phone number** + device ID.

## 4. Languages

All 22 Scheduled Languages + English (23 locales). Native names shown on the picker. One file per locale under `mobile/src/i18n/locales/`, keys like `home.welcome`. Missing keys fall back to Hindi → English, never to a blank.

| Capability | Coverage |
|---|---|
| UI text | all 23 (English and Hindi hand-written; others machine-translated by the included script, then reviewed) |
| AI text chat | all 23 (the model answers in the user's language) |
| Chat translation (user ↔ Pandit) | all 23, with an **Original / Translated** toggle; the original is always stored |
| AI voice (speech in & out) | languages with a provider voice (configured in `server/src/config/voice.ts`). For the rest, the app offers voice in Hindi or English, or text chat — it never pretends |

Urdu, Kashmiri and Sindhi render right-to-left in chat bubbles.

## 5. Astrology engine (server, `server/src/astro/`)

- Planetary positions from **astronomy-engine** (pure JS, arc-second accuracy), converted to sidereal with **Lahiri (Chitrapaksha) ayanamsa**.
- Lagna from local sidereal time + latitude; whole-sign houses (standard for Vedic).
- Rahu = mean lunar node, Ketu = Rahu + 180°.
- Nakshatra + pada, Rashi, Vimshottari Mahadasha/Antardasha, Manglik dosha, Kaal Sarp check, Navamsa (D9).
- Ashtakoota Guna Milan (36 points) for Kundli matching.
- Panchang: tithi, vara, nakshatra, yoga, karana, sunrise/sunset.
- Unknown birth time → Moon-chart only (Chandra Lagna), clearly labelled.

Daily horoscopes are generated once per rashi per language per day by a cron job (AI, from real transits), cached, and served to everyone — not generated per user.

## 6. "Explain Simply"

Every technical item (planet in house, dasha, dosha) has two texts: `simple` ("What this means: …") and `detailed`. Kundli has a **Simple | Detailed** switch at the top.

## 7. AI astrologer

- Gets the user's computed chart (not raw DOB) as context, so it never re-asks stored details.
- Answers in the selected language, warm and plain, no fear-selling, no guaranteed outcomes.
- Refuses to give medical diagnosis, legal or investment advice, or predictions of death; gently redirects.
- Always labelled **AI** in the UI. A human Pandit is always labelled **Pandit Ji ✓**.
- Voice: speech-to-text → model → text-to-speech, streamed.

## 8. Architecture

```
Expo app (iOS/Android) ──HTTPS/WSS──▶ API (Node/Express + Socket.IO)
                                       ├─ auth (phone OTP, Google, Apple)
                                       ├─ astro engine
                                       ├─ ai service ──▶ LLM provider
                                       ├─ voice service ──▶ STT/TTS provider
                                       ├─ translation service
                                       ├─ billing engine (wallet ledger, session ticks)
                                       ├─ payments ──▶ Razorpay (webhooks)
                                       ├─ notifications ──▶ Expo Push
                                       └─ PostgreSQL (Prisma)
Admin web (React) ─────────────▶ same API, /admin routes, admin role only
```

No secret keys in the app. The app only knows the API URL.

## 9. Data model (core tables)

`User`, `BirthProfile`, `Device`, `Pandit`, `PanditLanguage`, `PanditAvailability`, `Verification`, `Session` (AI or Pandit, chat/voice/video, status, rate, free seconds used, billed paise), `Message` (original text + language, translations JSON), `Wallet`, `LedgerEntry` (append-only, every debit/credit), `Payment` (Razorpay order), `Payout`, `Review`, `Report`, `DailyHoroscope`, `Notification`, `Setting` (pricing rules), `AnalyticsEvent`.

The wallet balance is always derivable from the ledger; the cached `balancePaise` is updated in the same DB transaction as each ledger row.

## 10. Build order

1. Auth, onboarding, birth profile, Kundli (no money involved) ✅ in this build
2. Wallet + Razorpay top-up + ledger ✅
3. AI chat with per-minute billing ✅
4. Pandit onboarding, verification, marketplace, live chat with billing + free minutes ✅
5. Translation layer ✅
6. AI voice ✅ (provider keys required)
7. Pandit voice/video calls — scaffolded; needs an RTC provider (Agora / 100ms / LiveKit) account
8. Admin panel ✅
9. Store submission: see `docs/LAUNCH.md`

## 11. Trust & legal

Disclaimer on AI screens and reports; Privacy Policy, Terms, Refund Policy screens (templates — have a lawyer review). Pricing is never hidden: rate, timer, running cost and balance are always on screen during a paid session.
