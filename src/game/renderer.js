// Canvas renderer for the neon look: smooth in-between movement, glow,
// particles, floating score text, screen shake and flashes.
// All positions are kept in grid-cell units so effects survive resizes.

import { DIRECTIONS, GRID_SIZE } from './snake.js'

const BG_INNER = '#0e1130'
const BG_OUTER = '#05060d'
const GRID_LINE = 'rgba(129, 140, 248, 0.07)'
const GRID_DOT = 'rgba(165, 180, 252, 0.2)'
const HEAD = '#7df9ff'
const EYE = '#05060d'
const FOOD = '#ff4fd8'
const FOOD_CORE = '#ffe3f8'
const TONGUE = '#ff4f7a'
const CRASH = '#ff3b5c'
const GOLD = '#ffd54a'
const HEAD_HUE = 184
const TAIL_HUE = 284
const MAX_PARTICLES = 400

const lerp = (a, b, t) => a + (b - a) * t
const lerpPoint = (a, b, t) => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) })
const clamp01 = (value) => Math.min(1, Math.max(0, value))
const centerOf = (p) => ({ x: p.x + 0.5, y: p.y + 0.5 })
const pointKey = (p) => (p ? `${p.x},${p.y}` : '')

function easeOutBack(t) {
  const c = 1.70158
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2
}

function bodyColor(fraction, alpha = 1) {
  const hue = lerp(HEAD_HUE, TAIL_HUE, fraction)
  const light = lerp(66, 60, fraction)
  return `hsla(${hue}, 100%, ${light}%, ${alpha})`
}

// Cell-center points tracing the snake part-way (t = 0..1) through a move from
// `prev` to `curr`. The head slides forward and the tail slides in, while every
// bend stays on the grid, so the body glides instead of jumping cell to cell.
export function snakePath(prev, curr, t) {
  if (!prev || prev === curr) return curr.map(centerOf)
  const grew = curr.length > prev.length
  const points = [
    lerpPoint(prev[0], curr[0], t),
    ...prev.slice(0, grew ? prev.length : -1),
  ]
  if (!grew) points.push(lerpPoint(prev.at(-1), prev.at(-2), t))
  return points.map(centerOf)
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d')
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

  let size = 0
  let cell = 1
  let background = null
  let lastNow = 0
  let particles = []
  let floaters = []
  let pendingEats = []
  let shake = { until: 0, duration: 1, strength: 0 }
  let flash = { until: 0, duration: 1, rgb: '' }
  let headFlashUntil = 0
  let foodKey = ''
  let foodBornAt = 0

  function resize(pixels) {
    // A multiple of the grid size keeps every cell on whole pixels.
    const next = Math.max(GRID_SIZE, Math.round(pixels / GRID_SIZE) * GRID_SIZE)
    if (next === size) return
    size = next
    cell = size / GRID_SIZE
    canvas.width = size
    canvas.height = size
    background = paintBackground()
  }

  // The static floor is painted once per resize and copied in every frame.
  function paintBackground() {
    const layer = document.createElement('canvas')
    layer.width = size
    layer.height = size
    const g = layer.getContext('2d')
    const half = size / 2

    const glow = g.createRadialGradient(half, half, 0, half, half, size * 0.72)
    glow.addColorStop(0, BG_INNER)
    glow.addColorStop(1, BG_OUTER)
    g.fillStyle = glow
    g.fillRect(0, 0, size, size)

    g.strokeStyle = GRID_LINE
    g.lineWidth = Math.max(1, Math.round(cell * 0.03))
    g.beginPath()
    for (let i = 1; i < GRID_SIZE; i++) {
      const p = i * cell
      g.moveTo(p, 0)
      g.lineTo(p, size)
      g.moveTo(0, p)
      g.lineTo(size, p)
    }
    g.stroke()

    g.fillStyle = GRID_DOT
    const dot = Math.max(0.75, cell * 0.035)
    for (let y = 1; y < GRID_SIZE; y++) {
      for (let x = 1; x < GRID_SIZE; x++) {
        g.beginPath()
        g.arc(x * cell, y * cell, dot, 0, Math.PI * 2)
        g.fill()
      }
    }
    return layer
  }

  function burst(point, color, count, speed, life) {
    const amount = reducedMotion.matches ? Math.ceil(count / 3) : count
    for (let i = 0; i < amount && particles.length < MAX_PARTICLES; i++) {
      const angle = Math.random() * Math.PI * 2
      const velocity = speed * (0.3 + Math.random() * 0.7)
      particles.push({
        x: point.x + 0.5,
        y: point.y + 0.5,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity,
        life,
        maxLife: life,
        radius: 0.05 + Math.random() * 0.09,
        color,
      })
    }
  }

  // The game eats one tick before the head visibly reaches the food, so the
  // burst is scheduled for `at`, when the head actually arrives.
  function eat(eaten, nextFood, at) {
    pendingEats.push({ point: eaten, at })
    foodKey = pointKey(nextFood)
    foodBornAt = at
  }

  function crash(point, { quiet = false } = {}) {
    const now = performance.now()
    burst(point, CRASH, 30, 7, 900)
    burst(point, '#ffffff', 8, 4, 500)
    if (quiet) return
    if (!reducedMotion.matches) {
      shake = { until: now + 380, duration: 380, strength: cell * 0.35 }
    }
    flash = { until: now + 320, duration: 320, rgb: '255, 59, 92' }
  }

  function celebrate(snake) {
    const now = performance.now()
    const stride = Math.max(1, Math.floor(snake.length / 12))
    for (let i = 0; i < snake.length; i += stride) burst(snake[i], GOLD, 10, 6, 1200)
    flash = { until: now + 500, duration: 500, rgb: '255, 213, 74' }
  }

  function reset() {
    particles = []
    floaters = []
    pendingEats = []
    shake = { until: 0, duration: 1, strength: 0 }
    flash = { until: 0, duration: 1, rgb: '' }
    headFlashUntil = 0
    foodKey = ''
  }

  function updateEffects(now, dt) {
    if (pendingEats.some((e) => e.at <= now)) {
      for (const { point, at } of pendingEats) {
        if (at > now) continue
        burst(point, FOOD, 22, 6, 700)
        floaters.push({ x: point.x + 0.5, y: point.y + 0.5, born: now, life: 800 })
        headFlashUntil = now + 160
      }
      pendingEats = pendingEats.filter((e) => e.at > now)
    }

    const seconds = dt / 1000
    const drag = Math.pow(0.04, seconds)
    particles = particles.filter((p) => {
      p.life -= dt
      p.x += p.vx * seconds
      p.y += p.vy * seconds
      p.vx *= drag
      p.vy *= drag
      return p.life > 0
    })
    floaters = floaters.filter((f) => now - f.born < f.life)
  }

  function drawOrb(point, scale, now) {
    const cx = (point.x + 0.5) * cell
    const cy = (point.y + 0.5) * cell
    const still = reducedMotion.matches
    const pulse = still ? 1 : 1 + Math.sin(now / 170) * 0.09
    const radius = Math.max(0, cell * 0.3 * scale * pulse)

    if (!still) {
      const phase = (now % 1500) / 1500
      ctx.strokeStyle = `rgba(255, 79, 216, ${0.55 * (1 - phase) * Math.min(scale, 1)})`
      ctx.lineWidth = cell * 0.05
      ctx.beginPath()
      ctx.arc(cx, cy, radius + phase * cell * 0.6, 0, Math.PI * 2)
      ctx.stroke()
    }

    ctx.save()
    ctx.shadowColor = FOOD
    ctx.shadowBlur = cell * 0.9
    ctx.fillStyle = FOOD
    ctx.beginPath()
    ctx.arc(cx, cy, radius, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()

    ctx.fillStyle = FOOD_CORE
    ctx.beginPath()
    ctx.arc(cx - radius * 0.25, cy - radius * 0.25, radius * 0.4, 0, Math.PI * 2)
    ctx.fill()
  }

  function drawFood(food, now) {
    if (!food) return
    const key = pointKey(food)
    if (key !== foodKey) {
      foodKey = key
      foodBornAt = now
    }
    const grow = clamp01((now - foodBornAt) / 320)
    if (grow > 0) drawOrb(food, easeOutBack(grow), now)
  }

  function drawHead(head, direction, crashed, now) {
    const { x: dx, y: dy } = DIRECTIONS[direction]
    const flashing = now < headFlashUntil
    const radius = cell * (flashing ? 0.47 : 0.42)

    // A quick tongue flick every couple of seconds.
    if (!crashed && !reducedMotion.matches && now % 2400 < 200) {
      const baseX = head.x + dx * radius
      const baseY = head.y + dy * radius
      const tipX = baseX + dx * cell * 0.3
      const tipY = baseY + dy * cell * 0.3
      ctx.strokeStyle = TONGUE
      ctx.lineWidth = cell * 0.06
      ctx.beginPath()
      ctx.moveTo(baseX, baseY)
      ctx.lineTo(tipX, tipY)
      for (const side of [-1, 1]) {
        ctx.moveTo(tipX, tipY)
        ctx.lineTo(
          tipX + dx * cell * 0.1 - dy * side * cell * 0.08,
          tipY + dy * cell * 0.1 + dx * side * cell * 0.08,
        )
      }
      ctx.stroke()
    }

    ctx.save()
    ctx.shadowColor = crashed ? CRASH : 'rgba(92, 242, 255, 0.9)'
    ctx.shadowBlur = cell * (flashing ? 1.5 : 0.8)
    ctx.fillStyle = crashed ? CRASH : flashing ? '#ffffff' : HEAD
    ctx.beginPath()
    ctx.arc(head.x, head.y, radius, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()

    // Eyes look where the snake is going; a crashed snake gets X eyes.
    for (const side of [-1, 1]) {
      const ex = head.x + dx * cell * 0.14 - dy * side * cell * 0.18
      const ey = head.y + dy * cell * 0.14 + dx * side * cell * 0.18
      if (crashed) {
        const s = cell * 0.08
        ctx.strokeStyle = EYE
        ctx.lineWidth = cell * 0.05
        ctx.beginPath()
        ctx.moveTo(ex - s, ey - s)
        ctx.lineTo(ex + s, ey + s)
        ctx.moveTo(ex + s, ey - s)
        ctx.lineTo(ex - s, ey + s)
        ctx.stroke()
      } else {
        ctx.fillStyle = EYE
        ctx.beginPath()
        ctx.arc(ex, ey, cell * 0.09, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#ffffff'
        ctx.beginPath()
        ctx.arc(ex - cell * 0.025, ey - cell * 0.025, cell * 0.03, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }

  function drawSnake(game, prevSnake, t, now) {
    const points = snakePath(prevSnake, game.snake, t).map((p) => ({
      x: p.x * cell,
      y: p.y * cell,
    }))
    const crashed = game.over && !game.won
    const last = points.length - 1
    const trace = () => {
      ctx.beginPath()
      ctx.moveTo(points[0].x, points[0].y)
      for (let i = 1; i <= last; i++) ctx.lineTo(points[i].x, points[i].y)
    }
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    // Soft neon glow beneath the whole body.
    ctx.save()
    ctx.shadowColor = crashed ? 'rgba(255, 59, 92, 0.5)' : 'rgba(92, 242, 255, 0.75)'
    ctx.shadowBlur = cell * 0.9
    ctx.strokeStyle = crashed ? 'rgba(90, 60, 80, 0.6)' : bodyColor(0.35, 0.6)
    ctx.lineWidth = cell * 0.62
    trace()
    ctx.stroke()
    ctx.restore()

    // Body: cyan at the head fading to violet at the tail, tapering as it goes.
    // Drawn tail-first so segments nearer the head sit on top.
    for (let i = last - 1; i >= 0; i--) {
      const f = last > 1 ? i / (last - 1) : 0
      ctx.strokeStyle = crashed
        ? `hsl(${lerp(330, 300, f)}, 18%, ${lerp(48, 34, f)}%)`
        : bodyColor(f)
      ctx.lineWidth = cell * lerp(0.72, 0.44, f)
      ctx.beginPath()
      ctx.moveTo(points[i].x, points[i].y)
      ctx.lineTo(points[i + 1].x, points[i + 1].y)
      ctx.stroke()
    }

    // Glossy highlight along the spine, nudged up-left for a tube-like shine.
    ctx.save()
    ctx.translate(-cell * 0.06, -cell * 0.08)
    ctx.strokeStyle = crashed ? 'rgba(255, 255, 255, 0.06)' : 'rgba(255, 255, 255, 0.24)'
    ctx.lineWidth = cell * 0.14
    trace()
    ctx.stroke()
    ctx.restore()

    drawHead(points[0], game.direction, crashed, now)
  }

  function drawParticles() {
    if (particles.length === 0) return
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    for (const p of particles) {
      const k = p.life / p.maxLife
      ctx.globalAlpha = k
      ctx.fillStyle = p.color
      ctx.beginPath()
      ctx.arc(p.x * cell, p.y * cell, Math.max(0.5, p.radius * cell * (0.4 + 0.6 * k)), 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }

  function drawFloaters(now) {
    if (floaters.length === 0) return
    ctx.save()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = `700 ${Math.round(cell * 0.62)}px Oxanium, system-ui, sans-serif`
    ctx.shadowColor = FOOD
    ctx.shadowBlur = cell * 0.5
    ctx.fillStyle = '#ffffff'
    for (const f of floaters) {
      const k = (now - f.born) / f.life
      ctx.globalAlpha = 1 - k
      ctx.fillText('+1', f.x * cell, (f.y - 0.4 - k * 1.1) * cell)
    }
    ctx.restore()
  }

  // Paint one frame. `t` is how far (0..1) the snake is through its current move.
  function draw(game, prevSnake, t, now) {
    const dt = lastNow ? Math.min(now - lastNow, 100) : 16
    lastNow = now
    if (!background) return
    updateEffects(now, dt)

    ctx.save()
    ctx.fillStyle = BG_OUTER
    ctx.fillRect(0, 0, size, size)
    if (now < shake.until) {
      const k = (shake.until - now) / shake.duration
      ctx.translate(
        (Math.random() * 2 - 1) * shake.strength * k,
        (Math.random() * 2 - 1) * shake.strength * k,
      )
    }
    ctx.drawImage(background, 0, 0)
    drawFood(game.food, now)
    // Food that has been eaten stays on screen until the head reaches it.
    for (const pending of pendingEats) drawOrb(pending.point, 1, now)
    drawSnake(game, prevSnake, t, now)
    drawParticles()
    drawFloaters(now)
    ctx.restore()

    if (now < flash.until) {
      const k = (flash.until - now) / flash.duration
      ctx.fillStyle = `rgba(${flash.rgb}, ${0.3 * k})`
      ctx.fillRect(0, 0, size, size)
    }
  }

  return { resize, draw, eat, crash, celebrate, reset }
}
