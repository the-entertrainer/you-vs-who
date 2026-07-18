import { ARENA_H, ARENA_W, GROUND_Y } from './engine'

const WALL = '#dedacc'
const WALL_DIM = '#c9c4b2'
const CUBICLE = '#b8c4cc'
const CUBICLE_DARK = '#8fa0aa'
const WINDOW_SKY = '#a8caec'
const WINDOW_FRAME = '#42474d'
const FLOOR = '#c2c7ce'
const FLOOR_LINE = '#9aa2ab'
const DESK = '#73777e'
const DESK_DARK = '#42474d'
const MONITOR = '#1d1c13'
const MONITOR_GLOW = '#a8caec'
const PLANT_POT = '#b62515'
const PLANT_LEAF = '#3e5100'
const POSTER_BG = '#0f3651'
const POSTER_ACCENT = '#fc5841'

function rect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h))
}

export function drawOffice(ctx: CanvasRenderingContext2D) {
  // back wall
  rect(ctx, 0, 0, ARENA_W, GROUND_Y, WALL)

  // big windows
  for (const wx of [30, 250]) {
    rect(ctx, wx, 24, 130, 90, WINDOW_FRAME)
    rect(ctx, wx + 4, 28, 122, 82, WINDOW_SKY)
    rect(ctx, wx + 4, 28, 122, 4, '#ffffff')
    // window cross bar
    rect(ctx, wx + 4 + 122 / 2 - 2, 28, 4, 82, WINDOW_FRAME)
    rect(ctx, wx + 4, 28 + 82 / 2 - 2, 122, 4, WINDOW_FRAME)
    // distant buildings silhouette
    rect(ctx, wx + 14, 60, 20, 50, '#7f9cb8')
    rect(ctx, wx + 44, 46, 26, 64, '#6c8aa8')
    rect(ctx, wx + 80, 66, 18, 44, '#7f9cb8')
  }

  // cubicle partition band along the wall
  rect(ctx, 0, 118, ARENA_W, 8, CUBICLE_DARK)
  for (let x = 0; x < ARENA_W; x += 58) {
    rect(ctx, x, 96, 6, 30, CUBICLE_DARK)
    rect(ctx, x + 6, 100, 52, 18, CUBICLE)
  }

  // motivational poster between windows
  rect(ctx, 195, 40, 50, 62, '#000000')
  rect(ctx, 198, 43, 44, 56, POSTER_BG)
  rect(ctx, 198, 74, 44, 8, POSTER_ACCENT)
  rect(ctx, 204, 50, 32, 18, '#ffffff')

  // floor
  rect(ctx, 0, GROUND_Y, ARENA_W, ARENA_H - GROUND_Y, FLOOR)
  const floorH = ARENA_H - GROUND_Y
  for (let i = 1; i < 5; i++) {
    const y = GROUND_Y + (floorH * i) / 5
    rect(ctx, 0, y, ARENA_W, 1, FLOOR_LINE)
  }
  for (let x = -40; x < ARENA_W + 40; x += 40) {
    ctx.strokeStyle = FLOOR_LINE
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(x, GROUND_Y)
    ctx.lineTo(x - 12, ARENA_H)
    ctx.stroke()
  }

  // background desk silhouettes (left + right, behind the fight line)
  drawDesk(ctx, 8, GROUND_Y - 34)
  drawDesk(ctx, ARENA_W - 76, GROUND_Y - 34)

  // water cooler
  rect(ctx, 4, GROUND_Y - 58, 16, 44, '#e7e2d5')
  rect(ctx, 6, GROUND_Y - 66, 12, 10, '#a8caec')
  rect(ctx, 2, GROUND_Y - 14, 20, 4, '#42474d')

  // potted plant
  const px = ARENA_W - 26
  rect(ctx, px, GROUND_Y - 16, 16, 16, PLANT_POT)
  rect(ctx, px + 2, GROUND_Y - 34, 4, 20, '#2a3900')
  ctx.fillStyle = PLANT_LEAF
  ctx.beginPath()
  ctx.ellipse(px + 8, GROUND_Y - 38, 13, 9, 0.4, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.ellipse(px + 4, GROUND_Y - 32, 10, 7, -0.5, 0, Math.PI * 2)
  ctx.fill()
}

function drawDesk(ctx: CanvasRenderingContext2D, x: number, y: number) {
  rect(ctx, x, y + 16, 68, 6, DESK_DARK)
  rect(ctx, x + 4, y + 22, 6, 12, DESK_DARK)
  rect(ctx, x + 58, y + 22, 6, 12, DESK_DARK)
  rect(ctx, x + 10, y, 26, 18, MONITOR)
  rect(ctx, x + 12, y + 2, 22, 13, MONITOR_GLOW)
  rect(ctx, x + 20, y + 15, 6, 4, MONITOR)
  rect(ctx, x + 40, y + 10, 18, 8, DESK)
}
