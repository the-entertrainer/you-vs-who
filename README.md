# You vs Who?

**A mobile-first comic-book combo brawler set in an office.**

You, a stick-figure office worker, fight a rival across a cubicle floor —
rendered in a bold, scribbly comic style: Bangers/Kalam lettering, hand-inked
"boiling line" outlines, halftone dot shading, jagged starburst callouts, and
screen shake on every hit. Real hand-animated sprite frames (idle, walk, run,
jump, hit, death, and a 19-frame 3-hit combo string) drive the fight, and
every control is a swipe/tap/hold gesture — no on-screen buttons. Desktop
visitors get a handheld-style QR code instead of the game — this is a
phone-in-your-hand experience.

## Play

```bash
npm install
npm run dev
```

Open the printed URL on your phone (or with your browser's device
emulation set to a mobile viewport / touch). On a real desktop browser
you'll see a QR code pointing back at the same URL.

## Controls

Everything is a gesture on the fight screen — no on-screen buttons:

- **Drag left/right** — walk; drag further to break into a run
- **Fast horizontal flick** — dash strike in that direction
- **Fast upward flick** — jump; flick again mid-air for an air strike
- **Quick tap** — throws a jab; tap again inside the follow-up window to
  chain into a cross, then a haymaker finisher (3-hit combo string)
- **Press and hold in place** — guard, reduces damage while held

## Features

- Bold comic-book presentation: Bangers/Kalam lettering, hand-inked
  "boiling line" outlines that stay alive frame-to-frame, halftone dot
  shading, jagged starburst hit callouts with rotated onomatopoeia
  (POW! THWACK! KAPOW!), and a screen shake on every hit
- Real sprite animation (not procedural rectangles) sourced from a CC0
  stick-figure fighter pack — idle, walk, run, dash, jump, hit, death,
  and a segmented 3-hit combo string, each frame cropped to a shared
  anchor so motion stays consistent
- Directional-aware combos: the same tap/flick input resolves to a
  different move (combo string / dash strike / air strike) depending on
  how you're moving when you throw it
- A hand-drawn, hand-inked office arena — cubicle partitions, windows,
  desks with monitors, a water cooler, a potted plant — rendered on
  `<canvas>`
- A lightweight AI rival using the identical moveset and animation set,
  tinted red to your blue
- Web Audio API square-wave SFX and `navigator.vibrate` haptics on every
  hit, block, and finisher
- Desktop shows a handheld-bezel QR screen instead of the game

## Tech stack

- Vue 3 + TypeScript + Vite
- Hand-rolled `<canvas>` renderer (`src/sprite.ts`, `src/arena.ts`,
  `src/comic.ts`) and fight simulation (`src/engine.ts`) — no game engine
- `qrcode` for the desktop QR screen

## Project layout

- `src/App.vue` — screen state machine (title → fight → results), the
  swipe/tap/hold gesture recognizer, HUD, and the requestAnimationFrame
  game loop
- `src/engine.ts` — fight simulation: fighter state, combo/move
  resolution, hit/block/KO logic, and the AI opponent
- `src/anim.ts` — sprite frame manifest, clip definitions, and preloading
- `src/sprite.ts` — canvas sprite renderer (frame drawing, per-side tint,
  hit flash, ground shadow)
- `src/arena.ts` — hand-drawn, hand-inked office backdrop
- `src/comic.ts` — starburst + onomatopoeia hit-effect renderer
- `src/assets/fighter/` — cropped sprite frames (CC0, see credit below)
- `src/data.ts` — hit-flavor text and win/lose quotes

## Sprite credit

Fighter sprites are from "Stick Figure Character Sprites 2D" by Raphael
Gonçalves ([@rgs_dev](https://twitter.com/rgs_dev)), CC0 licensed.
