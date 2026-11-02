# AgentX production setup

## Release decision

The application is a **release candidate**, not a deploy-and-forget service.
The code now includes a production landing experience, privacy and terms
templates, tenant-scoped operations data, and D1-backed request limits for
costly voice, blueprint and credential actions. Do not accept public calls or
payments until every item in the launch gate below has an owner and has been
verified in a production-like environment.

## Hosting

AgentX builds into a **Cloudflare Worker**. `npm run build` emits `dist/server/index.js`
(an ESM Worker with a `default.fetch` export), the browser assets in `dist/client`,
and the database migrations in `dist/migrations`.

Deploy it to your own Cloudflare account. Do not deploy to Vercel — the build
output is a Worker, not a Next.js server bundle.

## First-time setup

1. **Create the database.**

   ```
   npx wrangler d1 create agentx-db
   ```

   Paste the returned `database_id` into `wrangler.jsonc`, replacing the
   all-zero placeholder. Bindings live only in `wrangler.jsonc`; do not add an
   inline `config` block to `vite.config.ts` as well, or the bindings are merged
   and duplicated.

2. **Apply migrations.** Nothing applies them automatically. This includes the
   request-limit table introduced in migration `0006_request_limit_guard.sql`.

   ```
   npm run db:migrate          # local development database
   npm run db:migrate:remote   # deployed database
   ```

   Re-run `db:migrate:remote` on every deploy that adds a migration.

3. **Set secrets.** Never commit these; use `wrangler secret put NAME`.

   | Secret | Purpose |
   | --- | --- |
   | `AI_API_KEY` | AI provider credential |
   | `AI_API_BASE_URL` | Provider REST root |
   | `AI_REALTIME_MODEL` | Realtime speech-to-speech model |
   | `AI_TRANSCRIPTION_MODEL` | Live transcription model |
   | `AI_SPEECH_MODEL` | Text-to-speech, for voice previews |
   | `AI_TEXT_MODEL` | Blueprint generation |
   | `NEXT_PUBLIC_SUPABASE_URL` | Identity |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Identity |
   | `STRIPE_SECRET_KEY` | Billing |
   | `STRIPE_PRICE_*` | One id per plan and interval |

   Set a **spend limit** with your AI provider. Call length is not capped in
   application code, so an abandoned open call bills until the browser closes.

4. **Configure identity.** In Supabase, enable email/password, Google OAuth and
   phone OTP with an SMS provider. Add `https://<your-domain>/api/auth/callback`
   to Supabase's redirect allowlist and to Google's authorised redirect URIs.

5. **Configure billing.** Create INR products and recurring prices for Starter,
   Professional and Agency in monthly and annual variants. Point Stripe Checkout
   back at your domain. Stay in test mode until the webhook handler exists.

6. **Complete the public policy pages.** `/privacy` and `/terms` are deliberately
   marked as templates. Add the deploying legal entity, privacy contact, final
   processor list, hosting regions, retention period, governing law and support
   route. Have the completed text reviewed for each target market.

## Launch gate

Before a public launch, confirm all of the following:

- The D1 placeholder database ID has been replaced and all migrations have run.
- The production domain, Supabase redirect URLs and secure-cookie behaviour have
  been verified.
- A real AI spend limit, provider failure alert and human fallback contact are in
  place.
- Every live agent has tested consent wording, approved knowledge, handoff
  ownership and a non-voice fallback channel.
- The completed Privacy Notice names processors and explains retention, deletion
  and cross-border processing.
- Stripe remains in test mode until a signed webhook updates subscription state.
- No external integration is advertised as active until its OAuth or service
  account, permissions and confirmation behaviour have been tested.

## Verify before every deploy

```
npm run typecheck
npm run lint
npm test              # builds, then runs the contract tests
```

`npm run validate:artifact` re-checks that the built Worker exports
`default.fetch` and that migrations were packaged.

## Remaining launch blockers

These application-level items are not yet implemented and must be closed before
charging customers or offering unqualified production availability:

- **No Stripe webhook.** Subscription state never updates, so cancellations and
  failed payments do not revoke access.
- **No plan enforcement or usage metering.** The usage-event table exists, but
  nothing limits agents, minutes or calls per subscription, and call duration is
  not yet recorded against a subscription.
- **No automatic session refresh.** `/api/auth/refresh` exists but nothing calls
  it on a timer, so sessions end when the access token expires.
- **Privacy and terms need final business data.** The pages now exist, but they
  are intentionally templates until the deploying business adds its legal,
  processor and retention details.
- **No retention or deletion job.** Transcripts accumulate in
  `conversation_events` with no TTL and no per-tenant deletion workflow.
- **Telephony is not implemented.** No Twilio code exists.
