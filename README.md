# Persona Onboarding

A hosted web simulator of Persona's onboarding: an iMessage-style thread plus a live voice call.

## Live demo

https://persona-onboarding.rork.app

Tip: triple-tap "Persona" in the thread header to open the debug panel (session state, tool calls, errors) and the **Reset onboarding** button.

## How it works

- **Voice:** an ElevenLabs Conversational AI agent over WebRTC, using `@elevenlabs/react`. The backend mints a short-lived conversation credential (a WebRTC token for calls, a signed URL for text), so the API key never reaches the browser.
- **One brain for voice and text:** typed messages go to the same agent in text-only mode (`@elevenlabs/client` over WebSocket). During a live call, typed messages are sent into the call instead. Only one session is open at a time.
- **Client tools:** the agent calls `save_user_name`, `save_help_need`, `open_gmail_connect`, `save_gmail_status`, `save_agent_name` and `graduate`. Each one updates the UI and saves to the backend the moment it's heard. A failed save is retried once, and a second failure goes to the debug panel instead of breaking the conversation.
- **Session state:** stored in two tables, `onboarding_sessions` and `onboarding_messages`, keyed by an anonymous device id kept in the browser. Every session starts with the saved state passed in as dynamic variables (`user_name`, `help_need`, `gmail_status`, `agent_name`, `resumed`, `last_persona_message`, `opening_line`). So Persona never re-asks, and it picks up where it left off after a hang-up or refresh.
- **Google sign-in:** uses Google Identity Services with basic profile scopes only. The ID token is verified on the server (audience, issuer, expiry and verified email) and is never stored. Only the email is saved.

## Project structure

- `web/`: Vite + React + TypeScript + Tailwind front end.
  - `src/pages/Index.tsx`: the main screen. It wires the thread, call, text chat, tools and Google sign-in together.
  - `src/components/thread/`: iMessage thread UI (header, bubbles, typing indicator, input bar) and cards (Gmail connect, finish).
  - `src/components/call/`: full-screen call UI (timer, waveform, captions, mute, hang up).
  - `src/components/phone/`: iPhone frame (390x844 on desktop, full screen on mobile) and status bar.
  - `src/components/debug/DebugPanel.tsx`: hidden debug panel.
  - `src/hooks/`:
    - `useVoiceCall.ts`: WebRTC call lifecycle and outcomes.
    - `useTextChat.ts`: text-mode agent session.
    - `useOnboardingTools.ts`: the six client tools.
  - `src/state/`:
    - `ThreadProvider.tsx`: thread messages, session state and saving.
    - `GoogleSignInProvider.tsx`: Google Identity Services flow.
  - `src/lib/`:
    - `onboardingApi.ts`: backend client.
    - `sessionVariables.ts`: dynamic variables and opening lines.
    - `device.ts`: anonymous device id.
    - `googleConfig.ts`: Google client config.
  - `src/pages/Privacy.tsx`, `src/pages/Terms.tsx`: legal pages.
- `functions/`: Cloudflare Worker backend, reached from the web app at `/~api`.
  - `index.ts`: routes `get-elevenlabs-token`, `get-elevenlabs-signed-url`, `verify-google-login` and `ping`. It forwards the session routes to the store.
  - `onboarding-store.ts`: the Durable Object with SQLite storage that owns `onboarding_sessions` and `onboarding_messages`. Routes: `get-or-create-session`, `update-session`, `add-message`, `reset-session`. It validates and caps every field.

## Environment variables

Server-only (backend):

- `ELEVENLABS_API_KEY`
- `ELEVENLABS_AGENT_ID`

Web (optional, public):

- `VITE_GOOGLE_CLIENT_ID`: Google OAuth Web Client ID. Falls back to the built-in public client ID.
- `VITE_GOOGLE_ALLOWED_HOSTS`: extra comma-separated hosts where Google sign-in is enabled.

## Stress-tested cases

- Silence
- Interrupting Persona mid-sentence
- Refusing to give a name
- A joke name, then a correction
- Outlook instead of Gmail
- Off-topic questions
- Typing during a call
- Hanging up mid-sentence, then calling back
- Two tabs open at once
- Mic denied, then texting instead
- Rushing to finish

## Next steps

- **Gmail read access:** this is a restricted scope, so it needs Google verification and a security assessment.
- **Real accounts:** replace the anonymous device id with sign-in so progress follows the user across devices.
- **Rate limiting:** limit the token and signed-URL endpoints per device and IP.
- **Native iOS / real iMessage:** move from the web simulator to a native app and a real iMessage channel.
