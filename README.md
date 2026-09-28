# Snake

A classic Snake game built with React and Vite. Eat the red dots to grow, and avoid the walls and your own tail. The snake speeds up as your score climbs, and your best score is saved in the browser.

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

- `src/game/snake.js` holds the game rules as pure functions: movement, turning, eating, collisions and speed.
- `src/App.jsx` draws the board on a canvas and handles input, scoring and the start, pause and game-over screens.
- `src/index.css` defines the light and dark color themes, including the board colors.

## Other scripts

- `npm run build` creates a production build in `dist/`.
- `npm run preview` serves that build locally.
- `npm run lint` runs Oxlint.
