// The server is already set up: `npm start` runs it alongside the app.
// The app talks to it through src/api.js. You only need to fill in the TODOs.
import express from 'express'

const app = express()
app.use(express.json()) // lets the server read JSON sent by the app

// Lets the starter screen check the server is running. Safe to remove.
app.get('/api/ping', (req, res) => {
  res.json({ ok: true })
})

// Save one record sent by the app.
app.post('/api/records', async (req, res) => {
  const record = req.body
  // TODO: save `record` to a file. You choose the format (e.g. CSV, JSON).
  res.json({ ok: true })
})

// Send all saved records back to the app.
app.get('/api/records', async (req, res) => {
  // TODO: read your file and send back the records.
  res.json([])
})

// Change these routes or add your own if you prefer.

app.listen(3001, () => console.log('Server running on http://localhost:3001'))
