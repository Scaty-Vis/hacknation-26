# Bidly

Voice-first event sourcing. Bidly is a React/Vite web app where a user describes their event to an ElevenLabs Conversational AI agent in a short voice call, reviews and edits the collected details in an on-page form, and (once vendor calling is built out) will get back vendor quotes to compare.

## Current status

The app is a 3-step wizard behind a landing page:

1. **Information Gathering** — fully working. The user talks to the ElevenLabs agent (WebRTC voice call) or uploads a previously downloaded JSON file to skip the call. Once the call ends, the app polls ElevenLabs for the post-call "Data Collection" results, and shows them in an editable table (dropdowns for selections, checkboxes for yes/no fields, text/number/date/time inputs elsewhere). The user can download the data as JSON at any point, must tick a consent checkbox, and then hits **Submit**, which sends the data to an OpenAI-backed validation check (server-side, via a Vite dev/preview middleware route) before advancing to the next step.
2. **Calling** — placeholder only ("This step isn't built yet"). Intended to place structured vendor calls on the user's behalf.
3. **Analysis** — placeholder only ("This step isn't built yet"). Intended to show a side-by-side comparison of vendor offers.

Also included: an Imprint and a Privacy Policy page (linked from the landing page footer), and a persistent header in the wizard with a Home button.

There is no traditional backend server — two API routes (`/api/conversations/:id` and `/api/validate-event`) are implemented as Vite middleware plugins in `vite.config.ts`, so they only run under `vite dev` or `vite preview`, not as static files. This keeps the ElevenLabs and OpenAI API keys out of the browser bundle without standing up a separate server process.

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

```
ELEVENLABS_API_KEY=your_elevenlabs_api_key
OPEN_AI_API_KEY=your_openai_api_key
```

Run the dev server:

```bash
npm run dev
```

Then open the printed local URL, grant microphone access when starting a conversation, and go through the flow. `npm run build` type-checks and produces a production bundle in `dist/`; `npm run preview` serves that build locally (both API routes work in preview mode too, since they're Vite plugins rather than a separate server).

## Project layout

- `src/components/Landing.tsx` — marketing landing page.
- `src/components/Wizard.tsx` / `StepNav.tsx` / `WizardHeader.tsx` — the 3-step wizard shell, step-lock navigation, and persistent header.
- `src/components/panels/` — the three wizard steps (`InformationGatheringPanel.tsx` is the only functional one).
- `src/components/EventDetailsForm.tsx` — the editable review table shown after a call ends or a JSON file is uploaded.
- `src/components/legal/` — Imprint and Privacy Policy pages.
- `src/lib/eventDetails.ts` — the event-details schema, raw-data normalization, and the OpenAI validation prompt/schema (shared between the client form and the server-side validation route).
- `src/lib/conversationExtraction.ts` — polls ElevenLabs for post-call analysis results.
- `vite.config.ts` — Vite config plus the two API proxy plugins (`/api/conversations/:id`, `/api/validate-event`).
