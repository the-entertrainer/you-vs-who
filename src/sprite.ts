import type { FighterState } from './engine'
import { FIGHTER_W, FIGHTER_H, GROUND_Y } from './engine'

function rect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h))
}

export function drawFighter(ctx: CanvasRenderingContext2D, f: FighterState) {
  const p = f.character.palette
  const baseX = f.x
  const bob = f.state === 'idle' || f.state === 'walk' ? Math.sin(f.bobPhase) * 1.4 : 0
  const legOffset = f.state === 'walk' ? Math.sin(f.bobPhase * 3) * 3 : 0
  const y = GROUND_Y - FIGHTER_H + bob

  const lean = f.state === 'punch' || f.state === 'special' ? f.facing * 4 : 0
  const crouch = f.state === 'block' ? 4 : 0
  const flat = f.state === 'ko'

  ctx.save()
  if (flat) {
    ctx.translate(baseX + FIGHTER_W / 2, GROUND_Y - 6)
    ctx.rotate((f.facing * Math.PI) / 2)
    ctx.translate(-(baseX + FIGHTER_W / 2), -(GROUND_Y - 6))
  }

  // shadow
  ctx.globalAlpha = 0.35
  rect(ctx, baseX - 2, GROUND_Y - 3, FIGHTER_W + 4, 4, '#000000')
  ctx.globalAlpha = 1

  const flashOn = f.hitFlash > 0 && Math.floor(f.hitFlash / 60) % 2 === 0
  const skin = flashOn ? '#ffffff' : p.skin
  const outfit = flashOn ? '#ffffff' : p.outfit
  const outfitDark = flashOn ? '#dddddd' : p.outfitDark
  const hair = flashOn ? '#ffffff' : p.hair

  const x = baseX + lean
  const legY = y + 24 + crouch

  // legs
  rect(ctx, x + 4, legY, 6, 16 - crouch, outfitDark)
  rect(ctx, x + FIGHTER_W - 10, legY + legOffset * 0.3, 6, 16 - crouch, outfitDark)

  // torso
  rect(ctx, x + 2, y + 10 + crouch, FIGHTER_W - 4, 16, outfit)
  rect(ctx, x + 2, y + 10 + crouch, FIGHTER_W - 4, 3, p.accent)

  // head
  rect(ctx, x + 5, y + crouch, FIGHTER_W - 10, 11, skin)
  rect(ctx, x + 4, y - 3 + crouch, FIGHTER_W - 8, 5, hair)

  // arms depending on state
  const armY = y + 12 + crouch
  if (f.state === 'punch') {
    rect(ctx, x + (f.facing === 1 ? FIGHTER_W - 2 : -10), armY, 12, 5, skin)
  } else if (f.state === 'grab') {
    rect(ctx, x + (f.facing === 1 ? FIGHTER_W - 4 : -10), armY - 2, 14, 6, skin)
  } else if (f.state === 'special') {
    rect(ctx, x + (f.facing === 1 ? FIGHTER_W - 2 : -14), armY - 4, 16, 6, p.accent)
  } else if (f.state === 'block') {
    rect(ctx, x + (f.facing === 1 ? FIGHTER_W - 6 : 0), armY, 8, 10, skin)
  } else {
    rect(ctx, x, armY, 4, 12, skin)
    rect(ctx, x + FIGHTER_W - 4, armY, 4, 12, skin)
  }

  ctx.restore()
}

export function drawHealthBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  health: number,
  maxHealth: number,
  flip: boolean,
) {
  const segments = 10
  const segW = (w - (segments - 1)) / segments
  const filled = Math.round((health / maxHealth) * segments)
  rect(ctx, x - 1, y - 1, w + 2, 8, '#000000')
  for (let i = 0; i < segments; i++) {
    const idx = flip ? segments - 1 - i : i
    const on = idx < filled
    const color = !on ? '#3a3a3a' : filled <= 3 ? '#ba1a1a' : filled <= 6 ? '#fc5841' : '#afd44b'
    rect(ctx, x + i * (segW + 1), y, segW, 6, color)
  }
}
