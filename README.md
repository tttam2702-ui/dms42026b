# NEON//SERPENT

A cinematic 3D snake game built with Three.js and Tone.js. Both game engines load from pinned CDN versions; the application itself runs on vinext.

## Play

- Move with **WASD**, the **arrow keys**, swipe gestures, or the mobile direction pad.
- Eat pulse cores before the sync meter expires to build an 8× score chain.
- Every fifth core is a high-value prism core.
- Avoid the arena walls, your tail, and the floating data shards.
- Press **P** or **Escape** to pause.

Audio is synthesized live in the browser and starts only after the player presses **JACK IN**.

## Run locally

Node.js 22.13 or newer is required.

```bash
npm install
npm run dev
```

Create a production build with:

```bash
npm run build
```

## Technology

- Three.js 0.184.0 from jsDelivr
- Tone.js 15.5.0 from jsDelivr
- React 19 + vinext
- Keyboard, touch, and swipe controls
- Device-local high score storage
