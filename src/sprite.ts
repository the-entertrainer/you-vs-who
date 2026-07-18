import { getClips, getImage, type AnimName } from './anim'
import type { FighterAnim, FighterState } from './engine'
import { GROUND_Y, SPRITE_H, SPRITE_W } from './engine'

function clipFor(anim: FighterAnim): AnimName {
  switch (anim) {
    case 'dashAttack':
      return 'dash'
    case 'slideKick':
      return 'slide'
    case 'leapfrog':
      return 'climb'
    case 'leapfrogLand':
      return 'wallslide'
    case 'block':
      return 'idle'
    case 'launched':
      return 'hit'
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

// Measured from the source frames: standing/walking poses put the feet at
// source-image y≈193 out of a 228px-tall crop, i.e. 35px of empty footroom
// below the feet. Scaled to SPRITE_H this is the offset that plants the
// feet exactly on the ground line instead of floating above it.
const FOOT_MARGIN = (35 / 228) * SPRITE_H

export function drawFighter(ctx: CanvasRenderingContext2D, f: FighterState, isPlayer = false) {
  const clip = getClips(f.characterId)[clipFor(f.anim)]
  const src = clip.frames[Math.min(f.frame, clip.frames.length - 1)]
  if (!src) return
  const img = getImage(src)

  const cx = f.x
  const airLift = GROUND_Y - f.y // positive while airborne (feet above ground line)

  ctx.save()

  // ground shadow, fades and shrinks while airborne
  const shadowScale = Math.max(0.22, 1 - airLift / 220)
  ctx.globalAlpha = 0.32 * shadowScale
  ctx.fillStyle = '#000000'
  ctx.beginPath()
  ctx.ellipse(cx, GROUND_Y + 6, SPRITE_W * 0.32 * shadowScale, 7 * shadowScale, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalAlpha = 1

  // player-only ground ring so they read as "you" at a glance in a crowd
  if (isPlayer) {
    ctx.globalAlpha = 0.55 * shadowScale
    ctx.strokeStyle = '#5cc9ff'
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.ellipse(cx, GROUND_Y + 6, SPRITE_W * 0.36 * shadowScale, 8 * shadowScale, 0, 0, Math.PI * 2)
    ctx.stroke()
    ctx.globalAlpha = 1
  }

  // feet anchored at f.y (ground line when grounded)
  ctx.translate(cx, f.y + FOOT_MARGIN)
  // Flip before rotating so spin direction reads the same regardless of
  // which way the fighter was facing when launched.
  if (f.facing === -1) ctx.scale(-1, 1)
  if (f.anim === 'launched') {
    // Pivot around the sprite's visual center of mass, not the foot anchor —
    // rotating about the feet made a launched fighter orbit an invisible
    // point below them instead of tumbling like a ragdoll.
    const centerY = -(SPRITE_H + FOOT_MARGIN) / 2
    ctx.translate(0, centerY)
    ctx.rotate(f.spinAngle)
    ctx.translate(0, -centerY)
  }

  const flashOn = f.hitFlash > 0 && Math.floor(f.hitFlash / 55) % 2 === 0

  tintCtx.clearRect(0, 0, SPRITE_W, SPRITE_H)
  tintCtx.filter = f.anim === 'block' ? 'brightness(0.7)' : 'none'
  tintCtx.drawImage(img, 0, 0, SPRITE_W, SPRITE_H)
  tintCtx.filter = 'none'
  tintCtx.globalCompositeOperation = 'source-atop'
  tintCtx.fillStyle = flashOn ? '#ffffff' : f.tint
  tintCtx.fillRect(0, 0, SPRITE_W, SPRITE_H)
  tintCtx.globalCompositeOperation = 'source-over'

  // soft dark contact shadow around the whole silhouette — keeps every
  // fighter readable against busy photo backdrops instead of blending in
  ctx.shadowColor = isPlayer ? 'rgba(30, 60, 120, 0.85)' : 'rgba(0, 0, 0, 0.65)'
  ctx.shadowBlur = isPlayer ? 10 : 5
  ctx.drawImage(tintCanvas, -SPRITE_W / 2, -SPRITE_H)
  ctx.shadowBlur = 0

  // Cheap directional rim-light: the same silhouette redrawn shifted
  // up-left and additively blended, standing in for a key light without a
  // real lighting pass — gives the flat sprite a hint of 3D roundness.
  ctx.globalCompositeOperation = 'lighter'
  ctx.globalAlpha = 0.3
  ctx.drawImage(tintCanvas, -SPRITE_W / 2 - 1.5, -SPRITE_H - 1.5)
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'

  ctx.restore()
}
