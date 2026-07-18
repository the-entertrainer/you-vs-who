<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, shallowRef } from 'vue'
import QRCode from 'qrcode'
import { LOSE_QUOTES } from './data'
import { DEFAULT_PLAYER_ID, DEFAULT_RIVAL_ID } from './characters'
import { ENEMY_ROSTER } from './enemies'
import { BACKDROPS, getBackdropImage, preloadBackdrops, type Backdrop } from './backdrops'
import { ARENA_H, ARENA_W, FightController, runEnemyAI, type FightEvent, type FighterState } from './engine'
import { drawFighter } from './sprite'
import { preloadSprites } from './anim'
import { drawBurst, drawComicText, pickLaunchLine, pickOnomatopoeia } from './comic'
import { hapticLight, hapticMedium, hapticStrong } from './haptics'
import { sfxBlock, sfxLose, sfxMenuConfirm, sfxPunch, sfxSpecial, sfxUnlock, sfxWin } from './audio'

type Screen = 'desktop-qr' | 'title' | 'fight' | 'results'

const SWARM_SIZE = 14

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
const BURST_LIFE = 340
const TEXT_LIFE = 560
const LAUNCH_TEXT_LIFE = 900
const bursts = reactive<{ id: number; x: number; y: number; age: number; life: number; seed: number; big: boolean }[]>([])
const comicTexts = reactive<{ id: number; x: number; y: number; age: number; life: number; seed: number; text: string; size: number }[]>([])
let effectId = 0
let rafId = 0
let lastTs = 0
const playerHealth = ref(100)
const playerMaxHealth = ref(100)
const enemiesRemaining = ref(SWARM_SIZE)
const comboStep = ref(0)
const matchBackdrop = shallowRef<Backdrop>(BACKDROPS[0])
const defeatedBy = ref('')
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
  if (!spritesReady.value) {
    await Promise.all([preloadSprites([DEFAULT_PLAYER_ID, DEFAULT_RIVAL_ID]), preloadBackdrops()])
    spritesReady.value = true
  }
  const c = new FightController(DEFAULT_PLAYER_ID)
  c.spawnSwarm(SWARM_SIZE, ENEMY_ROSTER, DEFAULT_RIVAL_ID)
  controller.value = c
  matchBackdrop.value = BACKDROPS[Math.floor(Math.random() * BACKDROPS.length)]
  enemiesRemaining.value = SWARM_SIZE
  defeatedBy.value = ''
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
  if (c.victory) {
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
  c.move(c.player, dir, speedRatio)

  for (const e of c.enemies) runEnemyAI(c, e, dt)
  c.update(dt)
  comboStep.value = c.player.comboStep

  const evs = c.events.splice(0)
  for (const ev of evs) handleEvent(ev)

  playerHealth.value = c.player.health
  playerMaxHealth.value = c.player.maxHealth
  enemiesRemaining.value = c.enemies.filter((e) => !e.dead).length

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
    if (ev.who === 'player' && ev.attackerName) defeatedBy.value = ev.attackerName
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

  const bg = getBackdropImage(matchBackdrop.value.src)
  if (bg.complete && bg.naturalWidth > 0) {
    ctx.drawImage(bg, 0, 0, ARENA_W, ARENA_H)
  } else {
    ctx.fillStyle = '#1d1c13'
    ctx.fillRect(0, 0, ARENA_W, ARENA_H)
  }
  // darken slightly so the fighters (which get their own contact-shadow pop) read clearly against a busy photo
  ctx.fillStyle = 'rgba(10, 8, 6, 0.28)'
  ctx.fillRect(0, 0, ARENA_W, ARENA_H)

  const all: FighterState[] = [c.player, ...c.enemies]
  all.sort((f1, f2) => f1.x - f2.x)
  for (const f of all) drawFighter(ctx, f, f.isPlayer)

  for (const b of bursts) drawBurst(ctx, b.x, b.y, b.age, b.life, b.seed, b.big)
  for (const t of comicTexts) drawComicText(ctx, t.text, t.x, t.y, t.age, t.life, t.seed, t.size)

  ctx.restore()
}

function doJumpOrAirAttack() {
  const c = controller.value
  if (!c) return
  if (c.player.grounded) {
    c.jump(c.player)
  } else {
    const before = c.player.anim
    c.attack(c.player)
    if (c.player.anim !== before && c.player.anim === 'airAttack') {
      sfxSpecial()
      hapticStrong()
    }
  }
}

function doSwipeStrike(dir: -1 | 1) {
  const c = controller.value
  if (!c) return
  const before = c.player.anim
  c.swipeStrike(c.player, dir)
  if (c.player.anim !== before) {
    sfxSpecial()
    hapticStrong()
  }
}

function doAttack() {
  const c = controller.value
  if (!c) return
  const before = c.player.anim
  c.attack(c.player)
  const after = c.player.anim
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
  c.setBlocking(c.player, on)
}

function rematch() {
  sfxMenuConfirm()
  startFight()
}

const resultQuote = computed(() => LOSE_QUOTES[Math.floor(Math.random() * LOSE_QUOTES.length)])

// ---------------- Prevent scroll / pinch-zoom (mobile game) ----------------
function blockGesture(e: Event) {
  e.preventDefault()
}
function blockMultiTouch(e: TouchEvent) {
  if (e.touches.length > 1) e.preventDefault()
}

onMounted(async () => {
  isMobile.value = detectMobile()
  window.addEventListener('resize', onResize)
  document.addEventListener('gesturestart', blockGesture, { passive: false })
  document.addEventListener('gesturechange', blockGesture, { passive: false })
  document.addEventListener('touchmove', blockMultiTouch, { passive: false })
  Promise.all([preloadSprites([DEFAULT_PLAYER_ID, DEFAULT_RIVAL_ID]), preloadBackdrops()]).then(() => (spritesReady.value = true))
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
  document.removeEventListener('gesturestart', blockGesture)
  document.removeEventListener('gesturechange', blockGesture)
  document.removeEventListener('touchmove', blockMultiTouch)
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
          <p class="sub">a scribbly office brawler-vs-swarm, on your phone.</p>
          <div class="qr-frame wobble-border">
            <img v-if="qrDataUrl" :src="qrDataUrl" alt="QR code to open You vs Who? on mobile" />
            <div v-else class="qr-fallback">LOADING&hellip;</div>
          </div>
          <p class="scan-msg">SCAN WITH YOUR PHONE!</p>
        </div>
      </div>
      <p class="desktop-note">You vs Who? is a mobile-only brawler. Grab your phone and scan the code above.</p>
    </div>

    <!-- Title -->
    <div v-else-if="screen === 'title'" class="screen title-screen dither-bg">
      <div class="title-burst"></div>
      <h1 class="title-huge">YOU<br />VS<br />WHO?!</h1>
      <p class="subtitle">&mdash; {{ SWARM_SIZE }} VILLAINS. BARE HANDS. ONE OF YOU. &mdash;</p>
      <button class="press-start comic-btn" @click="startFight">PRESS START!</button>
      <p class="instructions wobble-border">
        DRAG to walk, hold the drag to run &middot; TAP to chain a 3-hit combo<br />
        FLICK &larr;&rarr; for a dash strike &middot; FLICK &uarr; to jump (again mid-air to strike)<br />
        PRESS &amp; HOLD still to guard
      </p>
      <p class="footer-tag">CLEAR THE OFFICE OR GO DOWN TRYING</p>
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
            <div class="health-fill" :style="{ width: (playerHealth / playerMaxHealth) * 100 + '%', background: playerHealth / playerMaxHealth > 0.6 ? 'var(--c-green)' : playerHealth / playerMaxHealth > 0.3 ? 'var(--c-yellow)' : 'var(--c-red)' }"></div>
          </div>
          <span v-if="comboStep > 0" class="combo-badge">{{ comboStep }}-HIT!</span>
        </div>
        <div class="hud-counter wobble-border">
          <span class="hud-counter-num">{{ enemiesRemaining }}</span>
          <span class="hud-counter-label">LEFT</span>
        </div>
      </div>

      <div class="canvas-wrap" ref="canvasWrapRef">
        <div class="canvas-frame" :style="{ width: canvasDisplaySize.w + 'px', height: canvasDisplaySize.h + 'px' }">
          <canvas ref="canvasRef" :width="ARENA_W" :height="ARENA_H" class="fight-canvas"></canvas>
          <div class="crt-overlay"></div>
        </div>
        <div v-if="gesture.blockHeld" class="block-indicator">GUARDING!</div>
      </div>

      <div class="gesture-legend">
        <span>drag = move</span><span>tap = punch</span><span>flick = dash/jump</span><span>hold = guard</span>
      </div>
    </div>

    <!-- Results -->
    <div v-else-if="screen === 'results'" class="screen results-screen dither-bg">
      <div class="results-burst"></div>
      <template v-if="controller">
        <h2 class="results-title" :class="{ lose: !controller.victory }">{{ controller.victory ? 'CLEARED!!' : 'DEFEATED!!' }}</h2>
        <p class="results-sub">{{ controller.victory ? `ALL ${SWARM_SIZE} VILLAINS DOWN` : `ENEMIES LEFT: ${enemiesRemaining}` }}</p>
        <p v-if="!controller.victory && defeatedBy" class="results-sub">FINISHED OFF BY {{ defeatedBy }}</p>
        <p class="results-quote wobble-border">&ldquo;{{ resultQuote }}&rdquo;</p>
      </template>
      <div class="results-actions">
        <button class="ready-btn comic-btn" @click="rematch">{{ controller?.victory ? 'GO AGAIN!' : 'TRY AGAIN!' }}</button>
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
  font-size: 13px;
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
  background: rgba(10, 8, 6, 0.6);
  border-bottom: 3px solid var(--c-ink);
}
.hud-side { display: flex; flex-direction: column; gap: 3px; position: relative; width: 150px; }
.hud-name { font-family: var(--font-shout); font-size: 13px; letter-spacing: 0.5px; }
.hud-counter {
  font-family: var(--font-shout);
  color: var(--c-yellow);
  background: var(--c-ink);
  border: 3px solid var(--c-yellow);
  border-radius: 50%;
  width: 52px;
  height: 52px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  line-height: 1;
}
.hud-counter-num { font-size: 20px; }
.hud-counter-label { font-family: var(--font-hand); font-size: 7px; letter-spacing: 0.5px; opacity: 0.85; }
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
.canvas-frame {
  position: relative;
}
.fight-canvas {
  display: block;
  width: 100%;
  height: 100%;
  border: 4px solid #fff;
  background: var(--c-paper);
}

/* CRT overlay: dark scanlines + faint RGB fringe + vignette + a slow flicker */
.crt-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
  border-radius: 2px;
  background:
    repeating-linear-gradient(rgba(18, 16, 16, 0) 0, rgba(18, 16, 16, 0) 1px, rgba(0, 0, 0, 0.3) 2px, rgba(0, 0, 0, 0.3) 2px),
    linear-gradient(90deg, rgba(255, 0, 60, 0.05), rgba(0, 255, 100, 0.02), rgba(0, 90, 255, 0.05)),
    radial-gradient(ellipse at center, rgba(0, 0, 0, 0) 55%, rgba(0, 0, 0, 0.65) 100%);
  background-size: 100% 3px, 3px 100%, 100% 100%;
  mix-blend-mode: multiply;
  animation: crtFlicker 3s infinite;
}
@keyframes crtFlicker {
  0%, 100% { opacity: 0.92; }
  8% { opacity: 0.78; }
  10% { opacity: 0.95; }
  50% { opacity: 0.88; }
  78% { opacity: 0.94; }
  92% { opacity: 0.8; }
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
  z-index: 6;
}

.gesture-legend {
  display: flex;
  justify-content: center;
  gap: 12px;
  padding: 6px 14px 10px;
  color: var(--c-paper-dim);
  font-family: var(--font-hand);
  font-size: 10px;
  text-align: center;
  opacity: 0.7;
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
