# Bidly

Bidly is a voice-first event sourcing dashboard. A planner describes an event to an ElevenLabs intake agent, reviews the collected Module 1 data, discovers and approves venues, prepares consent-gated venue calls, and compares the resulting quotations.

## Local workflow

The dashboard has three working steps:

1. **Information Gathering**: talk to the ElevenLabs intake agent or upload Module 1 JSON. Review the fields and explicitly consent to vendor discovery, calling, and negotiation. OpenAI validation is optional; deterministic validation is used when OpenAI is not configured.
2. **Venue conversations**: run fictional discovery, use Google Places, or import matching external Module 2 JSON. The first three approved venues receive the Tough gatekeeper, Practical deal-maker, and Premium upseller scenarios. Choose automatic agent simulation, live browser voice role-play, or authorised real phone calls.
3. **Analysis**: show opening and negotiated prices, itemized quote fields, commercial terms, transcript evidence, retained call audio when available, and a price-only recommendation.

The complete local flow runs under one Vite process. Server-side API routes keep credentials out of the browser bundle. Workflow state is written to the ignored `.eventbid-data/` directory and is resumed when the same Module 1 event is reopened.

## Requirements

- Node.js 20 or newer and npm.
- An ElevenLabs intake agent for live Module 1 conversations. JSON upload works without it.
- API access only for the integrations you select. Offline mock discovery and deterministic validation require no provider keys.

## Setup

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

Open the printed local URL. To test the complete pipeline without Twilio:

1. Upload a valid Module 1 JSON.
2. Review it, tick the consent checkbox, and submit.
3. Select **Fictional vendors (demo)** and click **Find venues**.
4. Select at least three venues and click **Approve and prepare**.
5. Keep **AI simulation** selected and click **Run negotiation demo**.
6. The three opening conversations run together. A fourth follow-up uses the cheapest completed quote as genuine leverage.
7. Review the price movement, ranked recommendation, and both rounds of transcript evidence.

For a challenge-valid live voice demonstration, select **Browser voice** instead. A teammate plays the supplied venue role for all three opening calls. After those calls complete, the dashboard unlocks the prepared leverage follow-up. ElevenLabs recordings appear in Analysis after conversation processing when workspace retention allows audio retrieval.

Run checks with:

```powershell
npm test
npm run lint
npm run build
```

## Environment settings

Add values to `.env` in the project root. Never put credentials in source files, JSON uploads, the browser console, or `VITE_` variables.

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

## Project layout

- `src/components/panels/InformationGatheringPanel.tsx`: Module 1 voice/JSON intake.
- `src/components/panels/CallingPanel.tsx`: Module 2 discovery/import, approval, agent simulation, browser voice, and real-call confirmation.
- `src/components/panels/AnalysisPanel.tsx`: Module 3 result comparison and transcript evidence.
- `src/lib/eventbidApi.ts` and `eventbidTypes.ts`: typed dashboard integration.
- `server/eventbid.ts`: local server API, discovery, persistence, call preparation, ElevenLabs calls, and result normalization.
- `vite.config.ts`: Vite configuration and server-side middleware registration.

## Deployment note

The current setup is intentionally local-first. Static-only hosting is not sufficient because the app has secret-bearing server routes. Production deployment should use a long-running Node server and managed persistence instead of `.eventbid-data/`. Deployment work is intentionally deferred.
