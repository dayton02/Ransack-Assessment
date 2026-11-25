import { config } from './config.js'

const SESSION_STORAGE_KEY = 'play_and_win_session_v1'
const ADMIN_PIN_KEY = 'play_and_win_admin_pin'

/**
 * Generates a RFC 4122 v4 UUID safely even over non-HTTPS LAN IPs
 * (e.g. http://192.168.1.x:5173 on mobile phones where crypto.randomUUID is unavailable).
 */
export function generateUUID() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16)
    crypto.getRandomValues(bytes)
    bytes[6] = (bytes[6] & 0x0f) | 0x40
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  }
  return `sess-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function getSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function saveSession(session) {
  try {
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
  } catch {
    // Ignore storage errors
  }
  return session
}

export function startNewSession() {
  const session = {
    sessionId: generateUUID(),
    createdAt: new Date().toISOString(),
    lastResult: null,
    claimCode: null,
    claimed: false,
    claimedAt: null,
    finalViewLogged: false,
  }
  return saveSession(session)
}

export function ensureActiveSession() {
  const existing = getSession()
  if (existing && existing.sessionId && !existing.claimed) {
    return existing
  }
  return startNewSession()
}

export function updateSession(patch) {
  const current = getSession() || startNewSession()
  const updated = { ...current, ...patch }
  return saveSession(updated)
}

export function clearSession() {
  try {
    sessionStorage.removeItem(SESSION_STORAGE_KEY)
  } catch {
    // Ignore
  }
}

export function getSavedAdminPin() {
  try {
    return sessionStorage.getItem(ADMIN_PIN_KEY) || ''
  } catch {
    return ''
  }
}

export function setSavedAdminPin(pin) {
  try {
    if (pin) sessionStorage.setItem(ADMIN_PIN_KEY, pin)
    else sessionStorage.removeItem(ADMIN_PIN_KEY)
  } catch {
    // Ignore
  }
}

/**
 * Compute score metrics dynamically from `config.rules.passMark`.
 */
export function evaluateScore(score, maxScore) {
  const safeMax = Math.max(1, Number(maxScore) || 1)
  const safeScore = Math.max(0, Number(score) || 0)
  const passMark = Number(config.rules.passMark) || 0.8
  const ratio = safeScore / safeMax
  const needed = Math.ceil(safeMax * passMark)
  const percent = Math.round(ratio * 100)
  const passPercent = Math.round(passMark * 100)
  const won = ratio + 1e-9 >= passMark
  return {
    score: safeScore,
    maxScore: safeMax,
    needed,
    percent,
    passPercent,
    won,
  }
}

/**
 * Compute effective quiz questions based on `config.quiz`.
 */
export function getActiveQuizQuestions() {
  const all = Array.isArray(config.quiz.questions) ? [...config.quiz.questions] : []
  if (config.quiz.shuffleQuestions) {
    for (let i = all.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[all[i], all[j]] = [all[j], all[i]]
    }
  }
  const limit = Number(config.quiz.questionLimit)
  if (Number.isFinite(limit) && limit > 0) {
    return all.slice(0, Math.min(limit, all.length))
  }
  return all
}

export function getQuizMaxScore() {
  const totalQuestions = config.quiz.questionLimit
    ? Math.min(Number(config.quiz.questionLimit), config.quiz.questions.length)
    : config.quiz.questions.length
  return Math.max(1, totalQuestions) * (Number(config.quiz.pointsPerCorrect) || 1)
}

export function getActiveMemorySymbols() {
  const all = Array.isArray(config.memory.symbols) ? config.memory.symbols : []
  const count = Math.max(2, Math.min(Number(config.memory.pairCount) || 6, all.length))
  return all.slice(0, count)
}

export function getMemoryMaxScore() {
  const pairs = getActiveMemorySymbols().length
  return pairs * (Number(config.memory.pointsPerPair) || 100)
}

/**
 * Hash routing helpers (`#/`, `#/select`, `#/play/quiz`, `#/play/memory`, `#/result`, `#/win`, `#/admin`)
 */
export function getRoute() {
  const hash = window.location.hash || '#/'
  const clean = hash.replace(/^#/, '').split('?')[0] || '/'
  return clean.startsWith('/') ? clean : `/${clean}`
}

export function navigate(route) {
  const target = route.startsWith('#') ? route : `#${route}`
  if (window.location.hash === target) {
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  } else {
    window.location.hash = target
  }
}
