// Weapon overlays layered on top of the existing stickman sprite — the guns
// are real pixel-art (a 12-gun "High Res" pack), the lightsaber and bullets
// are procedurally drawn glow shapes. Everything anchors to an approximate
// hand position and is driven by the same animation timeline the fists
// already use — no new character art or per-move rigging needed.

import type { FighterState, Projectile } from './engine'
import { SPRITE_H } from './engine'

const ATTACK_ANIMS = new Set(['comboJab', 'comboCross', 'comboFinisher', 'dashAttack', 'airAttack'])

function handAnchor(f: FighterState): [number, number] {
  return [f.x, f.y - SPRITE_H * 0.4]
}

// 12 hand-drawn pixel guns, all sourced facing right — matches this game's
// facing=1 convention, so no per-sprite mirroring correction is needed.
const gunModules = import.meta.glob('./assets/guns/*.png', { eager: true, import: 'default' }) as Record<string, string>
const GUN_SRCS = Object.entries(gunModules)
  .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
  .map(([, url]) => url)
const GUN_IMAGES: HTMLImageElement[] = GUN_SRCS.map((src) => {
  const img = new Image()
  img.src = src
  return img
})

// Source guns range from a stubby 49x14 pistol to a long 102x36 SMG. Scaling
// every one to a fixed width made the long guns look thin and the stubby
// ones look tiny — fitting each into the same bounding box instead keeps
// every gun a consistent, chunky, "cartoony prop" size relative to the
// character (roughly half the sprite's own width) no matter its native
// aspect ratio.
const GUN_MAX_W = 46
const GUN_MAX_H = 26

/** The fighter's randomly-dealt pixel-art gun, held forward, with a bright muzzle flash on the frame it fires. */
export function drawGunOverlay(ctx: CanvasRenderingContext2D, f: FighterState) {
  if (f.weapon !== 'gun' || GUN_IMAGES.length === 0) return
  const img = GUN_IMAGES[f.gunVariant % GUN_IMAGES.length]
  const [hx, hy] = handAnchor(f)
  ctx.save()
  ctx.translate(hx, hy)
  ctx.scale(f.facing, 1)

  const nw = img.naturalWidth || 60
  const nh = img.naturalHeight || 20
  const scale = Math.min(GUN_MAX_W / nw, GUN_MAX_H / nh)
  const w = nw * scale
  const h = nh * scale
  if (img.complete && img.naturalWidth > 0) {
    ctx.drawImage(img, -6, -h / 2, w, h)
  }

  const firing = ATTACK_ANIMS.has(f.anim) && !f.moveHasHit && f.frame >= (f.anim === 'comboFinisher' ? 2 : 1)
  if (firing) {
    const mx = w - 8
    const grad = ctx.createRadialGradient(mx, 0, 0, mx, 0, 14)
    grad.addColorStop(0, 'rgba(255, 230, 160, 0.9)')
    grad.addColorStop(1, 'rgba(255, 180, 60, 0)')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(mx, 0, 14, 0, Math.PI * 2)
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
