import { config } from '../config.js'
import { t } from '../i18n.js'
import { UI_SVGS } from '../icons.js'
import {
  ensureActiveSession,
  getDeviceId,
  evaluateScore,
  getQuizMaxScore,
  getActiveMemorySymbols,
  getMemoryMaxScore,
  navigate,
} from '../state.js'
import { saveRecord } from '../api.js'

function escapeHtml(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

export function mountSelectScreen(container) {
  const session = ensureActiveSession()

  function render() {
    const passPercent = Math.round((Number(config.rules.passMark) || 0.8) * 100)

    const quizCount = config.quiz.questionLimit
      ? Math.min(Number(config.quiz.questionLimit), config.quiz.questions.length)
      : config.quiz.questions.length
    const quizMax = getQuizMaxScore()
    const quizEval = evaluateScore(0, quizMax)

    const memoryPairs = getActiveMemorySymbols().length
    const memoryMax = getMemoryMaxScore()
    const memoryEval = evaluateScore(0, memoryMax)
    const memorySeconds = Number(config.memory.timeLimitSeconds) || 45

    container.innerHTML = `
      <div class="screen-body align-top">
        <div class="nav-row">
          <button type="button" id="back-home-btn" class="btn-ghost">
            ← ${escapeHtml(t('backHome'))}
          </button>
        </div>

        <section class="card card-compact text-center">
          <h1 class="section-title">${escapeHtml(t('selectHeading'))}</h1>
          <p class="lead">${escapeHtml(t('selectSubheading', { passPercent }))}</p>
        </section>

        <div class="game-card-list">
          <button type="button" class="game-choice-card" data-game="quiz">
            <div class="game-choice-icon">${UI_SVGS.quiz}</div>
            <div class="game-choice-content">
              <h2 class="game-choice-title">${escapeHtml(t('quizTitle'))}</h2>
              <p class="game-choice-desc">
                ${escapeHtml(
                  t('quizDesc', {
                    count: quizCount,
                    needed: quizEval.needed,
                    maxScore: quizMax,
                  }),
                )}
              </p>
              <div class="game-choice-meta">
                <span class="pill-tag">${escapeHtml(t('quizTag', { count: quizCount }))}</span>
                <span class="play-cta-pill">${escapeHtml(t('playNow'))} →</span>
              </div>
            </div>
          </button>

          <button type="button" class="game-choice-card" data-game="memory">
            <div class="game-choice-icon">${UI_SVGS.memory}</div>
            <div class="game-choice-content">
              <h2 class="game-choice-title">${escapeHtml(t('memoryTitle'))}</h2>
              <p class="game-choice-desc">
                ${escapeHtml(
                  t('memoryDesc', {
                    pairs: memoryPairs,
                    seconds: memorySeconds,
                    needed: memoryEval.needed,
                    maxScore: memoryMax,
                  }),
                )}
              </p>
              <div class="game-choice-meta">
                <span class="pill-tag">
                  ${escapeHtml(t('memoryTag', { seconds: memorySeconds, pairs: memoryPairs }))}
                </span>
                <span class="play-cta-pill">${escapeHtml(t('playNow'))} →</span>
              </div>
            </div>
          </button>
        </div>
      </div>
    `

    container.querySelector('#back-home-btn').addEventListener('click', () => {
      navigate('/')
    })

    container.querySelectorAll('.game-choice-card').forEach((card) => {
      card.addEventListener('click', () => {
        const gameId = card.dataset.game
        saveRecord({
          sessionId: session.sessionId,
          deviceId: getDeviceId(),
          funMode: Boolean(session.funMode),
          eventType: 'game_picked',
          gameId,
        })
        navigate(`/play/${gameId}`)
      })
    })
  }

  render()

  return {
    onLangChange: render,
  }
}
