# Running from source

Only needed if you want to develop, self-host, or run fully offline from day
one — most people should just use [the hosted link](../index.md).

You need [Node.js](https://nodejs.org) (18 or newer). That's the only
dependency.

```bash
git clone https://github.com/sheabrennan/TheDecateronExperiment.git
cd TheDecateronExperiment
npm install
npm run dev
```

Open the URL it prints (`http://localhost:5173`) in a browser. That's it —
no database, no accounts, no config.

To build a static bundle you can host anywhere (or just open from disk):

```bash
npm run build
```

The output lands in `web/dist`.

| script | does |
|---|---|
| `npm run dev` | dev server on :5173 |
| `npm run build` | static bundle into `web/dist` |
| `npm test` | invariant + unit suite (`node --test`) |
| `npm run validate` | validate a pack: `npm run validate -- path/to/pack.json` |
| `npm run docs:reference` | regenerate the pack field reference from `src/pack/schema.js` |
| `npm run docs:screenshots` | regenerate `docs/img/*.png` via Playwright (needs `npx playwright install chromium` once) |

## Project layout

```
src/engine/   topology, generation, orientation, pathfinding, game state
src/pack/     pack schema, loader, validator
src/io/       session (what the server used to do) and local storage
packs/        content packs
web/          React UI
docs/         this documentation site (MkDocs)
```

## Building the docs site locally

The documentation site is [MkDocs Material](https://squidfunk.github.io/mkdocs-material/).

```bash
pip install mkdocs-material
mkdocs serve
```

Opens a live-reloading preview at `http://localhost:8000`. The pack field
reference is generated, not hand-written — after changing `src/pack/schema.js`,
regenerate it with:

```bash
node scripts/gen-pack-reference.js
```

The screenshots in `docs/img/` are generated too, from the bundled
**Field Reference Example** pack, using [Playwright](https://playwright.dev):

```bash
npx playwright install chromium   # once
npm run docs:screenshots
```

This boots its own dev server on a scratch port, drives a headless Chromium
through generating a dungeon and opening the pack builder, and writes fresh
PNGs to `docs/img/`. Re-run it after a visual change to the app that the
docs screenshots should reflect.

See [architecture notes](architecture.md) for how the engine and packs are
put together.
