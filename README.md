# Taara — Vedic astrology in 22 Indian languages

One codebase builds the iOS and Android apps, and the same backend serves both.

| Folder | What it is |
|---|---|
| `mobile/` | Expo (React Native) app for iOS and Android: Expo Router, zustand, i18next |
| `server/` | Node 22 API: Express 5, Socket.IO, Drizzle ORM on Postgres, astrology engine, billing |
| `admin/` | Admin panel (Vite + React), served by the API at `/admin-panel` |
| `docs/SPEC.md` | Combined product spec: roles, screens, pricing, languages, data model |
| `render.yaml` | One-click deploy of API, admin and Postgres on Render |

---

## 1. Run it locally (about 5 minutes)

```bash
# API with an embedded database: no Postgres or keys needed
cd server
cp .env.example .env          # leave everything blank for a demo
echo "OTP_DEV_CODE=123456" >> .env
npm install
npm run db:seed               # admin (+919999999999) + 6 demo Pandits
npm run dev                   # http://localhost:4000

# Admin panel
cd ../admin && npm install && npm run build   # then open http://localhost:4000/admin-panel

# App
cd ../mobile && npm install
EXPO_PUBLIC_API_URL=http://<your-laptop-LAN-IP>:4000 npx expo start
```

To log in, use any 10-digit number with code `123456`. To use the admin panel, log in as `9999999999`.

Without `ANTHROPIC_API_KEY`, AI chat, palm reading, reports and translation return clearly labelled placeholder text, so the full flow can still be clicked through. Charts, kundli, matching, panchang, Sade Sati, Choghadiya, numerology and billing are real calculations and need no keys.

Tests: `cd server && npm test` runs 41 tests covering the astro engine, billing, palm and an end-to-end API test.
Translation check: `cd mobile && node scripts/check-i18n.mjs`.

---

## 2. Accounts and keys you need before launch

| Service | Used for | Where | Env var(s) |
|---|---|---|---|
| **Anthropic** | AI astrologer, palm vision, reports, horoscopes, chat translation | console.anthropic.com | `ANTHROPIC_API_KEY` |
| **Razorpay** | Wallet top-ups (UPI, cards, netbanking). Webhook URL: `{PUBLIC_URL}/webhooks/razorpay` | dashboard.razorpay.com | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` |
| **MSG91** | OTP SMS. Needs a DLT-registered template containing `{{otp}}` (Indian telecom requirement) | msg91.com | `MSG91_AUTH_KEY`, `MSG91_TEMPLATE_ID` |
| **Sarvam AI** *(optional)* | Voice: speech-to-text in all 22 languages; spoken replies in 11 | dashboard.sarvam.ai | `SARVAM_API_KEY` |
| **Postgres** | Database (Render, Supabase, Neon or RDS) | — | `DATABASE_URL` |
| **Apple Developer** ($99/yr) | iOS build and App Store | developer.apple.com | — |
| **Google Play** ($25 once) | Android build and Play Store | play.google.com/console | — |
| **Expo / EAS** | Cloud builds and store submission | expo.dev | — |

Also set `JWT_SECRET` (long and random), `PUBLIC_URL`, and `ADMIN_PHONES` (your number). **Leave `OTP_DEV_CODE` empty in production.** The server refuses to start in production if it is set.

---

## 3. Deploy the backend

1. Push this repo to GitHub.
2. On Render, go to **New → Blueprint** and pick the repo. `render.yaml` creates the API (with a 5 GB disk for uploads) and Postgres in Singapore.
3. Fill in the env vars marked `sync: false`. Migrations run automatically on every deploy.
4. Open `https://<your-api>/admin-panel` and log in with a phone number listed in `ADMIN_PHONES`.
5. In **Pricing**, set your real prices. Every price can be changed from the admin panel, with no redeploy: AI ₹/min, free minutes, the Pandit commission, palm-reading prices and report prices.

Do **not** run `db:seed` in production. It creates demo Pandits.

---

## 4. Build and publish the apps

```bash
cd mobile
npm i -g eas-cli && eas login
eas init                                  # links the project, writes the projectId
# edit eas.json → production.env.EXPO_PUBLIC_API_URL = https://<your-api>
eas build --platform all --profile production
eas submit --platform ios                 # needs ascAppId in eas.json
eas submit --platform android             # first upload must be done manually in Play Console
```

The bundle id / package is `in.taara.app`. Change it in `app.json` before your first build if you want a different one.

**Store listing notes (astrology apps get extra review scrutiny):**
- Both stores require **account deletion** inside the app. Profile → Delete account is built in.
- The disclaimer that the app is for guidance only and is not medical, legal or financial advice is shown on Home, Horoscope, Consult, chat, the tools, the palm results and Legal. Keep it.
- Apple: wallet top-ups buy **real-world services from human Pandits**, which is generally allowed outside In-App Purchase. AI-only features bought with that same wallet may be treated as digital content. Discuss your model with Apple review before launch and be ready to add IAP for AI minutes if they ask.
- Google Play: complete the Data Safety form. The app collects phone number, birth details, photos (palm, ID for Pandits) and payment info via Razorpay.
- Have a lawyer review the policy texts under `mobile/src/lib/legal.ts`. They are drafts.

---

## 5. What is real and what isn't (read before promising features)

**Working end to end**
- Phone OTP login, onboarding, multiple birth profiles.
- Kundli: North and South Indian charts, Simple/Detailed views, "Explain simply", dasha, doshas.
- Guna Milan.
- Panchang and Rahu Kaal, Sade Sati / Dhaiya timeline, transits (gochar), Choghadiya + Abhijit, Chaldean numerology.
- Daily/weekly/monthly/yearly horoscopes.
- AI astrologer chat and voice with live per-second billing, idle pause and consent before paid time.
- Pandit marketplace (Pandits set their own prices, the first N minutes are free, 70/30 split), live chat with auto-translation between the user's and the Pandit's languages.
- Wallet and Razorpay, PDF reports, palm reading (quick, detailed, AI palm expert).
- Pandit onboarding with ID upload and admin verification, Pandit dashboard and payout requests.
- Admin panel, push notifications, dark mode.

**Not built yet**
- **Voice and video calls with human Pandits.** The buttons say "coming soon". This needs an RTC provider (Agora, 100ms or Twilio) and roughly 1–2 weeks of work.
- **Automated Pandit payouts.** Admins approve payout requests and mark them paid. The actual bank transfer is manual or via RazorpayX, which isn't wired up.
- Google sign-in is wired on the server but has no client button. Apple sign-in is present on iOS.

**Astrology accuracy.** Planet positions use the `astronomy-engine` library with Lahiri ayanamsa, whole-sign houses and mean nodes. Results were spot-checked against published ephemerides and known Sade Sati dates. Some traditions use other ayanamsas or true nodes, so a Pandit's software may differ by small amounts.

---

## 6. Languages

All 22 Scheduled Languages plus English are available in the language picker.

| Status | Languages |
|---|---|
| Fully translated (649/649 strings) | Hindi, Bengali, Telugu, Marathi, Tamil, Urdu, Gujarati, Kannada, Odia, Malayalam, Punjabi, Assamese, Maithili, Nepali, Konkani, Dogri, Sanskrit |
| Fully translated, **needs native-speaker review before launch** | Bodo, Manipuri (Bengali script), Kashmiri, Sindhi |
| **Partial** (288/649 — core screens; the rest falls back to Hindi) | Santali (Ol Chiki) |

All translations were machine-written. Have a native speaker review at least the first-run screens (welcome, login, onboarding, home) in every language you market in. For the low-resource ones listed above, review is essential. To fill gaps automatically, run `ANTHROPIC_API_KEY=… node scripts/translate-locales.mjs` in `mobile/`, then `node scripts/check-i18n.mjs`.

AI answers, horoscopes and reports are generated directly in the user's language at runtime, so they don't depend on these files. Spoken AI replies are available in 11 languages (Sarvam). Users of the other 11 speak their question and get a written answer, and the app tells them so.

---

## 7. Where to change things

| Change | File |
|---|---|
| Brand colours (yellow / kesari) | `mobile/src/lib/theme.ts`, `admin/src/styles.css` |
| Prices, free minutes, commission | Admin panel → Pricing (defaults in `server/src/lib/settings.ts`) |
| AI astrologer personality and safety rules | `server/src/services/ai.ts` |
| Palm reading prompt | `server/src/services/palm.ts` |
| Astrology maths | `server/src/astro/` |
| Any UI text | `mobile/src/i18n/locales/<lang>.json` |

---

## Data sources and credits

- **Birthplaces in India:** India Post office directory (≈150,000 post offices with coordinates, including villages), published on data.gov.in under the Government Open Data Licence – India. Built into `server/data/places.tsv.gz` by the script in `server/scripts/build_places.py`.
- **Places abroad / anything not listed:** looked up live on OpenStreetMap (Nominatim), © OpenStreetMap contributors. Nominatim allows light use only (1 request per second). Before a large launch, switch `geocode()` in `server/src/services/places.ts` to a paid geocoder (Google Places, Ola Maps or LocationIQ).
- **Planet positions:** astronomy-engine (MIT).
