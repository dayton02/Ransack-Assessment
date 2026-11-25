/**
 * Lightweight zero-dependency Canvas confetti burst for wins & early clears.
 */
export function launchConfetti(durationMs = 2200) {
  if (typeof window === 'undefined') return
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

  const canvas = document.createElement('canvas')
  canvas.className = 'confetti-canvas'
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const width = window.innerWidth
  const height = window.innerHeight
  canvas.width = width * dpr
  canvas.height = height * dpr
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`
  document.body.appendChild(canvas)

  const ctx = canvas.getContext('2d')
  ctx.scale(dpr, dpr)

  const colors = ['#6db33f', '#2e6a6f', '#f59e0b', '#ef4444', '#38bdf8', '#a855f7']
  const particles = Array.from({ length: 75 }, () => ({
    x: width * (0.15 + Math.random() * 0.7),
    y: -15 - Math.random() * 80,
    vx: (Math.random() - 0.5) * 5.2,
    vy: 2.2 + Math.random() * 4.2,
    size: 6 + Math.random() * 6,
    rotation: Math.random() * Math.PI * 2,
    vRot: (Math.random() - 0.5) * 0.22,
    color: colors[Math.floor(Math.random() * colors.length)],
    shape: Math.random() > 0.4 ? 'rect' : 'circle',
  }))

  const startTime = performance.now()

  function frame(now) {
    const elapsed = now - startTime
    const progress = Math.min(1, elapsed / durationMs)
    ctx.clearRect(0, 0, width, height)

    const alpha = progress > 0.7 ? 1 - (progress - 0.7) / 0.3 : 1
    ctx.globalAlpha = Math.max(0, alpha)

    for (const p of particles) {
      p.x += p.vx
      p.y += p.vy
      p.vy += 0.08
      p.rotation += p.vRot

      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate(p.rotation)
      ctx.fillStyle = p.color
      if (p.shape === 'rect') {
        ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.65)
      } else {
        ctx.beginPath()
        ctx.arc(0, 0, p.size * 0.42, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.restore()
    }

    if (elapsed < durationMs) {
      requestAnimationFrame(frame)
    } else {
      canvas.remove()
    }
  }

  requestAnimationFrame(frame)
}
