import { useCallback, useEffect, useRef, useState } from 'react'
import { autopilot, createGame, queueTurn, step, tickDuration } from './game/snake.js'
import { createRenderer } from './game/renderer.js'
import './App.css'

const BEST_SCORE_KEY = 'snake-best-score'
const SWIPE_THRESHOLD_PX = 24
// How long the start-screen demo lingers on its crash before starting over.
const DEMO_RESTART_MS = 1200

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

// Everything the animation loop changes each frame lives in one plain object,
// outside React state, so the board can animate at 60fps without re-rendering.
function createSimulation({ demo, direction } = {}) {
  let game = createGame()
  if (direction) game = queueTurn(game, direction)
  return { game, prevSnake: game.snake, elapsed: 0, demo: Boolean(demo), demoRestartAt: 0 }
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
  const rendererRef = useRef(null)
  const touchStartRef = useRef(null)
  const simRef = useRef(null)
  if (simRef.current === null) simRef.current = createSimulation({ demo: true })

  // ready | playing | paused | over
  const [status, setStatus] = useState('ready')
  const statusRef = useRef('ready')
  const [score, setScore] = useState(0)
  const [best, setBest] = useState(loadBestScore)
  const [newRecord, setNewRecord] = useState(false)
  const [won, setWon] = useState(false)
  const bestRef = useRef(best)

  // The loop reads status from a ref so it never has to restart.
  const changeStatus = useCallback((next) => {
    statusRef.current = next
    setStatus(next)
  }, [])

  useEffect(() => {
    bestRef.current = best
    saveBestScore(best)
  }, [best])

  // One animation loop for the lifetime of the page: it advances the game on
  // each tick and repaints every frame so effects keep moving between ticks.
  useEffect(() => {
    const canvas = canvasRef.current
    const renderer = createRenderer(canvas)
    rendererRef.current = renderer

    const observer = new ResizeObserver(() => {
      renderer.resize(canvas.clientWidth * window.devicePixelRatio)
    })
    observer.observe(canvas)

    const advance = (sim, now) => {
      const before = sim.demo ? queueTurn(sim.game, autopilot(sim.game)) : sim.game
      const next = step(before)
      sim.prevSnake = next.over ? next.snake : before.snake
      sim.game = next

      if (next.score > before.score) {
        renderer.eat(before.food, next.food, now + tickDuration(next.score))
        if (!sim.demo) setScore(next.score)
      }
      if (!next.over) return

      if (next.won) renderer.celebrate(next.snake)
      else renderer.crash(next.snake[0], { quiet: sim.demo })

      if (sim.demo) {
        sim.demoRestartAt = now + DEMO_RESTART_MS
        return
      }
      const record = next.score > bestRef.current
      setNewRecord(record)
      if (record) setBest(next.score)
      setWon(next.won)
      changeStatus('over')
    }

    let frame
    let last = performance.now()
    const loop = (now) => {
      const dt = Math.min(now - last, 100)
      last = now
      const status = statusRef.current

      if (status === 'ready' && simRef.current.game.over && now >= simRef.current.demoRestartAt) {
        simRef.current = createSimulation({ demo: true })
        renderer.reset()
      }

      const sim = simRef.current
      const running = !sim.game.over && (status === 'playing' || (status === 'ready' && sim.demo))
      if (running) {
        sim.elapsed += dt
        const tick = tickDuration(sim.game.score)
        if (sim.elapsed >= tick) {
          // Carry the remainder, but never bank more than one extra tick.
          sim.elapsed = Math.min(sim.elapsed - tick, tick)
          advance(sim, now)
        }
      }

      const progress = sim.game.over ? 1 : Math.min(1, sim.elapsed / tickDuration(sim.game.score))
      renderer.draw(sim.game, sim.prevSnake, progress, now)
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [changeStatus])

  // Pause automatically when the tab is hidden.
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden && statusRef.current === 'playing') changeStatus('paused')
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [changeStatus])

  const newGame = useCallback(
    (direction) => {
      simRef.current = createSimulation({ direction })
      rendererRef.current?.reset()
      setScore(0)
      setNewRecord(false)
      setWon(false)
      changeStatus('playing')
    },
    [changeStatus],
  )

  const turn = useCallback(
    (direction) => {
      const current = statusRef.current
      if (current === 'ready') newGame(direction)
      else if (current === 'playing') {
        const sim = simRef.current
        sim.game = queueTurn(sim.game, direction)
      }
    },
    [newGame],
  )

  const togglePause = useCallback(() => {
    const current = statusRef.current
    if (current === 'playing') changeStatus('paused')
    else if (current === 'paused') changeStatus('playing')
    else newGame()
  }, [changeStatus, newGame])

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
      } else if (event.code === 'Enter' && statusRef.current !== 'playing') {
        event.preventDefault()
        if (statusRef.current === 'paused') changeStatus('playing')
        else newGame()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [turn, togglePause, newGame, changeStatus])

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
            {/* Keyed so the pop animation replays on every change. */}
            <span className="stat-value" key={score}>
              {score}
            </span>
          </div>
          <div className="stat stat-best">
            <span className="stat-label">Best</span>
            <span className="stat-value" key={best}>
              {best}
            </span>
          </div>
        </div>
      </header>

      <div className="board-frame">
        <div className="board" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          <canvas ref={canvasRef} role="img" aria-label={`Snake board, score ${score}`} />

          {status !== 'playing' && (
            <div className={`overlay overlay-${status}`} aria-live="polite">
              {status === 'ready' && (
                <>
                  <h2>Eat. Grow. Survive.</h2>
                  <p>Chase the glowing orbs. Walls and your own tail end the run.</p>
                  <button type="button" className="primary" onClick={() => newGame()}>
                    Play
                  </button>
                  <p className="blink on-keys">Press any arrow key</p>
                </>
              )}
              {status === 'paused' && (
                <>
                  <h2>Paused</h2>
                  <button type="button" className="primary" onClick={() => changeStatus('playing')}>
                    Resume
                  </button>
                  <p className="blink on-keys">Press Space</p>
                </>
              )}
              {status === 'over' && (
                <>
                  <h2>{won ? 'You win!' : 'Game over'}</h2>
                  <div className="final">
                    <span className="final-label">Score</span>
                    <span className="final-value">{score}</span>
                  </div>
                  {newRecord && <p className="record">New best!</p>}
                  <button type="button" className="primary" onClick={() => newGame()}>
                    Play again
                  </button>
                  <p className="blink on-keys">Press Enter</p>
                </>
              )}
            </div>
          )}
        </div>
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
