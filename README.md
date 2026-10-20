# Rum to Riches

A persistent Caribbean trading game. Start with one battered sloop and 500 gold, trade rum and
other goods between six ports, buy more ships, hire escorts against pirates, and come back later:
voyages keep sailing on the server while you're away.

- **Frontend:** plain HTML, CSS and vanilla JavaScript (ES modules). No build step.
- **Backend:** Netlify Functions only (`/netlify/functions`).
- **Persistence:** Netlify Blobs only (`@netlify/blobs`, store name `rum-to-riches`).
- **No external services.** No database, analytics, payments, email provider or third-party API.

---

## Repository structure

```
/index.html                      Game entry point
/404.html                        "Lost at sea" page
/src/app.js                      App controller: auth, rendering, actions, timers
/src/api.js                      Fetch client for /api/* + localStorage offline cache
/src/views.js                    HTML builders for Fleet / Market / Shipyard / Logbook / dialogs
/src/chart.js                    SVG sea chart with live ship positions
/src/styles.css                  Parchment / nautical chart styling
/src/favicon.svg                 Icon
/netlify/functions/api-auth.js   POST /api/auth     register, login, PIN recovery, logout
/netlify/functions/api-load.js   GET  /api/load     load save (+ resolve voyages finished while away)
/netlify/functions/api-save.js   POST /api/save     apply & persist a player action
/netlify/functions/api-voyages.js POST /api/voyages resolve completed voyages, collect rewards
/netlify/lib/game.js             Game rules, catalog (ports, goods, ships, routes), voyage resolution
/netlify/lib/auth.js             PIN hashing (scrypt), session tokens, lockout
/netlify/lib/names.js            Captain/ship name validation & profanity filter
/netlify/lib/store.js            Netlify Blobs access (getStore / get / setJSON)
/netlify/lib/http.js             JSON responses, body validation, error handling
/tests/game.test.js              Unit tests for game rules and name filter (node --test)
/netlify.toml                    Netlify build, functions and redirect config
/package.json, /package-lock.json
/.nvmrc                          Node 22
/.gitignore
/README.md
```

`/netlify/lib` contains shared modules imported by the functions. It is not a function itself;
Netlify's esbuild bundler inlines it into each function at deploy time.

---

## Requirements

- Node.js **22.12 or newer** (`@netlify/blobs` v11 requires it; `.nvmrc` and `netlify.toml` pin Node 22).
- A free Netlify account and a GitHub account.
- For local development: Netlify CLI (`npm install -g netlify-cli`).

There are **no environment variables to set**. Netlify Blobs is configured automatically inside
Netlify Functions, both in production and under `netlify dev`.

---

## Local development

```bash
npm install
npm install -g netlify-cli      # once
netlify dev                     # http://localhost:8888
```

`netlify dev` serves the static site, runs the functions and provides a local Blobs sandbox
(stored under `.netlify/`, which is git-ignored). Run the unit tests with:

```bash
npm test
```

---

## Deploying to Netlify from GitHub

1. Create a new GitHub repository and push this project to it:
   ```bash
   git init
   git add .
   git commit -m "Rum to Riches"
   git branch -M main
   git remote add origin https://github.com/<you>/rum-to-riches.git
   git push -u origin main
   ```
2. In Netlify: **Add new site → Import an existing project → GitHub**, then pick the repository.
3. Netlify reads `netlify.toml`, so leave the settings as detected:
   - Build command: `echo 'No build step required'`
   - Publish directory: `.`
   - Functions directory: `netlify/functions`
4. Click **Deploy**. Netlify installs `@netlify/blobs`, bundles the four functions and publishes the site.
5. Open the site URL, enlist a captain and play. Saves appear under **Site → Blobs → rum-to-riches**
   in the Netlify UI.

Every push to `main` redeploys automatically. Saved games are not affected by redeploys.

---

## API

All endpoints return JSON. Errors look like `{ "ok": false, "error": "message" }` with a proper
status code (400 invalid body, 401 not signed in / wrong PIN, 402 not enough gold, 404 not found,
405 wrong method, 409 conflict, 413 body too large, 429 locked out, 500 server error).

Authenticated endpoints need `Authorization: Bearer <token>` (returned by `/api/auth`).

| Method & path | Body | Purpose |
| --- | --- | --- |
| `POST /api/auth` | `{ action: "register", captain, pin, email? }` | Create a captain + new game |
| | `{ action: "login", captain, pin }` | Sign in |
| | `{ action: "recover", captain, email, newPin }` | Reset a forgotten PIN using the recovery email |
| | `{ action: "logout" }` (auth header) | Revoke this device's session |
| `GET /api/load` | — | Load the save; resolves any voyages that finished while away. A missing/empty save is replaced with a fresh game |
| `POST /api/save` | `{ action: "buyCargo", shipId, good, qty }` | Buy goods into a docked ship |
| | `{ action: "sellCargo", shipId, good, qty }` | Sell goods from a docked ship |
| | `{ action: "buyShip", type, name, port }` | Commission a new ship |
| | `{ action: "repair", shipId }` | Repair hull (as much as you can afford) |
| | `{ action: "upgrade", shipId, kind }` | `kind` = `hull`, `cannons`, `sails` or `hold` |
| | `{ action: "dispatch", shipId, escortIds?, to }` | Send a ship (plus up to 4 escorts) on a voyage |
| `POST /api/voyages` | `{ action: "resolve" }` | Resolve all voyages whose arrival time has passed |
| | `{ action: "collect", voyageId }` | Bank a completed voyage's gold and dock its ships |
| | `{ action: "collectAll" }` | Collect every completed voyage |

`/api/save` is **server-authoritative**: the browser sends the action it wants, the function
validates it against the state stored in Blobs, applies it and saves the result. The browser can
never write arbitrary gold or fleet data.

### Storage layout (Netlify Blobs)

- Store: `rum-to-riches` (opened with `getStore({ name: "rum-to-riches", consistency: "strong" })`)
- One key per captain: `player:{playerId}`, where `playerId` is the normalised captain name
  (`"Anne Bonny"` → `player:anne-bonny`).
- Written with `setJSON()`, read with `get(key, { type: "json" })`.
- The value holds the captain's display name, auth data (scrypt-hashed PIN, scrypt-hashed recovery
  email, a masked email hint, hashed session tokens, lockout counters) and the full game state:
  gold, ships (hull, cargo, upgrades, location, status), voyages (departure/arrival timestamps,
  escorts, outcomes), route pirate-risk, history and stats.

No queries, indexes or relational behaviour are used. Everything is a single key lookup.

**Concurrent writes:** every write is a read-modify-write guarded by the blob's ETag
(`getWithMetadata` → `setJSON(..., { onlyIfMatch: etag })`, retried on conflict), and new captains
are created with `onlyIfNew: true`, so two tabs or devices acting at once can't overwrite each
other on Netlify. Note: the local `netlify dev` Blobs sandbox does not return ETags, so this
protection only applies on a deployed site.

---

## Accounts: captain name + PIN

- **Captain name:** 3–20 characters, letters/numbers/spaces/apostrophes/hyphens, must start with a
  letter. Names containing profanity or slurs (including l33t-speak like `Sh1t`) and reserved names
  (`admin`, `moderator`, `support`, …) are rejected. The same filter applies to ship names.
  The filter list lives in `netlify/lib/names.js`.
- **PIN:** 4–6 digits, stored as a salted scrypt hash. 5 wrong attempts lock the captain for
  15 minutes.
- **Recovery email (optional):** If you forget your PIN, use **Lost PIN**, enter your captain name,
  the same email you registered with, and a new PIN. The email is stored only as a hash.
  **No email is ever sent**: this project deliberately uses no email service. If you didn't give an
  email when enlisting, a forgotten PIN can't be reset.
- Sessions last 30 days per device (up to 5 devices). Sign in on another device with the same name
  and PIN and your fleet is there.

---

## How to play

1. **Enlist** with a captain name and PIN. You start in **Port Royal** with the sloop
   *The Salty Gull* and 500 gold.
2. **Trade cargo:** open the **Market** (or click a port on the chart). Goods can only be bought
   where they're made (green prices). The *Best sale* column shows where each good fetches most.
   - Port Royal: rum, sugar · Havana: sugar, tobacco · Nassau: cotton · Tortuga: tobacco ·
     Cartagena: spices · Bridgetown: rum, cotton
3. **Set sail:** pick a ship, a destination along a charted route and optional escorts. The dialog
   shows voyage time, pirate attack chance and the value of your cargo at the destination. Voyages
   take a few minutes of real time and keep going if you close the browser.
4. **At sea:** each voyage is resolved on the server once its arrival time passes:
   - **Storms** (12%): hull damage, and sometimes the fleet is blown off course to a neighbouring port.
   - **Pirates:** chance = route risk, reduced by escort cannons (up to −60%). Your total guns fight
     the pirates' strength. Win → bounty gold and the route gets safer. Lose → 40–80% of cargo
     plundered, heavy damage, and the route gets more dangerous.
   - Cargo is sold automatically at the port where the voyage ends.
5. **Collect** the voyage in the Fleet tab to bank the gold and dock the ships.
6. **Repair** damaged ships (1.5 gold per hull point). Ships below 40% hull can't sail.
7. **Upgrade** ships (3 levels each): Oak Planking (hull), Gun Deck (cannons), Canvas & Rigging
   (speed), Expanded Hold (cargo).
8. **Grow your fleet** in the **Shipyard** (Port Royal, or any port where you have a ship docked):
   Sloop, Schooner, Brigantine, Galleon (traders) and Privateer Cutter, Frigate (escorts).
   Up to 12 ships.

Every meaningful action (buy/sell cargo, dispatch, collect, repair, upgrade, buy ship, voyage
completion) is saved to Netlify Blobs immediately. The latest state is also kept in `localStorage`
purely as an offline cache so the last-known fleet can be shown when the network is down.

---

## Tuning

All balance numbers (prices, routes, voyage durations, ship stats, upgrade costs, storm and
pirate odds) are constants at the top of `netlify/lib/game.js`. Voyage durations are in seconds;
multiply them to make voyages last hours instead of minutes.
