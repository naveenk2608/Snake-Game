import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createGame,
  DIRECTIONS,
  GRID_SIZE,
  queueTurn,
  step,
  tickDuration,
} from './game/snake.js'
import './App.css'

const BEST_SCORE_KEY = 'snake-best-score'
const SWIPE_THRESHOLD_PX = 24

const KEY_DIRECTIONS = {
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
}

function loadBestScore() {
  try {
    return Number(localStorage.getItem(BEST_SCORE_KEY)) || 0
  } catch {
    return 0
  }
}

function saveBestScore(value) {
  try {
    localStorage.setItem(BEST_SCORE_KEY, String(value))
  } catch {
    // Storage can be unavailable (private mode, blocked site data); the game still works.
  }
}

// Board colors live in CSS custom properties so light and dark themes are
// defined in one place.
function readColors(element) {
  const style = getComputedStyle(element)
  const get = (name) => style.getPropertyValue(name).trim()
  return {
    board: get('--board'),
    boardAlt: get('--board-alt'),
    snake: get('--snake'),
    head: get('--snake-head'),
    food: get('--food'),
    crash: get('--crash'),
  }
}

function drawGame(canvas, game, colors) {
  const ctx = canvas.getContext('2d')
  const cell = canvas.width / GRID_SIZE

  ctx.fillStyle = colors.board
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = colors.boardAlt
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      if ((x + y) % 2) ctx.fillRect(x * cell, y * cell, cell, cell)
    }
  }

  if (game.food) {
    ctx.fillStyle = colors.food
    ctx.beginPath()
    ctx.arc(
      (game.food.x + 0.5) * cell,
      (game.food.y + 0.5) * cell,
      cell * 0.34,
      0,
      Math.PI * 2,
    )
    ctx.fill()
  }

  const inset = cell * 0.08
  const crashed = game.over && !game.won
  // Draw tail first so the head always sits on top.
  for (let i = game.snake.length - 1; i >= 0; i--) {
    const part = game.snake[i]
    const isHead = i === 0
    ctx.fillStyle = isHead ? (crashed ? colors.crash : colors.head) : colors.snake
    ctx.beginPath()
    ctx.roundRect(
      part.x * cell + inset,
      part.y * cell + inset,
      cell - inset * 2,
      cell - inset * 2,
      cell * (isHead ? 0.38 : 0.26),
    )
    ctx.fill()
  }

  // Eyes point in the direction of travel.
  const head = game.snake[0]
  const { x: dx, y: dy } = DIRECTIONS[game.direction]
  const cx = (head.x + 0.5) * cell
  const cy = (head.y + 0.5) * cell
  ctx.fillStyle = colors.board
  for (const side of [-1, 1]) {
    ctx.beginPath()
    ctx.arc(
      cx + dx * cell * 0.16 - dy * side * cell * 0.17,
      cy + dy * cell * 0.16 + dx * side * cell * 0.17,
      cell * 0.08,
      0,
      Math.PI * 2,
    )
    ctx.fill()
  }
}

function Arrow({ rotate }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      aria-hidden="true"
      style={{ transform: `rotate(${rotate}deg)` }}
    >
      <path
        d="M6 15l6-6 6 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default function App() {
  const canvasRef = useRef(null)
  const colorsRef = useRef(null)
  const touchStartRef = useRef(null)
  const gameRef = useRef(null)
  if (gameRef.current === null) gameRef.current = createGame()

  // ready | playing | paused | over
  const [status, setStatus] = useState('ready')
  const [score, setScore] = useState(0)
  const [best, setBest] = useState(loadBestScore)
  const [newRecord, setNewRecord] = useState(false)
  const [won, setWon] = useState(false)
  const bestRef = useRef(best)

  useEffect(() => {
    bestRef.current = best
    saveBestScore(best)
  }, [best])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    colorsRef.current ??= readColors(canvas)
    drawGame(canvas, gameRef.current, colorsRef.current)
  }, [])

  // Keep the canvas pixel-sharp at any size, and repaint when the OS theme flips.
  useEffect(() => {
    const canvas = canvasRef.current
    const resize = () => {
      const pixels = canvas.clientWidth * window.devicePixelRatio
      // A multiple of the grid size keeps every cell on whole pixels.
      const size = Math.max(GRID_SIZE, Math.round(pixels / GRID_SIZE) * GRID_SIZE)
      if (canvas.width !== size) {
        canvas.width = size
        canvas.height = size
      }
      draw()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)

    const scheme = window.matchMedia('(prefers-color-scheme: dark)')
    const onSchemeChange = () => {
      colorsRef.current = null
      draw()
    }
    scheme.addEventListener('change', onSchemeChange)

    return () => {
      observer.disconnect()
      scheme.removeEventListener('change', onSchemeChange)
    }
  }, [draw])

  // Game loop: runs only while playing.
  useEffect(() => {
    if (status !== 'playing') return

    let frame
    let last = performance.now()
    let elapsed = 0

    const loop = (now) => {
      elapsed += now - last
      last = now

      const tick = tickDuration(gameRef.current.score)
      if (elapsed >= tick) {
        // Carry the remainder, but never bank more than one extra tick.
        elapsed = Math.min(elapsed - tick, tick)
        const game = step(gameRef.current)
        gameRef.current = game
        draw()
        setScore(game.score)

        if (game.over) {
          const record = game.score > bestRef.current
          setNewRecord(record)
          setWon(game.won)
          if (record) setBest(game.score)
          setStatus('over')
          return
        }
      }
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)

    // Pause automatically when the tab is hidden.
    const onVisibility = () => {
      if (document.hidden) setStatus('paused')
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [status, draw])

  const newGame = useCallback(
    (direction) => {
      let game = createGame()
      if (direction) game = queueTurn(game, direction)
      gameRef.current = game
      setScore(0)
      setNewRecord(false)
      setWon(false)
      setStatus('playing')
      draw()
    },
    [draw],
  )

  const turn = useCallback(
    (direction) => {
      if (status === 'ready') newGame(direction)
      else if (status === 'playing') {
        gameRef.current = queueTurn(gameRef.current, direction)
      }
    },
    [status, newGame],
  )

  const togglePause = useCallback(() => {
    if (status === 'playing') setStatus('paused')
    else if (status === 'paused') setStatus('playing')
    else newGame()
  }, [status, newGame])

  useEffect(() => {
    const onKeyDown = (event) => {
      const direction = KEY_DIRECTIONS[event.code]
      if (direction) {
        event.preventDefault()
        turn(direction)
        return
      }
      if (event.repeat) return
      // Let a focused button handle its own Space/Enter press.
      if (event.target instanceof Element && event.target.closest('button')) return

      if (event.code === 'Space' || event.code === 'KeyP') {
        event.preventDefault()
        togglePause()
      } else if (event.code === 'Enter' && status !== 'playing') {
        event.preventDefault()
        if (status === 'paused') setStatus('playing')
        else newGame()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [turn, togglePause, newGame, status])

  const onTouchStart = (event) => {
    const touch = event.touches[0]
    touchStartRef.current = { x: touch.clientX, y: touch.clientY }
  }

  const onTouchEnd = (event) => {
    const start = touchStartRef.current
    touchStartRef.current = null
    if (!start) return
    const touch = event.changedTouches[0]
    const dx = touch.clientX - start.x
    const dy = touch.clientY - start.y
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_THRESHOLD_PX) return
    if (Math.abs(dx) > Math.abs(dy)) turn(dx > 0 ? 'right' : 'left')
    else turn(dy > 0 ? 'down' : 'up')
  }

  return (
    <main className="app">
      <header className="top">
        <h1>Snake</h1>
        <div className="scores">
          <div className="stat">
            <span className="stat-label">Score</span>
            <span className="stat-value">{score}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Best</span>
            <span className="stat-value">{best}</span>
          </div>
        </div>
      </header>

      <div className="board" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <canvas ref={canvasRef} role="img" aria-label={`Snake board, score ${score}`} />

        {status !== 'playing' && (
          <div className="overlay" aria-live="polite">
            {status === 'ready' && (
              <>
                <h2>Eat. Grow. Don&apos;t crash.</h2>
                <p>Steer the snake to the red dots. Walls and your own tail end the run.</p>
                <button type="button" className="primary" onClick={() => newGame()}>
                  Play
                </button>
              </>
            )}
            {status === 'paused' && (
              <>
                <h2>Paused</h2>
                <button type="button" className="primary" onClick={() => setStatus('playing')}>
                  Resume
                </button>
              </>
            )}
            {status === 'over' && (
              <>
                <h2>{won ? 'You filled the board!' : 'Game over'}</h2>
                <p>
                  You scored <strong>{score}</strong>.
                  {newRecord && <span className="record"> New best!</span>}
                </p>
                <button type="button" className="primary" onClick={() => newGame()}>
                  Play again
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <div className="controls">
        <button
          type="button"
          className="secondary"
          onClick={togglePause}
          disabled={status === 'ready' || status === 'over'}
        >
          {status === 'paused' ? 'Resume' : 'Pause'}
        </button>
        <button type="button" className="secondary" onClick={() => newGame()}>
          Restart
        </button>
      </div>

      <div className="dpad" aria-label="Direction controls">
        <button type="button" className="up" aria-label="Up" onClick={() => turn('up')}>
          <Arrow rotate={0} />
        </button>
        <button type="button" className="left" aria-label="Left" onClick={() => turn('left')}>
          <Arrow rotate={-90} />
        </button>
        <button type="button" className="down" aria-label="Down" onClick={() => turn('down')}>
          <Arrow rotate={180} />
        </button>
        <button type="button" className="right" aria-label="Right" onClick={() => turn('right')}>
          <Arrow rotate={90} />
        </button>
      </div>

      <p className="hint">
        <kbd>Arrow keys</kbd> or <kbd>WASD</kbd> to steer, <kbd>Space</kbd> to pause
      </p>
    </main>
  )
}
