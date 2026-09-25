# Synapse

*The living constellation of human knowledge.*

A zero-backend, mobile-first web app that turns any academic field into an
explorable, physics-driven knowledge graph, powered by the free
[OpenAlex Topics API](https://docs.openalex.org/api-entities/topics).

## Run locally

No build step. Just serve the folder statically (ES modules require `http://`, not `file://`):

```bash
npx serve .
# or
python3 -m http.server 8080
```

Then open the printed local URL.

## Deploy to Cloudflare Pages (via GitHub)

1. Push this folder to a new GitHub repository.
2. In the Cloudflare dashboard: **Workers & Pages → Create → Pages → Connect to Git**.
3. Select the repo. Build settings:
   - **Framework preset:** None
   - **Build command:** *(leave empty)*
   - **Build output directory:** `/`
4. Deploy. That's it — no environment variables or backend required.

## How it works

- `js/app.js` — search, caching, UI wiring, PWA bootstrap.
- `js/graph.js` — D3 v7 force simulation + SVG rendering, loaded from jsDelivr's ESM CDN build (no npm install needed).
- `js/mock-data.js` — 4 fully-connected offline topic clusters that activate automatically if `api.openalex.org` is unreachable, so the app never shows a dead end.
- Topic payloads are cached in `localStorage` under `synapse:topic:{id}` for 7 days.
- Saved ("Codex") topics persist under `synapse:codex`.

## Keyboard shortcuts (desktop)

| Key | Action |
|---|---|
| `/` | Focus search |
| `Space` | Freeze / resume physics |
| `Esc` | Close inspector / modal |
| `R` | Random spark |
| `F` | Re-center view |

## Credits

Built by **Suva**. Feedback → `suvadipchakraborty@gmail.com` (via the in-app About modal).
