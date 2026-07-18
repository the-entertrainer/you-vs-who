<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, shallowRef } from 'vue'
import QRCode from 'qrcode'
import { ARENAS, CHARACTERS, type Arena, type Character } from './data'
import { ARENA_H, ARENA_W, FightController, GROUND_Y, runAI, type FightEvent } from './engine'
import { drawFighter, drawHealthBar } from './sprite'
import { hapticLight, hapticMedium, hapticStrong } from './haptics'
import { sfxBlock, sfxGrab, sfxLose, sfxMenuConfirm, sfxMenuMove, sfxPunch, sfxSpecial, sfxUnlock, sfxWin } from './audio'

type Screen = 'desktop-qr' | 'title' | 'char-select' | 'arena-select' | 'fight' | 'results'

const screen = ref<Screen>('title')
const isMobile = ref(true)
const qrDataUrl = ref('')

function detectMobile() {
  if (typeof window === 'undefined') return true
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false
  const uaMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
  const narrow = window.innerWidth <= 900
  return coarse || uaMobile || narrow
}

const selectedCharIndex = ref<number | null>(null)
const opponent = ref<Character | null>(null)
const selectedArenaIndex = ref<number | null>(null)

const player = computed<Character | null>(() =>
  selectedCharIndex.value !== null ? CHARACTERS[selectedCharIndex.value] : null,
)

function pickOpponent(exclude: Character) {
  const pool = CHARACTERS.filter((c) => c.id !== exclude.id)
  return pool[Math.floor(Math.random() * pool.length)]
}

function goTitle() {
  sfxMenuConfirm()
  screen.value = 'title'
}

function goCharSelect() {
  sfxMenuConfirm()
  screen.value = 'char-select'
}

function chooseChar(i: number) {
  sfxMenuMove()
  hapticLight()
  selectedCharIndex.value = i
}

function confirmChar() {
  if (selectedCharIndex.value === null) return
  sfxMenuConfirm()
  hapticMedium()
  opponent.value = pickOpponent(CHARACTERS[selectedCharIndex.value])
  screen.value = 'arena-select'
}

function chooseArena(i: number) {
  sfxMenuMove()
  hapticLight()
  selectedArenaIndex.value = i
  sfxMenuConfirm()
  hapticMedium()
  startFight()
}

const arena = computed<Arena | null>(() =>
  selectedArenaIndex.value !== null ? ARENAS[selectedArenaIndex.value] : null,
)

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
const aiMemory = reactive({ thinkCooldown: 0 })
const floaters = reactive<{ id: number; x: number; y: number; text: string; life: number; color: string }[]>([])
let floaterId = 0
let rafId = 0
let lastTs = 0
const playerHealth = ref(100)
const opponentHealth = ref(100)
const timeRemaining = ref(60)
const specialCooldownPct = ref(0)

const moveState = reactive({ left: false, right: false })

async function startFight() {
  if (!player.value || !opponent.value) return
  sfxUnlock()
  controller.value = new FightController(player.value, opponent.value)
  aiMemory.thinkCooldown = 300
  floaters.length = 0
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
  if (c.winner === c.a) {
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
  let dt = ts - lastTs
  lastTs = ts
  dt = Math.min(dt, 48)

  if (moveState.left && !moveState.right) c.move(c.a, -1)
  else if (moveState.right && !moveState.left) c.move(c.a, 1)
  else c.move(c.a, 0)

  runAI(c, c.b, c.a, dt, aiMemory)

  c.update(dt)

  for (const ev of c.drainEvents()) {
    handleEvent(ev, c)
  }

  playerHealth.value = c.a.health
  opponentHealth.value = c.b.health
  timeRemaining.value = Math.ceil(c.timeRemaining)
  specialCooldownPct.value = c.a.cooldowns.special / 2600

  for (const f of floaters) f.life -= dt
  while (floaters.length && floaters[0].life <= 0) floaters.shift()

  render(c)

  if (c.over) {
    endFight()
    return
  }
  rafId = requestAnimationFrame(loop)
}

function handleEvent(ev: FightEvent, c: FightController) {
  if (ev.type === 'block') {
    sfxBlock()
    hapticLight()
  } else if (ev.type === 'hit' || ev.type === 'special') {
    if (ev.type === 'special') sfxSpecial()
    hapticMedium()
    floaters.push({ id: floaterId++, x: ev.x, y: ev.y, text: ev.message ?? 'HIT!', life: 700, color: '#ba1a1a' })
  } else if (ev.type === 'ko') {
    floaters.push({ id: floaterId++, x: ev.x, y: ev.y, text: 'K.O.!', life: 1200, color: '#0f3651' })
  }
  void c
}

function render(c: FightController) {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx || !arena.value) return
  ctx.imageSmoothingEnabled = false

  ctx.fillStyle = arena.value.sky
  ctx.fillRect(0, 0, ARENA_W, GROUND_Y)
  ctx.fillStyle = arena.value.floor
  ctx.fillRect(0, GROUND_Y, ARENA_W, ARENA_H - GROUND_Y)
  ctx.fillStyle = arena.value.floorLine
  ctx.fillRect(0, GROUND_Y, ARENA_W, 2)

  ctx.fillStyle = arena.value.prop
  for (let i = 0; i < 5; i++) {
    ctx.fillRect(10 + i * 48, GROUND_Y - 2, 20, 2)
  }

  drawFighter(ctx, c.a)
  drawFighter(ctx, c.b)

  for (const f of floaters) {
    ctx.fillStyle = f.color
    ctx.font = '8px monospace'
    ctx.textAlign = 'center'
    const rise = (1 - f.life / 700) * 14
    ctx.fillText(f.text, f.x + 11, f.y - rise)
  }
}

function doPunch() {
  const c = controller.value
  if (!c) return
  if (c.attack(c.a, 'punch')) {
    sfxPunch()
    hapticLight()
  }
}
function doGrab() {
  const c = controller.value
  if (!c) return
  if (c.attack(c.a, 'grab')) {
    sfxGrab()
    hapticMedium()
  }
}
function doSpecial() {
  const c = controller.value
  if (!c) return
  if (c.attack(c.a, 'special')) {
    sfxSpecial()
    hapticStrong()
  }
}
function setBlock(on: boolean) {
  const c = controller.value
  if (!c) return
  c.setBlocking(c.a, on)
}

function rematch() {
  sfxMenuConfirm()
  if (!player.value) return
  opponent.value = pickOpponent(player.value)
  startFight()
}

function backToCharSelect() {
  sfxMenuConfirm()
  selectedCharIndex.value = null
  selectedArenaIndex.value = null
  screen.value = 'char-select'
}

onMounted(async () => {
  isMobile.value = detectMobile()
  window.addEventListener('resize', onResize)
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
          <p class="body-sm sub">1990s office-fighting on your phone.</p>
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
      <p class="desktop-note">You vs Who? is a mobile-only pixel fighter. Grab your phone and scan the code above.</p>
    </div>

    <!-- Title -->
    <div v-else-if="screen === 'title'" class="screen title-screen">
      <div class="title-bg dither-bg"></div>
      <h1 class="title-huge">YOU<br />VS<br />WHO?</h1>
      <p class="body-sm subtitle">A 1990s OFFICE FIGHTING SIMULATOR</p>
      <button class="press-start" @click="goCharSelect">PRESS START</button>
      <p class="footer-tag">12 STEREOTYPES // 5 ARENAS // 0 HR COMPLAINTS FILED</p>
    </div>

    <!-- Character select -->
    <div v-else-if="screen === 'char-select'" class="screen char-select">
      <header class="bar">
        <button class="icon-btn" @click="goTitle">◀</button>
        <h2 class="bar-title">SELECT EMPLOYEE</h2>
        <span class="body-sm count">{{ selectedCharIndex !== null ? '1' : '0' }}/12</span>
      </header>
      <div class="char-grid dither-bg">
        <button
          v-for="(c, i) in CHARACTERS"
          :key="c.id"
          class="char-cell"
          :class="{ selected: selectedCharIndex === i }"
          :style="{ '--accent': c.palette.accent, '--outfit': c.palette.outfit }"
          @click="chooseChar(i)"
        >
          <div class="char-portrait" :style="{ background: c.palette.outfit }">
            <div class="portrait-skin" :style="{ background: c.palette.skin }"></div>
            <div class="portrait-hair" :style="{ background: c.palette.hair }"></div>
            <div class="portrait-accent" :style="{ background: c.palette.accent }"></div>
          </div>
          <span class="label-caps">{{ c.name }}</span>
        </button>
      </div>
      <div class="detail-panel" v-if="player">
        <h3 class="detail-name">{{ player.name }}</h3>
        <p class="detail-title">{{ player.title }}</p>
        <p class="detail-desc">{{ player.desc }}</p>
      </div>
      <div class="detail-panel" v-else>
        <p class="detail-desc muted">Tap a candidate to review their performance metrics.</p>
      </div>
      <button class="ready-btn" :disabled="selectedCharIndex === null" @click="confirmChar">
        {{ selectedCharIndex === null ? 'SELECT DATA' : `READY, ${player?.name}?` }}
      </button>
    </div>

    <!-- Arena select -->
    <div v-else-if="screen === 'arena-select'" class="screen arena-select">
      <header class="bar">
        <button class="icon-btn" @click="backToCharSelect">◀</button>
        <h2 class="bar-title">SELECT ARENA</h2>
      </header>
      <div class="vs-banner" v-if="player && opponent">
        <span class="vs-name">{{ player.name }}</span>
        <span class="vs-label">VS</span>
        <span class="vs-name">{{ opponent.name }}</span>
      </div>
      <div class="arena-list">
        <button
          v-for="(a, i) in ARENAS"
          :key="a.id"
          class="arena-cell"
          @click="chooseArena(i)"
        >
          <div class="arena-swatch" :style="{ background: a.sky }">
            <div class="arena-floor-swatch" :style="{ background: a.floor }"></div>
          </div>
          <span class="label-caps">{{ a.name }}</span>
        </button>
      </div>
    </div>

    <!-- Fight -->
    <div v-else-if="screen === 'fight'" class="screen fight-screen">
      <div class="fight-hud">
        <div class="hud-side">
          <span class="hud-name">{{ player?.name }}</span>
          <svg width="100" height="8" class="health-svg">
            <rect x="0" y="0" width="100" height="8" fill="#000" />
            <rect x="1" y="1" :width="Math.max(0, (playerHealth / 100) * 98)" height="6" :fill="playerHealth > 60 ? '#afd44b' : playerHealth > 30 ? '#fc5841' : '#ba1a1a'" />
          </svg>
        </div>
        <div class="hud-timer">{{ timeRemaining }}</div>
        <div class="hud-side right">
          <span class="hud-name">{{ opponent?.name }}</span>
          <svg width="100" height="8" class="health-svg">
            <rect x="0" y="0" width="100" height="8" fill="#000" />
            <rect x="1" y="1" :width="Math.max(0, (opponentHealth / 100) * 98)" height="6" :fill="opponentHealth > 60 ? '#afd44b' : opponentHealth > 30 ? '#fc5841' : '#ba1a1a'" style="transform-origin: right; transform: scaleX(1);" />
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
      </div>

      <div class="controls">
        <div class="dpad-controls">
          <button
            class="dpad-btn left"
            @pointerdown.prevent="moveState.left = true"
            @pointerup.prevent="moveState.left = false"
            @pointerleave="moveState.left = false"
            @pointercancel="moveState.left = false"
          >◀</button>
          <button
            class="dpad-btn right"
            @pointerdown.prevent="moveState.right = true"
            @pointerup.prevent="moveState.right = false"
            @pointerleave="moveState.right = false"
            @pointercancel="moveState.right = false"
          >▶</button>
          <button
            class="block-btn"
            @pointerdown.prevent="setBlock(true)"
            @pointerup.prevent="setBlock(false)"
            @pointerleave="setBlock(false)"
            @pointercancel="setBlock(false)"
          >BLOCK</button>
        </div>
        <div class="action-buttons">
          <button class="action-btn punch" @pointerdown.prevent="doPunch">PUNCH</button>
          <button class="action-btn grab" @pointerdown.prevent="doGrab">GRAB</button>
          <button
            class="action-btn special"
            :disabled="specialCooldownPct > 0"
            @pointerdown.prevent="doSpecial"
          >
            SPECIAL
            <span v-if="specialCooldownPct > 0" class="cooldown-fill" :style="{ height: specialCooldownPct * 100 + '%' }"></span>
          </button>
        </div>
      </div>
    </div>

    <!-- Results -->
    <div v-else-if="screen === 'results'" class="screen results-screen">
      <template v-if="controller?.winner">
        <h2 class="results-title" :class="{ lose: controller.winner !== controller.a }">
          {{ controller.winner === controller.a ? 'VICTORY' : 'DEFEATED' }}
        </h2>
        <p class="results-sub">{{ controller.timeUp ? 'TIME UP — DECIDED ON HEALTH' : 'K.O.' }}</p>
        <div class="results-portrait-frame">
          <div class="results-portrait" :style="{ background: controller.winner.character.palette.outfit }">
            <div class="results-portrait-skin" :style="{ background: controller.winner.character.palette.skin }"></div>
            <div class="results-portrait-accent" :style="{ background: controller.winner.character.palette.accent }"></div>
          </div>
        </div>
        <p class="results-quote">"{{ controller.winner.character.winQuote }}"</p>
        <p class="results-name">— {{ controller.winner.character.name }}</p>
      </template>
      <div class="results-actions">
        <button class="ready-btn" @click="rematch">REMATCH</button>
        <button class="secondary-btn" @click="backToCharSelect">CHANGE EMPLOYEE</button>
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
  box-shadow: 8px 8px 0 rgba(0, 0, 0, 1);
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
  gap: 4vh;
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
  margin-top: 24px;
  background: var(--c-secondary-container);
  color: #000;
  border: 3px solid #000;
  padding: 14px 28px;
  font-size: 16px;
  font-weight: 700;
  box-shadow: 4px 4px 0 rgba(0, 0, 0, 1);
  animation: blink 1.1s steps(2, start) infinite;
}
.press-start:active { transform: translate(2px, 2px); box-shadow: none; }
@keyframes blink { 50% { opacity: 0.55; } }
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

/* ---------- Shared bar ---------- */
.bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  background: var(--c-primary);
  color: #fff;
  border-bottom: 4px solid #000;
}
.bar-title {
  font-family: var(--font-headline);
  font-size: 15px;
  letter-spacing: 1px;
  margin: 0;
}
.icon-btn {
  background: none;
  border: none;
  color: #fff;
  font-size: 16px;
}
.count { color: var(--c-secondary-container); font-weight: 700; }

/* ---------- Char select ---------- */
.char-select { background: var(--c-surface); }
.char-grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  padding: 12px;
  overflow-y: auto;
  border-bottom: 4px solid #000;
}
.char-cell {
  background: var(--c-surface-container-lowest);
  border: 2px solid #000;
  box-shadow: 3px 3px 0 rgba(0, 0, 0, 1);
  padding: 6px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.char-cell:active { transform: translate(2px, 2px); box-shadow: none; }
.char-cell.selected {
  outline: 3px solid var(--c-secondary-container);
  outline-offset: 2px;
}
.char-portrait {
  width: 100%;
  aspect-ratio: 1;
  border: 2px solid #000;
  position: relative;
  overflow: hidden;
}
.portrait-skin { position: absolute; top: 8%; left: 25%; width: 50%; height: 35%; }
.portrait-hair { position: absolute; top: 4%; left: 22%; width: 56%; height: 14%; }
.portrait-accent { position: absolute; bottom: 8%; left: 15%; width: 70%; height: 20%; }
.label-caps {
  font-family: var(--font-headline);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-align: center;
}
.detail-panel {
  background: var(--c-surface-container);
  border-top: 2px solid #000;
  padding: 10px 14px;
  min-height: 84px;
}
.detail-name {
  font-family: var(--font-headline);
  background: var(--c-primary);
  color: #fff;
  display: inline-block;
  padding: 2px 8px;
  margin: 0 0 4px;
  font-size: 14px;
}
.detail-title {
  color: var(--c-secondary);
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1px;
  margin: 0 0 4px;
}
.detail-desc { font-size: 11px; color: var(--c-on-surface-variant); margin: 0; line-height: 1.4; }
.detail-desc.muted { font-style: italic; }
.ready-btn {
  background: #000;
  color: #fff;
  border: none;
  padding: 14px;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 1px;
}
.ready-btn:disabled { opacity: 0.4; }

/* ---------- Arena select ---------- */
.arena-select { background: var(--c-surface); flex: 1; }
.vs-banner {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 16px;
  font-family: var(--font-headline);
  font-weight: 700;
  font-size: 13px;
}
.vs-label { color: var(--c-secondary); }
.arena-list {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  overflow-y: auto;
}
.arena-cell {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--c-surface-container-lowest);
  border: 2px solid #000;
  box-shadow: 3px 3px 0 rgba(0, 0, 0, 1);
  padding: 8px;
}
.arena-cell:active { transform: translate(2px, 2px); box-shadow: none; }
.arena-swatch {
  width: 56px;
  height: 40px;
  border: 2px solid #000;
  position: relative;
  overflow: hidden;
}
.arena-floor-swatch { position: absolute; bottom: 0; left: 0; right: 0; height: 40%; }

/* ---------- Fight ---------- */
.fight-screen {
  background: #000;
  height: 100dvh;
  justify-content: space-between;
}
.fight-hud {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  color: #fff;
  gap: 8px;
}
.hud-side { display: flex; flex-direction: column; gap: 2px; }
.hud-side.right { align-items: flex-end; }
.hud-name { font-family: var(--font-headline); font-size: 9px; letter-spacing: 0.5px; }
.hud-timer { font-family: var(--font-headline); font-size: 16px; font-weight: 700; }
.health-svg { image-rendering: pixelated; }

.canvas-wrap {
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

.controls {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  padding: 10px 14px 20px;
  gap: 10px;
}
.dpad-controls { display: flex; gap: 6px; align-items: center; }
.dpad-btn {
  width: 48px;
  height: 48px;
  background: var(--c-outline-variant);
  border: 3px solid #000;
  font-size: 16px;
  box-shadow: 3px 3px 0 rgba(0, 0, 0, 1);
}
.dpad-btn:active { transform: translate(2px, 2px); box-shadow: none; }
.block-btn {
  height: 40px;
  padding: 0 12px;
  background: var(--c-primary-container);
  color: #fff;
  border: 3px solid #000;
  font-size: 10px;
  font-weight: 700;
  box-shadow: 3px 3px 0 rgba(0, 0, 0, 1);
}
.block-btn:active { transform: translate(2px, 2px); box-shadow: none; }

.action-buttons { display: flex; gap: 8px; }
.action-btn {
  position: relative;
  width: 62px;
  height: 62px;
  border-radius: 50%;
  border: 3px solid #000;
  color: #fff;
  font-family: var(--font-headline);
  font-size: 10px;
  font-weight: 700;
  box-shadow: 4px 4px 0 rgba(0, 0, 0, 1);
  overflow: hidden;
}
.action-btn:active { transform: translate(3px, 3px); box-shadow: none; }
.action-btn.punch { background: var(--c-error); }
.action-btn.grab { background: var(--c-tertiary-fixed-dim); color: #161f00; }
.action-btn.special { background: #7b3fa0; }
.action-btn:disabled { opacity: 0.5; }
.cooldown-fill {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: rgba(0, 0, 0, 0.55);
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
.results-portrait-frame {
  width: 80px;
  height: 80px;
  padding: 4px;
  background: var(--c-surface-container-lowest);
  border: 3px solid #000;
  box-shadow: 4px 4px 0 rgba(0, 0, 0, 1);
}
.results-portrait {
  position: relative;
  width: 100%;
  height: 100%;
  border: 2px solid #000;
  overflow: hidden;
}
.results-portrait-skin {
  position: absolute;
  top: 10%;
  left: 25%;
  width: 50%;
  height: 35%;
}
.results-portrait-accent {
  position: absolute;
  bottom: 10%;
  left: 15%;
  width: 70%;
  height: 20%;
}
.results-quote { font-style: italic; max-width: 320px; margin: 8px 0 0; }
.results-name { font-size: 11px; opacity: 0.8; margin: 2px 0 20px; }
.results-actions { display: flex; flex-direction: column; gap: 10px; width: 100%; max-width: 280px; }
.secondary-btn {
  background: transparent;
  color: #fff;
  border: 2px solid #fff;
  padding: 10px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1px;
}
</style>
