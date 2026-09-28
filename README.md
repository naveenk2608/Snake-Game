# Snake

A neon arcade take on Snake, built with React and Vite. Eat the glowing orbs to grow, and avoid the walls and your own tail. The snake glides smoothly between cells and speeds up as your score climbs. Your best score is saved in the browser. A self-playing demo runs behind the start screen.

## Run it

```sh
npm install
npm run dev
```

Then open the local address Vite prints, usually http://localhost:5173.

## Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Steer | Arrow keys or WASD | Swipe on the board or use the on-screen arrows |
| Start | Any arrow key, Enter, or Space | Tap **Play** or an arrow |
| Pause / resume | Space or P | **Pause** button |
| Restart | Enter after a game ends | **Restart** button |

The game pauses automatically when you switch tabs.

## Project layout

- `src/game/snake.js` holds the game rules as pure functions: movement, turning, eating, collisions, speed and the demo autopilot.
- `src/game/renderer.js` draws the board on a canvas: the gliding snake, glow, particles, screen shake and flashes.
- `src/App.jsx` runs the animation loop and handles input, scoring and the start, pause and game-over screens.
- `src/index.css` and `src/App.css` hold the neon theme and layout.

The game respects the system "reduce motion" setting by turning off screen shake, the pulsing effects and the animated border.

## Other scripts

- `npm run build` creates a production build in `dist/`.
- `npm run preview` serves that build locally.
- `npm run lint` runs Oxlint.
