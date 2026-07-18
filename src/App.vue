<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, shallowRef } from 'vue'
import QRCode from 'qrcode'
import { LOSE_QUOTES, WIN_QUOTES } from './data'
import { DEFAULT_PLAYER_ID, DEFAULT_RIVAL_ID } from './characters'
import {
  ARENA_H,
  ARENA_W,
  FightController,
  GROUND_Y,
  runAI,
  type AIMemory,
  type FightEvent,
  type FighterState,
} from './engine'
import { drawFighter } from './sprite'
import { drawOffice } from './arena'
import { preloadSprites } from './anim'
import { drawBurst, drawComicText, pickLaunchLine, pickOnomatopoeia } from './comic'
import { hapticLight, hapticMedium, hapticStrong } from './haptics'
import { sfxBlock, sfxLose, sfxMenuConfirm, sfxPunch, sfxSpecial, sfxUnlock, sfxWin } from './audio'

type Screen = 'desktop-qr' | 'title' | 'fight' | 'results'

const screen = ref<Screen>('title')
const isMobile = ref(true)
const qrDataUrl = ref('')
const spritesReady = ref(false)

function detectMobile() {
  if (typeof window === 'undefined') return true
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false
  const uaMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
  const narrow = window.innerWidth <= 900
  return coarse || uaMobile || narrow
}

function goTitle() {
  sfxMenuConfirm()
  screen.value = 'title'
}

// ---------------- Fight state ----------------
const canvasRef = ref<HTMLCanvasElement | null>(null)
const canvasWrapRef = ref<HTMLDivElement | null>(null)
const canvasDisplaySize = reactive({ w: ARENA_W, h: ARENA_H })
let resizeObserver: ResizeObserver | null = null

function fitCanvasToWrap() {
  const wrap = canvasWrapRef.value
  if (!wrap) return
  const availW = wrap.clientWidth
  const availH = wrap.clientHeight
  if (!availW || !availH) return
  const ratio = ARENA_W / ARENA_H
  let w = availW
  let h = w / ratio
  if (h > availH) {
    h = availH
    w = h * ratio
  }
  canvasDisplaySize.w = Math.floor(w)
  canvasDisplaySize.h = Math.floor(h)
}

const controller = shallowRef<FightController | null>(null)
const aiMemory = reactive<AIMemory>({ thinkCooldown: 300, wantChain: false, speedRatio: 0 })
const BURST_LIFE = 340
const TEXT_LIFE = 560
const LAUNCH_TEXT_LIFE = 900
const bursts = reactive<{ id: number; x: number; y: number; age: number; life: number; seed: number; big: boolean }[]>([])
const comicTexts = reactive<{ id: number; x: number; y: number; age: number; life: number; seed: number; text: string; size: number }[]>([])
let effectId = 0
let rafId = 0
let lastTs = 0
const playerHealth = ref(100)
const opponentHealth = ref(100)
const timeRemaining = ref(60)
const comboStep = ref(0)
let shake = 0
let slowMoMs = 0

// ---------------- Swipe / tap / hold gesture recognizer ----------------
// Everything is one full-surface gesture: drag horizontally to walk
// (proportional to how far you drag — a light drag is a careful step, a
// big drag is a full sprint), a fast horizontal flick throws a dash
// strike, a fast upward flick jumps (or air-strikes if already airborne),
// holding still in place guards, and a quick tap throws a combo punch.
const TAP_MAX_DIST = 16
const TAP_MAX_DURATION = 180
const DRAG_DEADZONE = 10
const MAX_DRAG_DIST = 85 // drag distance at which movement reaches full run speed
const FLICK_MIN_DIST = 32
const FLICK_MIN_SPEED = 0.45 // px/ms
const HOLD_BLOCK_DELAY = 150

const gesture = reactive({
  active: false,
  dragging: false,
  blockHeld: false,
  startX: 0,
  startY: 0,
  curX: 0,
  curY: 0,
  startTime: 0,
})
let holdTimer = 0

function gestureDown(e: PointerEvent) {
  gesture.active = true
  gesture.dragging = false
  gesture.blockHeld = false
  gesture.startX = e.clientX
  gesture.startY = e.clientY
  gesture.curX = e.clientX
  gesture.curY = e.clientY
  gesture.startTime = performance.now()
  window.clearTimeout(holdTimer)
  holdTimer = window.setTimeout(() => {
    if (gesture.active && !gesture.dragging) {
      gesture.blockHeld = true
      setBlock(true)
    }
  }, HOLD_BLOCK_DELAY)
}

function gestureMove(e: PointerEvent) {
  if (!gesture.active) return
  gesture.curX = e.clientX
  gesture.curY = e.clientY
  if (!gesture.dragging && !gesture.blockHeld) {
    const dx = gesture.curX - gesture.startX
    const dy = gesture.curY - gesture.startY
    if (Math.hypot(dx, dy) > DRAG_DEADZONE) {
      gesture.dragging = true
      window.clearTimeout(holdTimer)
    }
  }
}

function gestureUp() {
  if (!gesture.active) return
  gesture.active = false
  window.clearTimeout(holdTimer)

  if (gesture.blockHeld) {
    gesture.blockHeld = false
    setBlock(false)
    return
  }

  const dx = gesture.curX - gesture.startX
  const dy = gesture.curY - gesture.startY
  const dist = Math.hypot(dx, dy)
  const duration = performance.now() - gesture.startTime

  if (gesture.dragging) {
    gesture.dragging = false
    const speed = dist / Math.max(1, duration)
    if (dist > FLICK_MIN_DIST && speed > FLICK_MIN_SPEED) {
      if (Math.abs(dy) > Math.abs(dx) && dy < 0) {
        doJumpOrAirAttack()
      } else {
        doSwipeStrike(dx > 0 ? 1 : -1)
      }
    }
    return
  }

  if (dist <= TAP_MAX_DIST && duration <= TAP_MAX_DURATION) {
    doAttack()
  }
}

function gestureCancel() {
  if (gesture.blockHeld) setBlock(false)
  gesture.active = false
  gesture.dragging = false
  gesture.blockHeld = false
  window.clearTimeout(holdTimer)
}

async function startFight() {
  sfxUnlock()
  if (!spritesReady.value) await preloadSprites([DEFAULT_PLAYER_ID, DEFAULT_RIVAL_ID]).then(() => (spritesReady.value = true))
  controller.value = new FightController(DEFAULT_PLAYER_ID, DEFAULT_RIVAL_ID)
  aiMemory.thinkCooldown = 300
  aiMemory.wantChain = false
  aiMemory.speedRatio = 0
  bursts.length = 0
  comicTexts.length = 0
  shake = 0
  slowMoMs = 0
  comboStep.value = 0
  screen.value = 'fight'
  lastTs = 0
  cancelAnimationFrame(rafId)
  await nextTick()
  if (canvasWrapRef.value) {
    resizeObserver?.disconnect()
    resizeObserver = new ResizeObserver(() => fitCanvasToWrap())
    resizeObserver.observe(canvasWrapRef.value)
  }
  fitCanvasToWrap()
  rafId = requestAnimationFrame(loop)
}

function endFight() {
  cancelAnimationFrame(rafId)
  const c = controller.value
  if (!c) return
  if (c.a.winner) {
    sfxWin()
    hapticStrong()
  } else {
    sfxLose()
    hapticMedium()
  }
  screen.value = 'results'
}

function loop(ts: number) {
  const c = controller.value
  if (!c || screen.value !== 'fight') return
  if (!lastTs) lastTs = ts
  let realDt = (ts - lastTs) / 1000
  lastTs = ts
  realDt = Math.min(realDt, 0.048)

  // brief hit-stop / slow-mo on a "sent flying" launch, for comedic emphasis
  const timeScale = slowMoMs > 0 ? 0.25 : 1
  slowMoMs = Math.max(0, slowMoMs - realDt * 1000)
  const dt = realDt * timeScale

  let dir: -1 | 0 | 1 = 0
  let speedRatio = 0
  if (gesture.active && gesture.dragging) {
    const dx = gesture.curX - gesture.startX
    const dy = gesture.curY - gesture.startY
    if (Math.abs(dx) > Math.abs(dy)) {
      dir = dx > 0 ? 1 : -1
      speedRatio = Math.min(1, Math.abs(dx) / MAX_DRAG_DIST)
    }
  }
  c.move(c.a, dir, speedRatio)

  runAI(c, c.b, c.a, aiMemory, dt)
  c.update(dt)
  comboStep.value = c.a.comboStep

  const evs = c.events.splice(0)
  for (const ev of evs) handleEvent(ev)

  playerHealth.value = c.a.health
  opponentHealth.value = c.b.health
  timeRemaining.value = Math.ceil(Math.max(0, c.time))

  for (const b of bursts) b.age += realDt * 1000
  while (bursts.length && bursts[0].age > bursts[0].life) bursts.shift()
  for (const t of comicTexts) t.age += realDt * 1000
  while (comicTexts.length && comicTexts[0].age > comicTexts[0].life) comicTexts.shift()
  shake *= 0.82
  if (shake < 0.3) shake = 0

  render(c)

  if (c.over) {
    endFight()
    return
  }
  rafId = requestAnimationFrame(loop)
}

function handleEvent(ev: FightEvent) {
  if (ev.type === 'block') {
    sfxBlock()
    hapticLight()
  } else if (ev.type === 'hit' || ev.type === 'finisher') {
    if (ev.type === 'finisher') sfxSpecial()
    else sfxPunch()
    hapticMedium()
    bursts.push({ id: effectId++, x: ev.x, y: ev.y, age: 0, life: BURST_LIFE, seed: effectId, big: false })
    comicTexts.push({ id: effectId++, x: ev.x, y: ev.y - 8, age: 0, life: TEXT_LIFE, seed: effectId, text: pickOnomatopoeia(), size: 26 })
    shake = ev.type === 'finisher' ? 11 : 6
  } else if (ev.type === 'launch') {
    sfxSpecial()
    hapticStrong()
    bursts.push({ id: effectId++, x: ev.x, y: ev.y, age: 0, life: BURST_LIFE + 120, seed: effectId, big: true })
    comicTexts.push({ id: effectId++, x: ev.x, y: ev.y - 8, age: 0, life: LAUNCH_TEXT_LIFE, seed: effectId, text: pickLaunchLine(), size: 34 })
    shake = 22
    slowMoMs = 260
  } else if (ev.type === 'ko') {
    bursts.push({ id: effectId++, x: ev.x, y: ev.y, age: 0, life: BURST_LIFE, seed: effectId, big: false })
    comicTexts.push({ id: effectId++, x: ev.x, y: ev.y - 8, age: 0, life: 1200, seed: effectId, text: 'K.O.!!', size: 30 })
    shake = 16
  }
}

function render(c: FightController) {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.imageSmoothingEnabled = true
  ctx.clearRect(0, 0, ARENA_W, ARENA_H)

  ctx.save()
  if (shake > 0) {
    ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake)
  }

  drawOffice(ctx)

  const order: FighterState[] = c.a.x <= c.b.x ? [c.a, c.b] : [c.b, c.a]
  for (const f of order) drawFighter(ctx, f, f.side === 'a' ? 'p1' : 'p2')

  for (const b of bursts) drawBurst(ctx, b.x, b.y, b.age, b.life, b.seed, b.big)
  for (const t of comicTexts) drawComicText(ctx, t.text, t.x, t.y, t.age, t.life, t.seed, t.size)

  ctx.restore()
}

function doJumpOrAirAttack() {
  const c = controller.value
  if (!c) return
  if (c.a.grounded) {
    c.jump(c.a)
  } else {
    const before = c.a.anim
    c.attack(c.a)
    if (c.a.anim !== before && c.a.anim === 'airAttack') {
      sfxSpecial()
      hapticStrong()
    }
  }
}

function doSwipeStrike(dir: -1 | 1) {
  const c = controller.value
  if (!c) return
  const before = c.a.anim
  c.swipeStrike(c.a, dir)
  if (c.a.anim !== before) {
    sfxSpecial()
    hapticStrong()
  }
}

function doAttack() {
  const c = controller.value
  if (!c) return
  const before = c.a.anim
  c.attack(c.a)
  const after = c.a.anim
  if (after === before) return // input buffered into an existing string, no new sfx
  if (after === 'comboFinisher' || after === 'dashAttack' || after === 'airAttack') {
    sfxSpecial()
    hapticStrong()
  } else if (after.startsWith('combo')) {
    sfxPunch()
    hapticLight()
  }
}

function setBlock(on: boolean) {
  const c = controller.value
  if (!c) return
  c.setBlocking(c.a, on)
}

function rematch() {
  sfxMenuConfirm()
  startFight()
}

const resultTitle = computed(() => (controller.value?.a.winner ? 'VICTORY' : 'DEFEATED'))
const resultSub = computed(() => {
  const c = controller.value
  if (!c) return ''
  if (c.a.dead || c.b.dead) return 'K.O.'
  return "TIME'S UP"
})
const resultQuote = computed(() => {
  const pool = controller.value?.a.winner ? WIN_QUOTES : LOSE_QUOTES
  return pool[Math.floor(Math.random() * pool.length)]
})

onMounted(async () => {
  isMobile.value = detectMobile()
  window.addEventListener('resize', onResize)
  preloadSprites([DEFAULT_PLAYER_ID, DEFAULT_RIVAL_ID]).then(() => (spritesReady.value = true))
  if (!isMobile.value) {
    screen.value = 'desktop-qr'
    try {
      qrDataUrl.value = await QRCode.toDataURL(window.location.href, {
        margin: 1,
        color: { dark: '#0a0a0a', light: '#fff6e5' },
        width: 240,
      })
    } catch {
      qrDataUrl.value = ''
    }
  }
})

function onResize() {
  const mobile = detectMobile()
  if (mobile !== isMobile.value) {
    isMobile.value = mobile
    if (!mobile && screen.value !== 'desktop-qr') screen.value = 'desktop-qr'
    if (mobile && screen.value === 'desktop-qr') screen.value = 'title'
  }
  fitCanvasToWrap()
}

onBeforeUnmount(() => {
  cancelAnimationFrame(rafId)
  window.removeEventListener('resize', onResize)
  resizeObserver?.disconnect()
  window.clearTimeout(holdTimer)
})
</script>

<template>
  <div class="shell dither-bg">
    <!-- Desktop QR screen -->
    <div v-if="screen === 'desktop-qr'" class="desktop-wrap">
      <div class="handheld wobble-border">
        <div class="handheld-top">
          <span class="dot red"></span><span class="dot yellow"></span><span class="dot green"></span>
        </div>
        <div class="handheld-screen">
          <h1 class="title-lg">YOU VS WHO?!</h1>
          <p class="sub">a scribbly office combo brawler, on your phone.</p>
          <div class="qr-frame wobble-border">
            <img v-if="qrDataUrl" :src="qrDataUrl" alt="QR code to open You vs Who? on mobile" />
            <div v-else class="qr-fallback">LOADING&hellip;</div>
          </div>
          <p class="scan-msg">SCAN WITH YOUR PHONE!</p>
        </div>
      </div>
      <p class="desktop-note">You vs Who? is a mobile-only combo brawler. Grab your phone and scan the code above.</p>
    </div>

    <!-- Title -->
    <div v-else-if="screen === 'title'" class="screen title-screen dither-bg">
      <div class="title-burst"></div>
      <h1 class="title-huge">YOU<br />VS<br />WHO?!</h1>
      <p class="subtitle">&mdash; AN OFFICE COMBO BRAWLER &mdash;</p>
      <button class="press-start comic-btn" @click="startFight">PRESS START!</button>
      <p class="instructions wobble-border">
        DRAG to walk, hold the drag to run &middot; TAP to chain a 3-hit combo<br />
        FLICK &larr;&rarr; for a dash strike &middot; FLICK &uarr; to jump (again mid-air to strike)<br />
        PRESS &amp; HOLD still to guard
      </p>
      <p class="footer-tag">1 CUBICLE &bull; 1 RIVAL &bull; 0 HR COMPLAINTS FILED</p>
    </div>

    <!-- Fight -->
    <div
      v-else-if="screen === 'fight'"
      class="screen fight-screen"
      @pointerdown.prevent="gestureDown"
      @pointermove.prevent="gestureMove"
      @pointerup.prevent="gestureUp"
      @pointercancel="gestureCancel"
      @pointerleave="gestureCancel"
    >
      <div class="fight-hud">
        <div class="hud-side">
          <span class="hud-name">YOU</span>
          <div class="health-bar wobble-border">
            <div class="health-fill" :style="{ width: playerHealth + '%', background: playerHealth > 60 ? 'var(--c-green)' : playerHealth > 30 ? 'var(--c-yellow)' : 'var(--c-red)' }"></div>
          </div>
          <span v-if="comboStep > 0" class="combo-badge">{{ comboStep }}-HIT!</span>
        </div>
        <div class="hud-timer wobble-border">{{ timeRemaining }}</div>
        <div class="hud-side right">
          <span class="hud-name">RIVAL</span>
          <div class="health-bar wobble-border">
            <div class="health-fill" :style="{ width: opponentHealth + '%', background: opponentHealth > 60 ? 'var(--c-green)' : opponentHealth > 30 ? 'var(--c-yellow)' : 'var(--c-red)' }"></div>
          </div>
        </div>
      </div>

      <div class="canvas-wrap" ref="canvasWrapRef">
        <canvas
          ref="canvasRef"
          :width="ARENA_W"
          :height="ARENA_H"
          class="fight-canvas"
          :style="{ width: canvasDisplaySize.w + 'px', height: canvasDisplaySize.h + 'px' }"
        ></canvas>
        <div v-if="gesture.blockHeld" class="block-indicator">GUARDING!</div>
      </div>

      <div class="gesture-legend">
        <span>&larr;&rarr; drag walk/run</span>
        <span>&uarr; flick jump/air strike</span>
        <span>tap combo</span>
        <span>flick &larr;&rarr; dash strike</span>
        <span>hold guard</span>
      </div>
    </div>

    <!-- Results -->
    <div v-else-if="screen === 'results'" class="screen results-screen dither-bg">
      <div class="results-burst"></div>
      <template v-if="controller">
        <h2 class="results-title" :class="{ lose: !controller.a.winner }">{{ resultTitle }}!!</h2>
        <p class="results-sub">{{ resultSub }}</p>
        <p class="results-quote wobble-border">&ldquo;{{ resultQuote }}&rdquo;</p>
      </template>
      <div class="results-actions">
        <button class="ready-btn comic-btn" @click="rematch">REMATCH!</button>
        <button class="secondary-btn comic-btn" @click="goTitle">MAIN MENU</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.shell {
  position: relative;
  width: 100%;
  min-height: 100dvh;
  background: var(--c-paper);
  overflow: hidden;
}

.screen {
  position: relative;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
}

/* ---------- Desktop QR ---------- */
.desktop-wrap {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 24px;
  padding: 24px;
  background: var(--c-blue);
}
.handheld {
  width: 340px;
  background: var(--c-yellow);
  border: 5px solid var(--c-ink);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  transform: rotate(-1deg);
}
.handheld-top {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
.dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid var(--c-ink);
}
.dot.red { background: var(--c-red); }
.dot.yellow { background: var(--c-yellow-dark); }
.dot.green { background: var(--c-green); }
.handheld-screen {
  background: var(--c-panel);
  border: 3px solid var(--c-ink);
  padding: 20px 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  text-align: center;
}
.title-lg {
  font-family: var(--font-shout);
  font-size: 32px;
  color: var(--c-red);
  -webkit-text-stroke: 1.5px var(--c-ink);
  margin: 0;
  letter-spacing: 1px;
}
.sub { color: var(--c-ink-soft); margin: 0 0 8px; }
.qr-frame {
  width: 200px;
  height: 200px;
  border: 4px solid var(--c-ink);
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.qr-frame img { width: 100%; height: 100%; }
.qr-fallback { font-size: 12px; }
.scan-msg {
  font-family: var(--font-shout);
  letter-spacing: 1px;
  color: var(--c-red);
  margin: 8px 0 0;
  font-size: 18px;
}
.desktop-note {
  max-width: 320px;
  text-align: center;
  color: #fff;
  font-size: 13px;
}

/* ---------- Title ---------- */
.title-screen {
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 2.5vh;
  padding: 24px;
  background: var(--c-blue);
  color: #fff;
}
.title-burst {
  position: absolute;
  top: 18%;
  left: 50%;
  width: 78vw;
  height: 78vw;
  max-width: 420px;
  max-height: 420px;
  transform: translate(-50%, -50%) rotate(8deg);
  background: var(--c-yellow);
  clip-path: polygon(
    50% 0%, 61% 15%, 78% 6%, 78% 25%, 98% 25%, 87% 40%, 100% 50%,
    87% 60%, 98% 75%, 78% 75%, 78% 94%, 61% 85%, 50% 100%, 39% 85%,
    22% 94%, 22% 75%, 2% 75%, 13% 60%, 0% 50%, 13% 40%, 2% 25%,
    22% 25%, 22% 6%, 39% 15%
  );
  opacity: 0.9;
}
.title-huge {
  position: relative;
  font-family: var(--font-shout);
  font-size: 17vw;
  line-height: 0.9;
  color: var(--c-red);
  margin: 0;
  letter-spacing: 1px;
  -webkit-text-stroke: 3px var(--c-ink);
  transform: rotate(-2deg);
}
.subtitle {
  position: relative;
  font-family: var(--font-hand);
  font-weight: 700;
  font-size: 14px;
  letter-spacing: 1px;
  color: var(--c-yellow);
}
.press-start {
  position: relative;
  margin-top: 8px;
  background: var(--c-red);
  color: #fff;
  padding: 14px 30px;
  font-size: 22px;
  animation: pulse 1.1s ease-in-out infinite;
}
@keyframes pulse { 50% { opacity: 0.82; } }
.instructions {
  position: relative;
  max-width: 320px;
  font-family: var(--font-hand);
  font-size: 12px;
  line-height: 1.7;
  color: var(--c-ink);
  background: var(--c-panel);
  padding: 10px 14px;
  transform: rotate(-0.6deg);
}
.footer-tag {
  position: absolute;
  bottom: 16px;
  left: 0;
  right: 0;
  font-family: var(--font-hand);
  font-size: 11px;
  letter-spacing: 0.5px;
  color: var(--c-yellow);
  opacity: 0.9;
}

/* ---------- Fight ---------- */
.fight-screen {
  background: var(--c-ink);
  height: 100dvh;
  justify-content: space-between;
  touch-action: none;
  user-select: none;
}
.fight-hud {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  color: #fff;
  gap: 8px;
}
.hud-side { display: flex; flex-direction: column; gap: 3px; position: relative; width: 120px; }
.hud-side.right { align-items: flex-end; }
.hud-name { font-family: var(--font-shout); font-size: 13px; letter-spacing: 0.5px; }
.hud-timer {
  font-family: var(--font-shout);
  font-size: 22px;
  color: var(--c-yellow);
  background: var(--c-ink);
  border: 3px solid var(--c-yellow);
  border-radius: 50%;
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.health-bar {
  width: 100%;
  height: 12px;
  background: #fff;
  border: 2px solid var(--c-ink);
  overflow: hidden;
}
.health-fill {
  height: 100%;
  transition: width 0.15s;
}
.combo-badge {
  font-family: var(--font-shout);
  font-size: 12px;
  letter-spacing: 0.5px;
  color: var(--c-ink);
  background: var(--c-yellow);
  border: 2px solid var(--c-ink);
  padding: 0px 6px;
  align-self: flex-start;
}

.canvas-wrap {
  position: relative;
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 0;
  padding: 0 4px;
}
.fight-canvas {
  border: 4px solid #fff;
  background: var(--c-paper);
}

.block-indicator {
  position: absolute;
  bottom: 6px;
  left: 50%;
  transform: translateX(-50%);
  font-family: var(--font-shout);
  font-size: 14px;
  letter-spacing: 1px;
  color: var(--c-ink);
  background: var(--c-yellow);
  border: 2px solid var(--c-ink);
  padding: 2px 12px;
}

.gesture-legend {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px 10px;
  padding: 10px 14px 20px;
  color: var(--c-paper-dim);
  font-family: var(--font-hand);
  font-size: 10px;
  text-align: center;
}
.gesture-legend span {
  border: 1px dashed var(--c-paper-dim);
  padding: 3px 6px;
}

/* ---------- Results ---------- */
.results-screen {
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 10px;
  padding: 24px;
  background: var(--c-blue);
  color: #fff;
  overflow: hidden;
}
.results-burst {
  position: absolute;
  top: 30%;
  left: 50%;
  width: 100vw;
  height: 100vw;
  max-width: 480px;
  max-height: 480px;
  transform: translate(-50%, -50%);
  background: var(--c-yellow);
  clip-path: polygon(
    50% 0%, 61% 15%, 78% 6%, 78% 25%, 98% 25%, 87% 40%, 100% 50%,
    87% 60%, 98% 75%, 78% 75%, 78% 94%, 61% 85%, 50% 100%, 39% 85%,
    22% 94%, 22% 75%, 2% 75%, 13% 60%, 0% 50%, 13% 40%, 2% 25%,
    22% 25%, 22% 6%, 39% 15%
  );
  opacity: 0.85;
}
.results-title {
  position: relative;
  font-family: var(--font-shout);
  font-size: 46px;
  color: var(--c-green);
  margin: 0;
  -webkit-text-stroke: 3px var(--c-ink);
  transform: rotate(-2deg);
}
.results-title.lose { color: var(--c-red); }
.results-sub {
  position: relative;
  font-family: var(--font-hand);
  font-weight: 700;
  font-size: 14px;
  letter-spacing: 1px;
  opacity: 0.9;
  margin: 0 0 8px;
}
.results-quote {
  position: relative;
  font-family: var(--font-hand);
  color: var(--c-ink);
  background: var(--c-panel);
  max-width: 300px;
  margin: 8px 0 20px;
  padding: 12px 16px;
  transform: rotate(0.8deg);
}
.results-actions { position: relative; display: flex; flex-direction: column; gap: 12px; width: 100%; max-width: 280px; }
.secondary-btn {
  background: var(--c-panel);
  color: var(--c-ink);
  padding: 12px;
  font-size: 16px;
}
.ready-btn {
  background: var(--c-yellow);
  color: var(--c-ink);
  padding: 15px;
  font-size: 18px;
}
</style>
