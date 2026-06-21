# Penny — chat-first AI expense tracker (Ionic React + Capacitor)

Penny is a cross-platform mobile expense tracker whose primary surface is a **chat with an AI agent**. You log expenses by typing natural language ("had tea and snack 2+3, 5 aed"), snapping a bill, forwarding a bank SMS, or uploading a statement. The agent categorizes entries, itemizes them, scores **necessity (1–10)**, answers questions about your money, and (later) nudges you about idle subscriptions, EMIs, and recurring impulse buys.

Built from the high-fidelity design handoff with **Ionic React + Vite + TypeScript** and **Capacitor** for native iOS/Android (camera, file picking). Default currency AED.

## Status / roadmap

Built so far (in priority order):

1. **Chat (the core surface)** — greeting + starter chips, natural-language expense parsing into an editable **mini-form card** (category/account/amount/necessity), conversational corrections, the **model-escalation trace** (Haiku → Sonnet → Opus) with model tags, insight answers with trend charts, MCQ chips, **image reading** (snap a receipt → itemized analysis) and **file reading** (PDF/bank statement import).
2. **Accounts addition in chat** — "add my new Liv savings account, 2500 aed" drafts an account card you confirm; it persists and appears on the Accounts screen.
3. **Transaction list** — Home activity feed grouped by day, month-summary card, accounts strip.

Next: subscriptions, EMIs, the full **Track** tab (EMIs / Recurring / Grocery) and **Coach** tab (daily digest, nudges) — these currently show "coming next" placeholders.

## Running it

```bash
npm install

# Demo mode (no API key) — on-device heuristic parser, works fully offline:
npm run dev            # → http://localhost:5173

# Live mode (real Claude) — run the web app + the Anthropic proxy together:
cp .env.example .env   # then set ANTHROPIC_API_KEY=...
npm run dev:full       # vite + proxy; Vite proxies /api -> the server
```

The chat header badge shows **HAIKU LIVE** when the proxy has a key, **DEMO MODE** otherwise. Every model call has a heuristic/scripted fallback, so the UI never breaks if the backend is down.

## Architecture

```
src/
  theme/tokens.css      Design tokens + all component styles (ported 1:1 from the handoff)
  lib/
    data.ts             Categories, accounts, seed txns, currency, persistence helpers
    types.ts            Domain + LLM-contract types
    llm.ts              Model router (classify), heuristic parser/corrector, backend bridge
    media.ts            Cross-platform camera + file picking (Capacitor native / web <input>)
  components/           Avatar (dot), Icons (inline SVG), ui primitives (NecMeter, Gauge, Bar…)
  state/AppContext.tsx  Global state: txns, accounts, grocery, currency, toast, navigation
  chat/                 ChatView (the router/pipeline) + message cards + message model
  screens/              Home, Accounts, Track/Coach placeholders
  App.tsx               Shell: tab bar + FAB → chat
server/index.mjs        Minimal Anthropic proxy (parse / receipt / statement / digest)
```

### The LLM layer

`src/lib/llm.ts` mirrors the design's contract:

- `classify(text)` → which model tier + the visible trace steps.
- `parse(text, prevExpense)` → POSTs to `/api/penny/parse`; on any failure falls back to the on-device `localParse` / `localCorrect` heuristics. Returns strict JSON (`kind`, `reply`, `expense`, `account`, `chart`, …), sanitized (necessity clamped 1–10, valid category/account ids, abs totals).
- `parseReceipt(base64, mime)` → vision itemization (`/penny/receipt`); demo fallback returns a scripted Spinneys receipt.
- `parseStatement(base64, mime, name)` → bulk import + recurring-charge discovery (`/penny/statement`); demo fallback returns the scripted 42-txn import.
- `digest(txns)` → daily digest (`/penny/digest`).

The proxy (`server/index.mjs`) keeps the API key server-side and routes parse requests to Haiku/Sonnet/Opus. Model ids are set in `.env`.

## Native builds (Capacitor)

The project is Capacitor-ready (`capacitor.config.ts`, camera/filesystem/file-picker plugins). To produce native apps:

```bash
npm run build
npx cap add ios        # requires Xcode
npx cap add android    # requires Android Studio / SDK
npm run cap:sync
npx cap open ios       # or android
```

In demo/web the attach options open a file picker; on device they use the native camera and document picker.

## Notes

- Amounts are stored in AED and converted for display via a static FX table (`data.ts`) — production should use live FX.
- User data (transactions, accounts, grocery list, currency) persists in `localStorage` under the `penny.*` namespace.
- The avatar, icons, and all chrome are pure CSS/SVG — no raster assets.
