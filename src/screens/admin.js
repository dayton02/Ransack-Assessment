import { config } from '../config.js'
import { getSavedAdminPin, setSavedAdminPin, navigate } from '../state.js'
import {
  verifyAdminPin,
  getAdminStats,
  redeemClaimCode,
  downloadSessionsCsv,
  resetAllStats,
} from '../api.js'

function escapeHtml(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function formatTimestamp(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export function mountAdminScreen(container) {
  let pin = getSavedAdminPin()
  let unlocked = Boolean(pin)
  let stats = null
  let loading = false
  let errorMsg = ''
  let searchQuery = ''
  let refreshTimer = null
  let destroyed = false

  async function loadStats() {
    if (!unlocked || !pin || destroyed) return
    loading = true
    try {
      stats = await getAdminStats(pin)
      errorMsg = ''
    } catch (err) {
      if (err.status === 401) {
        unlocked = false
        pin = ''
        setSavedAdminPin('')
        errorMsg = 'Session expired. Please re-enter Staff PIN.'
      } else {
        errorMsg = 'Could not load stats from server.'
      }
    } finally {
      loading = false
      if (!destroyed) render()
    }
  }

  function startAutoRefresh() {
    clearInterval(refreshTimer)
    const interval = Number(config.admin.autoRefreshMs) || 10000
    refreshTimer = setInterval(() => {
      const typingInSearch = document.activeElement?.id === 'claim-search-input'
      if (unlocked && !destroyed && !typingInSearch) {
        loadStats()
      }
    }, interval)
  }

  function renderPinGate() {
    container.innerHTML = `
      <div class="screen-body">
        <div class="nav-row">
          <button type="button" id="admin-exit-btn" class="btn-ghost">← Back to App</button>
        </div>

        <section class="card text-center">
          <span class="eyebrow">Staff Only</span>
          <h1 class="section-title" style="margin-top: 10px">Admin Dashboard</h1>
          <p class="lead">
            Enter the 4-digit staff PIN to view event stats and verify prize claims.
          </p>

          <form id="admin-pin-form" autocomplete="off">
            <input
              type="password"
              id="admin-pin-input"
              class="pin-input"
              inputmode="numeric"
              pattern="[0-9]*"
              maxlength="8"
              placeholder="••••"
              aria-label="Staff PIN"
              required
            />
            <div class="error-text">${escapeHtml(errorMsg)}</div>
            <button type="submit" class="btn btn-teal">Unlock Dashboard</button>
          </form>
        </section>
      </div>
    `

    container.querySelector('#admin-exit-btn').addEventListener('click', () => navigate('/'))
    const input = container.querySelector('#admin-pin-input')
    input?.focus()

    container.querySelector('#admin-pin-form').addEventListener('submit', async (e) => {
      e.preventDefault()
      const candidate = (input?.value || '').trim()
      if (!candidate) return
      const check = await verifyAdminPin(candidate)
      if (destroyed) return
      if (check.ok) {
        pin = candidate
        unlocked = true
        errorMsg = ''
        setSavedAdminPin(candidate)
        startAutoRefresh()
        await loadStats()
      } else if (check.networkError) {
        errorMsg = 'Cannot reach server. Make sure `npm start` is running.'
        render()
      } else {
        errorMsg = 'Incorrect Staff PIN. Please try again.'
        render()
      }
    })
  }

  function renderDashboard() {
    const s = stats || {
      engine: '...',
      totalPlayers: 0,
      finalScreenViews: 0,
      prizesWon: 0,
      prizesClaimed: 0,
      prizesUnclaimed: 0,
      overallWinRate: 0,
      games: {
        quiz: { picked: 0, wins: 0, losses: 0, winRate: 0 },
        memory: { picked: 0, wins: 0, losses: 0, winRate: 0 },
      },
      funMode: {
        sessions: 0,
        finalScreenViews: 0,
        totalWins: 0,
        totalLosses: 0,
        overallWinRate: 0,
        games: {
          quiz: { picked: 0, wins: 0, losses: 0, winRate: 0 },
          memory: { picked: 0, wins: 0, losses: 0, winRate: 0 },
        },
      },
      claims: [],
    }
    const fm = s.funMode || {
      sessions: 0,
      finalScreenViews: 0,
      totalWins: 0,
      totalLosses: 0,
      overallWinRate: 0,
      games: {
        quiz: { picked: 0, wins: 0, losses: 0, winRate: 0 },
        memory: { picked: 0, wins: 0, losses: 0, winRate: 0 },
      },
    }

    const q = searchQuery.trim().toUpperCase()
    const filteredClaims = (s.claims || []).filter((c) => {
      if (!q) return true
      return (
        (c.claimCode && c.claimCode.toUpperCase().includes(q)) ||
        (c.winningGame && c.winningGame.toUpperCase().includes(q))
      )
    })

    container.innerHTML = `
      <div class="screen-body align-top">
        <div class="card card-compact">
          <div class="admin-header">
            <div>
              <span class="eyebrow">Admin • ${escapeHtml(config.event.eventName)}</span>
              <h1 class="section-title" style="margin: 6px 0 2px">Live Event Stats</h1>
              <div class="muted">
                Storage: <strong>${escapeHtml(s.engine)}</strong> • Pass mark:
                <strong>${Math.round((Number(config.rules.passMark) || 0.8) * 100)}%</strong> •
                1/Device: <strong>${s.onePrizePerDevice ? 'ON' : 'OFF'}</strong>
              </div>
            </div>
            <div class="admin-actions">
              <button type="button" id="admin-refresh-btn" class="btn-ghost" ${loading ? 'disabled' : ''}>
                ↻ Refresh
              </button>
              <button type="button" id="admin-csv-btn" class="btn-ghost">
                ↓ Export CSV
              </button>
              <button type="button" id="admin-lock-btn" class="btn-ghost">
                Lock
              </button>
              <button type="button" id="admin-home-btn" class="btn-ghost">
                ← App
              </button>
            </div>
          </div>
          ${errorMsg ? `<div class="error-text" style="text-align:left">${escapeHtml(errorMsg)}</div>` : ''}
        </div>

        <section class="card card-compact">
          <div class="kpi-grid">
            <div class="kpi-tile">
              <div class="kpi-value" id="stat-players">${s.totalPlayers}</div>
              <div class="kpi-label">Total Players</div>
            </div>
            <div class="kpi-tile">
              <div class="kpi-value" id="stat-final-views">${s.finalScreenViews}</div>
              <div class="kpi-label">Final Screen Views</div>
            </div>
            <div class="kpi-tile">
              <div class="kpi-value" id="stat-claimed">${s.prizesClaimed} / ${s.prizesWon}</div>
              <div class="kpi-label">Prizes Claimed</div>
            </div>
            <div class="kpi-tile">
              <div class="kpi-value" id="stat-win-rate">${s.overallWinRate}%</div>
              <div class="kpi-label">Win Rate</div>
            </div>
          </div>
        </section>

        <section class="card card-compact">
          <h2 class="section-title" style="font-size: 1.15rem; margin-top: 0">
            Prize Play — Per-Game Breakdown
          </h2>
          <div class="game-stat-grid">
            ${[
              { key: 'quiz', label: 'Fun-Fact Quiz' },
              { key: 'memory', label: 'Forest Canopy Memory' },
            ]
              .map(({ key, label }) => {
                const g = s.games?.[key] || { picked: 0, wins: 0, losses: 0, winRate: 0 }
                return `
                  <div class="game-stat-card">
                    <h3>${label}</h3>
                    <div class="mini-metrics">
                      <div class="mini-metric">
                        <strong>${g.picked}</strong>
                        <span>Picked</span>
                      </div>
                      <div class="mini-metric">
                        <strong style="color: var(--success)">${g.wins}</strong>
                        <span>Wins</span>
                      </div>
                      <div class="mini-metric">
                        <strong style="color: var(--coral)">${g.losses}</strong>
                        <span>Losses</span>
                      </div>
                    </div>
                    <div class="progress-track" style="margin: 0 0 4px">
                      <div class="progress-fill" style="width: ${g.winRate}%"></div>
                    </div>
                    <div class="muted" style="font-size: 0.78rem">Win rate: ${g.winRate}%</div>
                  </div>
                `
              })
              .join('')}
          </div>
        </section>

        <section class="card card-compact">
          <div class="admin-header" style="margin-bottom: 10px">
            <div>
              <h2 class="section-title" style="font-size: 1.1rem; margin: 0">
                Play-for-Fun Stats (Separate from Prize Play)
              </h2>
              <div class="muted" style="font-size: 0.8rem">
                Replays by already-claimed devices — excluded from Prize Play counts above.
              </div>
            </div>
            <span class="pill-tag">
              ${fm.sessions} Sessions • ${fm.finalScreenViews} Final Views
            </span>
          </div>
          <div class="game-stat-grid">
            ${[
              { key: 'quiz', label: 'Fun-Fact Quiz (Fun)' },
              { key: 'memory', label: 'Forest Canopy Memory (Fun)' },
            ]
              .map(({ key, label }) => {
                const g = fm.games?.[key] || { picked: 0, wins: 0, losses: 0, winRate: 0 }
                return `
                  <div class="game-stat-card" style="background: #f9fafb">
                    <h3>${label}</h3>
                    <div class="mini-metrics">
                      <div class="mini-metric">
                        <strong>${g.picked}</strong>
                        <span>Picked</span>
                      </div>
                      <div class="mini-metric">
                        <strong style="color: var(--success)">${g.wins}</strong>
                        <span>Wins</span>
                      </div>
                      <div class="mini-metric">
                        <strong style="color: var(--coral)">${g.losses}</strong>
                        <span>Losses</span>
                      </div>
                    </div>
                  </div>
                `
              })
              .join('')}
          </div>
        </section>

        <section class="card card-compact">
          <div class="admin-header" style="margin-bottom: 10px">
            <h2 class="section-title" style="font-size: 1.15rem; margin: 0">
              Prize Claim Code Lookup (${filteredClaims.length})
            </h2>
            <button type="button" id="admin-reset-btn" class="btn-ghost" style="color: var(--coral)">
              Clear Test Data
            </button>
          </div>

          <input
            type="search"
            id="claim-search-input"
            class="search-input"
            placeholder="Search claim code (e.g. OAK-42)..."
            value="${escapeHtml(searchQuery)}"
          />

          <div class="claims-list">
            ${
              filteredClaims.length === 0
                ? `<p class="muted text-center" style="margin: 12px 0">No winning claim codes yet.</p>`
                : filteredClaims
                    .map(
                      (c) => `
                  <div class="claim-row">
                    <div>
                      <div class="claim-row-code">${escapeHtml(c.claimCode || '—')}</div>
                      <div class="muted" style="font-size: 0.78rem">
                        ${escapeHtml(c.winningGame || 'game')} • ${c.winningScore ?? 0}/${c.winningMaxScore ?? 0}
                        • ${escapeHtml(formatTimestamp(c.claimed ? c.claimedAt : c.lastActiveAt))}
                      </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap">
                      ${
                        c.repeatIp
                          ? `<span class="status-badge is-warning" title="Multiple claims from this phone/network IP">Repeat IP (${c.ipClaimCount})</span>`
                          : ''
                      }
                      <span class="status-badge ${c.claimed ? 'is-claimed' : 'is-unclaimed'}">
                        ${c.claimed ? 'Claimed' : 'Unclaimed'}
                      </span>
                      ${
                        !c.claimed && c.claimCode
                          ? `<button type="button" class="btn-small" data-redeem-code="${escapeHtml(c.claimCode)}">Mark Claimed</button>`
                          : ''
                      }
                    </div>
                  </div>
                `,
                    )
                    .join('')
            }
          </div>
        </section>
      </div>
    `

    container.querySelector('#admin-home-btn').addEventListener('click', () => navigate('/'))
    container.querySelector('#admin-refresh-btn').addEventListener('click', loadStats)
    container.querySelector('#admin-lock-btn').addEventListener('click', () => {
      unlocked = false
      pin = ''
      setSavedAdminPin('')
      clearInterval(refreshTimer)
      render()
    })

    container.querySelector('#admin-csv-btn').addEventListener('click', async () => {
      try {
        await downloadSessionsCsv(pin)
      } catch {
        errorMsg = 'CSV download failed.'
        render()
      }
    })

    container.querySelector('#admin-reset-btn').addEventListener('click', async () => {
      const confirmed = window.confirm(
        'Clear all recorded players, game plays, and claim codes? This cannot be undone.',
      )
      if (!confirmed) return
      await resetAllStats(pin)
      await loadStats()
    })

    const searchInput = container.querySelector('#claim-search-input')
    searchInput?.addEventListener('input', (e) => {
      searchQuery = e.target.value
      renderDashboard()
      const nextInput = container.querySelector('#claim-search-input')
      if (nextInput) {
        nextInput.focus()
        nextInput.setSelectionRange(searchQuery.length, searchQuery.length)
      }
    })

    container.querySelectorAll('[data-redeem-code]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const code = btn.dataset.redeemCode
        btn.disabled = true
        const res = await redeemClaimCode(code, pin)
        await loadStats()
        if (!res.ok && !destroyed) {
          errorMsg = res.error || 'Could not redeem that claim code.'
          render()
        }
      })
    })
  }

  function render() {
    if (destroyed) return
    if (!unlocked) renderPinGate()
    else renderDashboard()
  }

  render()
  if (unlocked) {
    startAutoRefresh()
    loadStats()
  }

  return {
    destroy() {
      destroyed = true
      clearInterval(refreshTimer)
    },
  }
}
