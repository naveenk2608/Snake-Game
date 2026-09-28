// Pure Snake rules. Every function returns a new game object and never mutates
// its input, so the UI can keep the current game in a ref and swap it per tick.

export const GRID_SIZE = 20

export const DIRECTIONS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
}

const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' }

// Buffering two turns lets quick key presses (e.g. up then left) both land
// even if they happen within a single tick.
const MAX_QUEUED_TURNS = 2

const samePoint = (a, b) => a.x === b.x && a.y === b.y

export function placeFood(snake, random = Math.random) {
  const free = []
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      if (!snake.some((part) => part.x === x && part.y === y)) free.push({ x, y })
    }
  }
  return free.length ? free[Math.floor(random() * free.length)] : null
}

export function createGame(random = Math.random) {
  const mid = Math.floor(GRID_SIZE / 2)
  const snake = [
    { x: mid, y: mid },
    { x: mid - 1, y: mid },
    { x: mid - 2, y: mid },
  ]
  return {
    snake,
    direction: 'right',
    turns: [],
    food: placeFood(snake, random),
    score: 0,
    over: false,
    won: false,
  }
}

export function queueTurn(game, direction) {
  if (game.over || game.turns.length >= MAX_QUEUED_TURNS) return game
  const current = game.turns.at(-1) ?? game.direction
  if (direction === current || direction === OPPOSITE[current]) return game
  return { ...game, turns: [...game.turns, direction] }
}

export function step(game, random = Math.random) {
  if (game.over) return game

  const [nextTurn, ...turns] = game.turns
  const direction = nextTurn ?? game.direction
  const { x: dx, y: dy } = DIRECTIONS[direction]
  const head = { x: game.snake[0].x + dx, y: game.snake[0].y + dy }
  const eats = game.food !== null && samePoint(head, game.food)

  // The tail moves out of the way this tick unless the snake is growing,
  // so the head may safely move into the cell the tail is leaving.
  const body = eats ? game.snake : game.snake.slice(0, -1)
  const hitsWall =
    head.x < 0 || head.y < 0 || head.x >= GRID_SIZE || head.y >= GRID_SIZE
  if (hitsWall || body.some((part) => samePoint(part, head))) {
    return { ...game, direction, turns, over: true }
  }

  const snake = [head, ...body]
  if (!eats) return { ...game, snake, direction, turns }

  const food = placeFood(snake, random)
  const filledBoard = food === null
  return {
    ...game,
    snake,
    direction,
    turns,
    food,
    score: game.score + 1,
    over: filledBoard,
    won: filledBoard,
  }
}

// Milliseconds per move: starts relaxed and speeds up as the snake grows.
export function tickDuration(score) {
  return Math.max(60, 150 - score * 4)
}
