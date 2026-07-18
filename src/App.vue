<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, shallowRef } from 'vue'
import QRCode from 'qrcode'
import { HIT_MESSAGES, LOSE_QUOTES, WIN_QUOTES } from './data'
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
import { HIT_EFFECT_FRAMES, getImage, preloadSprites } from './anim'
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
const aiMemory = reactive<AIMemory>({ thinkCooldown: 300, wantChain: false })
const floaters = reactive<{ id: number; x: number; y: number; text: string; life: number; color: string }[]>([])
const hitEffects = reactive<{ id: number; x: number; y: number; age: number }[]>([])
let floaterId = 0
let rafId = 0
let lastTs = 0
const playerHealth = ref(100)
const opponentHealth = ref(100)
const timeRemaining = ref(60)
const comboStep = ref(0)

// ---------------- Swipe / tap / hold gesture recognizer ----------------
// Everything is one full-surface gesture: drag horizontally to walk (drag
// further to break into a run), a fast horizontal flick throws a dash
// strike, a fast upward flick jumps (or air-strikes if already airborne),
// holding still in place guards, and a quick tap throws a combo punch.
const TAP_MAX_DIST = 16
const TAP_MAX_DURATION = 220
const DRAG_DEADZONE = 16
const RUN_DRAG_DIST = 55
const FLICK_MIN_DIST = 40
const FLICK_MIN_SPEED = 0.55 // px/ms
const HOLD_BLOCK_DELAY = 180

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
  if (!spritesReady.value) await preloadSprites().then(() => (spritesReady.value = true))
  controller.value = new FightController()
  aiMemory.thinkCooldown = 300
  aiMemory.wantChain = false
  floaters.length = 0
  hitEffects.length = 0
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
  let dt = (ts - lastTs) / 1000
  lastTs = ts
  dt = Math.min(dt, 0.048)

  let dir: -1 | 0 | 1 = 0
  let running = false
  if (gesture.active && gesture.dragging) {
    const dx = gesture.curX - gesture.startX
    const dy = gesture.curY - gesture.startY
    if (Math.abs(dx) > Math.abs(dy)) {
      dir = dx > 0 ? 1 : -1
      running = Math.abs(dx) > RUN_DRAG_DIST
    }
  }
  c.move(c.a, dir, running)

  runAI(c, c.b, c.a, aiMemory, dt)
  c.update(dt)
  comboStep.value = c.a.comboStep

  const evs = c.events.splice(0)
  for (const ev of evs) handleEvent(ev)

  playerHealth.value = c.a.health
  opponentHealth.value = c.b.health
  timeRemaining.value = Math.ceil(Math.max(0, c.time))

  for (const f of floaters) f.life -= dt * 1000
  while (floaters.length && floaters[0].life <= 0) floaters.shift()
  for (const h of hitEffects) h.age += dt * 1000
  while (hitEffects.length && hitEffects[0].age > 260) hitEffects.shift()

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
    const msg = HIT_MESSAGES[Math.floor(Math.random() * HIT_MESSAGES.length)]
    floaters.push({ id: floaterId++, x: ev.x, y: ev.y, text: msg, life: 650, color: ev.type === 'finisher' ? '#b62515' : '#0f3651' })
    hitEffects.push({ id: floaterId++, x: ev.x, y: ev.y, age: 0 })
  } else if (ev.type === 'ko') {
    floaters.push({ id: floaterId++, x: ev.x, y: ev.y, text: 'K.O.!', life: 1200, color: '#0f3651' })
  }
}

function render(c: FightController) {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.imageSmoothingEnabled = false
  ctx.clearRect(0, 0, ARENA_W, ARENA_H)

  drawOffice(ctx)

  const order: FighterState[] = c.a.x <= c.b.x ? [c.a, c.b] : [c.b, c.a]
  for (const f of order) drawFighter(ctx, f, f.side === 'a' ? 'p1' : 'p2')

  for (const h of hitEffects) {
    const frameIdx = Math.min(HIT_EFFECT_FRAMES.length - 1, Math.floor((h.age / 260) * HIT_EFFECT_FRAMES.length))
    const src = HIT_EFFECT_FRAMES[frameIdx]
    if (src) {
      const img = getImage(src)
      const size = 46
      ctx.drawImage(img, h.x - size / 2, h.y - size / 2, size, size)
    }
  }

  for (const f of floaters) {
    ctx.fillStyle = f.color
    ctx.font = 'bold 12px "Space Mono", monospace'
    ctx.textAlign = 'center'
    const rise = (1 - f.life / 650) * 22
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 3
    ctx.strokeText(f.text, f.x, f.y - rise)
    ctx.fillText(f.text, f.x, f.y - rise)
  }
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
  preloadSprites().then(() => (spritesReady.value = true))
  if (!isMobile.value) {
    screen.value = 'desktop-qr'
    try {
      qrDataUrl.value = await QRCode.toDataURL(window.location.href, {
        margin: 1,
        color: { dark: '#0f3651', light: '#fef9eb' },
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
    <div class="scanlines"></div>

    <!-- Desktop QR screen -->
    <div v-if="screen === 'desktop-qr'" class="desktop-wrap">
      <div class="handheld">
        <div class="handheld-top">
          <span class="dot red"></span><span class="dot amber"></span><span class="dot green"></span>
        </div>
        <div class="handheld-screen">
          <h1 class="title-lg">YOU VS WHO?</h1>
          <p class="body-sm sub">office combo brawler, on your phone.</p>
          <div class="qr-frame">
            <img v-if="qrDataUrl" :src="qrDataUrl" alt="QR code to open You vs Who? on mobile" />
            <div v-else class="qr-fallback">LOADING QR...</div>
          </div>
          <p class="body-sm scan-msg">SCAN WITH YOUR PHONE</p>
        </div>
        <div class="handheld-bottom">
          <div class="dpad">
            <div class="dpad-up"></div>
            <div class="dpad-mid">
              <div class="dpad-left"></div>
              <div class="dpad-center"></div>
              <div class="dpad-right"></div>
            </div>
            <div class="dpad-down"></div>
          </div>
          <div class="ab-buttons">
            <span class="ab-btn b-btn">B</span>
            <span class="ab-btn a-btn">A</span>
          </div>
        </div>
      </div>
      <p class="desktop-note">You vs Who? is a mobile-only combo brawler. Grab your phone and scan the code above.</p>
    </div>

    <!-- Title -->
    <div v-else-if="screen === 'title'" class="screen title-screen">
      <div class="title-bg dither-bg"></div>
      <h1 class="title-huge">YOU<br />VS<br />WHO?</h1>
      <p class="body-sm subtitle">AN OFFICE COMBO BRAWLER</p>
      <button class="press-start" @click="startFight">PRESS START</button>
      <p class="body-sm instructions">
        DRAG TO WALK, HOLD THE DRAG TO RUN &middot; TAP TO CHAIN A 3-HIT COMBO<br />
        FLICK &larr;&rarr; FOR A DASH STRIKE &middot; FLICK &uarr; TO JUMP (AGAIN MID-AIR TO STRIKE)<br />
        PRESS AND HOLD STILL TO GUARD
      </p>
      <p class="footer-tag">1 CUBICLE // 1 RIVAL // 0 HR COMPLAINTS FILED</p>
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
          <svg width="100" height="8" class="health-svg">
            <rect x="0" y="0" width="100" height="8" fill="#000" />
            <rect x="1" y="1" :width="Math.max(0, (playerHealth / 100) * 98)" height="6" :fill="playerHealth > 60 ? '#afd44b' : playerHealth > 30 ? '#fc5841' : '#ba1a1a'" />
          </svg>
          <span v-if="comboStep > 0" class="combo-badge">{{ comboStep }}-HIT</span>
        </div>
        <div class="hud-timer">{{ timeRemaining }}</div>
        <div class="hud-side right">
          <span class="hud-name">RIVAL</span>
          <svg width="100" height="8" class="health-svg">
            <rect x="0" y="0" width="100" height="8" fill="#000" />
            <rect x="1" y="1" :width="Math.max(0, (opponentHealth / 100) * 98)" height="6" :fill="opponentHealth > 60 ? '#afd44b' : opponentHealth > 30 ? '#fc5841' : '#ba1a1a'" />
          </svg>
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
        <div v-if="gesture.blockHeld" class="block-indicator">GUARDING</div>
      </div>

      <div class="gesture-legend">
        <span>&larr;&rarr; DRAG WALK / RUN</span>
        <span>&uarr; FLICK JUMP / AIR STRIKE</span>
        <span>TAP COMBO</span>
        <span>FLICK &larr;&rarr; DASH STRIKE</span>
        <span>HOLD GUARD</span>
      </div>
    </div>

    <!-- Results -->
    <div v-else-if="screen === 'results'" class="screen results-screen">
      <template v-if="controller">
        <h2 class="results-title" :class="{ lose: !controller.a.winner }">{{ resultTitle }}</h2>
        <p class="results-sub">{{ resultSub }}</p>
        <p class="results-quote">"{{ resultQuote }}"</p>
      </template>
      <div class="results-actions">
        <button class="ready-btn" @click="rematch">REMATCH</button>
        <button class="secondary-btn" @click="goTitle">MAIN MENU</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.shell {
  position: relative;
  width: 100%;
  min-height: 100dvh;
  background: var(--c-background);
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
}
.handheld {
  width: 340px;
  background: var(--c-primary-container);
  border: 4px solid #000;
  border-right: 8px solid #000;
  border-bottom: 8px solid #000;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.handheld-top {
  display: flex;
  gap: 6px;
  justify-content: flex-end;
}
.dot {
  width: 8px;
  height: 8px;
  border: 2px solid #000;
}
.dot.red { background: var(--c-error); }
.dot.amber { background: var(--c-secondary-container); }
.dot.green { background: var(--c-tertiary-fixed); }
.handheld-screen {
  background: var(--c-surface);
  border: 3px solid #000;
  box-shadow: inset 4px 4px 0 rgba(0, 0, 0, 0.15);
  padding: 20px 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  text-align: center;
}
.title-lg {
  font-family: var(--font-headline);
  font-size: 22px;
  font-weight: 700;
  color: var(--c-primary);
  margin: 0;
  letter-spacing: -1px;
}
.sub { color: var(--c-on-surface-variant); margin: 0 0 8px; }
.qr-frame {
  width: 200px;
  height: 200px;
  border: 3px solid #000;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.qr-frame img { width: 100%; height: 100%; }
.qr-fallback { font-size: 10px; font-family: var(--font-body); }
.scan-msg {
  font-family: var(--font-headline);
  font-weight: 700;
  letter-spacing: 1px;
  color: var(--c-secondary);
  margin: 8px 0 0;
}
.handheld-bottom {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 4px 0;
}
.dpad-mid { display: flex; }
.dpad-up, .dpad-down { width: 14px; height: 14px; background: #000; margin: 0 auto; }
.dpad-left, .dpad-right { width: 14px; height: 14px; background: #000; }
.dpad-center { width: 14px; height: 14px; background: var(--c-primary-container); }
.ab-buttons { display: flex; gap: 8px; align-items: flex-end; }
.ab-btn {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 2px solid #000;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  color: #fff;
  font-family: var(--font-headline);
  font-size: 12px;
}
.a-btn { background: var(--c-error); }
.b-btn { background: var(--c-tertiary-fixed-dim); color: #161f00; }
.desktop-note {
  max-width: 320px;
  text-align: center;
  color: var(--c-on-surface-variant);
  font-size: 12px;
}

/* ---------- Title ---------- */
.title-screen {
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 3vh;
  padding: 24px;
  background: var(--c-primary);
  color: #fff;
}
.title-huge {
  font-family: var(--font-headline);
  font-size: 15vw;
  line-height: 0.95;
  font-weight: 700;
  color: var(--c-secondary-container);
  margin: 0;
  letter-spacing: -2px;
  -webkit-text-stroke: 2px #000;
}
.subtitle {
  font-size: 12px;
  letter-spacing: 2px;
  color: var(--c-primary-fixed, #cce5ff);
}
.press-start {
  margin-top: 12px;
  background: var(--c-secondary-container);
  color: #000;
  border: 3px solid #000;
  padding: 14px 28px;
  font-size: 16px;
  font-weight: 700;
  box-shadow: 4px 4px 0 #000;
  animation: blink 1.1s steps(2, start) infinite;
  text-transform: uppercase;
  letter-spacing: 2px;
}
.press-start:active { transform: translate(2px, 2px); box-shadow: 0 0 0 #000; }
@keyframes blink { 50% { opacity: 0.55; } }
.instructions {
  max-width: 320px;
  font-size: 9px;
  line-height: 1.7;
  letter-spacing: 0.5px;
  color: var(--c-primary-fixed, #cce5ff);
  opacity: 0.85;
}
.footer-tag {
  position: absolute;
  bottom: 16px;
  left: 0;
  right: 0;
  font-size: 9px;
  letter-spacing: 1px;
  color: var(--c-primary-fixed, #cce5ff);
  opacity: 0.7;
}

/* ---------- Fight ---------- */
.fight-screen {
  background: #000;
  height: 100dvh;
  justify-content: space-between;
  touch-action: none;
  user-select: none;
}
.fight-hud {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  color: #fff;
  gap: 8px;
}
.hud-side { display: flex; flex-direction: column; gap: 2px; position: relative; }
.hud-side.right { align-items: flex-end; }
.hud-name { font-family: var(--font-headline); font-size: 9px; letter-spacing: 0.5px; }
.hud-timer { font-family: var(--font-headline); font-size: 16px; font-weight: 700; }
.health-svg { image-rendering: pixelated; }
.combo-badge {
  font-family: var(--font-headline);
  font-size: 9px;
  font-weight: 700;
  color: #000;
  background: var(--c-secondary-container);
  border: 1px solid #000;
  padding: 1px 5px;
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
  border: 3px solid #fff;
  background: #000;
}

.block-indicator {
  position: absolute;
  bottom: 6px;
  left: 50%;
  transform: translateX(-50%);
  font-family: var(--font-headline);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 1px;
  color: #000;
  background: var(--c-primary-fixed, #cce5ff);
  border: 2px solid #000;
  padding: 2px 10px;
}

.gesture-legend {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px 10px;
  padding: 10px 14px 20px;
  color: var(--c-outline-variant);
  font-size: 8px;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  text-align: center;
}
.gesture-legend span {
  border: 1px solid var(--c-outline-variant);
  padding: 3px 6px;
}

/* ---------- Results ---------- */
.results-screen {
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 10px;
  padding: 24px;
  background: var(--c-primary);
  color: #fff;
}
.results-title {
  font-family: var(--font-headline);
  font-size: 40px;
  color: var(--c-tertiary-fixed);
  margin: 0;
  -webkit-text-stroke: 2px #000;
}
.results-title.lose { color: var(--c-secondary-container); }
.results-sub { font-size: 11px; letter-spacing: 1px; opacity: 0.8; margin: 0 0 8px; }
.results-quote { font-style: italic; max-width: 320px; margin: 8px 0 20px; }
.results-actions { display: flex; flex-direction: column; gap: 10px; width: 100%; max-width: 280px; }
.secondary-btn {
  background: transparent;
  color: #fff;
  border: 2px solid #fff;
  border-right: 4px solid #fff;
  border-bottom: 4px solid #fff;
  padding: 10px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1px;
  text-transform: uppercase;
}
.secondary-btn:active { transform: translate(2px, 2px); border-right: 2px solid #fff; border-bottom: 2px solid #fff; }
.ready-btn {
  background: #000;
  color: #fff;
  border: 2px solid #fff;
  padding: 14px;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 1px;
  text-transform: uppercase;
  border-right: 4px solid #fff;
  border-bottom: 4px solid #fff;
}
.ready-btn:active { transform: translate(2px, 2px); border-right: 2px solid #fff; border-bottom: 2px solid #fff; }
</style>
