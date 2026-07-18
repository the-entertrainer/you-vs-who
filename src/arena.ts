import { ARENA_H, ARENA_W, GROUND_Y } from './engine'

const INK = '#0a0a0a'
const WALL = '#fff6e5'
const CUBICLE = '#ffd23f'
const CUBICLE_DARK = '#f2a900'
const WINDOW_SKY = '#1c3fa8'
const WINDOW_SKY_LIGHT = '#5c7bd6'
const FLOOR = '#f2e6c9'
const DESK = '#ee2b2b'
const DESK_DARK = '#a90f0f'
const MONITOR = '#0a0a0a'
const MONITOR_GLOW = '#7fd8ff'
const PLANT_POT = '#ee2b2b'
const PLANT_LEAF = '#2fb84f'
const POSTER_BG = '#1c3fa8'
const POSTER_ACCENT = '#ffd23f'

function rect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h))
}

/** A single hand-drawn (slightly jittery, redrawn fresh each frame) ink segment. */
function sketchLine(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, wobble = 1) {
  const steps = 3
  ctx.beginPath()
  ctx.moveTo(x1 + (Math.random() - 0.5) * wobble, y1 + (Math.random() - 0.5) * wobble)
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    const x = x1 + (x2 - x1) * t + (Math.random() - 0.5) * wobble
    const y = y1 + (y2 - y1) * t + (Math.random() - 0.5) * wobble
    ctx.lineTo(x, y)
  }
  ctx.stroke()
}

/** Flat fill plus a loose, hand-inked rectangle outline (redrawn each frame for a "boiling line" scribble feel). */
function sketchRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill: string, wobble = 1) {
  rect(ctx, x, y, w, h, fill)
  ctx.strokeStyle = INK
  ctx.lineWidth = 2
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  sketchLine(ctx, x, y, x + w, y, wobble)
  sketchLine(ctx, x + w, y, x + w, y + h, wobble)
  sketchLine(ctx, x + w, y + h, x, y + h, wobble)
  sketchLine(ctx, x, y + h, x, y, wobble)
}

function halftonePatch(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, spacing: number, color: string) {
  ctx.fillStyle = color
  for (let py = y; py < y + h; py += spacing) {
    for (let px = x; px < x + w; px += spacing) {
      ctx.beginPath()
      ctx.arc(px, py, 1.1, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

export function drawOffice(ctx: CanvasRenderingContext2D) {
  // back wall
  rect(ctx, 0, 0, ARENA_W, GROUND_Y, WALL)
  halftonePatch(ctx, 0, 0, ARENA_W, GROUND_Y, 9, 'rgba(10,10,10,0.05)')

  // big windows
  for (const wx of [30, 250]) {
    sketchRect(ctx, wx, 24, 130, 90, INK, 1.4)
    sketchRect(ctx, wx + 5, 29, 120, 80, WINDOW_SKY, 1.2)
    // window cross bar
    rect(ctx, wx + 5 + 120 / 2 - 2, 29, 4, 80, INK)
    rect(ctx, wx + 5, 29 + 80 / 2 - 2, 120, 4, INK)
    // distant buildings silhouette
    rect(ctx, wx + 16, 62, 20, 46, WINDOW_SKY_LIGHT)
    rect(ctx, wx + 46, 48, 26, 60, WINDOW_SKY_LIGHT)
    rect(ctx, wx + 82, 68, 18, 40, WINDOW_SKY_LIGHT)
  }

  // motivational poster between windows
  sketchRect(ctx, 195, 40, 50, 62, POSTER_BG, 1.4)
  sketchRect(ctx, 200, 76, 40, 8, POSTER_ACCENT, 1)
  sketchRect(ctx, 204, 48, 32, 20, '#ffffff', 1)

  // cubicle partition band along the wall
  rect(ctx, 0, 118, ARENA_W, 8, CUBICLE_DARK)
  for (let x = 0; x < ARENA_W; x += 58) {
    sketchRect(ctx, x + 3, 98, 50, 20, CUBICLE, 1.2)
  }

  // floor
  rect(ctx, 0, GROUND_Y, ARENA_W, ARENA_H - GROUND_Y, FLOOR)
  ctx.strokeStyle = INK
  ctx.lineWidth = 2
  sketchLine(ctx, 0, GROUND_Y, ARENA_W, GROUND_Y, 1.4)
  ctx.lineWidth = 1
  const floorH = ARENA_H - GROUND_Y
  for (let i = 1; i < 5; i++) {
    const y = GROUND_Y + (floorH * i) / 5
    sketchLine(ctx, 0, y, ARENA_W, y, 1)
  }
  for (let x = -40; x < ARENA_W + 40; x += 40) {
    sketchLine(ctx, x, GROUND_Y, x - 12, ARENA_H, 1)
  }

  // background desk silhouettes (left + right, behind the fight line)
  drawDesk(ctx, 8, GROUND_Y - 34)
  drawDesk(ctx, ARENA_W - 76, GROUND_Y - 34)

  // water cooler
  sketchRect(ctx, 4, GROUND_Y - 58, 16, 44, '#ffffff', 1.2)
  sketchRect(ctx, 6, GROUND_Y - 66, 12, 10, WINDOW_SKY, 1)
  rect(ctx, 2, GROUND_Y - 14, 20, 4, INK)

  // potted plant
  const px = ARENA_W - 26
  sketchRect(ctx, px, GROUND_Y - 16, 16, 16, PLANT_POT, 1.2)
  rect(ctx, px + 2, GROUND_Y - 34, 4, 20, '#2b6b1f')
  ctx.fillStyle = PLANT_LEAF
  ctx.strokeStyle = INK
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.ellipse(px + 8, GROUND_Y - 38, 13, 9, 0.4, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  ctx.beginPath()
  ctx.ellipse(px + 4, GROUND_Y - 32, 10, 7, -0.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
}

function drawDesk(ctx: CanvasRenderingContext2D, x: number, y: number) {
  rect(ctx, x, y + 16, 68, 6, DESK_DARK)
  rect(ctx, x + 4, y + 22, 6, 12, DESK_DARK)
  rect(ctx, x + 58, y + 22, 6, 12, DESK_DARK)
  sketchRect(ctx, x + 10, y, 26, 18, MONITOR, 1.2)
  rect(ctx, x + 12, y + 2, 22, 13, MONITOR_GLOW)
  rect(ctx, x + 20, y + 15, 6, 4, MONITOR)
  sketchRect(ctx, x + 40, y + 10, 18, 8, DESK, 1)
}
