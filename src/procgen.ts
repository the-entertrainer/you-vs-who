// Procedural office backdrop, in two depth layers. Instead of a fixed
// photo, the whole scene is generated from a seed using a deterministic
// per-cell hash: every desk, window, and floor tile gets its own
// pseudo-random variant, so nothing visibly repeats no matter how wide the
// arena is, and re-running the same seed always reproduces the same room
// (no glitches, no popping). Each layer is rendered wider than the arena so
// it has room to pan slightly for parallax without ever showing an edge.

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
const SKY_TOP = '#0a0d1a'
const SKY_BOTTOM = '#171d34'

export const FAR_MARGIN = 90 // extra px each side the far skyline layer can pan into
export const NEAR_MARGIN = 50 // extra px each side the office wall layer can pan into

export interface Backdrop {
  far: HTMLCanvasElement // distant skyline — slow parallax, painted first
  near: HTMLCanvasElement // office wall/desks/floor — the layer fighters stand against
  groundY: number
  farMargin: number
  nearMargin: number
}

/** Distant city skyline seen through the office windows — a slow-parallax backdrop layer. */
function generateFarLayer(width: number, height: number, groundY: number, seed: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!

  const sky = ctx.createLinearGradient(0, 0, 0, groundY)
  sky.addColorStop(0, SKY_TOP)
  sky.addColorStop(1, SKY_BOTTOM)
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, width, groundY)

  // faint stars/dust for depth texture
  for (let x = 0; x < width; x += 5) {
    const s = hash(x, 900, seed)
    if (s > 0.965) {
      ctx.globalAlpha = 0.25 + s * 0.4
      ctx.fillStyle = '#cfe0ff'
      ctx.fillRect(x, (hash(x, 901, seed) * groundY * 0.7) | 0, 1, 1)
    }
  }
  ctx.globalAlpha = 1

  // distant building silhouettes, hashed heights/widths, tinted with window glow flecks
  let bx = 0
  let bi = 0
  while (bx < width) {
    const bw = 26 + Math.floor(hash(bi, 1, seed) * 40)
    const bh = 40 + Math.floor(hash(bi, 2, seed) * (groundY * 0.55))
    ctx.fillStyle = 'rgba(9, 11, 20, 0.9)'
    ctx.fillRect(bx, groundY - bh, bw, bh)
    // sparse lit windows
    for (let wy = groundY - bh + 6; wy < groundY - 6; wy += 9) {
      for (let wx = bx + 4; wx < bx + bw - 4; wx += 8) {
        if (hash(wx, wy, seed) > 0.72) {
          ctx.fillStyle = WINDOW_GLOW[Math.floor(hash(wx, wy + 1, seed) * WINDOW_GLOW.length)]
          ctx.globalAlpha = 0.35
          ctx.fillRect(wx, wy, 3, 4)
          ctx.globalAlpha = 1
        }
      }
    }
    bx += bw + 4 + Math.floor(hash(bi, 3, seed) * 10)
    bi++
  }

  // low haze near the horizon to sell atmospheric depth
  const haze = ctx.createLinearGradient(0, groundY - 60, 0, groundY)
  haze.addColorStop(0, 'rgba(23, 29, 52, 0)')
  haze.addColorStop(1, 'rgba(23, 29, 52, 0.85)')
  ctx.fillStyle = haze
  ctx.fillRect(0, groundY - 60, width, 60)

  return canvas
}

/** The office interior: cubicle walls, windows, desks, floor. Fighters stand directly against this layer. */
function generateNearLayer(width: number, height: number, groundY: number, seed: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!

  // wall (kept mostly transparent above the panel band so the far skyline layer shows through gaps)
  ctx.fillStyle = WALL[0]
  ctx.globalAlpha = 0.94
  ctx.fillRect(0, 0, width, groundY)
  ctx.globalAlpha = 1

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

    // roughly 1 in 3 panels is a window instead of a plain wall — cut through to
    // transparent so the far skyline layer is visible behind it
    if (h2 < 0.34) {
      ctx.clearRect(x + 8, 34, unit - 22, 54)
      const glow = WINDOW_GLOW[Math.floor(h3 * WINDOW_GLOW.length)]
      ctx.fillStyle = glow
      ctx.globalAlpha = 0.16
      ctx.fillRect(x + 8, 34, unit - 22, 54)
      ctx.globalAlpha = 1
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
      // soft bloom around the lit monitor — a cheap stand-in for real glow/lighting
      const bloom = ctx.createRadialGradient(x + 27, deskY - 4, 2, x + 27, deskY - 4, 22)
      bloom.addColorStop(0, MONITOR_GLOW[Math.floor(h2 * MONITOR_GLOW.length)] + '55')
      bloom.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = bloom
      ctx.fillRect(x - 5, deskY - 26, 64, 48)
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

  return canvas
}

/** Builds both parallax layers once per match — cheap to blit every frame afterward. */
export function generateBackdrop(width: number, height: number, groundY: number, seed: number): Backdrop {
  const far = generateFarLayer(width + FAR_MARGIN * 2, height, groundY, seed)
  const near = generateNearLayer(width + NEAR_MARGIN * 2, height, groundY, seed + 7)
  return { far, near, groundY, farMargin: FAR_MARGIN, nearMargin: NEAR_MARGIN }
}
