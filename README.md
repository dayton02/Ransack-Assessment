# Play & Win: starter project

A blank app for the Ransack take-home. Build a working **mobile** demo of the app in the **[client brief](client-brief.pdf)**.

**Deadline:** Sunday, 23:59.

**Required (minimum viable product):**

- **The full flow**, from the Landing Screen to the Final Screen, working on a phone.
- **Keep it flexible.** Keep all settings (questions, pass mark, game limits, text) in one place, and tell us where in your notes. We'll test changing them.

**Strongly recommended next step: data collection and the Admin Screen.** Save what happens in the app and show the stats on the Admin Screen. The server is already set up for you. See [Saving data](#saving-data).

Everything else is extra. AI for code is fine (and encouraged). Please don't use AI-generated images or artwork.

## Setup

1. Click **Use this template → Create a new repository** and make it **public**. Please don't fork. Email the link to your repo to **chase@ransack.sg** as soon as you've created it, so we can follow your progress.
2. Clone your new repo and install [Node.js](https://nodejs.org) 20.19 or newer.
3. In the project folder, run:

   ```bash
   npm install
   npm start
   ```

4. Open `http://localhost:5173`. You should see **"Setup works!"** and **"Server connected ✓"**.

`npm start` runs both the app and the server. Always use it to run the project.

## Testing on mobile

Use either option. Testing on a real phone is best if you can.

**Option A: your phone**

1. With `npm start` running, look for the **Network** address it prints (e.g. `http://192.168.1.23:5173`).
2. Open that address on a phone connected to the **same Wi-Fi**.
3. Can't connect? On Windows, allow Node.js through the firewall. Some Wi-Fi networks block this, so try your phone's hotspot instead.

**Option B: browser developer tools**

1. With `npm start` running, open the app in Chrome or Edge.
2. Press **F12** (Mac: **Cmd + Option + I**), then click the **phone/tablet icon** (or press **Ctrl + Shift + M**).
3. Pick a phone (e.g. iPhone 14) from the dropdown at the top.

## Saving data

A browser can't write files on a computer, so the app sends data to a small **server** that runs on your computer, and the server saves it. This is already set up. You just fill in the blanks.

```
Phone ──▶ app (port 5173) ──▶ /api/... ──▶ server.js (port 3001) ──▶ your file
```

**Fill in:**

- **`src/api.js`:** `saveRecord(record)` and `getRecords()`. Your app calls these, the same way you'd use a database service.
- **`server.js`:** the two `/api/records` routes, which save records to a file and send them back.

**You decide:**

- **How to save:** when the app should save, and what gets saved.
- **The format:** what one record looks like, and the file format (e.g. CSV, JSON, or another format you prefer).
- **How to retrieve:** how the Admin Screen gets the records and turns them into the stats in the brief.

Every phone must save to the **same file on your computer**, not each phone's own storage. Use a local file, not a hosted database (e.g. Supabase, Firebase). Node's built-in [`fs`](https://nodejs.org/api/fs.html) module can read and write files. Change the functions and routes, or add your own, if you prefer.

## What's inside

```
client-brief.pdf         What the client wants
public/bg.png            Background image
server.js                The server (fill in the save/load routes)
vite.config.js           Connects the app to the server (no changes needed)
src/api.js               saveRecord() and getRecords() for your app to call
src/main.js              App entry point (placeholder screen)
src/style.css            Global styles
src/data/questions.json  The quiz questions
```

Questions can have any number of options. Each question has an `answerIndex`: the position of the correct option, counting from 0.

```json
{ "question": "Which of these is a fruit?", "options": ["Carrot", "Tomato"], "answerIndex": 1 }
```

You can use any framework or library, as long as `npm install` and `npm start` still run everything.

## Your notes

- **Where to change the settings:**
  All configurable settings live in one single file: **[`src/config.js`](src/config.js)** (imported directly by both the Vite frontend and `server.js`):
  - **Event branding & text:** `config.event` (club name, event name, title, tagline, version) and `config.copy` (all UI copy in English, Chinese, Malay, and Tamil — with automatic fallback to English).
  - **Languages:** `config.languages` (`EN`, `中文`, `BM`, `தமிழ்`).
  - **Pass mark & prize lock:** `config.rules.passMark` (default `0.8` = 80%; dynamically recalculates the required winning score for both games) and `config.rules.onePrizePerDevice` (default `true` — limits 1 prize per phone with Play-for-Fun mode and a Staff PIN Family-Pass Override).
  - **Fun-Fact Quiz:** `config.quiz` (`questions`, `questionLimit`, `shuffleQuestions`, `pointsPerCorrect`). Questions support any number of options with 0-based `answerIndex`; optional `translations` localize each question while any newly added plain question works automatically across all languages.
  - **Forest Canopy Memory Match:** `config.memory` (`timeLimitSeconds`, `pairCount` from 2–8, `pointsPerPair`, `mismatchDelayMs`, `symbols`). Fixed max score is `pairCount * pointsPerPair` (default `6 × 100 = 600`).
  - **Staff / Admin PIN:** `config.admin.staffPin` (default `1234`, also overridable via the `STAFF_PIN` environment variable).
  - *Note:* `src/data/questions.json` was folded into `src/config.js` so there is only one place to update.

- **How saving and loading works, and why I chose that format:**
  - All phones talk through `src/api.js` → Vite `/api` proxy → `server.js` → `db.js`, writing to a single shared **SQLite database file** (`data/play-and-win.db`) using Node's built-in `node:sqlite` (`DatabaseSync`) with **`PRAGMA journal_mode = WAL;`** and explicit transactions.
  - **Why SQLite WAL instead of raw JSON/CSV:** When multiple phones submit scores simultaneously on event Wi-Fi, raw `fs.writeFile` JSON writes can overwrite or corrupt each other, and updating a prize's `claimed = true` state in append-only CSV/JSONL is error-prone. SQLite stays a single local file with zero database server setup, guarantees ACID concurrency safety, supports atomic duplicate-claim prevention (`409 Conflict`), and exports a clean CSV (`GET /api/admin/export.csv`) on demand.
  - **Compatibility safeguard:** Because `package.json` supports Node `^20.19.0 || >=22.12.0` (and `node:sqlite` ships from Node 22.5+), `db.js` automatically falls back to a promise-serialized atomic temp-file JSON store on Node 20.x—with zero native C++ (`node-gyp`) build dependencies to break `npm install`.

- **Assumptions I made:**
  - **Preventing repeat claims (with family phone-sharing escape hatch):** By default (`config.rules.onePrizePerDevice: true`), each phone gets a persistent `device_id` (stored in both `localStorage` and a cookie) tracked in SQLite alongside a hashed client IP. Once redeemed, refreshing or replaying on that phone enters **Play-for-Fun** mode (no second claim code issued), and even simultaneous two-tab wins are blocked atomically on the server. If a parent genuinely shares one phone with multiple kids at the booth, staff can tap **"Staff: Unlock for Next Family Member"** with the 4-digit PIN to grant one more prize win. If someone uses Private/Incognito mode from the same phone IP, a **"Repeat IP"** warning alerts staff in both the Redeem modal and Admin Dashboard.
  - **Singapore multi-generational audience:** Added a top 4-language switcher (`EN | 中文 | BM | தமிழ்`) that updates screens and active games in-place without losing timer, score, or claim state.
  - **LAN HTTP testing:** Used a `crypto.getRandomValues` UUID generator instead of `crypto.randomUUID()` alone because browsers restrict `crypto.randomUUID()` over plain `http://192.168.x.x` Wi-Fi addresses.
  - **Admin access:** Accessible directly via `#/admin` (for bookmarking on staff phones/tablets) or by triple-tapping the version pill in the Landing Screen footer, protected by a backend-verified 4-digit staff PIN (`1234` default).

- **What I prioritised, and why:**
  1. **All-ages accessibility & polish:** Chose **Forest Canopy Memory Match** (45s, 6 pairs, 600 max score) over reflex-based games so toddlers and grandparents can play on equal footing with big tap targets, flat vector SVG icons + native-language labels, and immediate confetti celebration on early clear.
  2. **Zero-friction configurability:** Every knob (questions, option counts, pass mark, timer, pair count, copy, PIN) lives in `src/config.js` and dynamically updates all calculations and labels.
  3. **Real-world booth reliability:** Concurrency-safe SQLite WAL backend, server-authoritative claim redemption (defeating prize-screen screenshots), Admin Dashboard with claim code lookup + CSV export, and zero external framework bloat (Vanilla JS + Vite + native CSS).

- **What I left out or didn't finish, and why:**
  - **Audio / sound effects:** Intentionally omitted so phones don't unexpectedly chime loudly in a busy community hall.
  - **Offline PWA queuing:** Assumed players are connected to the local event Wi-Fi hosting `npm start`.
  - **Per-staff user accounts:** Kept staff authentication to a single fast 4-digit booth PIN to keep prize-line throughput quick.

- **Time planned vs. time spent:**
  - Planned ~3–4 hours across brief analysis, architecture planning, implementation, and mobile/API verification; completed within budget by keeping the stack lean (Vanilla JS + native CSS + built-in `node:sqlite`).

- **How I used AI (and one suggestion I changed or didn't use):**
  - Used AI to plan the architecture, write the modular frontend/backend code, author the hand-coded flat SVG forest icons (no AI-generated raster artwork), localize the 4 Singapore languages, and write automated concurrency tests.
  - **Decisions changed from initial AI/default ideas:** (1) Replaced `better-sqlite3` with Node's built-in `node:sqlite` + Node 20 fallback so `npm install` never fails compiling native C++ bindings on Node 26 / Windows; (2) Added a Singapore 4-language tab bar (`EN / 中文 / BM / தமிழ்`) specifically tailored to multi-generational family events.

- **Anything I'm unsure about:**
  - Whether Harbour Point Community Club prefers quiz questions in a fixed order or shuffled per player (`config.quiz.shuffleQuestions` is a one-line boolean toggle in `src/config.js`).
  - Final booth staff PIN (`1234` default in `src/config.js`, overridable via `STAFF_PIN` env var) and whether they'd like any additional languages or custom event prizes listed on the Final Screen.
