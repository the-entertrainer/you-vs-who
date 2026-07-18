# You vs Who?

**1990s Game Boy Advance pixel fighter meets toxic office culture.**

A mobile-first web game where 12 office stereotypes beat the corporate
absurdity out of each other, rendered in strict low-res GBA pixel style.
Desktop visitors get a handheld-style QR code instead of the game — this
is a phone-in-your-hand experience.

## Play

```bash
npm install
npm run dev
```

Open the printed URL on your phone (or with your browser's device
emulation set to a mobile viewport / touch). On a real desktop browser
you'll see a QR code pointing back at the same URL.

## Features

- 12 playable office stereotypes (The Boss, Coffee Zombie, Spreadsheet
  Wizard, HR Enforcer, IT Support, and more), each with a unique palette,
  bio, and win quote
- 5 arenas: Cubicle Farm, Conference Room, Break Room, Open Office
  Jungle, Executive Suite
- Simple move set — **Punch**, **Grab**, **Special**, **Block** — with a
  lightweight AI opponent, hitstun, blocking, and a 60-second clock
- Pure `<canvas>` rendering at a 240×160 logical resolution scaled up
  with nearest-neighbor scaling, chunky rectangle sprites, and a scanline
  overlay — no sprite sheets, no game engine dependency
- Web Audio API square-wave SFX and `navigator.vibrate` haptics on
  every hit, block, and special
- Desktop shows a handheld-bezel QR screen instead of the game

## Tech stack

- Vue 3 + TypeScript + Vite
- Hand-rolled `<canvas>` renderer (`src/sprite.ts`) and fight simulation
  (`src/engine.ts`) — no game engine
- `qrcode` for the desktop QR screen

## Project layout

- `src/App.vue` — screen state machine (title → char-select →
  arena-select → fight → results), input handling, HUD, and the
  requestAnimationFrame game loop
- `src/engine.ts` — fight simulation: fighter state, move resolution,
  hit/block/KO logic, and the AI opponent
- `src/sprite.ts` — canvas pixel-rectangle sprite renderer and health bars
- `src/data.ts` — character roster, arenas, and hit-flavor text
- `src/audio.ts` / `src/haptics.ts` — Web Audio SFX and vibration feedback

## Controls

D-pad (left/right) to move, plus four action buttons: **Punch**,
**Grab** (breaks block), **Special** (higher damage, has a cooldown),
and **Block** (hold to reduce incoming damage).
