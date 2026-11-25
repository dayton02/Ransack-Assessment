// Express backend for Play & Win.
// `npm start` runs this alongside Vite (which proxies /api/* -> localhost:3001).
import express from 'express'
import crypto from 'node:crypto'
import { config } from './src/config.js'
import { getDb } from './db.js'

const app = express()
app.use(express.json())

const VALID_EVENT_TYPES = new Set([
  'session_start',
  'game_picked',
  'game_completed',
  'final_screen_view',
])

function getExpectedStaffPin() {
  return String(process.env.STAFF_PIN || config.admin.staffPin || '1234').trim()
}

function isValidStaffPin(candidate) {
  const expected = getExpectedStaffPin()
  const actual = String(candidate || '').trim()
  if (actual.length !== expected.length) return false
  return crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
}

function requireAdminPin(req, res, next) {
  const pin = req.get('X-Admin-Pin') || req.query.pin || ''
  if (!isValidStaffPin(pin)) {
    return res.status(401).json({ ok: false, error: 'Invalid staff PIN' })
  }
  next()
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim()
  }
  return req.socket?.remoteAddress || req.ip || ''
}

// Health check
app.get('/api/ping', async (req, res) => {
  const db = await getDb()
  res.json({ ok: true, engine: db.engine })
})

// Check whether a device has already claimed its prize (and whether repeat-IP applies)
app.get('/api/devices/:deviceId', async (req, res) => {
  try {
    const db = await getDb()
    const status = await db.getDeviceEligibility(req.params.deviceId, getClientIp(req))
    res.json({ ok: true, ...status })
  } catch (err) {
    console.error('GET /api/devices/:deviceId failed:', err)
    res.status(500).json({ ok: false, error: 'Failed to check device eligibility' })
  }
})

// Staff Family-Pass Override: allow one additional prize claim on a shared family phone
app.post('/api/devices/:deviceId/unlock', async (req, res) => {
  try {
    const pin = req.body?.pin || req.get('X-Admin-Pin') || ''
    if (!isValidStaffPin(pin)) {
      return res.status(403).json({ ok: false, error: 'Invalid staff PIN' })
    }
    const db = await getDb()
    const result = await db.unlockDevice(req.params.deviceId)
    res.status(result.status || 200).json(result)
  } catch (err) {
    console.error('POST /api/devices/:deviceId/unlock failed:', err)
    res.status(500).json({ ok: false, error: 'Failed to unlock device' })
  }
})

// Save one event record sent by the app.
// On a winning `game_completed`, atomically generates & returns a unique Claim Code
// (unless onePrizePerDevice is enabled and this device already claimed its prize).
app.post('/api/records', async (req, res) => {
  try {
    const record = req.body || {}
    if (!record.sessionId || typeof record.sessionId !== 'string') {
      return res.status(400).json({ ok: false, error: 'Missing sessionId' })
    }
    if (!VALID_EVENT_TYPES.has(record.eventType)) {
      return res.status(400).json({ ok: false, error: 'Invalid eventType' })
    }
    const db = await getDb()
    const result = await db.recordEvent(record, getClientIp(req))
    res.json(result)
  } catch (err) {
    console.error('POST /api/records failed:', err)
    res.status(500).json({ ok: false, error: 'Failed to save record' })
  }
})

// Return all saved records (protected by staff PIN).
app.get('/api/records', requireAdminPin, async (req, res) => {
  try {
    const db = await getDb()
    const data = await db.getAllRecords()
    res.json(data)
  } catch (err) {
    console.error('GET /api/records failed:', err)
    res.status(500).json({ ok: false, error: 'Failed to load records' })
  }
})

// Fetch live claim status for a specific player session (used on Final Screen reload).
app.get('/api/sessions/:sessionId', async (req, res) => {
  try {
    const db = await getDb()
    const session = await db.getSession(req.params.sessionId)
    if (!session) {
      return res.status(404).json({ ok: false, error: 'Session not found' })
    }
    res.json({ ok: true, session })
  } catch (err) {
    console.error('GET /api/sessions/:sessionId failed:', err)
    res.status(500).json({ ok: false, error: 'Failed to fetch session' })
  }
})

// Staff prize redemption endpoint for a player session (requires 4-digit staff PIN).
app.post('/api/sessions/:sessionId/redeem', async (req, res) => {
  try {
    const pin = req.body?.pin || req.get('X-Admin-Pin') || ''
    if (!isValidStaffPin(pin)) {
      return res.status(403).json({ ok: false, error: 'Invalid staff PIN' })
    }
    const db = await getDb()
    const result = await db.redeemSession(req.params.sessionId)
    res.status(result.status || 200).json(result)
  } catch (err) {
    console.error('POST /api/sessions/:sessionId/redeem failed:', err)
    res.status(500).json({ ok: false, error: 'Failed to redeem prize' })
  }
})

// Verify staff PIN for Admin Dashboard access.
app.post('/api/admin/verify', (req, res) => {
  const pin = req.body?.pin || ''
  if (!isValidStaffPin(pin)) {
    return res.status(401).json({ ok: false, error: 'Incorrect PIN' })
  }
  res.json({ ok: true })
})

// Aggregated event statistics & claim lookup list for the Admin Dashboard.
app.get('/api/admin/stats', requireAdminPin, async (req, res) => {
  try {
    const db = await getDb()
    const stats = await db.getAdminStats()
    res.json({ ok: true, stats })
  } catch (err) {
    console.error('GET /api/admin/stats failed:', err)
    res.status(500).json({ ok: false, error: 'Failed to compute stats' })
  }
})

// Redeem directly by claim code from the Admin Dashboard lookup table.
app.post('/api/admin/redeem-code', requireAdminPin, async (req, res) => {
  try {
    const code = req.body?.claimCode || ''
    const db = await getDb()
    const result = await db.redeemByCode(code)
    res.status(result.status || 200).json(result)
  } catch (err) {
    console.error('POST /api/admin/redeem-code failed:', err)
    res.status(500).json({ ok: false, error: 'Failed to redeem code' })
  }
})

// One-click CSV export of all sessions for event organizers.
app.get('/api/admin/export.csv', requireAdminPin, async (req, res) => {
  try {
    const db = await getDb()
    const csv = await db.exportSessionsCsv()
    const dateStamp = new Date().toISOString().slice(0, 10)
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="play-and-win-sessions-${dateStamp}.csv"`,
    )
    res.send(csv)
  } catch (err) {
    console.error('GET /api/admin/export.csv failed:', err)
    res.status(500).json({ ok: false, error: 'Failed to export CSV' })
  }
})

// Clear all test data before the event starts.
app.post('/api/admin/reset', requireAdminPin, async (req, res) => {
  try {
    const db = await getDb()
    await db.resetAllData()
    res.json({ ok: true })
  } catch (err) {
    console.error('POST /api/admin/reset failed:', err)
    res.status(500).json({ ok: false, error: 'Failed to reset data' })
  }
})

const PORT = Number(process.env.PORT || 3001)
getDb()
  .then((db) => {
    const server = app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT} (storage: ${db.engine} -> ${db.filePath})`)
    })
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use. Stop any existing \`npm start\` terminal and try again.`)
      } else {
        console.error('Server error:', err)
      }
      process.exit(1)
    })
  })
  .catch((err) => {
    console.error('Failed to initialise database:', err)
    process.exit(1)
  })
