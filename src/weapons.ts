// Procedurally drawn weapon overlays layered on top of the existing
// stickman sprite — no new character art, just glowing shapes anchored to
// an approximate hand position and driven by the same animation timeline
// the fists already use.

import type { FighterState, Projectile } from './engine'
import { SPRITE_H } from './engine'

const ATTACK_ANIMS = new Set(['comboJab', 'comboCross', 'comboFinisher', 'dashAttack', 'airAttack'])

function handAnchor(f: FighterState): [number, number] {
  return [f.x, f.y - SPRITE_H * 0.4]
}

/** A stubby blaster in the fighter's hand, with a bright muzzle flash on the frame it fires. */
export function drawGunOverlay(ctx: CanvasRenderingContext2D, f: FighterState) {
  if (f.weapon !== 'gun') return
  const [hx, hy] = handAnchor(f)
  ctx.save()
  ctx.translate(hx, hy)
  ctx.scale(f.facing, 1)

  ctx.fillStyle = '#1a1d2b'
  ctx.fillRect(2, -3, 16, 7)
  ctx.fillStyle = '#3a4160'
  ctx.fillRect(2, -3, 16, 3)
  ctx.fillStyle = '#0d0f18'
  ctx.fillRect(16, -1, 8, 3)

  const firing = ATTACK_ANIMS.has(f.anim) && !f.moveHasHit && f.frame >= (f.anim === 'comboFinisher' ? 2 : 1)
  if (firing) {
    const grad = ctx.createRadialGradient(24, 0, 0, 24, 0, 14)
    grad.addColorStop(0, 'rgba(255, 230, 160, 0.9)')
    grad.addColorStop(1, 'rgba(255, 180, 60, 0)')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(24, 0, 14, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

/** A glowing blade whose swing angle tracks the attack animation's frame progress — "heavily animation controlled" by the existing punch/kick timeline instead of new art. */
export function drawLightsaberOverlay(ctx: CanvasRenderingContext2D, f: FighterState) {
  if (f.weapon !== 'lightsaber') return
  const [hx, hy] = handAnchor(f)
  const attacking = ATTACK_ANIMS.has(f.anim)
  const t = attacking ? Math.min(1, f.frame / 6) : 0
  const angle = attacking ? -0.95 + t * 1.9 : 0.35
  const length = attacking ? 30 : 22

  ctx.save()
  ctx.translate(hx, hy)
  ctx.scale(f.facing, 1)
  ctx.rotate(angle)

  ctx.strokeStyle = '#0a0a0a'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(4, 0)
  ctx.stroke()

  const bladeColor = f.isPlayer ? '#5fd0ff' : '#ff5f5f'
  ctx.shadowColor = bladeColor
  ctx.shadowBlur = attacking ? 14 : 8
  ctx.strokeStyle = bladeColor
  ctx.lineWidth = attacking ? 3.5 : 2.5
  ctx.beginPath()
  ctx.moveTo(4, 0)
  ctx.lineTo(4 + length, 0)
  ctx.stroke()
  ctx.lineWidth = 1.2
  ctx.strokeStyle = '#ffffff'
  ctx.beginPath()
  ctx.moveTo(4, 0)
  ctx.lineTo(4 + length, 0)
  ctx.stroke()
  ctx.shadowBlur = 0

  ctx.restore()
}

/** A glowing bolt with a short motion-blur trail — the bullet-hell payload. */
export function drawProjectile(ctx: CanvasRenderingContext2D, p: Projectile) {
  const angle = Math.atan2(p.vy, p.vx)
  ctx.save()
  ctx.translate(p.x, p.y)
  ctx.rotate(angle)

  const grad = ctx.createLinearGradient(-14, 0, 4, 0)
  grad.addColorStop(0, 'rgba(255, 210, 90, 0)')
  grad.addColorStop(1, 'rgba(255, 230, 140, 0.95)')
  ctx.fillStyle = grad
  ctx.fillRect(-14, -1.5, 18, 3)

  ctx.shadowColor = '#ffcf5c'
  ctx.shadowBlur = 8
  ctx.fillStyle = '#fff3c4'
  ctx.beginPath()
  ctx.arc(2, 0, 2.4, 0, Math.PI * 2)
  ctx.fill()
  ctx.shadowBlur = 0

  ctx.restore()
}
