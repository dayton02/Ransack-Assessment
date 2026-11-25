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
import crypto from 'node:crypto'
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

function normalizeIp(ip) {
  if (!ip) return ''
  const raw = String(ip).split(',')[0].trim()
  return raw.replace(/^::ffff:/i, '')
}

export function hashIp(ip) {
  const clean = normalizeIp(ip)
  if (!clean) return null
  return crypto.createHash('sha256').update(`paw-ip:${clean}`).digest('hex').slice(0, 12)
}

function isOnePrizePerDeviceEnabled() {
  return Boolean(config.rules.onePrizePerDevice)
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
    'mode',
    'device_id',
    'ip_hash',
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
        s.isFunMode ? 'fun' : 'prize',
        s.deviceId ?? '',
        s.ipHash ?? '',
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

function emptyGamesMap() {
  return {
    quiz: { picked: 0, wins: 0, losses: 0, winRate: 0 },
    memory: { picked: 0, wins: 0, losses: 0, winRate: 0 },
  }
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
      device_id TEXT,
      device_slot INTEGER NOT NULL DEFAULT 0,
      ip_hash TEXT,
      is_fun_mode INTEGER NOT NULL DEFAULT 0,
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

    CREATE TABLE IF NOT EXISTS devices (
      device_id TEXT PRIMARY KEY,
      allowed_claims INTEGER NOT NULL DEFAULT 1,
      claimed_count INTEGER NOT NULL DEFAULT 0,
      last_claim_code TEXT,
      last_claimed_at TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      game_id TEXT,
      score INTEGER,
      max_score INTEGER,
      won INTEGER,
      is_fun_mode INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
  `)

  // Safe schema migrations for existing SQLite databases
  const sessionCols = new Set(
    db.prepare(`PRAGMA table_info(sessions)`).all().map((col) => col.name),
  )
  if (!sessionCols.has('device_id')) {
    db.exec(`ALTER TABLE sessions ADD COLUMN device_id TEXT`)
  }
  if (!sessionCols.has('device_slot')) {
    db.exec(`ALTER TABLE sessions ADD COLUMN device_slot INTEGER NOT NULL DEFAULT 0`)
  }
  if (!sessionCols.has('ip_hash')) {
    db.exec(`ALTER TABLE sessions ADD COLUMN ip_hash TEXT`)
  }
  if (!sessionCols.has('is_fun_mode')) {
    db.exec(`ALTER TABLE sessions ADD COLUMN is_fun_mode INTEGER NOT NULL DEFAULT 0`)
  }

  const eventCols = new Set(
    db.prepare(`PRAGMA table_info(events)`).all().map((col) => col.name),
  )
  if (!eventCols.has('is_fun_mode')) {
    db.exec(`ALTER TABLE events ADD COLUMN is_fun_mode INTEGER NOT NULL DEFAULT 0`)
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id);
    CREATE INDEX IF NOT EXISTS idx_events_type_game ON events(event_type, game_id, is_fun_mode);
    CREATE INDEX IF NOT EXISTS idx_sessions_claim_code ON sessions(claim_code);
    CREATE INDEX IF NOT EXISTS idx_sessions_device ON sessions(device_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_ip ON sessions(ip_hash);
    CREATE INDEX IF NOT EXISTS idx_sessions_fun ON sessions(is_fun_mode);
  `)

  const stmtUpsertSession = db.prepare(`
    INSERT INTO sessions (session_id, device_id, device_slot, ip_hash, is_fun_mode, created_at, last_active_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(session_id) DO UPDATE SET
      device_id = COALESCE(sessions.device_id, excluded.device_id),
      ip_hash = COALESCE(sessions.ip_hash, excluded.ip_hash),
      is_fun_mode = CASE WHEN sessions.won = 1 THEN sessions.is_fun_mode ELSE MAX(sessions.is_fun_mode, excluded.is_fun_mode) END,
      last_active_at = excluded.last_active_at
  `)

  const stmtInsertEvent = db.prepare(`
    INSERT INTO events (session_id, event_type, game_id, score, max_score, won, is_fun_mode, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)

  const stmtGetSession = db.prepare(`SELECT * FROM sessions WHERE session_id = ?`)
  const stmtGetSessionByCode = db.prepare(
    `SELECT * FROM sessions WHERE UPPER(claim_code) = UPPER(?)`,
  )
  const stmtCodeExists = db.prepare(`SELECT 1 FROM sessions WHERE claim_code = ?`)

  const stmtGetDevice = db.prepare(`SELECT * FROM devices WHERE device_id = ?`)
  const stmtEnsureDevice = db.prepare(`
    INSERT INTO devices (device_id, allowed_claims, claimed_count, updated_at)
    VALUES (?, 1, 0, ?)
    ON CONFLICT(device_id) DO NOTHING
  `)
  const stmtIncrementDeviceClaim = db.prepare(`
    INSERT INTO devices (device_id, allowed_claims, claimed_count, last_claim_code, last_claimed_at, updated_at)
    VALUES (?, 1, 1, ?, ?, ?)
    ON CONFLICT(device_id) DO UPDATE SET
      claimed_count = devices.claimed_count + 1,
      last_claim_code = excluded.last_claim_code,
      last_claimed_at = excluded.last_claimed_at,
      updated_at = excluded.updated_at
  `)
  const stmtUnlockDevice = db.prepare(`
    INSERT INTO devices (device_id, allowed_claims, claimed_count, updated_at)
    VALUES (?, 2, 0, ?)
    ON CONFLICT(device_id) DO UPDATE SET
      allowed_claims = MAX(devices.allowed_claims, devices.claimed_count) + 1,
      updated_at = excluded.updated_at
  `)

  const stmtCountOtherIpClaims = db.prepare(`
    SELECT COUNT(*) AS count
    FROM sessions
    WHERE ip_hash = ? AND claimed = 1 AND session_id != ?
  `)

  const stmtCountIpClaimsAll = db.prepare(`
    SELECT COUNT(*) AS count
    FROM sessions
    WHERE ip_hash = ? AND claimed = 1
  `)

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
    WHERE session_id = ? AND won = 1 AND claimed = 0 AND is_fun_mode = 0
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
        // Ignore rollback error
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

  function computeDeviceEligibilitySync(deviceId, ipHash) {
    const enabled = isOnePrizePerDeviceEnabled()
    const row = deviceId ? stmtGetDevice.get(deviceId) : null
    const claimedCount = Number(row?.claimed_count || 0)
    const allowedClaims = Number(row?.allowed_claims ?? 1)
    const ipClaimCount = ipHash ? Number(stmtCountIpClaimsAll.get(ipHash)?.count || 0) : 0
    return {
      onePrizePerDevice: enabled,
      locked: enabled && Boolean(deviceId) && claimedCount >= allowedClaims,
      claimedCount,
      allowedClaims,
      lastClaimCode: row?.last_claim_code || null,
      lastClaimedAt: row?.last_claimed_at || null,
      ipClaimCount,
    }
  }

  function mapSessionRow(row) {
    if (!row) return null
    return {
      sessionId: row.session_id,
      deviceId: row.device_id || null,
      ipHash: row.ip_hash || null,
      isFunMode: Boolean(row.is_fun_mode),
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

  function computeGameBreakdown(isFunFlag) {
    const games = emptyGamesMap()
    const pickedRows = db
      .prepare(`
        SELECT game_id, COUNT(*) AS count
        FROM events
        WHERE event_type = 'game_picked' AND game_id IS NOT NULL AND is_fun_mode = ?
        GROUP BY game_id
      `)
      .all(isFunFlag)

    const resultRows = db
      .prepare(`
        SELECT
          game_id,
          SUM(CASE WHEN won = 1 THEN 1 ELSE 0 END) AS wins,
          SUM(CASE WHEN won = 0 THEN 1 ELSE 0 END) AS losses
        FROM events
        WHERE event_type = 'game_completed' AND game_id IS NOT NULL AND is_fun_mode = ?
        GROUP BY game_id
      `)
      .all(isFunFlag)

    for (const row of pickedRows) {
      if (!games[row.game_id]) games[row.game_id] = { picked: 0, wins: 0, losses: 0, winRate: 0 }
      games[row.game_id].picked = Number(row.count || 0)
    }

    for (const row of resultRows) {
      if (!games[row.game_id]) games[row.game_id] = { picked: 0, wins: 0, losses: 0, winRate: 0 }
      const wins = Number(row.wins || 0)
      const losses = Number(row.losses || 0)
      const total = wins + losses
      games[row.game_id].wins = wins
      games[row.game_id].losses = losses
      games[row.game_id].winRate = total > 0 ? Math.round((wins / total) * 100) : 0
    }

    const totalWins = Object.values(games).reduce((sum, g) => sum + g.wins, 0)
    const totalLosses = Object.values(games).reduce((sum, g) => sum + g.losses, 0)
    const totalCompleted = totalWins + totalLosses

    return {
      games,
      totalWins,
      totalLosses,
      overallWinRate: totalCompleted > 0 ? Math.round((totalWins / totalCompleted) * 100) : 0,
    }
  }

  return {
    engine: 'sqlite-wal',
    filePath: SQLITE_PATH,

    async getDeviceEligibility(deviceId, clientIp) {
      return computeDeviceEligibilitySync(String(deviceId || '').trim(), hashIp(clientIp))
    },

    async unlockDevice(deviceId) {
      const cleanId = String(deviceId || '').trim()
      if (!cleanId) return { ok: false, status: 400, error: 'Missing deviceId' }
      const timestamp = nowIso()
      return withTransaction(() => {
        stmtUnlockDevice.run(cleanId, timestamp)
        stmtInsertEvent.run(
          `device:${cleanId}`,
          'device_unlocked',
          null,
          null,
          null,
          null,
          0,
          timestamp,
        )
        const eligibility = computeDeviceEligibilitySync(cleanId, null)
        return { ok: true, status: 200, ...eligibility }
      })
    },

    async recordEvent(record, clientIp = '') {
      const timestamp = nowIso()
      const sessionId = String(record.sessionId || '').trim()
      const deviceId = record.deviceId ? String(record.deviceId).trim() : null
      const ipHash = hashIp(clientIp)
      const eventType = String(record.eventType || '').trim()
      const gameId = record.gameId ? String(record.gameId) : null
      const score = Number.isFinite(Number(record.score)) ? Number(record.score) : null
      const maxScore = Number.isFinite(Number(record.maxScore)) ? Number(record.maxScore) : null
      const won = typeof record.won === 'boolean' ? (record.won ? 1 : 0) : null

      return withTransaction(() => {
        if (deviceId) {
          stmtEnsureDevice.run(deviceId, timestamp)
        }

        const existingBefore = stmtGetSession.get(sessionId)
        const effectiveDeviceId = deviceId || existingBefore?.device_id || null
        const eligibility = computeDeviceEligibilitySync(effectiveDeviceId, ipHash)

        // Authoritatively classify Play-for-Fun vs Prize Play:
        // If this session already won a prize, it stays Prize Play (even after redemption).
        // Otherwise, if client flagged funMode OR device is locked, tag as Play-for-Fun.
        let isFunMode = 0
        if (existingBefore?.won) {
          isFunMode = Number(existingBefore.is_fun_mode || 0)
        } else if (existingBefore?.is_fun_mode || record.funMode === true || eligibility.locked) {
          isFunMode = 1
        }

        const deviceSlot = existingBefore
          ? Number(existingBefore.device_slot || 0)
          : eligibility.claimedCount

        stmtUpsertSession.run(sessionId, deviceId, deviceSlot, ipHash, isFunMode, timestamp, timestamp)
        stmtInsertEvent.run(sessionId, eventType, gameId, score, maxScore, won, isFunMode, timestamp)

        let deviceLocked = Boolean(isFunMode)
        let previousClaimCode = isFunMode ? eligibility.lastClaimCode : null
        let previousClaimedAt = isFunMode ? eligibility.lastClaimedAt : null

        if (eventType === 'game_completed' && won === 1) {
          if (isFunMode) {
            deviceLocked = true
            previousClaimCode = eligibility.lastClaimCode
            previousClaimedAt = eligibility.lastClaimedAt
          } else {
            const existing = stmtGetSession.get(sessionId)
            const code = existing?.claim_code || allocateUniqueCode()
            stmtMarkWon.run(gameId, score, maxScore, code, timestamp, sessionId)
          }
        } else if (eventType === 'final_screen_view') {
          stmtIncFinalViews.run(timestamp, sessionId)
        }

        const updated = mapSessionRow(stmtGetSession.get(sessionId))
        const otherIpClaims =
          updated?.ipHash
            ? Number(stmtCountOtherIpClaims.get(updated.ipHash, sessionId)?.count || 0)
            : 0

        return {
          ok: true,
          sessionId,
          isFunMode: Boolean(updated?.isFunMode),
          claimCode: updated?.claimCode ?? null,
          claimed: updated?.claimed ?? false,
          claimedAt: updated?.claimedAt ?? null,
          deviceLocked,
          previousClaimCode,
          previousClaimedAt,
          ipClaimCount: otherIpClaims,
        }
      })
    },

    async getSession(sessionId) {
      const row = stmtGetSession.get(sessionId)
      if (!row) return null
      const mapped = mapSessionRow(row)
      const ipClaimCount = mapped.ipHash
        ? Number(stmtCountOtherIpClaims.get(mapped.ipHash, sessionId)?.count || 0)
        : 0
      const eligibility = computeDeviceEligibilitySync(mapped.deviceId, mapped.ipHash)
      return {
        ...mapped,
        ipClaimCount,
        deviceLocked: (mapped.isFunMode || eligibility.locked) && !mapped.claimed,
        previousClaimCode: eligibility.lastClaimCode,
        previousClaimedAt: eligibility.lastClaimedAt,
      }
    },

    async redeemSession(sessionId) {
      const timestamp = nowIso()
      return withTransaction(() => {
        const session = stmtGetSession.get(sessionId)
        if (!session) {
          return { ok: false, status: 404, error: 'Session not found' }
        }
        if (session.is_fun_mode) {
          return { ok: false, status: 400, error: 'Play-for-Fun sessions are not eligible for prizes' }
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

        if (isOnePrizePerDeviceEnabled() && session.device_id) {
          const dev = stmtGetDevice.get(session.device_id)
          const claimedCount = Number(dev?.claimed_count || 0)
          const allowedClaims = Number(dev?.allowed_claims ?? 1)
          if (claimedCount >= allowedClaims) {
            return {
              ok: false,
              status: 409,
              deviceAlreadyClaimed: true,
              previousClaimCode: dev?.last_claim_code || null,
              previousClaimedAt: dev?.last_claimed_at || null,
              error: 'Device has already claimed its prize',
            }
          }
        }

        stmtRedeem.run(timestamp, timestamp, sessionId)
        if (session.device_id) {
          stmtIncrementDeviceClaim.run(session.device_id, session.claim_code, timestamp, timestamp)
        }
        stmtInsertEvent.run(
          sessionId,
          'prize_claimed',
          session.winning_game,
          session.winning_score,
          session.winning_max_score,
          1,
          0,
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
          isFunMode: Boolean(e.is_fun_mode),
          createdAt: e.created_at,
        }))
      return { sessions, events }
    },

    async getAdminStats() {
      // Prize Play metrics ONLY (is_fun_mode = 0)
      // Total Players = distinct engaged players (actually picked or completed a game),
      // deduplicated by (device_id, device_slot) so Start->Back bounces or tab refreshes
      // before claiming never inflate the count, while Staff Family-Pass unlocks DO count as a new player.
      const prizeTotals = db
        .prepare(`
          SELECT
            COUNT(DISTINCT CASE
              WHEN EXISTS (
                SELECT 1 FROM events e
                WHERE e.session_id = sessions.session_id
                  AND e.event_type IN ('game_picked', 'game_completed')
                  AND e.is_fun_mode = 0
              )
              THEN COALESCE(device_id || '#' || device_slot, session_id)
              ELSE NULL
            END) AS totalPlayers,
            SUM(CASE WHEN won = 1 THEN 1 ELSE 0 END) AS prizesWon,
            SUM(CASE WHEN claimed = 1 THEN 1 ELSE 0 END) AS prizesClaimed
          FROM sessions
          WHERE is_fun_mode = 0
        `)
        .get()

      const prizeFinalViews = db
        .prepare(`SELECT COUNT(*) AS count FROM events WHERE event_type = 'final_screen_view' AND is_fun_mode = 0`)
        .get()

      const prizeBreakdown = computeGameBreakdown(0)

      // Play-for-Fun metrics kept strictly separate (is_fun_mode = 1, only engaged sessions)
      const funSessionCount = db
        .prepare(`
          SELECT COUNT(*) AS count
          FROM sessions
          WHERE is_fun_mode = 1
            AND EXISTS (
              SELECT 1 FROM events e
              WHERE e.session_id = sessions.session_id
                AND e.event_type IN ('game_picked', 'game_completed')
                AND e.is_fun_mode = 1
            )
        `)
        .get()

      const funFinalViews = db
        .prepare(`SELECT COUNT(*) AS count FROM events WHERE event_type = 'final_screen_view' AND is_fun_mode = 1`)
        .get()

      const funBreakdown = computeGameBreakdown(1)

      const ipClaimRows = db
        .prepare(`
          SELECT ip_hash, COUNT(*) AS count
          FROM sessions
          WHERE claimed = 1 AND is_fun_mode = 0 AND ip_hash IS NOT NULL
          GROUP BY ip_hash
        `)
        .all()
      const ipClaimCounts = new Map(ipClaimRows.map((r) => [r.ip_hash, Number(r.count || 0)]))

      const claims = db
        .prepare(`
          SELECT * FROM sessions
          WHERE won = 1 AND is_fun_mode = 0
          ORDER BY last_active_at DESC
          LIMIT 200
        `)
        .all()
        .map((row) => {
          const mapped = mapSessionRow(row)
          const ipClaims = mapped.ipHash ? ipClaimCounts.get(mapped.ipHash) || 0 : 0
          const repeatIp = mapped.claimed ? ipClaims > 1 : ipClaims >= 1
          return {
            ...mapped,
            ipClaimCount: ipClaims,
            repeatIp,
          }
        })

      const prizesWon = Number(prizeTotals?.prizesWon || 0)
      const prizesClaimed = Number(prizeTotals?.prizesClaimed || 0)

      return {
        engine: this.engine,
        onePrizePerDevice: isOnePrizePerDeviceEnabled(),
        totalPlayers: Number(prizeTotals?.totalPlayers || 0),
        finalScreenViews: Number(prizeFinalViews?.count || 0),
        prizesWon,
        prizesClaimed,
        prizesUnclaimed: Math.max(0, prizesWon - prizesClaimed),
        repeatIpAlerts: claims.filter((c) => c.repeatIp).length,
        totalWins: prizeBreakdown.totalWins,
        totalLosses: prizeBreakdown.totalLosses,
        overallWinRate: prizeBreakdown.overallWinRate,
        games: prizeBreakdown.games,
        funMode: {
          sessions: Number(funSessionCount?.count || 0),
          finalScreenViews: Number(funFinalViews?.count || 0),
          totalWins: funBreakdown.totalWins,
          totalLosses: funBreakdown.totalLosses,
          overallWinRate: funBreakdown.overallWinRate,
          games: funBreakdown.games,
        },
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
        db.exec('DELETE FROM events; DELETE FROM sessions; DELETE FROM devices;')
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
  let state = { sessions: {}, devices: {}, events: [], nextEventId: 1 }

  if (fs.existsSync(JSON_FALLBACK_PATH)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(JSON_FALLBACK_PATH, 'utf8'))
      if (parsed && typeof parsed === 'object') {
        state = {
          sessions: parsed.sessions || {},
          devices: parsed.devices || {},
          events: Array.isArray(parsed.events) ? parsed.events : [],
          nextEventId: parsed.nextEventId || (parsed.events?.length || 0) + 1,
        }
      }
    } catch {
      // Keep clean default state
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

  function countIpClaims(ipHash, excludeSessionId = null) {
    if (!ipHash) return 0
    return Object.values(state.sessions).filter(
      (s) => s.claimed && !s.isFunMode && s.ipHash === ipHash && s.sessionId !== excludeSessionId,
    ).length
  }

  function computeEligibility(deviceId, ipHash) {
    const enabled = isOnePrizePerDeviceEnabled()
    const dev = deviceId ? state.devices[deviceId] : null
    const claimedCount = Number(dev?.claimedCount || 0)
    const allowedClaims = Number(dev?.allowedClaims ?? 1)
    return {
      onePrizePerDevice: enabled,
      locked: enabled && Boolean(deviceId) && claimedCount >= allowedClaims,
      claimedCount,
      allowedClaims,
      lastClaimCode: dev?.lastClaimCode || null,
      lastClaimedAt: dev?.lastClaimedAt || null,
      ipClaimCount: countIpClaims(ipHash),
    }
  }

  function computeJsonBreakdown(isFunBool) {
    const games = emptyGamesMap()
    let finalViews = 0
    for (const e of state.events) {
      if (Boolean(e.isFunMode) !== isFunBool) continue
      if (e.eventType === 'final_screen_view') finalViews++
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
    return {
      games,
      finalViews,
      totalWins,
      totalLosses,
      overallWinRate: totalCompleted > 0 ? Math.round((totalWins / totalCompleted) * 100) : 0,
    }
  }

  return {
    engine: 'json-atomic-fallback',
    filePath: JSON_FALLBACK_PATH,

    async getDeviceEligibility(deviceId, clientIp) {
      return computeEligibility(String(deviceId || '').trim(), hashIp(clientIp))
    },

    async unlockDevice(deviceId) {
      const cleanId = String(deviceId || '').trim()
      if (!cleanId) return { ok: false, status: 400, error: 'Missing deviceId' }
      return serialized(() => {
        const timestamp = nowIso()
        const existing = state.devices[cleanId] || {
          deviceId: cleanId,
          allowedClaims: 1,
          claimedCount: 0,
          lastClaimCode: null,
          lastClaimedAt: null,
        }
        existing.allowedClaims = Math.max(existing.allowedClaims, existing.claimedCount) + 1
        existing.updatedAt = timestamp
        state.devices[cleanId] = existing
        state.events.push({
          id: state.nextEventId++,
          sessionId: `device:${cleanId}`,
          eventType: 'device_unlocked',
          gameId: null,
          score: null,
          maxScore: null,
          won: null,
          isFunMode: false,
          createdAt: timestamp,
        })
        persistAtomic()
        return { ok: true, status: 200, ...computeEligibility(cleanId, null) }
      })
    },

    async recordEvent(record, clientIp = '') {
      return serialized(() => {
        const timestamp = nowIso()
        const sessionId = String(record.sessionId || '').trim()
        const deviceId = record.deviceId ? String(record.deviceId).trim() : null
        const ipHash = hashIp(clientIp)
        const eventType = String(record.eventType || '').trim()
        const gameId = record.gameId ? String(record.gameId) : null
        const score = Number.isFinite(Number(record.score)) ? Number(record.score) : null
        const maxScore = Number.isFinite(Number(record.maxScore)) ? Number(record.maxScore) : null
        const won = typeof record.won === 'boolean' ? record.won : null

        if (deviceId && !state.devices[deviceId]) {
          state.devices[deviceId] = {
            deviceId,
            allowedClaims: 1,
            claimedCount: 0,
            lastClaimCode: null,
            lastClaimedAt: null,
            updatedAt: timestamp,
          }
        }

        const existingBefore = state.sessions[sessionId]
        const effectiveDeviceId = deviceId || existingBefore?.deviceId || null
        const eligibility = computeEligibility(effectiveDeviceId, ipHash)

        let isFunMode = false
        if (existingBefore?.won) {
          isFunMode = Boolean(existingBefore.isFunMode)
        } else if (existingBefore?.isFunMode || record.funMode === true || eligibility.locked) {
          isFunMode = true
        }

        if (!state.sessions[sessionId]) {
          state.sessions[sessionId] = {
            sessionId,
            deviceId,
            deviceSlot: eligibility.claimedCount,
            ipHash,
            isFunMode,
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
        if (!session.deviceId && deviceId) session.deviceId = deviceId
        if (!session.ipHash && ipHash) session.ipHash = ipHash
        if (!session.won && isFunMode) session.isFunMode = true
        session.lastActiveAt = timestamp

        state.events.push({
          id: state.nextEventId++,
          sessionId,
          eventType,
          gameId,
          score,
          maxScore,
          won,
          isFunMode,
          createdAt: timestamp,
        })

        let deviceLocked = isFunMode
        let previousClaimCode = isFunMode ? eligibility.lastClaimCode : null
        let previousClaimedAt = isFunMode ? eligibility.lastClaimedAt : null

        if (eventType === 'game_completed' && won === true) {
          if (isFunMode) {
            deviceLocked = true
            previousClaimCode = eligibility.lastClaimCode
            previousClaimedAt = eligibility.lastClaimedAt
          } else {
            session.won = true
            if (!session.winningGame) session.winningGame = gameId
            if (session.winningScore === null) session.winningScore = score
            if (session.winningMaxScore === null) session.winningMaxScore = maxScore
            if (!session.claimCode) session.claimCode = allocateUniqueCode()
          }
        } else if (eventType === 'final_screen_view') {
          session.finalScreenViews += 1
        }

        persistAtomic()
        return {
          ok: true,
          sessionId,
          isFunMode: Boolean(session.isFunMode),
          claimCode: session.claimCode,
          claimed: session.claimed,
          claimedAt: session.claimedAt,
          deviceLocked,
          previousClaimCode,
          previousClaimedAt,
          ipClaimCount: countIpClaims(session.ipHash, sessionId),
        }
      })
    },

    async getSession(sessionId) {
      const s = state.sessions[sessionId]
      if (!s) return null
      const eligibility = computeEligibility(s.deviceId, s.ipHash)
      return {
        ...s,
        ipClaimCount: countIpClaims(s.ipHash, sessionId),
        deviceLocked: (Boolean(s.isFunMode) || eligibility.locked) && !s.claimed,
        previousClaimCode: eligibility.lastClaimCode,
        previousClaimedAt: eligibility.lastClaimedAt,
      }
    },

    async redeemSession(sessionId) {
      return serialized(() => {
        const session = state.sessions[sessionId]
        if (!session) return { ok: false, status: 404, error: 'Session not found' }
        if (session.isFunMode) {
          return { ok: false, status: 400, error: 'Play-for-Fun sessions are not eligible for prizes' }
        }
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
        if (isOnePrizePerDeviceEnabled() && session.deviceId) {
          const dev = state.devices[session.deviceId]
          if (dev && dev.claimedCount >= dev.allowedClaims) {
            return {
              ok: false,
              status: 409,
              deviceAlreadyClaimed: true,
              previousClaimCode: dev.lastClaimCode,
              previousClaimedAt: dev.lastClaimedAt,
              error: 'Device has already claimed its prize',
            }
          }
        }
        const timestamp = nowIso()
        session.claimed = true
        session.claimedAt = timestamp
        session.lastActiveAt = timestamp
        if (session.deviceId) {
          const dev = state.devices[session.deviceId] || {
            deviceId: session.deviceId,
            allowedClaims: 1,
            claimedCount: 0,
          }
          dev.claimedCount += 1
          dev.lastClaimCode = session.claimCode
          dev.lastClaimedAt = timestamp
          dev.updatedAt = timestamp
          state.devices[session.deviceId] = dev
        }
        state.events.push({
          id: state.nextEventId++,
          sessionId,
          eventType: 'prize_claimed',
          gameId: session.winningGame,
          score: session.winningScore,
          maxScore: session.winningMaxScore,
          won: true,
          isFunMode: false,
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
      const allSessions = Object.values(state.sessions)
      const engagedPrizeSessions = new Set(
        state.events
          .filter(
            (e) =>
              !e.isFunMode &&
              (e.eventType === 'game_picked' || e.eventType === 'game_completed'),
          )
          .map((e) => e.sessionId),
      )
      const engagedFunSessions = new Set(
        state.events
          .filter(
            (e) =>
              Boolean(e.isFunMode) &&
              (e.eventType === 'game_picked' || e.eventType === 'game_completed'),
          )
          .map((e) => e.sessionId),
      )

      const prizeSessions = allSessions.filter((s) => !s.isFunMode)
      const funSessions = allSessions.filter(
        (s) => s.isFunMode && engagedFunSessions.has(s.sessionId),
      )

      const distinctPrizePlayers = new Set(
        prizeSessions
          .filter((s) => engagedPrizeSessions.has(s.sessionId))
          .map((s) => (s.deviceId ? `${s.deviceId}#${s.deviceSlot ?? 0}` : s.sessionId)),
      )

      const prizeBreakdown = computeJsonBreakdown(false)
      const funBreakdown = computeJsonBreakdown(true)

      const prizesWon = prizeSessions.filter((s) => s.won).length
      const prizesClaimed = prizeSessions.filter((s) => s.claimed).length
      const claims = prizeSessions
        .filter((s) => s.won)
        .sort((a, b) => b.lastActiveAt.localeCompare(a.lastActiveAt))
        .slice(0, 200)
        .map((s) => {
          const ipClaims = countIpClaims(s.ipHash)
          return {
            ...s,
            ipClaimCount: ipClaims,
            repeatIp: s.claimed ? ipClaims > 1 : ipClaims >= 1,
          }
        })

      return {
        engine: this.engine,
        onePrizePerDevice: isOnePrizePerDeviceEnabled(),
        totalPlayers: distinctPrizePlayers.size,
        finalScreenViews: prizeBreakdown.finalViews,
        prizesWon,
        prizesClaimed,
        prizesUnclaimed: Math.max(0, prizesWon - prizesClaimed),
        repeatIpAlerts: claims.filter((c) => c.repeatIp).length,
        totalWins: prizeBreakdown.totalWins,
        totalLosses: prizeBreakdown.totalLosses,
        overallWinRate: prizeBreakdown.overallWinRate,
        games: prizeBreakdown.games,
        funMode: {
          sessions: funSessions.length,
          finalScreenViews: funBreakdown.finalViews,
          totalWins: funBreakdown.totalWins,
          totalLosses: funBreakdown.totalLosses,
          overallWinRate: funBreakdown.overallWinRate,
          games: funBreakdown.games,
        },
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
        state = { sessions: {}, devices: {}, events: [], nextEventId: 1 }
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
