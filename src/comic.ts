// Hand-drawn comic-book hit effects: jagged starburst callouts + bold
// rotated onomatopoeia, drawn straight on the canvas (no sprite assets).

export const ONOMATOPOEIA = ['POW!', 'BAM!', 'KAPOW!', 'WHACK!', 'BOOM!', 'ZOK!', 'THWACK!', 'BONK!', 'SMACK!']

// The over-the-top callout for a combo finisher that sends someone flying —
// absurd Bollywood-fight-scene energy.
export const LAUNCH_LINES = ['SENT FLYING!!', 'OUTTA HERE!!', 'BLASTOFF!!', 'YEET!!', 'BYE BYE!!', 'MASALA KICK!!']

const BURST_COLORS = ['#ffd23f', '#ee2b2b', '#1c3fa8']

function seededRand(seed: number) {
  let s = seed % 2147483647
  if (s <= 0) s += 2147483646
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

/** age/maxAge drive a quick pop-in-then-fade envelope, 0..1 */
function popEnvelope(t: number): number {
  if (t < 0.25) return t / 0.25 // 0 -> 1
  if (t < 0.4) return 1 + (1 - (t - 0.25) / 0.15) * 0.25 // slight overshoot settle
  return 1
}

export function drawBurst(ctx: CanvasRenderingContext2D, x: number, y: number, age: number, maxAge: number, seed: number, big = false) {
  const t = Math.min(1, age / maxAge)
  if (t >= 1) return
  const rand = seededRand(seed)
  const spikes = 10 + Math.floor(rand() * 4)
  const baseR = (big ? 34 : 20) + rand() * (big ? 10 : 6)
  const scale = popEnvelope(t) * (1 - Math.max(0, (t - 0.6) / 0.4) * 0.15)
  const alpha = t < 0.75 ? 1 : 1 - (t - 0.75) / 0.25
  const rotation = (seed % 7) * 0.15

  ctx.save()
  ctx.globalAlpha = alpha
  ctx.translate(x, y)
  ctx.rotate(rotation)
  ctx.scale(scale, scale)

  ctx.beginPath()
  for (let i = 0; i < spikes * 2; i++) {
    const ang = (Math.PI * 2 * i) / (spikes * 2)
    const isOuter = i % 2 === 0
    const jitter = 0.82 + rand() * 0.36
    const r = (isOuter ? baseR : baseR * 0.42) * jitter
    const px = Math.cos(ang) * r
    const py = Math.sin(ang) * r
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.closePath()
  ctx.fillStyle = BURST_COLORS[seed % BURST_COLORS.length]
  ctx.fill()
  ctx.lineWidth = 3
  ctx.strokeStyle = '#0a0a0a'
  ctx.stroke()
  ctx.restore()
}

export function drawComicText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  age: number,
  maxAge: number,
  seed: number,
  fontSize = 26,
) {
  const t = Math.min(1, age / maxAge)
  if (t >= 1) return
  const scale = popEnvelope(t)
  const alpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3
  const rise = t * 16
  const rotation = ((seed % 5) - 2) * 0.05

  ctx.save()
  ctx.globalAlpha = alpha
  ctx.translate(x, y - rise)
  ctx.rotate(rotation)
  ctx.scale(scale, scale)
  ctx.font = `${fontSize}px "BoldPixels", "Space Mono", sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  ctx.lineWidth = fontSize * 0.19
  ctx.strokeStyle = '#0a0a0a'
  ctx.strokeText(text, 0, 0)
  ctx.fillStyle = '#fff6e5'
  ctx.fillText(text, 0, 0)
  ctx.restore()
}

const POWERUP_COLORS: Record<string, string> = { slide: '#ffa23f', leapfrog: '#3fd0ee' }
const POWERUP_LABELS: Record<string, string> = { slide: 'S', leapfrog: 'L' }

/** A pulsing pickup orb marking a power-up on the ground, with a bobbing float and letter tag. */
export function drawPowerUp(ctx: CanvasRenderingContext2D, x: number, y: number, kind: string, clock: number) {
  const bob = Math.sin(clock * 3.2) * 4
  const pulse = 0.9 + Math.sin(clock * 5) * 0.08
  const color = POWERUP_COLORS[kind] ?? '#fff'

  ctx.save()
  ctx.translate(x, y + bob)
  ctx.scale(pulse, pulse)

  ctx.beginPath()
  ctx.arc(0, 0, 12, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.fill()
  ctx.lineWidth = 2.5
  ctx.strokeStyle = '#0a0a0a'
  ctx.stroke()

  ctx.font = `12px "BoldPixels", "Space Mono", sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#0a0a0a'
  ctx.fillText(POWERUP_LABELS[kind] ?? '?', 0, 1)
  ctx.restore()
}

export function pickOnomatopoeia(): string {
  return ONOMATOPOEIA[Math.floor(Math.random() * ONOMATOPOEIA.length)]
}

export function pickLaunchLine(): string {
  return LAUNCH_LINES[Math.floor(Math.random() * LAUNCH_LINES.length)]
}
