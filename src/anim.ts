// Sprite frames sourced from "Stick Figure Character Sprites 2D" (CC0, Raphael Gonçalves).
// Cropped to a shared 220x228 bounding box so animation motion stays anchored.

const frameModules = import.meta.glob('./assets/fighter/*.png', { eager: true, import: 'default' }) as Record<string, string>

function framesFor(prefix: string): string[] {
  const entries = Object.entries(frameModules)
    .filter(([path]) => path.includes(`/${prefix}`))
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
  return entries.map(([, url]) => url)
}

export type AnimName =
  | 'idle'
  | 'walk'
  | 'run'
  | 'dash'
  | 'jump'
  | 'airAttack'
  | 'hit'
  | 'death'
  | 'wallslide'
  | 'comboJab'
  | 'comboCross'
  | 'comboFinisher'

interface ClipDef {
  frames: string[]
  fps: number
  loop: boolean
}

const allCombo = framesFor('combo_')
// 19-frame combo (0064-0082) split into a 3-hit string: jab / cross / finisher
const comboJab = allCombo.slice(0, 6)
const comboCross = allCombo.slice(6, 13)
const comboFinisher = allCombo.slice(13, 19)

export const CLIPS: Record<AnimName, ClipDef> = {
  idle: { frames: framesFor('Idle_'), fps: 6, loop: true },
  walk: { frames: framesFor('walk_'), fps: 12, loop: true },
  run: { frames: framesFor('run_'), fps: 14, loop: true },
  dash: { frames: framesFor('dash_'), fps: 16, loop: false },
  jump: { frames: framesFor('jump_'), fps: 12, loop: false },
  airAttack: { frames: framesFor('air_attack_'), fps: 10, loop: false },
  hit: { frames: framesFor('hit_'), fps: 12, loop: false },
  death: { frames: framesFor('death_'), fps: 10, loop: false },
  wallslide: { frames: framesFor('wallslide'), fps: 8, loop: true },
  comboJab: { frames: comboJab, fps: 18, loop: false },
  comboCross: { frames: comboCross, fps: 18, loop: false },
  comboFinisher: { frames: comboFinisher, fps: 14, loop: false },
}

const preloaded: HTMLImageElement[] = []
export function preloadSprites(): Promise<void> {
  const urls = new Set<string>()
  Object.values(CLIPS).forEach((c) => c.frames.forEach((f) => urls.add(f)))
  const imgs = Array.from(urls).map((src) => {
    const img = new Image()
    img.src = src
    preloaded.push(img)
    return new Promise<void>((resolve) => {
      if (img.complete) resolve()
      else {
        img.onload = () => resolve()
        img.onerror = () => resolve()
      }
    })
  })
  return Promise.all(imgs).then(() => undefined)
}

const imageCache = new Map<string, HTMLImageElement>()
export function getImage(src: string): HTMLImageElement {
  let img = imageCache.get(src)
  if (!img) {
    img = new Image()
    img.src = src
    imageCache.set(src, img)
  }
  return img
}

export function clipDuration(name: AnimName): number {
  const c = CLIPS[name]
  return c.frames.length / c.fps
}
