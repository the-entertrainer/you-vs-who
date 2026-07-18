import { CLIPS, getImage, type AnimName } from './anim'
import type { FighterAnim, FighterState } from './engine'
import { GROUND_Y, SPRITE_H, SPRITE_W } from './engine'

function clipFor(anim: FighterAnim): AnimName {
  switch (anim) {
    case 'dashAttack':
      return 'dash'
    case 'block':
      return 'idle'
    default:
      return anim as AnimName
  }
}

// Offscreen buffer used to isolate the tint recolor to the sprite's own
// silhouette (source-atop against the main canvas would also paint the
// already-drawn background underneath it).
const tintCanvas = document.createElement('canvas')
tintCanvas.width = SPRITE_W
tintCanvas.height = SPRITE_H
const tintCtx = tintCanvas.getContext('2d')!

export function drawFighter(ctx: CanvasRenderingContext2D, f: FighterState, tint: 'p1' | 'p2') {
  const clip = CLIPS[clipFor(f.anim)]
  const src = clip.frames[Math.min(f.frame, clip.frames.length - 1)]
  if (!src) return
  const img = getImage(src)

  const cx = f.x
  const airLift = GROUND_Y - f.y // positive while airborne (feet above ground line)

  ctx.save()

  // ground shadow, fades and shrinks while airborne
  const shadowScale = Math.max(0.35, 1 - airLift / 160)
  ctx.globalAlpha = 0.32 * shadowScale
  ctx.fillStyle = '#000000'
  ctx.beginPath()
  ctx.ellipse(cx, GROUND_Y + 6, SPRITE_W * 0.32 * shadowScale, 7 * shadowScale, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalAlpha = 1

  // feet anchored at f.y, sprite has ~14px of empty footroom baked into the crop
  ctx.translate(cx, f.y - 14)
  if (f.facing === -1) ctx.scale(-1, 1)

  const flashOn = f.hitFlash > 0 && Math.floor(f.hitFlash / 55) % 2 === 0

  tintCtx.clearRect(0, 0, SPRITE_W, SPRITE_H)
  tintCtx.filter = f.anim === 'block' ? 'brightness(0.7)' : 'none'
  tintCtx.drawImage(img, 0, 0, SPRITE_W, SPRITE_H)
  tintCtx.filter = 'none'
  tintCtx.globalCompositeOperation = 'source-atop'
  tintCtx.fillStyle = flashOn ? '#ffffff' : tint === 'p1' ? 'rgba(46, 94, 158, 0.5)' : 'rgba(198, 42, 32, 0.5)'
  tintCtx.fillRect(0, 0, SPRITE_W, SPRITE_H)
  tintCtx.globalCompositeOperation = 'source-over'

  ctx.drawImage(tintCanvas, -SPRITE_W / 2, -SPRITE_H)
  ctx.restore()
}
