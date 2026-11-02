# CHAOS ARENA — Netlify Multiplayer Edition

## Publish to Netlify
Drag-and-drop uploads files without running a build, so the TypeScript function would not be bundled. Deploy with the Netlify CLI instead:

```bash
npm install
npx netlify-cli login                          # one-time, opens your browser
npx netlify-cli deploy --build --prod --site-name <your-site-name>   # first deploy (creates the site)
npx netlify-cli deploy --build --prod          # later deploys
```

Or push this folder to a Git repo and import it in the Netlify dashboard; `netlify.toml` already holds the build settings. No environment variables, API keys, or external database are needed — Netlify Blobs is provisioned automatically.

## Run locally
```bash
npm install
npx netlify-cli dev        # http://localhost:8888 with a local Netlify Blobs sandbox
```
Use **+ Device** in the top bar to add up to 8 players on one screen.

## Architecture
- **Netlify Function (`netlify/functions/game.ts`)**: Functions v2 handler (`export default (req: Request) => Response`) served at `/.netlify/functions/game` (no `config.path`, no redirects). The v2 signature is required: only v2 functions receive the Blobs context needed for strong-consistency reads.
- **Netlify Blobs (`src/lib/blobStore.ts`)**: `getStore({ name: 'chaos-arena-rooms', consistency: 'strong' })` with ETag conditional writes (`onlyIfNew` on create, `onlyIfMatch` + retry on updates), so simultaneous submissions are never lost. Requires `@netlify/blobs` 10+.
- **Authoritative Game Engine (`src/lib/gameEngine.ts`, `src/lib/gameTypes.ts`)**: All scoring happens on the server. Functions have no background timers, so a round whose timer has expired is finalized by the next room poll.
- **Frontend (`public/index.html` → `dist/index.html`)**: Sends every action (create, join, ready, start, submit, finalize, next round) to the function and polls room state every 900 ms. If the function is unreachable (e.g. opening the HTML file directly), it falls back to an in-browser offline mode.
