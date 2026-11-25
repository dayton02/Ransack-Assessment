import { t } from '../i18n.js'
import { UI_SVGS } from '../icons.js'
import { getSession, navigate } from '../state.js'
import { saveRecord } from '../api.js'

function escapeHtml(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

export function mountResultScreen(container) {
  const session = getSession()
  const result = session?.lastResult

  if (!result) {
    navigate('/select')
    return {}
  }

  if (result.won) {
    navigate('/win')
    return {}
  }

  function render() {
    container.innerHTML = `
      <div class="screen-body">
        <section class="card text-center">
          <div class="trophy-wrap">${UI_SVGS.star}</div>
          <span class="eyebrow eyebrow-gold">${escapeHtml(t('lossBadge'))}</span>
          <h1 class="hero-title" style="margin-top: 10px">${escapeHtml(t('lossTitle'))}</h1>
          <p class="lead" style="font-weight: 800; color: var(--ink-primary); margin-bottom: 8px">
            ${escapeHtml(
              t('lossSummary', {
                score: result.score,
                maxScore: result.maxScore,
                percent: result.percent,
              }),
            )}
          </p>
          <p class="lead">
            ${escapeHtml(
              t('lossNeeded', {
                needed: result.needed,
                passPercent: result.passPercent,
              }),
            )}
          </p>

          <div class="btn-stack">
            <button type="button" id="retry-same-btn" class="btn btn-primary">
              ${escapeHtml(t('tryAgainBtn'))}
            </button>
            <button type="button" id="switch-game-btn" class="btn btn-secondary">
              ${escapeHtml(t('switchGameBtn'))}
            </button>
          </div>
        </section>
      </div>
    `

    container.querySelector('#retry-same-btn').addEventListener('click', () => {
      saveRecord({
        sessionId: session.sessionId,
        eventType: 'game_picked',
        gameId: result.gameId,
      })
      navigate(`/play/${result.gameId}`)
    })

    container.querySelector('#switch-game-btn').addEventListener('click', () => {
      navigate('/select')
    })
  }

  render()

  return {
    onLangChange: render,
  }
}
