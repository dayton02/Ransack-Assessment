import { t, getGameName } from '../i18n.js'
import { UI_SVGS } from '../icons.js'
import { launchConfetti } from '../confetti.js'
import { getSession, updateSession, clearSession, getDeviceId, navigate } from '../state.js'
import { saveRecord, getSessionStatus, redeemPrize, unlockDeviceForFamily } from '../api.js'

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

  const deviceId = getDeviceId()

  let state = {
    sessionId: initialSession.sessionId,
    claimCode: initialSession.claimCode || '----',
    claimed: Boolean(initialSession.claimed),
    claimedAt: initialSession.claimedAt || null,
    deviceLocked: Boolean(initialSession.deviceLocked),
    previousClaimCode: initialSession.previousClaimCode || null,
    previousClaimedAt: initialSession.previousClaimedAt || null,
    ipClaimCount: Number(initialSession.ipClaimCount || 0),
    gameId: initialSession.lastResult?.gameId || 'quiz',
    score: initialSession.lastResult?.score ?? 0,
    maxScore: initialSession.lastResult?.maxScore ?? 1,
    percent: initialSession.lastResult?.percent ?? 100,
    modalMode: null, // 'redeem' | 'unlock' | null
    modalError: '',
    submitting: false,
  }

  let destroyed = false

  // Record Final Screen view once per arrival (not on language switch)
  saveRecord({
    sessionId: state.sessionId,
    deviceId,
    funMode: Boolean(initialSession.funMode || state.deviceLocked),
    eventType: 'final_screen_view',
    gameId: state.gameId,
  })

  if (!state.claimed) {
    launchConfetti(2200)
  }

  // Reconcile authoritative claim & device state from backend (handles refresh & Wi-Fi blips)
  async function syncClaimFromServer() {
    let remote = await getSessionStatus(state.sessionId)
    if (destroyed) return

    if (!remote?.claimCode && !remote?.deviceLocked && initialSession.lastResult?.won) {
      const saved = await saveRecord({
        sessionId: state.sessionId,
        deviceId,
        eventType: 'game_completed',
        gameId: state.gameId,
        score: state.score,
        maxScore: state.maxScore,
        won: true,
      })
      if (destroyed) return
      if (saved?.ok) {
        remote = {
          claimCode: saved.claimCode || null,
          claimed: Boolean(saved.claimed),
          claimedAt: saved.claimedAt || null,
          deviceLocked: Boolean(saved.deviceLocked),
          previousClaimCode: saved.previousClaimCode || null,
          previousClaimedAt: saved.previousClaimedAt || null,
          ipClaimCount: Number(saved.ipClaimCount || 0),
        }
      }
    }

    if (!remote) return
    state = {
      ...state,
      claimCode: remote.claimCode || state.claimCode,
      claimed: Boolean(remote.claimed),
      claimedAt: remote.claimedAt || state.claimedAt,
      deviceLocked: Boolean(remote.deviceLocked) && !remote.claimed,
      previousClaimCode: remote.previousClaimCode || state.previousClaimCode,
      previousClaimedAt: remote.previousClaimedAt || state.previousClaimedAt,
      ipClaimCount: Number(remote.ipClaimCount ?? state.ipClaimCount),
      gameId: remote.winningGame || state.gameId,
      score: remote.winningScore ?? state.score,
      maxScore: remote.winningMaxScore ?? state.maxScore,
    }
    updateSession({
      claimCode: state.claimCode === '----' ? null : state.claimCode,
      claimed: state.claimed,
      claimedAt: state.claimedAt,
      deviceLocked: state.deviceLocked,
      previousClaimCode: state.previousClaimCode,
      previousClaimedAt: state.previousClaimedAt,
      ipClaimCount: state.ipClaimCount,
    })
    render()
  }

  syncClaimFromServer()

  function render() {
    if (destroyed) return
    const gameName = getGameName(state.gameId)
    const percent =
      state.maxScore > 0 ? Math.round((state.score / state.maxScore) * 100) : state.percent

    const isFunMode = state.deviceLocked && !state.claimed

    container.innerHTML = `
      <div class="screen-body">
        <section class="card text-center">
          <div class="trophy-wrap">${UI_SVGS.trophy}</div>
          <span class="eyebrow ${
            state.claimed ? 'eyebrow-coral' : isFunMode ? 'eyebrow-gold' : ''
          }">
            ${escapeHtml(
              state.claimed
                ? t('prizeClaimedStamp')
                : isFunMode
                  ? t('funModeBadge')
                  : t('winBadge'),
            )}
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

          ${
            isFunMode
              ? `
            <div class="notice-banner" role="status" style="margin: 16px 0">
              ${escapeHtml(
                t('funModeNotice', {
                  code: state.previousClaimCode || '—',
                }),
              )}
            </div>
            <div class="btn-stack">
              <button type="button" id="next-player-btn" class="btn btn-primary">
                ${escapeHtml(t('funModePlayAgainBtn'))}
              </button>
              <button type="button" id="open-unlock-btn" class="btn btn-secondary" style="min-height: 46px; font-size: 0.92rem">
                ${escapeHtml(t('staffUnlockFamilyBtn'))}
              </button>
            </div>
          `
              : `
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
          `
          }
        </section>
      </div>

      ${
        state.modalMode
          ? `
        <div class="modal-backdrop" id="staff-modal-backdrop" role="dialog" aria-modal="true">
          <div class="modal-card text-center">
            <h2 class="section-title" style="margin-top: 0">
              ${escapeHtml(
                state.modalMode === 'unlock' ? t('staffUnlockTitle') : t('redeemModalTitle'),
              )}
            </h2>
            <p class="lead">
              ${escapeHtml(
                state.modalMode === 'unlock'
                  ? t('staffUnlockSubtitle')
                  : t('redeemModalSubtitle', { code: state.claimCode }),
              )}
            </p>

            ${
              state.modalMode === 'redeem' && state.ipClaimCount > 0
                ? `
              <div class="warning-banner" role="alert">
                ${escapeHtml(t('repeatIpWarning', { count: state.ipClaimCount }))}
              </div>
            `
                : ''
            }

            <form id="staff-modal-form" autocomplete="off">
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
                  class="btn ${state.modalMode === 'unlock' ? 'btn-teal' : 'btn-primary'}"
                  ${state.submitting ? 'disabled' : ''}
                >
                  ${escapeHtml(
                    state.modalMode === 'unlock'
                      ? t('staffUnlockConfirmBtn')
                      : t('redeemConfirmBtn'),
                  )}
                </button>
                <button
                  type="button"
                  id="cancel-modal-btn"
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

    container.querySelector('#open-redeem-btn')?.addEventListener('click', () => {
      state.modalMode = 'redeem'
      state.modalError = ''
      render()
      container.querySelector('#staff-pin-input')?.focus()
    })

    container.querySelector('#open-unlock-btn')?.addEventListener('click', () => {
      state.modalMode = 'unlock'
      state.modalError = ''
      render()
      container.querySelector('#staff-pin-input')?.focus()
    })

    container.querySelector('#next-player-btn')?.addEventListener('click', () => {
      clearSession()
      navigate('/')
    })

    container.querySelector('#cancel-modal-btn')?.addEventListener('click', () => {
      state.modalMode = null
      state.modalError = ''
      render()
    })

    const backdrop = container.querySelector('#staff-modal-backdrop')
    backdrop?.addEventListener('click', (e) => {
      if (e.target === backdrop && !state.submitting) {
        state.modalMode = null
        state.modalError = ''
        render()
      }
    })

    container.querySelector('#staff-modal-form')?.addEventListener('submit', async (e) => {
      e.preventDefault()
      if (state.submitting) return
      const pin = (container.querySelector('#staff-pin-input')?.value || '').trim()
      if (!pin) return

      state.submitting = true
      state.modalError = ''
      render()

      if (state.modalMode === 'unlock') {
        const res = await unlockDeviceForFamily(deviceId, pin)
        if (destroyed) return
        state.submitting = false
        if (res.ok) {
          state.modalMode = null
          clearSession()
          navigate('/')
        } else if (res.status === 403 || res.status === 401) {
          state.modalError = t('redeemWrongPin')
          render()
          container.querySelector('#staff-pin-input')?.focus()
        } else {
          state.modalError = t('redeemError')
          render()
        }
        return
      }

      const res = await redeemPrize(state.sessionId, pin)
      if (destroyed) return
      state.submitting = false

      if (res.ok) {
        state.claimed = true
        state.claimedAt = res.claimedAt || new Date().toISOString()
        state.modalMode = null
        updateSession({
          claimed: true,
          claimedAt: state.claimedAt,
        })
        render()
      } else if (res.deviceAlreadyClaimed) {
        state.deviceLocked = true
        state.previousClaimCode = res.previousClaimCode || state.previousClaimCode
        state.previousClaimedAt = res.previousClaimedAt || state.previousClaimedAt
        state.modalMode = null
        updateSession({
          deviceLocked: true,
          previousClaimCode: state.previousClaimCode,
          previousClaimedAt: state.previousClaimedAt,
        })
        render()
      } else if (res.alreadyClaimed || res.status === 409) {
        state.claimed = true
        state.claimedAt = res.claimedAt || state.claimedAt
        state.modalMode = null
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
