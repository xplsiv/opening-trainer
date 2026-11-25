# Opening Trainer

A personal chess opening trainer for phone and desktop. Learn openings move by move,
then revise them with spaced-repetition quizzes (FSRS). Works fully offline as an
installable web app, and syncs progress between devices through each user's own Dropbox.
Not a public service: you host it yourself and share it with a few friends, each with
their own data.

## Features

- **49 built-in openings** (139 lines, ~935 quiz positions): 1.e4 and 1.d4 systems for White,
  main defences for Black, flank openings, and 15 well-known gambits (Danish, Englund, Latvian,
  Elephant, Evans, Smith-Morra, Budapest, Benko, Alien, Martian, …). See `CONTENT_REVIEW.md`.
- **Game analysis** (tab *Analysis*, top left): load your games from Chess.com by username
  (public API, no login) or paste any PGN. Stockfish 19 (lite, single-threaded WASM, in
  `public/engine/`, GPL-3.0) checks every move in the browser and you get accuracy per player,
  an estimated game rating, move ratings (Brilliant, Great, Best, Excellent, Good, Book,
  Inaccuracy, Mistake, Miss, Blunder), an evaluation bar and graph, and the best move with its
  line for every error. Accuracy uses the open Lichess formula; the game rating and move ratings
  are approximations, not Chess.com's own numbers.
- **Two tabs on the home screen:** *Openings* and *Gambits*. An opening goes to the Gambits tab
  when its `Tags` header contains `gambit` (also works for imported PGNs).
- **Learn mode:** step through lines with forward/back, a variation picker, branch buttons
  and short comments on the key ideas.
- **Quiz modes:**
  - *Play the next move*: one position at a time; correct answers show the comment and the
    opponent replies, so lines flow naturally.
  - *Full line recall*: play a whole line from move 1. Option to stop at the first mistake.
- **Spaced repetition:** every position where it is your move is a card. Answers are graded
  automatically (correct → Good, with hint → Hard, wrong/revealed → Again, fast answers on
  well-known cards → Easy). Transpositions and alternative book moves count as correct.
- **Quiz setup:** any subset of openings (search, side, ECO family, tags), optionally
  narrowed to variations; "Due for review" or "Practice all"; saved named sets.
- **PGN import** (paste or file, variations and comments kept, multi-chapter studies merged).
- **Cloud sync** with Dropbox (optional), plus JSON backup export/import.
- Light/dark theme, touch and mouse, tap-to-move and drag, promotion picker, keyboard shortcuts.

## Run locally

Requires Node.js 24 (any recent LTS should work).

```sh
npm install
npm run dev              # http://localhost:5173
npm test                 # unit tests (Vitest)
npm run build            # production build in dist/ (type-checks first)
npm run preview          # serve dist/ at http://localhost:4173 (service worker active)
npm run content:reports  # regenerate ECO_REPORT.md and CONTENT_REVIEW.md
```

## Keyboard shortcuts (desktop)

| Where | Keys |
|---|---|
| Learn | ← / → step, ↑ / ↓ switch variation, Home start position, F flip |
| Quiz | H hint, S skip, F flip, Enter next / reveal, R reveal after a mistake, Esc quit |

## Project structure

```
content/openings/*.pgn   built-in openings, one file per opening
content/lichess/         Lichess opening names (CC0), used only by the ECO check
scripts/                 content reports (check-eco.ts, content-review.ts), icon generator
src/content/             PGN → move tree (chessops/pgn + chess.js), bundled content loader
src/engine/              tree, cards, move acceptance, FSRS scheduling, quiz state machines (UI-free)
src/db/                  IndexedDB (Dexie) schema and repository
src/sync/                merge logic, sync manager, Dropbox provider, backup file handling
src/ui/                  React screens and the chessground board
tests/                   Vitest unit tests (engine, content legality, merge, sync, Dropbox, DB)
```

## Add a built-in opening

1. Create `content/openings/<slug>.pgn`. The file name (without `.pgn`) is the opening's id;
   **do not rename it later**, progress is stored per id.
2. Headers:
   ```
   [Opening "Sicilian Defense: Najdorf Variation"]   display name (Lichess naming if possible)
   [ECO "B90"]
   [Side "black"]                                      the colour you play
   [Tags "e4,sicilian,sharp"]                          comma separated, used by the filters
   [Difficulty "3"]                                    1–3
   [Origin "Ruy López de Segura (1561)"]               optional: who invented / named it
   ```
3. Moves in standard PGN. Put alternatives in `( … )` **directly after the move they replace**.
   Lines of 8–14 moves work best (the tests allow 6–16).
4. Comments in `{ … }` are shown after you answer. Put the important ones on your own moves.
   Name a variation with `[%name …]` inside a comment on the move where it starts:
   `6. Bg5 { [%name 6.Bg5 Main Line] Pinning the knight… }`
5. Run `npm test` (fails on illegal moves, missing headers, lines without comments) and
   `npm run content:reports`, then check `ECO_REPORT.md` for name/ECO mismatches.

Editing an existing opening keeps progress: cards are keyed by opening id + position, so
positions that still exist keep their history. Removed positions are simply hidden.

## Import your own PGN

Home → **+ Import PGN**. Paste text or choose a `.pgn` file (up to 2 MB). The app shows
problems (e.g. illegal moves, which are left out), the lines it found and how many positions
you will answer. Enter a name, the side you play and optional tags/ECO, then **Import**.
A Lichess study export with several chapters can be merged into one opening; each chapter's
branch is named after the chapter. Imported openings work exactly like built-in ones and
can be deleted from their Learn page. They are included in sync and backups.

## Dropbox setup (cloud sync)

Sync is optional. Without an app key the app works fully, with progress stored on the
device only (the top bar shows "Local only"). Each user connects their **own** Dropbox, so
friends' data stays separate. There is no server and no client secret: the app uses the
OAuth 2 PKCE flow in the browser with an "App folder" app.

1. Go to <https://www.dropbox.com/developers/apps> and click **Create app**.
   - API: **Scoped access**
   - Access type: **App folder** (the app can only see `Apps/<your app name>/`)
   - Name: anything unique, e.g. `opening-trainer-yourname`
2. **Permissions** tab: tick `files.content.read` and `files.content.write`
   (`files.metadata.read` is included), then click **Submit**.
   Do this before anyone connects; changed scopes need a new login.
3. **Settings** tab:
   - **OAuth 2 → Redirect URIs**: add every address the app is served from, exactly,
     including the trailing slash:
     - `http://localhost:5173/` (development) and `http://localhost:4173/` (preview)
     - your deployed URL, e.g. `https://<user>.github.io/<repo>/` or `https://<project>.pages.dev/`
   - **Allow public clients (Implicit Grant & PKCE)**: set to **Allow**.
   - Copy the **App key** (not the secret; the secret is never used).
4. Put the key in an env file (not committed):
   ```sh
   # .env.local
   VITE_DROPBOX_APP_KEY=your_app_key
   ```
   For deployments, set the same variable in the build environment (see Deploy).
   The key is not a secret: it ends up in the JavaScript bundle by design.
5. In the app: **Settings → Connect Dropbox**, approve, and you are sent back to the app.

New Dropbox apps start in *Development* status, which is meant for a small number of
users. That is enough for you and a few friends; check the app's Settings page in the
Dropbox console for the current user limit.

### How sync works

- One JSON file, `opening-trainer-sync.json`, in the app folder (schema-versioned).
  It holds card progress, review history, sets, settings and imported openings.
  Built-in content is not synced.
- Sync runs when the app opens, after each quiz session, about 10 seconds after a change,
  when the device comes back online, and when the page is hidden. Use
  **Settings → Sync now** to force it. Offline changes are kept and synced later.
- Changes are merged, never overwritten: per position the most recent review wins,
  review history is a union, and sets/imported openings/settings use the newest edit
  (deletions are kept as tombstones so they win when newer). Two devices editing offline
  converge once both have synced.
- Uploads only succeed if the cloud file has not changed since it was read; otherwise the
  app pulls, merges again and retries.

### Security note

Dropbox recommends short-lived tokens without refresh tokens for pure browser apps.
This app deliberately keeps a refresh token (stored in the browser's IndexedDB) so you
do not have to log in again every few hours. The token only grants access to this app's
own folder. Anyone with access to your browser profile could use it. **Settings →
Disconnect** revokes it, and you can also revoke access under Dropbox → Settings →
Connected apps.

## Backup

**Settings → Export backup** downloads the same JSON as the sync file;
**Import backup** merges a backup into the current data (nothing is overwritten with
older data). Use it before switching browsers if you do not use Dropbox.

## Deploy

The app is a static site (`dist/`), so any static host works. Routing uses `#/…` URLs, so no
server rewrites are needed. Remember to add the deployed URL to the Dropbox redirect URIs.

### Cloudflare Pages

1. Push the repository to GitHub (or GitLab) and create a Pages project from it
   (Cloudflare dashboard → Workers & Pages → Create → Pages → connect the repository).
2. Build settings: framework preset *None*, build command `npm run build`,
   output directory `dist`.
3. Environment variables: `NODE_VERSION` = `24`, and optionally `VITE_DROPBOX_APP_KEY`.
4. The app is served at `https://<project>.pages.dev/` (base path `/`, nothing else to set).

### GitHub Pages

The workflow `.github/workflows/deploy-pages.yml` tests, builds and deploys on every push
to `main`.

1. Repository → Settings → Pages → Source: **GitHub Actions**.
2. Optional: Settings → Secrets and variables → Actions → **Variables** → add
   `VITE_DROPBOX_APP_KEY`.
3. Push to `main`. The site is served at `https://<user>.github.io/<repo>/`; the workflow
   sets `BASE_PATH=/<repo>/` so assets, the manifest and the offline cache use that path.

To build for a sub-path locally: `BASE_PATH=/my-repo/ npm run build` (PowerShell:
`$env:BASE_PATH='/my-repo/'; npm run build`).

### Install on a phone

Open the deployed URL, then *Add to Home Screen* (iOS Safari: Share → Add to Home Screen;
Android Chrome: menu → Install app). The app and all built-in openings are cached for
offline use; updates are picked up automatically the next time it is opened online.

## Tech

Vite + React + TypeScript · [chessground](https://github.com/lichess-org/chessground) (board) ·
[chess.js](https://github.com/jhlywa/chess.js) (rules) · [chessops](https://github.com/niklasf/chessops) (PGN parsing with variations) ·
[ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs) (FSRS) · Dexie (IndexedDB) ·
vite-plugin-pwa · Vitest. Opening names cross-checked against
[lichess-org/chess-openings](https://github.com/lichess-org/chess-openings) (CC0).

## License

GPL-3.0-or-later (see `LICENSE`). The board library chessground and the PGN parser chessops
are GPL-3.0, so this app is too. In practice: if you share the app with friends, keep this
source repository accessible to them (for example a public or shared GitHub repository),
and keep the license file and notices intact.
