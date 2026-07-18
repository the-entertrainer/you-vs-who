<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, shallowRef } from 'vue'
import QRCode from 'qrcode'
import { LOSE_QUOTES, WIN_QUOTES } from './data'
import { DEFAULT_PLAYER_ID, DEFAULT_RIVAL_ID } from './characters'
import { ENEMY_ROSTER } from './enemies'
import { generateBackdrop, type Backdrop } from './procgen'
import {
  ARENA_H,
  ARENA_W,
  FightController,
  GROUND_Y,
  ROUNDS_TO_WIN,
  ROUND_TIME,
  runEnemyAI,
  type EnemyProfile,
  type FightEvent,
  type FighterState,
  type PowerUpState,
} from './engine'
import { drawFighter } from './sprite'
import { preloadSprites } from './anim'
import { drawBurst, drawComicText, drawPowerUp, pickLaunchLine, pickOnomatopoeia } from './comic'
import { hapticLight, hapticMedium, hapticStrong } from './haptics'
import { isMuted, setMuted, sfxBlock, sfxLose, sfxMenuConfirm, sfxPowerUp, sfxPunch, sfxSpecial, sfxUnlock, sfxWin } from './audio'

import playIcon from './assets/ui/icons/play-black.png'
import pauseIcon from './assets/ui/icons/pause-black.png'
import homeIcon from './assets/ui/icons/home-black.png'
import soundOnIcon from './assets/ui/icons/sound-on-black.png'
import soundOffIcon from './assets/ui/icons/sound-off-black.png'

type Screen = 'desktop-qr' | 'title' | 'select' | 'fight' | 'results'
type RoundBanner = '' | 'round' | 'fight' | 'roundwin' | 'roundlose' | 'draw'

const screen = ref<Screen>('title')
const isMobile = ref(true)
const qrDataUrl = ref('')
const spritesReady = ref(false)
const soundOn = ref(!isMuted())
const paused = ref(false)

function toggleSound() {
  soundOn.value = !soundOn.value
  setMuted(!soundOn.value)
  if (soundOn.value) sfxMenuConfirm()
}

function detectMobile() {
  if (typeof window === 'undefined') return true
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false
  const uaMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
  const narrow = window.innerWidth <= 900
  return coarse || uaMobile || narrow
}

function goTitle() {
  sfxMenuConfirm()
  paused.value = false
  cancelAnimationFrame(rafId)
  screen.value = 'title'
}

function openSelect() {
  sfxMenuConfirm()
  cancelAnimationFrame(rafId)
  screen.value = 'select'
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
const opponentHealth = ref(100)
const opponentMaxHealth = ref(100)
const roundTimeLeft = ref(ROUND_TIME)
const comboStep = ref(0)
const playerHasSlide = ref(false)
const playerHasLeapfrog = ref(false)
const opponentHasSlide = ref(false)
const opponentHasLeapfrog = ref(false)
let backdrop: Backdrop | null = null
let shake = 0
let slowMoMs = 0
let pulseClock = 0

const selectedOpponent = ref<EnemyProfile>(ENEMY_ROSTER[0])
const playerRounds = ref(0)
const opponentRounds = ref(0)
const roundNumber = ref(1)
const roundBanner = ref<RoundBanner>('')
const introLock = ref(false)

const healthTier = computed(() => {
  const r = playerHealth.value / playerMaxHealth.value
  return r > 0.6 ? 'green' : r > 0.3 ? 'yellow' : 'red'
})
const opponentHealthTier = computed(() => {
  const r = opponentHealth.value / opponentMaxHealth.value
  return r > 0.6 ? 'green' : r > 0.3 ? 'yellow' : 'red'
})

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
  if (paused.value || introLock.value) return
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
      } else if (Math.abs(dy) > Math.abs(dx) && dy > 0) {
        doSlideKick()
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

function chooseOpponent(p: EnemyProfile) {
  sfxMenuConfirm()
  selectedOpponent.value = p
  playerRounds.value = 0
  opponentRounds.value = 0
  roundNumber.value = 1
  startRound()
}

function rematchSame() {
  sfxMenuConfirm()
  playerRounds.value = 0
  opponentRounds.value = 0
  roundNumber.value = 1
  startRound()
}

async function startRound() {
  sfxUnlock()
  if (!spritesReady.value) {
    await preloadSprites([DEFAULT_PLAYER_ID, DEFAULT_RIVAL_ID])
    spritesReady.value = true
  }
  const c = new FightController(DEFAULT_PLAYER_ID, selectedOpponent.value, DEFAULT_RIVAL_ID)
  controller.value = c
  backdrop = generateBackdrop(ARENA_W, ARENA_H, GROUND_Y, Math.floor(Math.random() * 1e9))
  bursts.length = 0
  comicTexts.length = 0
  shake = 0
  slowMoMs = 0
  pulseClock = 0
  comboStep.value = 0
  playerHealth.value = c.player.health
  playerMaxHealth.value = c.player.maxHealth
  opponentHealth.value = c.opponent.health
  opponentMaxHealth.value = c.opponent.maxHealth
  roundTimeLeft.value = c.roundTime
  playerHasSlide.value = false
  playerHasLeapfrog.value = false
  opponentHasSlide.value = false
  opponentHasLeapfrog.value = false
  paused.value = false
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
  render(c) // static frame so fighters are visible under the round-intro banner
  playRoundIntro()
}

function playRoundIntro() {
  introLock.value = true
  roundBanner.value = 'round'
  window.setTimeout(() => {
    roundBanner.value = 'fight'
    window.setTimeout(() => {
      roundBanner.value = ''
      introLock.value = false
      lastTs = 0
      rafId = requestAnimationFrame(loop)
    }, 650)
  }, 950)
}

function handleRoundEnd(c: FightController) {
  cancelAnimationFrame(rafId)
  if (c.draw) {
    roundBanner.value = 'draw'
  } else if (c.victory) {
    playerRounds.value++
    roundBanner.value = 'roundwin'
    sfxWin()
    hapticStrong()
  } else {
    opponentRounds.value++
    roundBanner.value = 'roundlose'
    sfxLose()
    hapticMedium()
  }
  window.setTimeout(() => {
    roundBanner.value = ''
    if (playerRounds.value >= ROUNDS_TO_WIN || opponentRounds.value >= ROUNDS_TO_WIN) {
      screen.value = 'results'
    } else {
      roundNumber.value++
      startRound()
    }
  }, 1600)
}

function pauseFight() {
  if (screen.value !== 'fight' || paused.value || introLock.value) return
  paused.value = true
  sfxMenuConfirm()
  cancelAnimationFrame(rafId)
}

function resumeFight() {
  if (!paused.value) return
  paused.value = false
  sfxMenuConfirm()
  lastTs = 0
  rafId = requestAnimationFrame(loop)
}

function loop(ts: number) {
  const c = controller.value
  if (!c || screen.value !== 'fight' || paused.value || introLock.value) return
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

  runEnemyAI(c, c.opponent, dt)
  c.update(dt)
  comboStep.value = c.player.comboStep
  pulseClock += realDt

  const evs = c.events.splice(0)
  for (const ev of evs) handleEvent(ev)

  playerHealth.value = c.player.health
  playerMaxHealth.value = c.player.maxHealth
  opponentHealth.value = c.opponent.health
  opponentMaxHealth.value = c.opponent.maxHealth
  roundTimeLeft.value = c.roundTime
  playerHasSlide.value = c.player.hasSlideCharge
  playerHasLeapfrog.value = c.player.hasLeapfrogCharge
  opponentHasSlide.value = c.opponent.hasSlideCharge
  opponentHasLeapfrog.value = c.opponent.hasLeapfrogCharge

  for (const b of bursts) b.age += realDt * 1000
  while (bursts.length && bursts[0].age > bursts[0].life) bursts.shift()
  for (const t of comicTexts) t.age += realDt * 1000
  while (comicTexts.length && comicTexts[0].age > comicTexts[0].life) comicTexts.shift()
  shake *= 0.82
  if (shake < 0.3) shake = 0

  render(c)

  if (c.over) {
    handleRoundEnd(c)
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
  } else if (ev.type === 'powerup') {
    sfxPowerUp()
    hapticLight()
    const label = ev.powerUpKind === 'slide' ? 'SLIDE KICK!' : 'LEAPFROG!'
    comicTexts.push({ id: effectId++, x: ev.x, y: ev.y - 8, age: 0, life: TEXT_LIFE, seed: effectId, text: label, size: 20 })
  }
}

function render(c: FightController) {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.imageSmoothingEnabled = false
  ctx.clearRect(0, 0, ARENA_W, ARENA_H)

  ctx.save()
  if (shake > 0) {
    ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake)
  }

  const midX = (c.player.x + c.opponent.x) / 2
  const centerRatio = Math.max(-1, Math.min(1, (midX - ARENA_W / 2) / (ARENA_W / 2)))

  if (backdrop) {
    // Two-layer parallax: the far skyline pans a little slower than the
    // near office wall, both driven by how far the fight's center of
    // action has drifted from the arena midpoint — a depth cue with no
    // real camera/scrolling involved.
    const farOffset = -centerRatio * backdrop.farMargin * 0.6
    const nearOffset = -centerRatio * backdrop.nearMargin * 0.9
    ctx.drawImage(backdrop.far, -backdrop.farMargin + farOffset, 0)
    ctx.drawImage(backdrop.near, -backdrop.nearMargin + nearOffset, 0)
  } else {
    ctx.fillStyle = '#10131f'
    ctx.fillRect(0, 0, ARENA_W, ARENA_H)
  }

  drawFog(ctx, pulseClock)

  for (const p of c.powerUps) drawPowerUp(ctx, p.x, p.y - 40, p.kind, pulseClock)

  const all: FighterState[] = [c.player, c.opponent].sort((f1, f2) => f1.x - f2.x)
  for (const f of all) drawFighter(ctx, f, f.isPlayer)

  drawSpotlight(ctx, midX)

  for (const b of bursts) drawBurst(ctx, b.x, b.y, b.age, b.life, b.seed, b.big)
  for (const t of comicTexts) drawComicText(ctx, t.text, t.x, t.y, t.age, t.life, t.seed, t.size)

  drawVignette(ctx)

  ctx.restore()
}

/** Slow-drifting translucent haze near the floor for atmospheric depth. */
function drawFog(ctx: CanvasRenderingContext2D, clock: number) {
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (let i = 0; i < 3; i++) {
    const speed = 5 + i * 3
    const x = ((clock * speed + i * 240) % (ARENA_W + 160)) - 80
    const y = GROUND_Y - 4 - i * 9
    const r = 65 + i * 18
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r)
    grad.addColorStop(0, 'rgba(180, 200, 255, 0.06)')
    grad.addColorStop(1, 'rgba(180, 200, 255, 0)')
    ctx.fillStyle = grad
    ctx.fillRect(x - r, y - r, r * 2, r * 2)
  }
  ctx.restore()
}

/** A soft warm key-light bloom over the fight, standing in for real 3D lighting on a flat 2D scene. */
function drawSpotlight(ctx: CanvasRenderingContext2D, midX: number) {
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  const grad = ctx.createRadialGradient(midX, GROUND_Y - 70, 10, midX, GROUND_Y - 70, 170)
  grad.addColorStop(0, 'rgba(255, 240, 210, 0.10)')
  grad.addColorStop(1, 'rgba(255, 240, 210, 0)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, ARENA_W, ARENA_H)
  ctx.restore()
}

/** Plain corner darkening for depth/focus — no scanlines or flicker, just a soft vignette. */
function drawVignette(ctx: CanvasRenderingContext2D) {
  const grad = ctx.createRadialGradient(ARENA_W / 2, ARENA_H / 2, ARENA_H * 0.35, ARENA_W / 2, ARENA_H / 2, ARENA_H * 0.85)
  grad.addColorStop(0, 'rgba(0, 0, 0, 0)')
  grad.addColorStop(1, 'rgba(0, 0, 0, 0.45)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, ARENA_W, ARENA_H)
}

function doJumpOrAirAttack() {
  const c = controller.value
  if (!c) return
  if (c.player.grounded) {
    // A charged leapfrog hijacks the jump gesture only when it's actually
    // useful (opponent close enough to vault) — otherwise jump normally.
    if (c.player.hasLeapfrogCharge && Math.abs(c.player.x - c.opponent.x) < 140) {
      const before = c.player.anim
      c.leapfrog(c.player)
      if (c.player.anim !== before) {
        sfxSpecial()
        hapticStrong()
        return
      }
    }
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

function doSlideKick() {
  const c = controller.value
  if (!c) return
  const before = c.player.anim
  c.slideKick(c.player)
  if (c.player.anim !== before) {
    sfxSpecial()
    hapticStrong()
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

const matchWon = computed(() => playerRounds.value > opponentRounds.value)
const resultQuote = computed(() => {
  const pool = matchWon.value ? WIN_QUOTES : LOSE_QUOTES
  return pool[Math.floor(Math.random() * pool.length)]
})

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
  preloadSprites([DEFAULT_PLAYER_ID, DEFAULT_RIVAL_ID]).then(() => (spritesReady.value = true))
  if (!isMobile.value) {
    screen.value = 'desktop-qr'
    try {
      qrDataUrl.value = await QRCode.toDataURL(window.location.href, {
        margin: 1,
        color: { dark: '#0a0a0a', light: '#ffffff' },
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
  <div class="shell">
    <!-- Desktop QR screen -->
    <div v-if="screen === 'desktop-qr'" class="desktop-wrap dither-bg">
      <div class="pixel-panel black qr-card">
        <h1 class="title-lg">YOU VS WHO?!</h1>
        <p class="sub">a 1v1 pixel showdown, on your phone.</p>
        <div class="qr-frame">
          <img v-if="qrDataUrl" :src="qrDataUrl" alt="QR code to open You vs Who? on mobile" />
          <div v-else class="qr-fallback">LOADING&hellip;</div>
        </div>
        <p class="scan-msg">SCAN WITH YOUR PHONE!</p>
      </div>
      <p class="desktop-note">You vs Who? is a mobile-only brawler. Grab your phone and scan the code above.</p>
    </div>

    <!-- Title -->
    <div v-else-if="screen === 'title'" class="screen title-screen dither-bg">
      <div class="title-wrap">
        <h1 class="title-huge">YOU<br />VS<br />WHO?!</h1>
        <p class="subtitle">ONE RIVAL &middot; BEST OF 3 &middot; NO MERCY</p>
      </div>
      <button class="pixel-btn green play-btn" @click="openSelect">
        <img :src="playIcon" alt="" class="btn-icon" />
        PLAY
      </button>
      <div class="pixel-panel black instructions-panel">
        <p class="instructions">
          DRAG to walk / run &middot; TAP to combo<br />
          FLICK up/side to jump/dash &middot; HOLD to guard<br />
          Grab power-ups &middot; FLICK down to unleash them
        </p>
      </div>
      <button class="sound-toggle" @click="toggleSound">
        <img :src="soundOn ? soundOnIcon : soundOffIcon" alt="toggle sound" />
      </button>
      <p class="footer-tag">FIRST TO 2 ROUNDS TAKES THE OFFICE</p>
    </div>

    <!-- Opponent select -->
    <div v-else-if="screen === 'select'" class="screen select-screen dither-bg">
      <h2 class="select-title">CHOOSE YOUR RIVAL</h2>
      <div class="rival-grid">
        <button v-for="p in ENEMY_ROSTER" :key="p.id" class="rival-card pixel-panel black" @click="chooseOpponent(p)">
          <div class="rival-portrait" :style="{ background: p.tint }"></div>
          <span class="rival-name">{{ p.name }}</span>
          <div class="rival-stats">
            <span>PWR {{ Math.round(p.dmgMult * 100) }}</span>
            <span>SPD {{ Math.round(p.speedMult * 100) }}</span>
          </div>
        </button>
      </div>
      <button class="pixel-btn black back-btn" @click="goTitle">BACK</button>
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
        <div class="hud-side you">
          <div class="hud-top-row">
            <span class="hud-name">YOU</span>
            <div class="round-pips">
              <span v-for="n in ROUNDS_TO_WIN" :key="'p' + n" class="pip" :class="{ won: n <= playerRounds }"></span>
            </div>
          </div>
          <div class="pixel-bar black">
            <div class="pixel-bar-fill" :class="healthTier" :style="{ width: (playerHealth / playerMaxHealth) * 100 + '%' }"></div>
          </div>
          <div class="power-badges">
            <span v-if="comboStep > 0" class="combo-badge">{{ comboStep }}-HIT!</span>
            <span v-if="playerHasSlide" class="power-badge slide">SLIDE READY</span>
            <span v-if="playerHasLeapfrog" class="power-badge leap">LEAP READY</span>
          </div>
        </div>

        <div class="hud-center">
          <span class="hud-timer">{{ Math.ceil(roundTimeLeft) }}</span>
          <button class="pixel-icon-btn" @click="pauseFight">
            <img :src="pauseIcon" alt="pause" />
          </button>
        </div>

        <div class="hud-side opp">
          <div class="hud-top-row reverse">
            <div class="round-pips">
              <span v-for="n in ROUNDS_TO_WIN" :key="'o' + n" class="pip" :class="{ won: n <= opponentRounds }"></span>
            </div>
            <span class="hud-name opp-name">{{ selectedOpponent.name }}</span>
          </div>
          <div class="pixel-bar black mirror">
            <div class="pixel-bar-fill mirror" :class="opponentHealthTier" :style="{ width: (opponentHealth / opponentMaxHealth) * 100 + '%' }"></div>
          </div>
          <div class="power-badges reverse">
            <span v-if="opponentHasSlide" class="power-badge slide">SLIDE READY</span>
            <span v-if="opponentHasLeapfrog" class="power-badge leap">LEAP READY</span>
          </div>
        </div>
      </div>

      <div class="canvas-wrap" ref="canvasWrapRef">
        <div class="canvas-frame" :style="{ width: canvasDisplaySize.w + 'px', height: canvasDisplaySize.h + 'px' }">
          <canvas ref="canvasRef" :width="ARENA_W" :height="ARENA_H" class="fight-canvas"></canvas>
        </div>
        <div v-if="gesture.blockHeld" class="block-indicator">GUARDING!</div>

        <!-- Round intro / outcome banner -->
        <div v-if="roundBanner" class="round-banner-overlay">
          <div class="round-banner-text" :class="roundBanner">
            <template v-if="roundBanner === 'round'">ROUND {{ roundNumber }}</template>
            <template v-else-if="roundBanner === 'fight'">FIGHT!</template>
            <template v-else-if="roundBanner === 'roundwin'">ROUND WIN!</template>
            <template v-else-if="roundBanner === 'roundlose'">ROUND LOST</template>
            <template v-else-if="roundBanner === 'draw'">DRAW!</template>
          </div>
        </div>

        <!-- Pause overlay -->
        <div v-if="paused" class="pause-overlay">
          <div class="pixel-panel black pause-card">
            <h2 class="pause-title">PAUSED</h2>
            <button class="pixel-btn green" @click="resumeFight">RESUME</button>
            <button class="pixel-btn blue" @click="toggleSound">
              <img :src="soundOn ? soundOnIcon : soundOffIcon" alt="" class="btn-icon" />
              SOUND {{ soundOn ? 'ON' : 'OFF' }}
            </button>
            <button class="pixel-btn red" @click="goTitle">
              <img :src="homeIcon" alt="" class="btn-icon" />
              MAIN MENU
            </button>
          </div>
        </div>
      </div>

      <div class="gesture-legend">
        <span>drag=move</span><span>tap=punch</span><span>flick=dash/jump</span><span>down-flick=power-up</span><span>hold=guard</span>
      </div>
    </div>

    <!-- Results -->
    <div v-else-if="screen === 'results'" class="screen results-screen dither-bg">
      <div class="pixel-panel black results-card">
        <h2 class="results-title" :class="{ lose: !matchWon }">{{ matchWon ? 'YOU WIN!' : 'YOU LOSE!' }}</h2>
        <p class="results-sub">{{ playerRounds }} &ndash; {{ opponentRounds }} vs {{ selectedOpponent.name }}</p>
        <p class="results-quote">&ldquo;{{ resultQuote }}&rdquo;</p>
        <div class="results-actions">
          <button class="pixel-btn green" @click="rematchSame">REMATCH</button>
          <button class="pixel-btn blue" @click="openSelect">CHOOSE RIVAL</button>
          <button class="pixel-btn black" @click="goTitle">
            <img :src="homeIcon" alt="" class="btn-icon" />
            MAIN MENU
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.shell {
  position: relative;
  width: 100%;
  min-height: 100dvh;
  background: var(--c-bg);
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
  background: var(--c-blue-dark);
}
.qr-card {
  width: 320px;
  padding: 24px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  text-align: center;
}
.title-lg {
  font-family: var(--font-pixel);
  font-size: 28px;
  color: var(--c-yellow);
  margin: 0;
  letter-spacing: 1px;
}
.sub { color: var(--c-ink-soft); margin: 0 0 8px; font-size: 12px; }
.qr-frame {
  width: 200px;
  height: 200px;
  border: 4px solid #fff;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.qr-frame img { width: 100%; height: 100%; }
.qr-fallback { font-size: 12px; color: #000; }
.scan-msg {
  font-family: var(--font-pixel);
  letter-spacing: 1px;
  color: var(--c-green);
  margin: 8px 0 0;
  font-size: 14px;
}
.desktop-note {
  max-width: 320px;
  text-align: center;
  color: var(--c-ink-soft);
  font-size: 13px;
}

/* ---------- Title ---------- */
.title-screen {
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 3.5vh;
  padding: 24px;
  background: radial-gradient(ellipse at top, var(--c-blue-dark) 0%, var(--c-bg) 70%);
  color: #fff;
}
.title-wrap { display: flex; flex-direction: column; gap: 10px; }
.title-huge {
  font-family: var(--font-pixel);
  font-size: 15vw;
  line-height: 1.05;
  color: var(--c-yellow);
  margin: 0;
  letter-spacing: 2px;
  text-shadow: 4px 4px 0 var(--c-red), 4px 4px 0 4px rgba(0,0,0,0.4);
}
.subtitle {
  font-family: var(--font-body);
  font-weight: 700;
  font-size: 11px;
  letter-spacing: 1px;
  color: var(--c-ink-soft);
}
.play-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 16px 40px;
  font-size: 20px;
  animation: pulse 1.3s ease-in-out infinite;
}
.btn-icon { width: 18px; height: 18px; image-rendering: pixelated; }
@keyframes pulse { 50% { transform: scale(1.04); } }
.instructions-panel {
  max-width: 320px;
  padding: 12px 16px;
}
.instructions {
  margin: 0;
  font-family: var(--font-body);
  font-size: 11px;
  line-height: 1.8;
  color: var(--c-ink-soft);
  text-align: center;
}
.sound-toggle {
  border: none;
  background: none;
  width: 32px;
  height: 32px;
  opacity: 0.7;
}
.sound-toggle img { width: 100%; height: 100%; image-rendering: pixelated; }
.footer-tag {
  position: absolute;
  bottom: 16px;
  left: 0;
  right: 0;
  font-family: var(--font-body);
  font-size: 10px;
  letter-spacing: 0.5px;
  color: var(--c-ink-soft);
  opacity: 0.6;
}

/* ---------- Opponent select ---------- */
.select-screen {
  align-items: center;
  justify-content: center;
  gap: 20px;
  padding: 24px;
  background: radial-gradient(ellipse at top, var(--c-blue-dark) 0%, var(--c-bg) 70%);
  color: #fff;
}
.select-title {
  font-family: var(--font-pixel);
  color: var(--c-yellow);
  font-size: 18px;
  letter-spacing: 1px;
  margin: 0;
  text-align: center;
}
.rival-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 14px;
  width: 100%;
  max-width: 360px;
}
.rival-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 14px 8px;
  border: none;
  cursor: pointer;
}
.rival-portrait {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.35);
}
.rival-name {
  font-family: var(--font-pixel);
  font-size: 10px;
  color: #fff;
  text-align: center;
  letter-spacing: 0.5px;
  line-height: 1.4;
}
.rival-stats {
  display: flex;
  gap: 8px;
  font-family: var(--font-body);
  font-size: 9px;
  color: var(--c-ink-soft);
  opacity: 0.8;
}
.back-btn { padding: 10px 28px; font-size: 13px; }

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
  padding: 10px 12px;
  color: #fff;
  gap: 8px;
  background: rgba(10, 13, 25, 0.75);
  border-bottom: 2px solid #000;
}
.hud-side { display: flex; flex-direction: column; gap: 4px; position: relative; width: 42%; }
.hud-side.opp { align-items: flex-end; }
.hud-side .pixel-bar { align-self: stretch; width: 100%; }
.hud-top-row { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
.hud-top-row.reverse { flex-direction: row-reverse; }
.hud-name { font-family: var(--font-pixel); font-size: 11px; letter-spacing: 0.5px; color: var(--c-blue); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hud-name.opp-name { color: var(--c-red); }
.round-pips { display: flex; gap: 4px; }
.pip {
  width: 9px;
  height: 9px;
  border: 2px solid var(--c-ink-soft);
  background: transparent;
}
.pip.won { background: var(--c-yellow); border-color: var(--c-yellow); }
.hud-center {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}
.hud-timer {
  font-family: var(--font-pixel);
  font-size: 18px;
  color: var(--c-yellow);
  min-width: 30px;
  text-align: center;
}
.pixel-bar.mirror,
.pixel-bar-fill.mirror { transform: scaleX(-1); }
.combo-badge {
  font-family: var(--font-pixel);
  font-size: 11px;
  letter-spacing: 0.5px;
  color: #000;
  background: var(--c-yellow);
  padding: 1px 6px;
  align-self: flex-start;
}

.power-badges { display: flex; flex-wrap: wrap; gap: 4px; }
.power-badges.reverse { justify-content: flex-end; }
.power-badge {
  font-family: var(--font-pixel);
  font-size: 8px;
  letter-spacing: 0.5px;
  color: #000;
  padding: 1px 5px;
}
.power-badge.slide { background: #ffa23f; }
.power-badge.leap { background: #3fd0ee; }

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
  border: 3px solid #000;
  outline: 2px solid #3a4166;
  background: #10131f;
}

.block-indicator {
  position: absolute;
  bottom: 6px;
  left: 50%;
  transform: translateX(-50%);
  font-family: var(--font-pixel);
  font-size: 13px;
  letter-spacing: 1px;
  color: #000;
  background: var(--c-yellow);
  padding: 3px 12px;
  z-index: 6;
}

.round-banner-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  z-index: 8;
}
.round-banner-text {
  font-family: var(--font-pixel);
  font-size: 30px;
  letter-spacing: 1px;
  color: var(--c-yellow);
  text-shadow: 3px 3px 0 #000, 3px 3px 0 3px rgba(0, 0, 0, 0.5);
  animation: bannerPop 0.25s ease-out;
}
.round-banner-text.fight { color: var(--c-red); font-size: 36px; }
.round-banner-text.roundwin { color: var(--c-green); }
.round-banner-text.roundlose { color: var(--c-red); }
.round-banner-text.draw { color: var(--c-ink-soft); }
@keyframes bannerPop {
  0% { transform: scale(0.5); opacity: 0; }
  100% { transform: scale(1); opacity: 1; }
}

.pause-overlay {
  position: absolute;
  inset: 0;
  background: rgba(5, 6, 12, 0.75);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
}
.pause-card {
  width: 240px;
  padding: 20px 18px;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 12px;
}
.pause-title {
  font-family: var(--font-pixel);
  color: var(--c-yellow);
  text-align: center;
  margin: 0 0 6px;
  font-size: 20px;
}
.pause-card .pixel-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px;
  font-size: 13px;
}

.gesture-legend {
  display: flex;
  justify-content: center;
  gap: 12px;
  padding: 6px 14px 10px;
  color: var(--c-ink-soft);
  font-family: var(--font-body);
  font-size: 9px;
  text-align: center;
  opacity: 0.55;
}

/* ---------- Results ---------- */
.results-screen {
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 10px;
  padding: 24px;
  background: radial-gradient(ellipse at center, var(--c-blue-dark) 0%, var(--c-bg) 75%);
  color: #fff;
  overflow: hidden;
}
.results-card {
  width: 300px;
  padding: 24px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.results-title {
  font-family: var(--font-pixel);
  font-size: 30px;
  color: var(--c-green);
  margin: 0;
  letter-spacing: 1px;
}
.results-title.lose { color: var(--c-red); }
.results-sub {
  font-family: var(--font-body);
  font-weight: 700;
  font-size: 12px;
  letter-spacing: 0.5px;
  opacity: 0.85;
  margin: 0;
}
.results-quote {
  font-family: var(--font-body);
  font-style: italic;
  color: var(--c-ink-soft);
  max-width: 260px;
  margin: 10px 0 6px;
  font-size: 12px;
}
.results-actions { display: flex; flex-direction: column; gap: 12px; width: 100%; margin-top: 8px; }
.results-actions .pixel-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 12px;
  font-size: 15px;
}
</style>
