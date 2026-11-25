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

Replace this section before you submit.

- **Where to change the settings:**
- **How saving and loading works, and why I chose that format** (or why I left it out):
- **Assumptions I made:**
- **What I prioritised, and why:**
- **What I left out or didn't finish, and why:**
- **Time planned vs. time spent:**
- **How I used AI** (and one suggestion I changed or didn't use):
- **Anything I'm unsure about:**
