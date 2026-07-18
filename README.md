# You vs Who?

**A mobile-first comic-book endless wave brawler set in an office.**

You, a stick-figure office worker, fight off an endless stream of office
archetypes — one at a time, wave after wave, each with their own fighting
style — rendered in a bold, scribbly comic style: Bangers/Kalam lettering,
hand-inked "boiling line" outlines, halftone dot shading, jagged starburst
callouts, and screen shake on every hit. Real hand-animated sprite frames
(idle, walk, run, jump, hit, death, and a 19-frame 3-hit combo string) drive
the fight, five pixel-art office backdrops cycle wave to wave, and every
control is a swipe/tap/hold gesture — no on-screen buttons. Desktop visitors
get a handheld-style QR code instead of the game — this is a
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

Everything is a gesture on the fight screen — no on-screen buttons. Movement
is analog: a light drag is a careful step, dragging further ramps smoothly up
to a full sprint (no walk/run threshold jump to fight against).

- **Drag left/right** — walk/run, proportional to how far you drag
- **Fast horizontal flick** — dash strike in that direction
- **Fast upward flick** — jump; flick again mid-air for an air strike
- **Quick tap** — throws a jab; tap again inside the follow-up window to
  chain into a cross, then a haymaker finisher (3-hit combo string) that
  **sends the opponent flying** — a spinning, screen-crossing, Bollywood
  fight scene-style knockback with hit-stop and a "SENT FLYING!!" callout
- **Press and hold in place** — guard, reduces damage while held

## Wave survival

There's no roster to pick from — it's always the same stickman, yours, versus
whoever's next. Enemies cycle through five office archetypes, each a
recolor of the same fighter with a genuinely different fighting style (not
just a bigger health bar):

- **The Micromanager** — cautious, blocks a lot, punishes openings
- **Reply-All** — glass cannon, spams jabs relentlessly, rarely blocks
- **The Marathoner** — constantly moving, leans hard on dash strikes
- **The Influencer** — lives in the air, favors jump-ins and air strikes
- **The Hero (of their own story)** — the toughest, aggressive finishers

The roster loops forever, getting tougher (more health, more damage) every
lap. Your own health carries over between waves — there's no healing between
fights, just survival. The backdrop changes every wave too, cycling through
five hand-picked pixel-art office scenes (daytime bullpen, a rainy noir
graveyard shift, a neon cyberpunk server room, a breaking-news newsroom, and
an 80s arcade break room).

## Features

- Endless wave mode: one opponent at a time, health persists between waves,
  a wave-intro banner announces each new enemy's name, and the run only
  ends when you go down
- Five distinct AI fighting styles from one shared moveset — dash-strike
  spam, air-strike spam, jab spam, defensive blocking, aggressive
  finishing — tuned via a per-enemy profile (`src/enemies.ts`)
- Fast, punchy pacing: quick movement, snappy animation
- A signature "sent flying" finisher: landing the full 3-hit combo launches
  the opponent into a spinning aerial ragdoll with a brief slow-mo hit-stop,
  a bigger screen shake, and an absurd comic callout — the payoff move
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
- Five pixel-art office backdrops, one per wave on rotation
- A character roster registry (`src/characters.ts`) and per-character
  sprite loading (`src/anim.ts`'s `getClips(characterId)`) ready to grow
  past the one fighter — drop a new sprite pack in `src/assets/<id>/`
  following the same frame-naming convention and register it
- Web Audio API square-wave SFX and `navigator.vibrate` haptics on every
  hit, block, and finisher
- Desktop shows a handheld-bezel QR screen instead of the game

## Tech stack

- Vue 3 + TypeScript + Vite
- Hand-rolled `<canvas>` renderer (`src/sprite.ts`, `src/comic.ts`) and
  fight simulation (`src/engine.ts`) — no game engine
- `qrcode` for the desktop QR screen

## Project layout

- `src/App.vue` — screen state machine (title → fight → results), the
  swipe/tap/hold gesture recognizer, wave transitions, HUD, and the
  requestAnimationFrame game loop
- `src/engine.ts` — fight simulation: fighter state, combo/move
  resolution, launch/ragdoll physics, hit/block/KO logic, endless-mode
  wave transitions, and the enemy-profile-driven AI
- `src/enemies.ts` — the five enemy archetype profiles and per-wave
  difficulty scaling
- `src/backdrops.ts` — the five pixel-art office backdrops, one per wave
- `src/characters.ts` — character roster registry (id → sprite folder)
- `src/anim.ts` — per-character sprite frame manifest, clip definitions,
  and preloading
- `src/sprite.ts` — canvas sprite renderer (frame drawing, per-fighter
  tint, hit flash, ground shadow, launch spin rotation)
- `src/comic.ts` — starburst + onomatopoeia hit-effect renderer
- `src/assets/fighter/` — cropped sprite frames (CC0, see credit below)
- `src/assets/backdrops/` — the five office backdrop images
- `src/data.ts` — lose-screen flavor quotes

## Sprite credit

Fighter sprites are from "Stick Figure Character Sprites 2D" by Raphael
Gonçalves ([@rgs_dev](https://twitter.com/rgs_dev)), CC0 licensed.
