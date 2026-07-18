# You vs Who?

**A mobile-first combo brawler set in an office.**

You, a stick-figure office worker, fight a rival across a cubicle floor.
Real hand-animated sprite frames (idle, walk, run, jump, hit, death, and a
19-frame 3-hit combo string), a hand-drawn office backdrop, and
directional-aware combos. Desktop visitors get a handheld-style QR code
instead of the game — this is a phone-in-your-hand experience.

## Play

```bash
npm install
npm run dev
```

Open the printed URL on your phone (or with your browser's device
emulation set to a mobile viewport / touch). On a real desktop browser
you'll see a QR code pointing back at the same URL.

## Controls

- **D-pad left/right** — walk; hold a direction to break into a run
- **▲** — jump
- **ATTACK** — tap to throw a jab; tap again inside the follow-up window
  to chain into a cross, then a haymaker finisher (3-hit combo string)
- **Attack while running** — dash strike
- **Attack while airborne** — air strike
- **BLOCK** — hold to guard, reduces damage and staggers the guard instead

## Features

- Real sprite animation (not procedural rectangles) sourced from a CC0
  stick-figure fighter pack — idle, walk, run, dash, jump, hit, death,
  and a segmented 3-hit combo string, each frame cropped to a shared
  anchor so motion stays consistent
- Directional-aware combos: the same ATTACK input resolves to a different
  move (combo string / dash strike / air strike) depending on how you're
  moving when you press it
- A hand-drawn office arena — cubicle partitions, windows, desks with
  monitors, a water cooler, a potted plant — rendered on `<canvas>`
- A lightweight AI rival using the identical moveset and animation set,
  tinted red to your blue
- Web Audio API square-wave SFX and `navigator.vibrate` haptics on every
  hit, block, and finisher
- Desktop shows a handheld-bezel QR screen instead of the game

## Tech stack

- Vue 3 + TypeScript + Vite
- Hand-rolled `<canvas>` renderer (`src/sprite.ts`, `src/arena.ts`) and
  fight simulation (`src/engine.ts`) — no game engine
- `qrcode` for the desktop QR screen

## Project layout

- `src/App.vue` — screen state machine (title → fight → results), input
  handling, HUD, and the requestAnimationFrame game loop
- `src/engine.ts` — fight simulation: fighter state, combo/move
  resolution, hit/block/KO logic, and the AI opponent
- `src/anim.ts` — sprite frame manifest, clip definitions, and preloading
- `src/sprite.ts` — canvas sprite renderer (frame drawing, per-side tint,
  hit flash, ground shadow)
- `src/arena.ts` — hand-drawn office backdrop
- `src/assets/fighter/` — cropped sprite frames (CC0, see credit below)
- `src/data.ts` — hit-flavor text and win/lose quotes

## Sprite credit

Fighter sprites are from "Stick Figure Character Sprites 2D" by Raphael
Gonçalves ([@rgs_dev](https://twitter.com/rgs_dev)), CC0 licensed.
