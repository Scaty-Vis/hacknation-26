# Bidly

Voice-first event sourcing. Bidly is a React/Vite web app where a user describes their event to an ElevenLabs Conversational AI agent in a short voice call, reviews and edits the collected details in an on-page form, and (once vendor calling is built out) will get back vendor quotes to compare.

## Current status

The app is a 3-step wizard behind a landing page:

1. **Information Gathering** — fully working. The user talks to the ElevenLabs agent (WebRTC voice call) or uploads a previously downloaded JSON file to skip the call. Once the call ends, the app polls ElevenLabs for the post-call "Data Collection" results, and shows them in an editable table (dropdowns for selections, checkboxes for yes/no fields, text/number/date/time inputs elsewhere). The user can download the data as JSON at any point, must tick a consent checkbox, and then hits **Submit**, which sends the data to an OpenAI-backed validation check (server-side, via a Vite dev/preview middleware route) before advancing to the next step.
2. **Calling** — placeholder only ("This step isn't built yet"). Intended to place structured vendor calls on the user's behalf.
3. **Analysis** — placeholder only ("This step isn't built yet"). Intended to show a side-by-side comparison of vendor offers.

Also included: an Imprint and a Privacy Policy page, and a shared sticky header + footer (`SiteHeader.tsx` / `SiteFooter.tsx`) present on every page, so Home/Get Started and the legal links are always reachable.

There is no traditional standalone backend server. Two API routes — `/api/conversations/:id` and `/api/validate-event` — exist in two parallel forms that share the same logic from `src/lib/eventDetails.ts`:
- **Local dev/preview**: Vite middleware plugins in `vite.config.ts` (`configureServer`/`configurePreviewServer`), active under `vite dev` or `vite preview`.
- **Production on Netlify**: Netlify Functions in `netlify/functions/` (`conversations.mts`, `validate-event.mts`), active once deployed — see "Deploying to Netlify" below.

Either way, the ElevenLabs and OpenAI API keys stay server-side and never reach the browser bundle.

## Requirements

- **Node.js 20+** and npm (developed against Node 24; anything with native `fetch` and top-level `for await` support in Node config files works).
- An **ElevenLabs** account with a Conversational AI agent configured (agent ID is currently hardcoded in `src/components/panels/InformationGatheringPanel.tsx` as `AGENT_ID`), including a Data Collection schema matching the fields in `src/lib/eventDetails.ts` (`event_category`, `requester`, `event_type`, `fixed_date`, `date_range_start`, `date_range_end`, `fixed_start_time`, `start_time_start`, `start_time_end`, `duration`, `location`, `location_radius_km`, `guest_count`, `guest_count_exact`, `catering_required`, `venue_catering_mandatory`, `catering_food`, `budget_per_guest`, `budget_currency`).
- An **OpenAI** API key with access to `gpt-4o` (used for the post-submit validation check).

## Setup

Install dependencies:

```bash
npm install
```

Create a `.env` file in the project root (never commit this — it's already git-ignored) with:

```env
ELEVENLABS_API_KEY=your_elevenlabs_api_key
OPEN_AI_API_KEY=your_openai_api_key
```

Run the dev server:

```bash
npm run dev
```

Then open the printed local URL, grant microphone access when starting a conversation, and go through the flow. `npm run build` type-checks and produces a production bundle in `dist/`; `npm run preview` serves that build locally (both API routes work in preview mode too, since they're Vite plugins rather than a separate server).

## Deploying to Netlify (free tier)

The frontend is a static build, but the two API routes need to run as **Netlify Functions** in production — Netlify's free tier serves static files via CDN, it doesn't run a Vite server, so the `vite.config.ts` middleware doesn't apply once deployed. `netlify/functions/conversations.mts` and `netlify/functions/validate-event.mts` are the production equivalents (same logic, reused from `src/lib/eventDetails.ts`, adapted to Netlify's Fetch API-style function signature). `netlify.toml` at the repo root wires up the build command, publish directory, and functions directory.

1. Push this repo to a Git provider (GitHub/GitLab/Bitbucket).
2. In Netlify: **Add new site → Import an existing project**, pick the repo. Netlify reads `netlify.toml` automatically (build command `npm run build`, publish dir `dist`, functions dir `netlify/functions`) — no manual config needed.
3. In **Site settings → Environment variables**, add `ELEVENLABS_API_KEY` and `OPEN_AI_API_KEY` (same values as your local `.env` — never commit these). This is the only step that can't be automated from the repo.
4. Deploy. Every push to the connected branch redeploys automatically.

Alternatively, without connecting Git: `npx netlify-cli login`, `npx netlify-cli init`, `npx netlify-cli deploy --prod` from the project root (still requires setting the two env vars via `netlify env:set` or the dashboard first). Drag-and-drop deploys on netlify.com don't support Functions, so they won't work for this app.

The free tier's usage is credit-based and comfortably covers a low-traffic app like this one — check current limits on [netlify.com/pricing](https://www.netlify.com/pricing/), since the exact conversion rates change over time.

## Project layout

- `src/components/Landing.tsx` — marketing landing page.
- `src/components/SiteHeader.tsx` / `SiteFooter.tsx` — the sticky header and footer shared by every page.
- `src/components/Wizard.tsx` / `StepNav.tsx` — the 3-step wizard shell and step-lock navigation.
- `src/components/panels/` — the three wizard steps (`InformationGatheringPanel.tsx` is the only functional one).
- `src/components/EventDetailsForm.tsx` — the editable review table shown after a call ends or a JSON file is uploaded.
- `src/components/legal/` — Imprint and Privacy Policy pages.
- `src/lib/eventDetails.ts` — the event-details schema, raw-data normalization, classical (non-LLM) validation, and the OpenAI validation prompt/schema — shared by the client form, the local Vite middleware, and the Netlify Functions.
- `src/lib/conversationExtraction.ts` — polls ElevenLabs for post-call analysis results.
- `vite.config.ts` — Vite config plus the two API proxy plugins used for local dev/preview.
- `netlify/functions/` + `netlify.toml` — the production equivalents of those two API routes, for deploying to Netlify.
