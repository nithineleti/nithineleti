# AgentX Voice Agent Platform

AgentX is an independent, multi-tenant voice-agent creation platform. Businesses can create, customise, publish and operate voice agents for websites, browser conversations and telephone workflows.

## Main capabilities

- No-code voice-agent studio
- Agent types, languages, voices, instructions and guardrails
- Voice previews and browser conversations
- Unique Agent ID and one-time private access key
- Client-owned agent workspace
- Business knowledge-source architecture
- Website widget and domain restrictions
- Subscription plans and usage controls
- Twilio inbound and outbound calling foundation
- Integration, analytics, marketplace and enterprise foundations

## Local setup

1. Install Node.js 22 or newer.
2. Install dependencies with `npm ci`.
3. Copy `.env.example` to `.env.local` and add your own service credentials.
4. Run `npm run dev`.
5. Open the local address printed by the development server.

Never commit `.env.local`, secret keys, access tokens or customer credentials.

## Production setup

Use Supabase for identity and application data, Stripe for INR subscriptions, an AI engine for voice intelligence, and Twilio for telephone calls. Add all secrets only through encrypted hosting environment settings. See `DEPLOYMENT.md` for the activation checklist.

## Validation

- `npm run build` — production build
- `npm test` — project tests
- `npm run validate:artifact` — deployment artifact validation
