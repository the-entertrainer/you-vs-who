function vibrate(pattern: number | number[]) {
  if (typeof navigator === 'undefined' || !navigator.vibrate) return
  try {
    navigator.vibrate(pattern)
  } catch {
    // ignore unsupported/blocked vibration
  }
}

export const hapticLight = () => vibrate(10)
export const hapticMedium = () => vibrate(25)
export const hapticStrong = () => vibrate([30, 20, 40])
