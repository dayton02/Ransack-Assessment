import { t, getGameName } from '../i18n.js'
import { UI_SVGS } from '../icons.js'
import { launchConfetti } from '../confetti.js'
import { getSession, updateSession, clearSession, navigate } from '../state.js'
import { saveRecord, getSessionStatus, redeemPrize } from '../api.js'

function escapeHtml(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function formatLocalTime(isoStr) {
  if (!isoStr) return ''
  try {
    return new Date(isoStr).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch {
    return isoStr
  }
}

export function mountFinalScreen(container) {
  const initialSession = getSession()
  if (!initialSession || (!initialSession.lastResult?.won && !initialSession.claimCode)) {
    navigate('/')
    return {}
  }

  let state = {
    sessionId: initialSession.sessionId,
    claimCode: initialSession.claimCode || '----',
    claimed: Boolean(initialSession.claimed),
    claimedAt: initialSession.claimedAt || null,
    gameId: initialSession.lastResult?.gameId || 'quiz',
    score: initialSession.lastResult?.score ?? 0,
    maxScore: initialSession.lastResult?.maxScore ?? 1,
    percent: initialSession.lastResult?.percent ?? 100,
    modalOpen: false,
    modalError: '',
    submitting: false,
  }

  let destroyed = false

  // Record Final Screen view once per arrival (not on language switch)
  saveRecord({
    sessionId: state.sessionId,
    eventType: 'final_screen_view',
    gameId: state.gameId,
  })

  if (!state.claimed) {
    launchConfetti(2200)
  }

  // Reconcile authoritative claim state from the backend (handles page refresh & Wi-Fi blips!)
  async function syncClaimFromServer() {
    let remote = await getSessionStatus(state.sessionId)
    if (destroyed) return

    // If the winning record hasn't reached the server yet (e.g. Wi-Fi blip), re-send it once
    if (!remote?.claimCode && initialSession.lastResult?.won) {
      const saved = await saveRecord({
        sessionId: state.sessionId,
        eventType: 'game_completed',
        gameId: state.gameId,
        score: state.score,
        maxScore: state.maxScore,
        won: true,
      })
      if (destroyed) return
      if (saved?.claimCode) {
        remote = {
          claimCode: saved.claimCode,
          claimed: Boolean(saved.claimed),
          claimedAt: saved.claimedAt || null,
        }
      }
    }

    if (!remote) return
    const changed =
      (remote.claimCode && remote.claimCode !== state.claimCode) ||
      Boolean(remote.claimed) !== state.claimed ||
      remote.claimedAt !== state.claimedAt

    state = {
      ...state,
      claimCode: remote.claimCode || state.claimCode,
      claimed: Boolean(remote.claimed),
      claimedAt: remote.claimedAt || state.claimedAt,
      gameId: remote.winningGame || state.gameId,
      score: remote.winningScore ?? state.score,
      maxScore: remote.winningMaxScore ?? state.maxScore,
    }
    updateSession({
      claimCode: state.claimCode,
      claimed: state.claimed,
      claimedAt: state.claimedAt,
    })
    if (changed) render()
  }

  syncClaimFromServer()

  function render() {
    if (destroyed) return
    const gameName = getGameName(state.gameId)
    const percent =
      state.maxScore > 0 ? Math.round((state.score / state.maxScore) * 100) : state.percent

    container.innerHTML = `
      <div class="screen-body">
        <section class="card text-center">
          <div class="trophy-wrap">${UI_SVGS.trophy}</div>
          <span class="eyebrow ${state.claimed ? 'eyebrow-coral' : ''}">
            ${escapeHtml(state.claimed ? t('prizeClaimedStamp') : t('winBadge'))}
          </span>
          <h1 class="hero-title" style="margin-top: 8px">${escapeHtml(t('winTitle'))}</h1>
          <p class="lead">
            ${escapeHtml(
              t('winSubtitle', {
                score: state.score,
                maxScore: state.maxScore,
                percent,
                gameName,
              }),
            )}
          </p>

          <div class="claim-box ${state.claimed ? 'is-claimed' : ''}">
            <div class="claim-label">${escapeHtml(t('claimCodeLabel'))}</div>
            <div class="claim-code" id="claim-code-display">${escapeHtml(state.claimCode)}</div>

            ${
              state.claimed
                ? `
              <div class="claimed-stamp" role="status">${escapeHtml(t('prizeClaimedStamp'))}</div>
              ${
                state.claimedAt
                  ? `<div class="claimed-time">${escapeHtml(
                      t('claimedAtText', { time: formatLocalTime(state.claimedAt) }),
                    )}</div>`
                  : ''
              }
            `
                : ''
            }
          </div>

          ${
            state.claimed
              ? `
            <p class="lead">${escapeHtml(t('claimedThankYou'))}</p>
            <div class="btn-stack">
              <button type="button" id="next-player-btn" class="btn btn-primary">
                ${escapeHtml(t('nextPlayerBtn'))}
              </button>
            </div>
          `
              : `
            <p class="lead" style="font-weight: 700; color: var(--ink-primary)">
              ${escapeHtml(t('prizeInstructions'))}
            </p>
            <p class="prize-note">${escapeHtml(t('onePrizeNote'))}</p>
            <hr class="staff-divider" />
            <button type="button" id="open-redeem-btn" class="btn btn-teal">
              ${escapeHtml(t('staffRedeemBtn'))}
            </button>
          `
          }
        </section>
      </div>

      ${
        state.modalOpen
          ? `
        <div class="modal-backdrop" id="redeem-backdrop" role="dialog" aria-modal="true">
          <div class="modal-card text-center">
            <h2 class="section-title" style="margin-top: 0">${escapeHtml(t('redeemModalTitle'))}</h2>
            <p class="lead">${escapeHtml(t('redeemModalSubtitle', { code: state.claimCode }))}</p>
            <form id="redeem-form" autocomplete="off">
              <input
                type="password"
                id="staff-pin-input"
                class="pin-input"
                inputmode="numeric"
                pattern="[0-9]*"
                maxlength="8"
                placeholder="••••"
                aria-label="${escapeHtml(t('redeemPinPlaceholder'))}"
                required
              />
              <div class="error-text" id="redeem-error">${escapeHtml(state.modalError)}</div>
              <div class="btn-stack" style="margin-top: 6px">
                <button
                  type="submit"
                  class="btn btn-primary"
                  ${state.submitting ? 'disabled' : ''}
                >
                  ${escapeHtml(t('redeemConfirmBtn'))}
                </button>
                <button
                  type="button"
                  id="cancel-redeem-btn"
                  class="btn btn-secondary"
                  ${state.submitting ? 'disabled' : ''}
                >
                  ${escapeHtml(t('redeemCancelBtn'))}
                </button>
              </div>
            </form>
          </div>
        </div>
      `
          : ''
      }
    `

    const openBtn = container.querySelector('#open-redeem-btn')
    openBtn?.addEventListener('click', () => {
      state.modalOpen = true
      state.modalError = ''
      render()
      container.querySelector('#staff-pin-input')?.focus()
    })

    const nextPlayerBtn = container.querySelector('#next-player-btn')
    nextPlayerBtn?.addEventListener('click', () => {
      clearSession()
      navigate('/')
    })

    const cancelBtn = container.querySelector('#cancel-redeem-btn')
    cancelBtn?.addEventListener('click', () => {
      state.modalOpen = false
      state.modalError = ''
      render()
    })

    const backdrop = container.querySelector('#redeem-backdrop')
    backdrop?.addEventListener('click', (e) => {
      if (e.target === backdrop && !state.submitting) {
        state.modalOpen = false
        state.modalError = ''
        render()
      }
    })

    const form = container.querySelector('#redeem-form')
    form?.addEventListener('submit', async (e) => {
      e.preventDefault()
      if (state.submitting) return
      const pinInput = container.querySelector('#staff-pin-input')
      const pin = (pinInput?.value || '').trim()
      if (!pin) return

      state.submitting = true
      state.modalError = ''
      render()

      const res = await redeemPrize(state.sessionId, pin)
      if (destroyed) return
      state.submitting = false

      if (res.ok) {
        state.claimed = true
        state.claimedAt = res.claimedAt || new Date().toISOString()
        state.modalOpen = false
        updateSession({
          claimed: true,
          claimedAt: state.claimedAt,
        })
        render()
      } else if (res.alreadyClaimed || res.status === 409) {
        state.claimed = true
        state.claimedAt = res.claimedAt || state.claimedAt
        state.modalOpen = false
        updateSession({
          claimed: true,
          claimedAt: state.claimedAt,
        })
        render()
      } else if (res.status === 403 || res.status === 401) {
        state.modalError = t('redeemWrongPin')
        render()
        container.querySelector('#staff-pin-input')?.focus()
      } else {
        state.modalError = t('redeemError')
        render()
      }
    })
  }

  render()

  return {
    onLangChange: render,
    destroy() {
      destroyed = true
    },
  }
}
