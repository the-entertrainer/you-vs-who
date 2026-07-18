// Sprite frames sourced from "Stick Figure Character Sprites 2D" (CC0, Raphael Gonçalves).
// Cropped to a shared 220x228 bounding box so animation motion stays anchored.
//
// Multi-character ready: every folder under src/assets/<characterId>/ is picked
// up automatically. To add a new fighter, drop its frames in a new folder
// following the same naming convention (Idle_/walk_/run_/dash_/jump_/
// air_attack_/hit_/death_/combo_) and register it in src/characters.ts —
// no changes needed here.

export const DEFAULT_CHARACTER = 'fighter'

const frameModules = import.meta.glob('./assets/*/*.png', { eager: true, import: 'default' }) as Record<string, string>

function framesFor(characterId: string, prefix: string): string[] {
  const marker = `/assets/${characterId}/`
  return Object.entries(frameModules)
    .filter(([path]) => {
      const idx = path.indexOf(marker)
      if (idx === -1) return false
      return path.slice(idx + marker.length).startsWith(prefix)
    })
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
    .map(([, url]) => url)
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
  | 'slide'
  | 'climb'
  | 'comboJab'
  | 'comboCross'
  | 'comboFinisher'

interface ClipDef {
  frames: string[]
  fps: number
  loop: boolean
}

const clipsCache = new Map<string, Record<AnimName, ClipDef>>()

/** Builds (and caches) the animation clip table for a given character folder. */
export function getClips(characterId: string): Record<AnimName, ClipDef> {
  const cached = clipsCache.get(characterId)
  if (cached) return cached

  const allCombo = framesFor(characterId, 'combo_')
  // 19-frame combo (0064-0082) split into a 3-hit string: jab / cross / finisher
  const comboJab = allCombo.slice(0, 6)
  const comboCross = allCombo.slice(6, 13)
  const comboFinisher = allCombo.slice(13, 19)

  const clips: Record<AnimName, ClipDef> = {
    idle: { frames: framesFor(characterId, 'Idle_'), fps: 8, loop: true },
    walk: { frames: framesFor(characterId, 'walk_'), fps: 16, loop: true },
    run: { frames: framesFor(characterId, 'run_'), fps: 20, loop: true },
    dash: { frames: framesFor(characterId, 'dash_'), fps: 22, loop: false },
    jump: { frames: framesFor(characterId, 'jump_'), fps: 15, loop: false },
    airAttack: { frames: framesFor(characterId, 'air_attack_'), fps: 14, loop: false },
    hit: { frames: framesFor(characterId, 'hit_'), fps: 16, loop: false },
    death: { frames: framesFor(characterId, 'death_'), fps: 12, loop: false },
    wallslide: { frames: framesFor(characterId, 'wallslide'), fps: 8, loop: false },
    slide: { frames: framesFor(characterId, 'slide_'), fps: 24, loop: false },
    climb: { frames: framesFor(characterId, 'climb_'), fps: 12, loop: false },
    comboJab: { frames: comboJab, fps: 26, loop: false },
    comboCross: { frames: comboCross, fps: 26, loop: false },
    comboFinisher: { frames: comboFinisher, fps: 20, loop: false },
  }
  clipsCache.set(characterId, clips)
  return clips
}

// Kept as the reference clip table for engine.ts's frame-count/fps timing math,
// which is shared across characters for consistent gameplay balance.
export const CLIPS = getClips(DEFAULT_CHARACTER)

const preloaded: HTMLImageElement[] = []
export function preloadSprites(characterIds: string[] = [DEFAULT_CHARACTER]): Promise<void> {
  const urls = new Set<string>()
  characterIds.forEach((id) => {
    Object.values(getClips(id)).forEach((c) => c.frames.forEach((f) => urls.add(f)))
  })
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
