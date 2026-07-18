// Procedural office backdrop. Instead of a fixed photo, the whole scene is
// generated from a seed using a deterministic per-cell hash: every desk,
// window, and floor tile gets its own pseudo-random variant, so nothing
// visibly repeats no matter how wide the arena is, and re-running the same
// seed always reproduces the same room (no glitches, no popping).

function hash(x: number, y: number, seed: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 2147483647)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return ((h >>> 0) % 100000) / 100000
}

const WALL = ['#2a3350', '#2e3a5c', '#263049']
const WALL_TRIM = '#1b2138'
const WINDOW_GLOW = ['#4fd8e8', '#7fe6a8', '#f2c94c']
const DESK = '#3d3050'
const DESK_DARK = '#2a2038'
const MONITOR_GLOW = ['#4fe0a0', '#4fb8e0', '#e0704f', '#e0c14f']
const FLOOR_A = '#181c2e'
const FLOOR_B = '#1d2236'
const CEIL_LIGHT = '#e8e4d8'

export interface Backdrop {
  canvas: HTMLCanvasElement
  groundY: number
}

/** Renders the whole backdrop once to an offscreen canvas — cheap to redraw every frame afterward. */
export function generateBackdrop(width: number, height: number, groundY: number, seed: number): Backdrop {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!

  // wall
  ctx.fillStyle = WALL[0]
  ctx.fillRect(0, 0, width, groundY)

  // ceiling light strips
  for (let x = 0; x < width; x += 58) {
    const jitter = hash(x, 0, seed)
    ctx.fillStyle = CEIL_LIGHT
    ctx.globalAlpha = 0.15 + jitter * 0.1
    ctx.fillRect(x + 8, 4, 36, 6)
    ctx.globalAlpha = 1
  }

  // cubicle wall panels + windows, one unit per ~74px, each with its own hashed look
  const unit = 74
  for (let i = 0, x = 0; x < width; i++, x += unit) {
    const h1 = hash(i, 1, seed)
    const h2 = hash(i, 2, seed)
    const h3 = hash(i, 3, seed)
    const panelColor = WALL[Math.floor(h1 * WALL.length)]
    ctx.fillStyle = panelColor
    ctx.fillRect(x, 26, unit - 6, groundY - 26 - 46)
    ctx.strokeStyle = WALL_TRIM
    ctx.lineWidth = 2
    ctx.strokeRect(x, 26, unit - 6, groundY - 26 - 46)

    // roughly 1 in 3 panels is a window instead of a plain wall
    if (h2 < 0.34) {
      const glow = WINDOW_GLOW[Math.floor(h3 * WINDOW_GLOW.length)]
      ctx.fillStyle = '#12172a'
      ctx.fillRect(x + 8, 34, unit - 22, 54)
      ctx.fillStyle = glow
      ctx.globalAlpha = 0.35
      ctx.fillRect(x + 8, 34, unit - 22, 54)
      ctx.globalAlpha = 1
      // distant skyline silhouette, hashed heights
      ctx.fillStyle = 'rgba(10, 12, 22, 0.75)'
      let bx = x + 10
      let bi = 0
      while (bx < x + unit - 16) {
        const bw = 8 + Math.floor(hash(i, 10 + bi, seed) * 8)
        const bh = 10 + Math.floor(hash(i, 20 + bi, seed) * 30)
        ctx.fillRect(bx, 34 + 54 - bh, bw, bh)
        bx += bw + 3
        bi++
      }
      ctx.strokeStyle = WALL_TRIM
      ctx.strokeRect(x + 8, 34, unit - 22, 54)
    } else if (h2 < 0.55) {
      // motivational poster
      ctx.fillStyle = '#0d1120'
      ctx.fillRect(x + 14, 38, unit - 34, 44)
      ctx.fillStyle = WINDOW_GLOW[Math.floor(h1 * WINDOW_GLOW.length)]
      ctx.globalAlpha = 0.5
      ctx.fillRect(x + 14, 38, unit - 34, 12)
      ctx.globalAlpha = 1
    }

    // desk + monitor along the base of the wall
    const deskY = groundY - 44
    ctx.fillStyle = DESK_DARK
    ctx.fillRect(x + 4, deskY + 22, unit - 16, 6)
    ctx.fillStyle = DESK
    ctx.fillRect(x + 10, deskY + 6, unit - 28, 4)
    if (h3 > 0.22) {
      ctx.fillStyle = '#12172a'
      ctx.fillRect(x + 16, deskY - 12, 22, 18)
      ctx.fillStyle = MONITOR_GLOW[Math.floor(h2 * MONITOR_GLOW.length)]
      ctx.globalAlpha = 0.8
      ctx.fillRect(x + 18, deskY - 10, 18, 13)
      ctx.globalAlpha = 1
    }
  }

  // floor
  ctx.fillStyle = FLOOR_A
  ctx.fillRect(0, groundY, width, height - groundY)
  const tile = 16
  for (let ty = groundY; ty < height; ty += tile) {
    for (let tx = 0; tx < width; tx += tile) {
      const t = hash(Math.floor(tx / tile), Math.floor(ty / tile), seed + 99)
      ctx.fillStyle = t > 0.5 ? FLOOR_B : FLOOR_A
      ctx.globalAlpha = 0.5
      ctx.fillRect(tx, ty, tile, tile)
      ctx.globalAlpha = 1
      // rare floor clutter fleck
      if (t > 0.94) {
        ctx.fillStyle = 'rgba(230, 226, 216, 0.5)'
        ctx.fillRect(tx + 4, ty + 5, 5, 4)
      }
    }
  }
  // floor perspective lines fanning from the horizon for depth
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'
  ctx.lineWidth = 1
  for (let x = -40; x < width + 40; x += 44) {
    const h4 = hash(x, 55, seed)
    ctx.beginPath()
    ctx.moveTo(x, groundY)
    ctx.lineTo(x + (h4 - 0.5) * 30, height)
    ctx.stroke()
  }
  ctx.fillStyle = WALL_TRIM
  ctx.fillRect(0, groundY, width, 3)

  return { canvas, groundY }
}
