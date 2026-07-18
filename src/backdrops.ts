// Pixel-art office backdrops. One is picked per wave (cycling through the
// list) so the run visually escalates through different corners of the
// building instead of staying on one static arena.

const modules = import.meta.glob('./assets/backdrops/*.jpg', { eager: true, import: 'default' }) as Record<string, string>

export interface Backdrop {
  id: string
  name: string
  src: string
}

export const BACKDROPS: Backdrop[] = Object.entries(modules)
  .map(([path, src]) => {
    const id = path.split('/').pop()!.replace('.jpg', '')
    return { id, src, name: nameFor(id) }
  })
  .sort((a, b) => a.id.localeCompare(b.id))

function nameFor(id: string): string {
  switch (id) {
    case 'office_day':
      return 'THE BULLPEN'
    case 'office_noir':
      return 'THE GRAVEYARD SHIFT'
    case 'office_arcade':
      return 'THE BREAK ROOM'
    case 'office_newsroom':
      return 'THE NEWSROOM'
    case 'office_cyberpunk':
      return 'THE SERVER ROOM'
    default:
      return id.toUpperCase()
  }
}

export function backdropForWave(wave: number): Backdrop {
  return BACKDROPS[(wave - 1) % BACKDROPS.length]
}

const imageCache = new Map<string, HTMLImageElement>()
export function getBackdropImage(src: string): HTMLImageElement {
  let img = imageCache.get(src)
  if (!img) {
    img = new Image()
    img.src = src
    imageCache.set(src, img)
  }
  return img
}

export function preloadBackdrops(): Promise<void> {
  return Promise.all(
    BACKDROPS.map(
      (b) =>
        new Promise<void>((resolve) => {
          const img = getBackdropImage(b.src)
          if (img.complete) resolve()
          else {
            img.onload = () => resolve()
            img.onerror = () => resolve()
          }
        }),
    ),
  ).then(() => undefined)
}
