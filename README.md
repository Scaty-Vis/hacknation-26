# Bidly

Bidly is a voice-first event sourcing dashboard. A planner describes an event to an ElevenLabs intake agent, reviews the collected Module 1 data, discovers and approves venues, prepares consent-gated venue calls, and compares the resulting quotations.

## Local workflow

The dashboard has three working steps:

1. **Information Gathering**: talk to the ElevenLabs intake agent or upload Module 1 JSON. Review the fields in an editable table, explicitly consent to vendor discovery, calling, and negotiation, and submit. OpenAI validation is optional; deterministic (non-LLM) validation is used for objective fields either way, and is used exclusively when OpenAI is not configured.
2. **Venue conversations**: run fictional discovery, use Google Places, or import matching external Module 2 JSON. The first three approved venues receive the Tough gatekeeper, Practical deal-maker, and Premium upseller scenarios. Choose automatic agent simulation, live browser voice role-play, or authorised real phone calls.
3. **Analysis**: show opening and negotiated prices, itemized quote fields, commercial terms, transcript evidence, retained call audio when available, and a price-only recommendation.

Also included: an Imprint and a Privacy Policy page, and a shared sticky header + footer (`SiteHeader.tsx` / `SiteFooter.tsx`) present on every page, so Home/Get Started and the legal links are always reachable.

The complete local flow runs under one Vite process. Server-side API routes keep credentials out of the browser bundle. Module 2/3 workflow state is written to the ignored `.eventbid-data/` directory and is resumed when the same Module 1 event is reopened.

## Requirements

- Node.js 20 or newer and npm.
- An ElevenLabs intake agent for live Module 1 conversations. JSON upload works without it.
- API access only for the integrations you select. Offline mock discovery and deterministic validation require no provider keys.

## Setup

```bash
npm install
cp .env.example .env
npm run dev
```

(On Windows PowerShell, use `Copy-Item .env.example .env` instead of `cp`.) Fill in `.env` with the keys for whichever integrations you want to use — see "Environment settings" below; every provider key is optional for some path through the app (JSON upload, mock discovery, deterministic validation).

Open the printed local URL. To test the complete pipeline without Twilio:

1. Upload a valid Module 1 JSON (or run a live voice intake).
2. Review it, tick the consent checkbox, and submit.
3. Select **Fictional vendors (demo)** and click **Find venues**.
4. Select at least three venues and click **Approve and prepare**.
5. Keep **AI simulation** selected and click **Run negotiation demo**.
6. The three opening conversations run together. A fourth follow-up uses the cheapest completed quote as genuine leverage.
7. Review the price movement, ranked recommendation, and both rounds of transcript evidence.

For a challenge-valid live voice demonstration, select **Browser voice** instead. A teammate plays the supplied venue role for all three opening calls. After those calls complete, the dashboard unlocks the prepared leverage follow-up. ElevenLabs recordings appear in Analysis after conversation processing when workspace retention allows audio retrieval.

Run checks with:

```bash
npm test
npm run lint
npm run build
```

## Environment settings

Add values to `.env` in the project root (copied from `.env.example`). Never put credentials in source files, JSON uploads, the browser console, or `VITE_` variables.

```dotenv
# Module 1 browser voice agent. Agent IDs are public identifiers.
VITE_ELEVENLABS_INTAKE_AGENT_ID=

# Server-side ElevenLabs credential used for simulations, conversation retrieval, and calls.
ELEVENLABS_API_KEY=

# Module 3 venue-calling agent. Required for AI simulation and browser voice.
ELEVENLABS_AGENT_ID=

# Required only for real phone calls.
ELEVENLABS_PHONE_NUMBER_ID=

# Module 2 Google discovery. Not needed for Mock or imported JSON.
GOOGLE_MAPS_API_KEY=

# Optional validation assistance.
OPEN_AI_API_KEY=
OPEN_AI_MODEL=

# Optional: your own authorized test number for the fictional mock venue.
MOCK_TEST_PHONE=
```

Twilio Account SID and Auth Token are not required. The Twilio number is controlled through the number already imported into ElevenLabs.

Agent-to-agent simulation requires only `ELEVENLABS_API_KEY` and `ELEVENLABS_AGENT_ID`. It does not require Twilio, a phone number, or verified recipients. The simulator is text-based and has no call recording; it is labelled accordingly. Its transcript, analysis, fictional quote profile, and leverage evidence are saved in the local workflow.

Browser voice uses the Module 3 agent in the dashboard. The person at the computer acts as the selected venue representative using the displayed style, itemization, and concession rule. The agent must allow public browser access in ElevenLabs. The Analysis screen retrieves retained audio through a server-side proxy so the ElevenLabs key never reaches the browser.

Real calls are sequential, limited to three, and require:

- Planner consent from Module 1.
- Manual approval for each selected venue.
- A validated telephone number.
- `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`, and `ELEVENLABS_PHONE_NUMBER_ID`.
- The visible real-call confirmation checkbox.

No code path books a venue or makes a binding commitment.

## Module 1 and Module 2 handoff

The Module 1 payload contains:

```json
{
  "conversationId": "...",
  "agentId": "...",
  "collectedAt": "...",
  "variables": {},
  "permissions": {}
}
```

External Module 2 JSON can be imported on the Calling screen. Its event details must match the active Module 1 event. For stronger traceability, Module 2 should include the Module 1 `conversationId` as `source_conversation_id`. Missing coordinates or distances remain unknown rather than being invented.

## Deploying to Netlify (free tier)

**Module 1 (Information Gathering) is deployable today.** Its two API routes — `/api/conversations/:id` and `/api/validate-event` — exist in two parallel forms sharing the same logic from `src/lib/eventDetails.ts`:
- **Local dev/preview**: Vite middleware plugins in `vite.config.ts`, active under `vite dev`/`vite preview`.
- **Production on Netlify**: Netlify Functions in `netlify/functions/` (`conversations.mts`, `validate-event.mts`), adapted to Netlify's Fetch API-style function signature. `netlify.toml` wires up the build command, publish directory, and functions directory.

1. Push this repo to a Git provider (GitHub/GitLab/Bitbucket).
2. In Netlify: **Add new site → Import an existing project**, pick the repo. Netlify reads `netlify.toml` automatically (build command `npm run build`, publish dir `dist`, functions dir `netlify/functions`) — no manual config needed.
3. In **Site settings → Environment variables**, add `ELEVENLABS_API_KEY` and `OPEN_AI_API_KEY` (same values as your local `.env` — never commit these). This is the only step that can't be automated from the repo.
4. Deploy. Every push to the connected branch redeploys automatically.

Alternatively, without connecting Git: `npx netlify-cli login`, `npx netlify-cli init`, `npx netlify-cli deploy --prod` from the project root (still requires setting the two env vars via `netlify env:set` or the dashboard first). Drag-and-drop deploys on netlify.com don't support Functions, so they won't work for this app.

**Modules 2/3 (venue discovery, calling, negotiation, analysis) are also deployable to Netlify.** `server/eventbid.ts`'s persistence (`saveState`/`getState`) is injected rather than hardcoded, so the exact same route logic runs against two different backends:
- **Local dev/preview**: the original file+in-memory persistence (`.eventbid-data/`), unchanged.
- **Production on Netlify**: [Netlify Blobs](https://docs.netlify.com/blobs/overview/) (`netlify/functions/lib/eventbidBlobsPersistence.ts`) — a durable, cross-invocation key/value store, since neither a local directory nor an in-memory `Map` survive across serverless invocations.

`/simulate-approved` is the one route that can't just be a regular synchronous Function: it runs up to 5 parallel ElevenLabs simulation calls plus a follow-up negotiation call, worst case ~120 seconds — far beyond a synchronous Function's timeout. It's deployed as a **Netlify Background Function** (`netlify/functions/simulate-approved-background.mts`, up to 15 minutes, free tier included) instead: the client gets an immediate acknowledgement and then polls `/resume` until the simulation results land in Blobs (`src/lib/eventbidApi.ts`'s `simulateApprovedVenues`) — the same pending-job/"Refresh results" pattern already used for real phone calls in `AnalysisPanel.tsx`. Locally, nothing changes — the Vite middleware still responds synchronously and the client uses that response directly without polling.

In Netlify's **Site settings → Environment variables**, add the same additional keys documented above (`ELEVENLABS_AGENT_ID`, `ELEVENLABS_PHONE_NUMBER_ID`, `GOOGLE_MAPS_API_KEY`, `MOCK_TEST_PHONE`, `OPEN_AI_MODEL`) alongside `ELEVENLABS_API_KEY`/`OPEN_AI_API_KEY` for whichever integrations you want live on the deployed site.

The free tier's usage is credit-based and comfortably covers a low-traffic app like this one — check current limits on [netlify.com/pricing](https://www.netlify.com/pricing/), since the exact conversion rates change over time.

## Project layout

- `src/components/Landing.tsx` — marketing landing page.
- `src/components/SiteHeader.tsx` / `SiteFooter.tsx` — the sticky header and footer shared by every page.
- `src/components/Wizard.tsx` / `StepNav.tsx` — the 3-step wizard shell and step-lock navigation.
- `src/components/panels/InformationGatheringPanel.tsx` — Module 1 voice/JSON intake and the editable review table.
- `src/components/panels/CallingPanel.tsx` — Module 2 discovery/import, approval, agent simulation, browser voice, and real-call confirmation.
- `src/components/panels/AnalysisPanel.tsx` — Module 3 result comparison and transcript evidence.
- `src/components/EventDetailsForm.tsx` — the editable review table shown after a call ends or a JSON file is uploaded.
- `src/components/legal/` — Imprint and Privacy Policy pages.
- `src/lib/eventDetails.ts` — the Module 1 event-details schema, raw-data normalization, classical (non-LLM) validation, and the OpenAI validation prompt/schema — shared by the client form, the local Vite middleware, and the Netlify Functions.
- `src/lib/eventbidApi.ts` / `eventbidTypes.ts` — typed client integration for the Module 2/3 dashboard.
- `src/lib/conversationExtraction.ts` — polls ElevenLabs for post-call analysis results.
- `server/eventbid.ts` — venue discovery, call preparation, ElevenLabs calls, and result normalization (Modules 2/3); persistence is injected (`EventBidPersistence`) so this same logic runs locally and on Netlify.
- `vite.config.ts` — Vite config plus the API proxy plugins used for local dev/preview (all three modules' routes).
- `netlify/functions/` + `netlify.toml` — the Netlify Functions production equivalents of every API route: `conversations.mts`/`validate-event.mts` (Module 1), `eventbid.mts` (Modules 2/3's fast routes) and `simulate-approved-background.mts` (the one slow route, as a Background Function), plus `lib/eventbidBlobsPersistence.ts` and `lib/connectShim.ts` (shared adapters).
