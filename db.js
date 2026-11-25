/**
 * Persistence layer for Play & Win.
 *
 * Primary engine: Node's built-in `node:sqlite` (DatabaseSync) in WAL mode —
 * single file on disk, ACID transactions, safe under concurrent mobile writes,
 * and zero native C++ build dependencies (`node-gyp`).
 *
 * Fallback engine: If run on Node 20.x where `node:sqlite` is unavailable,
 * automatically falls back to a write-serialized atomic temp-file JSON store
 * exposing the exact same API.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from './src/config.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, 'data')
const SQLITE_PATH = path.join(DATA_DIR, 'play-and-win.db')
const JSON_FALLBACK_PATH = path.join(DATA_DIR, 'play-and-win.json')

let adapter = null

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}

function nowIso() {
  return new Date().toISOString()
}

function generateCandidateCode(useThreeDigits = false) {
  const prefixes =
    Array.isArray(config.rules.claimCodePrefixes) && config.rules.claimCodePrefixes.length > 0
      ? config.rules.claimCodePrefixes
      : ['OAK', 'FERN', 'PINE']
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)]
  const num = useThreeDigits
    ? Math.floor(100 + Math.random() * 900)
    : Math.floor(10 + Math.random() * 90)
  return `${prefix}-${num}`
}

function csvEscape(value) {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (/[",\n\r]/.test(str)) {
    return `"${str.replaceAll('"', '""')}"`
  }
  return str
}

function buildSessionsCsv(sessions) {
  const headers = [
    'session_id',
    'created_at',
    'last_active_at',
    'won',
    'winning_game',
    'winning_score',
    'winning_max_score',
    'claim_code',
    'claimed',
    'claimed_at',
    'final_screen_views',
  ]
  const lines = [headers.join(',')]
  for (const s of sessions) {
    lines.push(
      [
        s.sessionId,
        s.createdAt,
        s.lastActiveAt,
        s.won ? 1 : 0,
        s.winningGame ?? '',
        s.winningScore ?? '',
        s.winningMaxScore ?? '',
        s.claimCode ?? '',
        s.claimed ? 1 : 0,
        s.claimedAt ?? '',
        s.finalScreenViews ?? 0,
      ]
        .map(csvEscape)
        .join(','),
    )
  }
  return lines.join('\r\n') + '\r\n'
}

// ============================================================================
// SQLite WAL Adapter (Node >= 22.5, including Node 22.12 LTS, 24, and 26)
// ============================================================================
function createSqliteAdapter(DatabaseSync) {
  ensureDataDir()
  const db = new DatabaseSync(SQLITE_PATH)

  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA busy_timeout = 5000;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS sessions (
      session_id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      last_active_at TEXT NOT NULL,
      won INTEGER NOT NULL DEFAULT 0,
      winning_game TEXT,
      winning_score INTEGER,
      winning_max_score INTEGER,
      claim_code TEXT UNIQUE,
      claimed INTEGER NOT NULL DEFAULT 0,
      claimed_at TEXT,
      final_screen_views INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      game_id TEXT,
      score INTEGER,
      max_score INTEGER,
      won INTEGER,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id);
    CREATE INDEX IF NOT EXISTS idx_events_type_game ON events(event_type, game_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_claim_code ON sessions(claim_code);
  `)

  const stmtUpsertSession = db.prepare(`
    INSERT INTO sessions (session_id, created_at, last_active_at)
    VALUES (?, ?, ?)
    ON CONFLICT(session_id) DO UPDATE SET last_active_at = excluded.last_active_at
  `)

  const stmtInsertEvent = db.prepare(`
    INSERT INTO events (session_id, event_type, game_id, score, max_score, won, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)

  const stmtGetSession = db.prepare(`SELECT * FROM sessions WHERE session_id = ?`)
  const stmtGetSessionByCode = db.prepare(`SELECT * FROM sessions WHERE UPPER(claim_code) = UPPER(?)`)
  const stmtCodeExists = db.prepare(`SELECT 1 FROM sessions WHERE claim_code = ?`)

  const stmtMarkWon = db.prepare(`
    UPDATE sessions
    SET won = 1,
        winning_game = COALESCE(winning_game, ?),
        winning_score = COALESCE(winning_score, ?),
        winning_max_score = COALESCE(winning_max_score, ?),
        claim_code = COALESCE(claim_code, ?),
        last_active_at = ?
    WHERE session_id = ?
  `)

  const stmtIncFinalViews = db.prepare(`
    UPDATE sessions
    SET final_screen_views = final_screen_views + 1,
        last_active_at = ?
    WHERE session_id = ?
  `)

  const stmtRedeem = db.prepare(`
    UPDATE sessions
    SET claimed = 1,
        claimed_at = ?,
        last_active_at = ?
    WHERE session_id = ? AND won = 1 AND claimed = 0
  `)

  function withTransaction(fn) {
    db.exec('BEGIN IMMEDIATE')
    try {
      const result = fn()
      db.exec('COMMIT')
      return result
    } catch (err) {
      try {
        db.exec('ROLLBACK')
      } catch {
        // Ignore rollback error if transaction wasn't open
      }
      throw err
    }
  }

  function allocateUniqueCode() {
    for (let i = 0; i < 40; i++) {
      const code = generateCandidateCode(i >= 20)
      if (!stmtCodeExists.get(code)) {
        return code
      }
    }
    return `WIN-${Date.now().toString().slice(-4)}`
  }

  function mapSessionRow(row) {
    if (!row) return null
    return {
      sessionId: row.session_id,
      createdAt: row.created_at,
      lastActiveAt: row.last_active_at,
      won: Boolean(row.won),
      winningGame: row.winning_game,
      winningScore: row.winning_score,
      winningMaxScore: row.winning_max_score,
      claimCode: row.claim_code,
      claimed: Boolean(row.claimed),
      claimedAt: row.claimed_at,
      finalScreenViews: row.final_screen_views,
    }
  }

  return {
    engine: 'sqlite-wal',
    filePath: SQLITE_PATH,

    async recordEvent(record) {
      const timestamp = nowIso()
      const sessionId = String(record.sessionId || '').trim()
      const eventType = String(record.eventType || '').trim()
      const gameId = record.gameId ? String(record.gameId) : null
      const score = Number.isFinite(Number(record.score)) ? Number(record.score) : null
      const maxScore = Number.isFinite(Number(record.maxScore)) ? Number(record.maxScore) : null
      const won =
        typeof record.won === 'boolean' ? (record.won ? 1 : 0) : null

      return withTransaction(() => {
        stmtUpsertSession.run(sessionId, timestamp, timestamp)
        stmtInsertEvent.run(sessionId, eventType, gameId, score, maxScore, won, timestamp)

        if (eventType === 'game_completed' && won === 1) {
          const existing = stmtGetSession.get(sessionId)
          const code = existing?.claim_code || allocateUniqueCode()
          stmtMarkWon.run(gameId, score, maxScore, code, timestamp, sessionId)
        } else if (eventType === 'final_screen_view') {
          stmtIncFinalViews.run(timestamp, sessionId)
        }

        const updated = mapSessionRow(stmtGetSession.get(sessionId))
        return {
          ok: true,
          sessionId,
          claimCode: updated?.claimCode ?? null,
          claimed: updated?.claimed ?? false,
          claimedAt: updated?.claimedAt ?? null,
        }
      })
    },

    async getSession(sessionId) {
      return mapSessionRow(stmtGetSession.get(sessionId))
    },

    async redeemSession(sessionId) {
      const timestamp = nowIso()
      return withTransaction(() => {
        const session = stmtGetSession.get(sessionId)
        if (!session) {
          return { ok: false, status: 404, error: 'Session not found' }
        }
        if (!session.won) {
          return { ok: false, status: 400, error: 'Session has not won a prize' }
        }
        if (session.claimed) {
          return {
            ok: false,
            status: 409,
            alreadyClaimed: true,
            claimCode: session.claim_code,
            claimedAt: session.claimed_at,
            error: 'Prize already claimed',
          }
        }
        stmtRedeem.run(timestamp, timestamp, sessionId)
        stmtInsertEvent.run(
          sessionId,
          'prize_claimed',
          session.winning_game,
          session.winning_score,
          session.winning_max_score,
          1,
          timestamp,
        )
        return {
          ok: true,
          status: 200,
          claimCode: session.claim_code,
          claimed: true,
          claimedAt: timestamp,
        }
      })
    },

    async redeemByCode(claimCode) {
      const row = stmtGetSessionByCode.get(String(claimCode || '').trim())
      if (!row) {
        return { ok: false, status: 404, error: 'Claim code not found' }
      }
      return this.redeemSession(row.session_id)
    },

    async getAllRecords() {
      const sessions = db
        .prepare(`SELECT * FROM sessions ORDER BY created_at DESC`)
        .all()
        .map(mapSessionRow)
      const events = db
        .prepare(`SELECT * FROM events ORDER BY id DESC`)
        .all()
        .map((e) => ({
          id: e.id,
          sessionId: e.session_id,
          eventType: e.event_type,
          gameId: e.game_id,
          score: e.score,
          maxScore: e.max_score,
          won: e.won === null ? null : Boolean(e.won),
          createdAt: e.created_at,
        }))
      return { sessions, events }
    },

    async getAdminStats() {
      const sessionTotals = db
        .prepare(`
          SELECT
            COUNT(*) AS totalPlayers,
            SUM(CASE WHEN won = 1 THEN 1 ELSE 0 END) AS prizesWon,
            SUM(CASE WHEN claimed = 1 THEN 1 ELSE 0 END) AS prizesClaimed
          FROM sessions
        `)
        .get()

      const finalViewsRow = db
        .prepare(`SELECT COUNT(*) AS count FROM events WHERE event_type = 'final_screen_view'`)
        .get()

      const gamePickedRows = db
        .prepare(`
          SELECT game_id, COUNT(*) AS count
          FROM events
          WHERE event_type = 'game_picked' AND game_id IS NOT NULL
          GROUP BY game_id
        `)
        .all()

      const gameResultRows = db
        .prepare(`
          SELECT
            game_id,
            SUM(CASE WHEN won = 1 THEN 1 ELSE 0 END) AS wins,
            SUM(CASE WHEN won = 0 THEN 1 ELSE 0 END) AS losses
          FROM events
          WHERE event_type = 'game_completed' AND game_id IS NOT NULL
          GROUP BY game_id
        `)
        .all()

      const games = {
        quiz: { picked: 0, wins: 0, losses: 0, winRate: 0 },
        memory: { picked: 0, wins: 0, losses: 0, winRate: 0 },
      }

      for (const row of gamePickedRows) {
        if (!games[row.game_id]) {
          games[row.game_id] = { picked: 0, wins: 0, losses: 0, winRate: 0 }
        }
        games[row.game_id].picked = Number(row.count || 0)
      }

      for (const row of gameResultRows) {
        if (!games[row.game_id]) {
          games[row.game_id] = { picked: 0, wins: 0, losses: 0, winRate: 0 }
        }
        const wins = Number(row.wins || 0)
        const losses = Number(row.losses || 0)
        const total = wins + losses
        games[row.game_id].wins = wins
        games[row.game_id].losses = losses
        games[row.game_id].winRate = total > 0 ? Math.round((wins / total) * 100) : 0
      }

      const totalWins = Object.values(games).reduce((sum, g) => sum + g.wins, 0)
      const totalLosses = Object.values(games).reduce((sum, g) => sum + g.losses, 0)
      const totalGamesCompleted = totalWins + totalLosses

      const claims = db
        .prepare(`
          SELECT * FROM sessions
          WHERE won = 1
          ORDER BY last_active_at DESC
          LIMIT 200
        `)
        .all()
        .map(mapSessionRow)

      const prizesWon = Number(sessionTotals?.prizesWon || 0)
      const prizesClaimed = Number(sessionTotals?.prizesClaimed || 0)

      return {
        engine: this.engine,
        totalPlayers: Number(sessionTotals?.totalPlayers || 0),
        finalScreenViews: Number(finalViewsRow?.count || 0),
        prizesWon,
        prizesClaimed,
        prizesUnclaimed: Math.max(0, prizesWon - prizesClaimed),
        totalWins,
        totalLosses,
        overallWinRate:
          totalGamesCompleted > 0 ? Math.round((totalWins / totalGamesCompleted) * 100) : 0,
        games,
        claims,
      }
    },

    async exportSessionsCsv() {
      const sessions = db
        .prepare(`SELECT * FROM sessions ORDER BY created_at DESC`)
        .all()
        .map(mapSessionRow)
      return buildSessionsCsv(sessions)
    },

    async resetAllData() {
      return withTransaction(() => {
        db.exec('DELETE FROM events; DELETE FROM sessions;')
        return { ok: true }
      })
    },
  }
}

// ============================================================================
// Serialized Atomic JSON Fallback (Node 20.x if `node:sqlite` is unavailable)
// ============================================================================
function createJsonFallbackAdapter() {
  ensureDataDir()

  let queue = Promise.resolve()
  let state = { sessions: {}, events: [], nextEventId: 1 }

  if (fs.existsSync(JSON_FALLBACK_PATH)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(JSON_FALLBACK_PATH, 'utf8'))
      if (parsed && typeof parsed === 'object') {
        state = {
          sessions: parsed.sessions || {},
          events: Array.isArray(parsed.events) ? parsed.events : [],
          nextEventId: parsed.nextEventId || (parsed.events?.length || 0) + 1,
        }
      }
    } catch {
      // Keep clean default state if file was corrupt
    }
  }

  function persistAtomic() {
    const tmpPath = `${JSON_FALLBACK_PATH}.tmp`
    fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2), 'utf8')
    fs.renameSync(tmpPath, JSON_FALLBACK_PATH)
  }

  function serialized(fn) {
    const task = queue.then(fn, fn)
    queue = task.then(
      () => undefined,
      () => undefined,
    )
    return task
  }

  function allocateUniqueCode() {
    const used = new Set(Object.values(state.sessions).map((s) => s.claimCode).filter(Boolean))
    for (let i = 0; i < 40; i++) {
      const code = generateCandidateCode(i >= 20)
      if (!used.has(code)) return code
    }
    return `WIN-${Date.now().toString().slice(-4)}`
  }

  return {
    engine: 'json-atomic-fallback',
    filePath: JSON_FALLBACK_PATH,

    async recordEvent(record) {
      return serialized(() => {
        const timestamp = nowIso()
        const sessionId = String(record.sessionId || '').trim()
        const eventType = String(record.eventType || '').trim()
        const gameId = record.gameId ? String(record.gameId) : null
        const score = Number.isFinite(Number(record.score)) ? Number(record.score) : null
        const maxScore = Number.isFinite(Number(record.maxScore)) ? Number(record.maxScore) : null
        const won = typeof record.won === 'boolean' ? record.won : null

        if (!state.sessions[sessionId]) {
          state.sessions[sessionId] = {
            sessionId,
            createdAt: timestamp,
            lastActiveAt: timestamp,
            won: false,
            winningGame: null,
            winningScore: null,
            winningMaxScore: null,
            claimCode: null,
            claimed: false,
            claimedAt: null,
            finalScreenViews: 0,
          }
        }
        const session = state.sessions[sessionId]
        session.lastActiveAt = timestamp

        state.events.push({
          id: state.nextEventId++,
          sessionId,
          eventType,
          gameId,
          score,
          maxScore,
          won,
          createdAt: timestamp,
        })

        if (eventType === 'game_completed' && won === true) {
          session.won = true
          if (!session.winningGame) session.winningGame = gameId
          if (session.winningScore === null) session.winningScore = score
          if (session.winningMaxScore === null) session.winningMaxScore = maxScore
          if (!session.claimCode) session.claimCode = allocateUniqueCode()
        } else if (eventType === 'final_screen_view') {
          session.finalScreenViews += 1
        }

        persistAtomic()
        return {
          ok: true,
          sessionId,
          claimCode: session.claimCode,
          claimed: session.claimed,
          claimedAt: session.claimedAt,
        }
      })
    },

    async getSession(sessionId) {
      return state.sessions[sessionId] ? { ...state.sessions[sessionId] } : null
    },

    async redeemSession(sessionId) {
      return serialized(() => {
        const session = state.sessions[sessionId]
        if (!session) return { ok: false, status: 404, error: 'Session not found' }
        if (!session.won) return { ok: false, status: 400, error: 'Session has not won a prize' }
        if (session.claimed) {
          return {
            ok: false,
            status: 409,
            alreadyClaimed: true,
            claimCode: session.claimCode,
            claimedAt: session.claimedAt,
            error: 'Prize already claimed',
          }
        }
        const timestamp = nowIso()
        session.claimed = true
        session.claimedAt = timestamp
        session.lastActiveAt = timestamp
        state.events.push({
          id: state.nextEventId++,
          sessionId,
          eventType: 'prize_claimed',
          gameId: session.winningGame,
          score: session.winningScore,
          maxScore: session.winningMaxScore,
          won: true,
          createdAt: timestamp,
        })
        persistAtomic()
        return {
          ok: true,
          status: 200,
          claimCode: session.claimCode,
          claimed: true,
          claimedAt: timestamp,
        }
      })
    },

    async redeemByCode(claimCode) {
      const target = String(claimCode || '').trim().toUpperCase()
      const found = Object.values(state.sessions).find(
        (s) => s.claimCode && s.claimCode.toUpperCase() === target,
      )
      if (!found) return { ok: false, status: 404, error: 'Claim code not found' }
      return this.redeemSession(found.sessionId)
    },

    async getAllRecords() {
      const sessions = Object.values(state.sessions).sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt),
      )
      const events = [...state.events].reverse()
      return { sessions, events }
    },

    async getAdminStats() {
      const sessions = Object.values(state.sessions)
      const games = {
        quiz: { picked: 0, wins: 0, losses: 0, winRate: 0 },
        memory: { picked: 0, wins: 0, losses: 0, winRate: 0 },
      }
      let finalScreenViews = 0
      for (const e of state.events) {
        if (e.eventType === 'final_screen_view') finalScreenViews++
        if (e.eventType === 'game_picked' && e.gameId) {
          if (!games[e.gameId]) games[e.gameId] = { picked: 0, wins: 0, losses: 0, winRate: 0 }
          games[e.gameId].picked++
        }
        if (e.eventType === 'game_completed' && e.gameId) {
          if (!games[e.gameId]) games[e.gameId] = { picked: 0, wins: 0, losses: 0, winRate: 0 }
          if (e.won) games[e.gameId].wins++
          else games[e.gameId].losses++
        }
      }
      for (const g of Object.values(games)) {
        const total = g.wins + g.losses
        g.winRate = total > 0 ? Math.round((g.wins / total) * 100) : 0
      }
      const totalWins = Object.values(games).reduce((s, g) => s + g.wins, 0)
      const totalLosses = Object.values(games).reduce((s, g) => s + g.losses, 0)
      const totalCompleted = totalWins + totalLosses
      const prizesWon = sessions.filter((s) => s.won).length
      const prizesClaimed = sessions.filter((s) => s.claimed).length
      const claims = sessions
        .filter((s) => s.won)
        .sort((a, b) => b.lastActiveAt.localeCompare(a.lastActiveAt))
        .slice(0, 200)

      return {
        engine: this.engine,
        totalPlayers: sessions.length,
        finalScreenViews,
        prizesWon,
        prizesClaimed,
        prizesUnclaimed: Math.max(0, prizesWon - prizesClaimed),
        totalWins,
        totalLosses,
        overallWinRate: totalCompleted > 0 ? Math.round((totalWins / totalCompleted) * 100) : 0,
        games,
        claims,
      }
    },

    async exportSessionsCsv() {
      const sessions = Object.values(state.sessions).sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt),
      )
      return buildSessionsCsv(sessions)
    },

    async resetAllData() {
      return serialized(() => {
        state = { sessions: {}, events: [], nextEventId: 1 }
        persistAtomic()
        return { ok: true }
      })
    },
  }
}

export async function getDb() {
  if (adapter) return adapter
  try {
    const sqlite = await import('node:sqlite')
    if (sqlite?.DatabaseSync) {
      adapter = createSqliteAdapter(sqlite.DatabaseSync)
      return adapter
    }
  } catch {
    // Fall back on Node 20.x where node:sqlite does not exist
  }
  adapter = createJsonFallbackAdapter()
  return adapter
}
