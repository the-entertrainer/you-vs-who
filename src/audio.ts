let ctx: AudioContext | null = null
let muted = false

export function setMuted(v: boolean) {
  muted = v
}
export function isMuted() {
  return muted
}

function getCtx(): AudioContext | null {
  if (muted) return null
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const AC = window.AudioContext || (window as any).webkitAudioContext
    if (!AC) return null
    ctx = new AC()
  }
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

interface Tone {
  freq: number
  duration: number
  type?: OscillatorType
  gain?: number
  slideTo?: number
}

function playTone({ freq, duration, type = 'square', gain = 0.08, slideTo }: Tone) {
  const c = getCtx()
  if (!c) return
  const osc = c.createOscillator()
  const gainNode = c.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, c.currentTime)
  if (slideTo) osc.frequency.linearRampToValueAtTime(slideTo, c.currentTime + duration)
  gainNode.gain.setValueAtTime(gain, c.currentTime)
  gainNode.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration)
  osc.connect(gainNode)
  gainNode.connect(c.destination)
  osc.start()
  osc.stop(c.currentTime + duration)
}

export function sfxUnlock() {
  getCtx()
}

export function sfxMenuMove() {
  playTone({ freq: 320, duration: 0.05, type: 'square', gain: 0.05 })
}

export function sfxMenuConfirm() {
  playTone({ freq: 440, duration: 0.08, type: 'square', gain: 0.07 })
  setTimeout(() => playTone({ freq: 660, duration: 0.09, type: 'square', gain: 0.07 }), 60)
}

export function sfxPunch() {
  playTone({ freq: 180, duration: 0.08, type: 'square', gain: 0.09, slideTo: 90 })
}

export function sfxGrab() {
  playTone({ freq: 140, duration: 0.16, type: 'sawtooth', gain: 0.08, slideTo: 60 })
}

export function sfxSpecial() {
  playTone({ freq: 220, duration: 0.24, type: 'square', gain: 0.1, slideTo: 720 })
}

export function sfxBlock() {
  playTone({ freq: 500, duration: 0.05, type: 'triangle', gain: 0.06 })
}

export function sfxWin() {
  const notes = [523, 659, 784, 1046]
  notes.forEach((f, i) => setTimeout(() => playTone({ freq: f, duration: 0.18, type: 'square', gain: 0.08 }), i * 110))
}

export function sfxLose() {
  const notes = [392, 330, 262]
  notes.forEach((f, i) => setTimeout(() => playTone({ freq: f, duration: 0.22, type: 'sawtooth', gain: 0.07 }), i * 140))
}
