import { config } from '../config.js'
import { t, getLocalizedQuestion } from '../i18n.js'
import { getSymbolSvg } from '../icons.js'
import {
  ensureActiveSession,
  updateSession,
  getDeviceId,
  evaluateScore,
  getActiveQuizQuestions,
  navigate,
} from '../state.js'
import { saveRecord } from '../api.js'

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

// Rotating forest quiz hosts matching the hand-crafted SVG forest theme
const QUIZ_HOSTS = [
  { id: 'owl', tint: '#e0e7ff' },
  { id: 'fox', tint: '#ffedd5' },
  { id: 'butterfly', tint: '#e0f2fe' },
  { id: 'mushroom', tint: '#ffe4e6' },
  { id: 'acorn', tint: '#fef3c7' },
  { id: 'fern', tint: '#dcfce7' },
]

function escapeHtml(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

export function mountQuizScreen(container) {
  const session = ensureActiveSession()
  const rawQuestions = getActiveQuizQuestions()
  const pointsPerCorrect = Number(config.quiz.pointsPerCorrect) || 1
  const maxScore = Math.max(1, rawQuestions.length) * pointsPerCorrect
  const { needed } = evaluateScore(0, maxScore)

  let currentIndex = 0
  let score = 0
  let selectedOptionIndex = null
  let isSubmitting = false
  // Track per-question outcome ('correct' | 'wrong' | null) for the visual trail
  const outcomes = Array(rawQuestions.length).fill(null)

  async function finishQuiz() {
    if (isSubmitting) return
    isSubmitting = true
    const summary = evaluateScore(score, maxScore)
    const resultRecord = {
      gameId: 'quiz',
      ...summary,
    }

    const res = await saveRecord({
      sessionId: session.sessionId,
      deviceId: getDeviceId(),
      funMode: Boolean(session.funMode),
      eventType: 'game_completed',
      gameId: 'quiz',
      score: summary.score,
      maxScore: summary.maxScore,
      won: summary.won,
    })

    updateSession({
      lastResult: resultRecord,
      claimCode: res?.claimCode || null,
      claimed: Boolean(res?.claimed),
      claimedAt: res?.claimedAt || null,
      deviceLocked: Boolean(res?.deviceLocked),
      previousClaimCode: res?.previousClaimCode || null,
      previousClaimedAt: res?.previousClaimedAt || null,
      ipClaimCount: Number(res?.ipClaimCount || 0),
    })

    navigate(summary.won ? '/win' : '/result')
  }

  function renderTrail(total, progressPct) {
    if (total > 10) {
      return `
        <div class="progress-track" aria-hidden="true">
          <div class="progress-fill" style="width: ${progressPct}%"></div>
        </div>
      `
    }
    return `
      <div class="quiz-trail" aria-hidden="true">
        ${outcomes
          .map((outcome, i) => {
            if (outcome === 'correct') {
              return `<span class="trail-dot is-correct">✓</span>`
            }
            if (outcome === 'wrong') {
              return `<span class="trail-dot is-wrong">✕</span>`
            }
            if (i === currentIndex) {
              return `<span class="trail-dot is-current">${i + 1}</span>`
            }
            return `<span class="trail-dot">${i + 1}</span>`
          })
          .join('')}
      </div>
    `
  }

  function render() {
    if (rawQuestions.length === 0) {
      navigate('/select')
      return
    }

    const rawQ = rawQuestions[currentIndex]
    const q = getLocalizedQuestion(rawQ)
    const total = rawQuestions.length
    const progressPct = Math.round(
      ((currentIndex + (selectedOptionIndex !== null ? 1 : 0)) / total) * 100,
    )
    const answered = selectedOptionIndex !== null
    const isCorrect = answered && selectedOptionIndex === q.answerIndex
    const isLast = currentIndex === total - 1
    const correctAnswerText = q.options[q.answerIndex] ?? ''
    const host = QUIZ_HOSTS[currentIndex % QUIZ_HOSTS.length]
    const hostMoodClass = !answered ? 'is-asking' : isCorrect ? 'is-happy' : 'is-oops'

    container.innerHTML = `
      <div class="screen-body align-top">
        <div class="nav-row">
          <button type="button" id="quiz-back-btn" class="btn-ghost">
            ← ${escapeHtml(t('backHome'))}
          </button>
          <span class="pill-tag">${escapeHtml(t('targetLabel', { needed }))}</span>
        </div>

        <div class="hud-bar">
          <div class="hud-stat" style="align-items: flex-start; flex: 1">
            <span class="hud-label">${escapeHtml(t('quizTitle'))}</span>
            <span class="hud-value" style="font-size: 0.96rem">
              ${escapeHtml(t('questionProgress', { current: currentIndex + 1, total }))}
            </span>
          </div>
          <div class="hud-stat">
            <span class="hud-label">${escapeHtml(t('scoreLabel'))}</span>
            <span class="hud-value">${score} / ${maxScore}</span>
          </div>
        </div>

        <section class="card quiz-stage-card">
          ${renderTrail(total, progressPct)}

          <div class="quiz-chat-row">
            <button
              type="button"
              id="quiz-host-avatar"
              class="quiz-host-avatar ${hostMoodClass}"
              style="--host-tint: ${host.tint}"
              aria-label="Quiz host"
            >
              ${getSymbolSvg(host.id)}
              ${answered && isCorrect ? `<span class="quiz-plus-badge">+${pointsPerCorrect}</span>` : ''}
            </button>

            <div class="quiz-chat-bubble ${answered ? (isCorrect ? 'is-correct' : 'is-wrong') : ''}">
              <h1 class="quiz-question-text">${escapeHtml(q.question)}</h1>
            </div>
          </div>

          <div class="quiz-options">
            ${q.options
              .map((opt, idx) => {
                let stateClass = ''
                let mark = ''
                if (answered) {
                  if (idx === q.answerIndex) {
                    stateClass = 'is-correct'
                    mark = '<span class="quiz-option-mark" aria-hidden="true">✓</span>'
                  } else if (idx === selectedOptionIndex) {
                    stateClass = 'is-wrong'
                    mark = '<span class="quiz-option-mark" aria-hidden="true">✕</span>'
                  }
                }
                const letter = LETTERS[idx] || String(idx + 1)
                return `
                  <button
                    type="button"
                    class="quiz-option-btn ${stateClass}"
                    data-idx="${idx}"
                    ${answered ? 'disabled' : ''}
                  >
                    <span class="quiz-option-letter">${letter}</span>
                    <span class="quiz-option-text">${escapeHtml(opt)}</span>
                    ${mark}
                  </button>
                `
              })
              .join('')}
          </div>

          ${
            answered
              ? `
            <div class="quiz-feedback-bubble ${isCorrect ? 'is-correct' : 'is-wrong'}" role="status">
              <span class="quiz-feedback-icon" aria-hidden="true">${isCorrect ? '★' : '💡'}</span>
              <span>
                ${escapeHtml(
                  isCorrect
                    ? t('correctFeedback')
                    : t('wrongFeedback', { answer: correctAnswerText }),
                )}
              </span>
            </div>
            <div class="btn-stack" style="margin-top: 10px">
              <button type="button" id="quiz-next-btn" class="btn btn-primary btn-shimmer" ${isSubmitting ? 'disabled' : ''}>
                ${escapeHtml(isLast ? t('seeResult') : t('nextQuestion'))} →
              </button>
            </div>
          `
              : ''
          }
        </section>
      </div>
    `

    container.querySelector('#quiz-back-btn').addEventListener('click', () => {
      navigate('/select')
    })

    const hostBtn = container.querySelector('#quiz-host-avatar')
    hostBtn?.addEventListener('click', () => {
      hostBtn.classList.remove('is-wiggling')
      void hostBtn.offsetWidth
      hostBtn.classList.add('is-wiggling')
    })

    if (!answered) {
      container.querySelectorAll('.quiz-option-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const idx = Number(btn.dataset.idx)
          selectedOptionIndex = idx
          const right = idx === q.answerIndex
          outcomes[currentIndex] = right ? 'correct' : 'wrong'
          if (right) {
            score += pointsPerCorrect
          }
          render()
        })
      })
    } else {
      const nextBtn = container.querySelector('#quiz-next-btn')
      nextBtn?.addEventListener('click', () => {
        if (isLast) {
          finishQuiz()
        } else {
          currentIndex += 1
          selectedOptionIndex = null
          render()
        }
      })
    }
  }

  render()

  return {
    // Re-renders the exact current question & options in the new language without losing progress
    onLangChange: render,
  }
}
