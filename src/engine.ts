import { CLIPS, DEFAULT_CHARACTER, type AnimName } from './anim'

export const ARENA_W = 480
export const ARENA_H = 270
export const GROUND_Y = 208
export const SPRITE_W = 132
export const SPRITE_H = 137
export const MAX_HEALTH = 100

export const WALK_SPEED = 112
export const RUN_SPEED = 236
export const JUMP_VELOCITY = -380
export const GRAVITY = 1050

// "Sent flying" launch physics — the over-the-top payoff for landing a
// full 3-hit combo finisher. Big horizontal yeet, floaty hang-time arc,
// fast spin, comedic Bollywood-fight-scene energy.
export const LAUNCH_VX = 520
export const LAUNCH_VY = -320
export const LAUNCH_GRAVITY = 620
export const LAUNCH_SPIN = 18 // radians/sec

export type FighterAnim =
  | 'idle'
  | 'walk'
  | 'run'
  | 'jump'
  | 'airAttack'
  | 'comboJab'
  | 'comboCross'
  | 'comboFinisher'
  | 'dashAttack'
  | 'hit'
  | 'block'
  | 'death'
  | 'launched'

interface MoveSpec {
  clip: AnimName
  activeFrame: number // frame index (0-based) at which the hit lands
  damage: number
  stun: number // ms of hitstun applied to victim
  pushback: number
  range: number
  launches?: boolean // sends the defender flying instead of normal hitstun
}

const JAB: MoveSpec = { clip: 'comboJab', activeFrame: 3, damage: 6, stun: 190, pushback: 10, range: 76 }
const CROSS: MoveSpec = { clip: 'comboCross', activeFrame: 4, damage: 8, stun: 220, pushback: 14, range: 78 }
const FINISHER: MoveSpec = { clip: 'comboFinisher', activeFrame: 3, damage: 17, stun: 480, pushback: 46, range: 82, launches: true }
const AIR_ATTACK: MoveSpec = { clip: 'airAttack', activeFrame: 1, damage: 10, stun: 300, pushback: 24, range: 74 }
const DASH_ATTACK: MoveSpec = { clip: 'dash', activeFrame: 3, damage: 11, stun: 280, pushback: 30, range: 84 }

export interface FightEvent {
  type: 'hit' | 'block' | 'ko' | 'finisher' | 'launch'
  x: number
  y: number
  who: 'a' | 'b'
  damage?: number
}

export interface FighterState {
  side: 'a' | 'b'
  characterId: string
  x: number
  y: number
  vy: number
  grounded: boolean
  facing: 1 | -1
  health: number
  anim: FighterAnim
  frame: number
  frameTimer: number
  comboStep: 0 | 1 | 2 | 3
  chainBuffered: boolean
  activeMove: MoveSpec | null
  moveHasHit: boolean
  hitstunTimer: number
  blocking: boolean
  hitFlash: number
  winner: boolean
  dead: boolean
  moveDir: -1 | 0 | 1
  speedRatio: number // 0 (walk) .. 1 (full run), analog — proportional to drag distance
  wantBlock: boolean
  spinAngle: number
  launchVX: number
  launchVY: number
}

function makeFighter(side: 'a' | 'b', x: number, facing: 1 | -1, characterId: string): FighterState {
  return {
    side,
    characterId,
    x,
    y: GROUND_Y,
    vy: 0,
    grounded: true,
    facing,
    health: MAX_HEALTH,
    anim: 'idle',
    frame: 0,
    frameTimer: 0,
    comboStep: 0,
    chainBuffered: false,
    activeMove: null,
    moveHasHit: false,
    hitstunTimer: 0,
    blocking: false,
    hitFlash: 0,
    winner: false,
    dead: false,
    moveDir: 0,
    speedRatio: 0,
    wantBlock: false,
    spinAngle: 0,
    launchVX: 0,
    launchVY: 0,
  }
}

function clipFor(anim: FighterAnim): AnimName {
  switch (anim) {
    case 'dashAttack':
      return 'dash'
    case 'block':
      return 'idle'
    case 'launched':
      return 'hit'
    default:
      return anim as AnimName
  }
}

export class FightController {
  a: FighterState
  b: FighterState
  time = 60
  over = false
  events: FightEvent[] = []

  constructor(playerCharacterId: string = DEFAULT_CHARACTER, rivalCharacterId: string = DEFAULT_CHARACTER) {
    this.a = makeFighter('a', ARENA_W * 0.28, 1, playerCharacterId)
    this.b = makeFighter('b', ARENA_W * 0.72, -1, rivalCharacterId)
  }

  private isBusy(f: FighterState): boolean {
    return (
      f.anim === 'comboJab' ||
      f.anim === 'comboCross' ||
      f.anim === 'comboFinisher' ||
      f.anim === 'airAttack' ||
      f.anim === 'dashAttack' ||
      f.anim === 'hit' ||
      f.anim === 'death' ||
      f.anim === 'launched'
    )
  }

  canAct(f: FighterState): boolean {
    return !f.dead && !this.over && f.anim !== 'death' && f.anim !== 'hit' && f.anim !== 'launched'
  }

  private startMove(f: FighterState, anim: FighterAnim) {
    f.anim = anim
    f.frame = 0
    f.frameTimer = 0
    f.moveHasHit = false
    f.chainBuffered = false
  }

  attack(f: FighterState) {
    if (!this.canAct(f)) return
    if (!f.grounded) {
      if (f.anim !== 'airAttack') this.startMove(f, 'airAttack')
      return
    }
    if (f.anim === 'run') {
      this.startMove(f, 'dashAttack')
      f.comboStep = 0
      return
    }
    if (this.isBusy(f) && f.anim.startsWith('combo')) {
      if (f.comboStep < 3) f.chainBuffered = true
      return
    }
    f.comboStep = 1
    this.startMove(f, 'comboJab')
  }

  /** Forces a dash-strike from a standstill — used by fast horizontal swipe gestures. */
  swipeStrike(f: FighterState, dir: -1 | 1) {
    if (!this.canAct(f) || !f.grounded || this.isBusy(f)) return
    f.facing = dir
    f.x += dir * 14
    f.x = Math.max(24, Math.min(ARENA_W - 24, f.x))
    this.startMove(f, 'dashAttack')
    f.comboStep = 0
  }

  setBlocking(f: FighterState, on: boolean) {
    f.wantBlock = on
    if (this.canAct(f) && f.grounded && !this.isBusy(f)) {
      f.blocking = on
      if (on) {
        f.anim = 'block'
        f.frame = 0
      }
    }
  }

  jump(f: FighterState) {
    if (!this.canAct(f) || !f.grounded || this.isBusy(f)) return
    f.vy = JUMP_VELOCITY
    f.grounded = false
    f.anim = 'jump'
    f.frame = 0
    f.frameTimer = 0
  }

  /** speedRatio: 0 = walk pace, 1 = full run — analog so drag distance maps smoothly to speed. */
  move(f: FighterState, dir: -1 | 0 | 1, speedRatio: number) {
    f.moveDir = dir
    f.speedRatio = Math.max(0, Math.min(1, speedRatio))
  }

  private moveSpecFor(anim: FighterAnim): MoveSpec | null {
    if (anim === 'comboJab') return JAB
    if (anim === 'comboCross') return CROSS
    if (anim === 'comboFinisher') return FINISHER
    if (anim === 'airAttack') return AIR_ATTACK
    if (anim === 'dashAttack') return DASH_ATTACK
    return null
  }

  private resolveHit(attacker: FighterState, defender: FighterState, move: MoveSpec) {
    const dist = Math.abs(attacker.x - defender.x)
    if (dist > move.range) return
    const facingRight = attacker.x < defender.x
    if ((facingRight && attacker.facing !== 1) || (!facingRight && attacker.facing !== -1)) return

    const dir = facingRight ? 1 : -1
    if (defender.blocking) {
      defender.x += dir * (move.pushback * 0.35)
      defender.x = Math.max(24, Math.min(ARENA_W - 24, defender.x))
      this.events.push({ type: 'block', x: defender.x, y: GROUND_Y - 90, who: defender.side })
      return
    }

    defender.health = Math.max(0, defender.health - move.damage)
    defender.blocking = false
    defender.comboStep = 0
    defender.hitFlash = 160

    if (move.launches) {
      defender.anim = 'launched'
      defender.frame = 0
      defender.frameTimer = 0
      defender.grounded = false
      defender.spinAngle = 0
      defender.launchVX = dir * LAUNCH_VX
      defender.launchVY = LAUNCH_VY
      this.events.push({ type: 'launch', x: defender.x, y: GROUND_Y - 100, who: defender.side, damage: move.damage })
    } else {
      defender.x += dir * move.pushback
      defender.x = Math.max(24, Math.min(ARENA_W - 24, defender.x))
      defender.anim = 'hit'
      defender.frame = 0
      defender.frameTimer = 0
      defender.hitstunTimer = move.stun
      const kind = move.damage >= 12 ? 'finisher' : 'hit'
      this.events.push({ type: kind, x: defender.x, y: GROUND_Y - 100, who: defender.side, damage: move.damage })
    }

    if (defender.health <= 0 && !defender.dead) {
      defender.dead = true
      if (!move.launches) {
        defender.anim = 'death'
        defender.frame = 0
        defender.frameTimer = 0
        this.events.push({ type: 'ko', x: defender.x, y: GROUND_Y - 100, who: defender.side })
      }
      // if launched, the KO event fires on landing instead — see updateFighter
    }
  }

  private updateFighter(f: FighterState, dt: number, opponent: FighterState) {
    const dtMs = dt * 1000

    if (f.hitFlash > 0) f.hitFlash = Math.max(0, f.hitFlash - dtMs)

    if (f.dead && f.anim !== 'launched') {
      this.stepAnim(f, dt)
      return
    }

    if (f.anim === 'launched') {
      f.x += f.launchVX * dt
      f.launchVX *= Math.pow(0.98, dt * 60)
      f.launchVY += LAUNCH_GRAVITY * dt
      f.y += f.launchVY * dt
      f.spinAngle += LAUNCH_SPIN * dt
      f.x = Math.max(18, Math.min(ARENA_W - 18, f.x))
      this.stepAnim(f, dt)
      if (f.y >= GROUND_Y) {
        f.y = GROUND_Y
        f.grounded = true
        f.spinAngle = 0
        if (f.dead) {
          f.anim = 'death'
          f.frame = 0
          f.frameTimer = 0
          this.events.push({ type: 'ko', x: f.x, y: GROUND_Y - 100, who: f.side })
        } else {
          f.anim = 'hit'
          f.frame = 0
          f.frameTimer = 0
          f.hitstunTimer = 420
        }
      }
      return
    }

    if (f.anim === 'hit') {
      f.hitstunTimer -= dtMs
      this.stepAnim(f, dt)
      if (f.hitstunTimer <= 0) {
        f.anim = f.grounded ? 'idle' : 'jump'
        f.frame = 0
      }
      return
    }

    if (!f.grounded) {
      f.vy += GRAVITY * dt
      f.y += f.vy * dt
      if (f.y >= GROUND_Y) {
        f.y = GROUND_Y
        f.vy = 0
        f.grounded = true
        if (f.anim === 'jump' || f.anim === 'airAttack') f.anim = 'idle'
      }
    }

    const activeMove = this.moveSpecFor(f.anim)

    if (activeMove) {
      if (!f.moveHasHit && f.frame >= activeMove.activeFrame) {
        f.moveHasHit = true
        this.resolveHit(f, opponent, activeMove)
      }
      this.stepAnim(f, dt)
      const clip = CLIPS[clipFor(f.anim)]
      const frameDur = 1 / clip.fps
      if (f.frame >= clip.frames.length - 1 && f.frameTimer >= frameDur - 1e-6) {
        if (f.anim === 'comboJab' && f.chainBuffered) {
          f.comboStep = 2
          this.startMove(f, 'comboCross')
        } else if (f.anim === 'comboCross' && f.chainBuffered) {
          f.comboStep = 3
          this.startMove(f, 'comboFinisher')
        } else {
          f.anim = f.grounded ? 'idle' : 'jump'
          f.frame = 0
          f.comboStep = 0
          f.chainBuffered = false
        }
      }
      return
    }

    if (!f.grounded) {
      this.stepAnim(f, dt)
      return
    }

    if (f.wantBlock) {
      f.blocking = true
      f.anim = 'block'
      f.frame = 0
      return
    }
    f.blocking = false

    if (f.moveDir !== 0) {
      f.facing = f.moveDir as 1 | -1
      const speed = WALK_SPEED + (RUN_SPEED - WALK_SPEED) * f.speedRatio
      f.x += f.moveDir * speed * dt
      f.x = Math.max(24, Math.min(ARENA_W - 24, f.x))
      f.anim = f.speedRatio > 0.5 ? 'run' : 'walk'
    } else {
      f.anim = 'idle'
    }
    this.stepAnim(f, dt)
  }

  private stepAnim(f: FighterState, dt: number) {
    const clip = CLIPS[clipFor(f.anim)]
    if (!clip || clip.frames.length === 0) return
    f.frameTimer += dt
    const frameDur = 1 / clip.fps
    while (f.frameTimer >= frameDur) {
      f.frameTimer -= frameDur
      if (f.frame < clip.frames.length - 1) {
        f.frame++
      } else if (clip.loop) {
        f.frame = 0
      } else {
        f.frameTimer = frameDur
        break
      }
    }
  }

  update(dt: number) {
    if (this.over) return
    this.time -= dt
    ;[this.a, this.b].forEach((f) => {
      const other = f === this.a ? this.b : this.a
      if (f.grounded && !this.isBusy(f) && f.anim !== 'block') {
        if (f.moveDir === 0) f.facing = f.x < other.x ? 1 : -1
      }
    })

    this.updateFighter(this.a, dt, this.b)
    this.updateFighter(this.b, dt, this.a)

    if (this.a.dead || this.b.dead || this.time <= 0) {
      const aDone = this.a.anim === 'death' && this.a.frame >= CLIPS.death.frames.length - 1
      const bDone = this.b.anim === 'death' && this.b.frame >= CLIPS.death.frames.length - 1
      if (this.a.dead && this.b.dead) {
        if (aDone || bDone) this.finish()
      } else if (this.a.dead) {
        if (aDone) this.finish()
      } else if (this.b.dead) {
        if (bDone) this.finish()
      } else if (this.time <= 0) {
        this.finish()
      }
    }
  }

  private finish() {
    this.over = true
    if (this.a.health > this.b.health) this.a.winner = true
    else if (this.b.health > this.a.health) this.b.winner = true
  }
}

// ---------------- AI ----------------
// Move categories available to both the player and the AI, and how they
// read on the receiving end:
//   - Jab / Cross        quick pokes, short hitstun, small pushback — pure combo filler
//   - Finisher            the 3rd combo hit — big damage AND launches the
//                          defender into a spinning, screen-crossing "sent
//                          flying" ragdoll (the absurd payoff move)
//   - Dash Strike          a lunging punch that covers ground, used to close
//                          distance aggressively or punish whiffs
//   - Air Strike            aerial attack, used to contest jump-ins or start
//                          offense from above
// The AI mixes all four with tuned probabilities below so it feels like an
// actual opponent rather than a heavy bag: it closes distance with dash
// strikes, contests neutral with jumps into air strikes, blocks reactively
// when the player is mid-combo, and commits hard to finishing chains once
// it starts one.
export interface AIMemory {
  thinkCooldown: number
  wantChain: boolean
  speedRatio: number
}

export function runAI(controller: FightController, ai: FighterState, target: FighterState, mem: AIMemory, dt: number) {
  if (!controller.canAct(ai) || controller.over) {
    ai.moveDir = 0
    ai.wantBlock = false
    return
  }
  mem.thinkCooldown -= dt * 1000
  const dist = Math.abs(ai.x - target.x)
  const strikeRange = 58 // comfortably inside every move's activation range

  if (mem.thinkCooldown <= 0) {
    mem.thinkCooldown = 90 + Math.random() * 130

    const targetBusy = target.anim.startsWith('combo') || target.anim === 'dashAttack' || target.anim === 'airAttack'

    if (dist > strikeRange) {
      ai.moveDir = ai.x < target.x ? 1 : -1
      mem.speedRatio = dist > 140 ? 1 : 0.4
      ai.wantBlock = false
      if (ai.grounded && dist < 210 && dist > strikeRange + 12 && Math.random() < 0.3) {
        controller.swipeStrike(ai, ai.x < target.x ? 1 : -1)
      }
    } else if (dist < strikeRange - 30) {
      ai.moveDir = ai.x < target.x ? -1 : 1
      mem.speedRatio = 0
      ai.wantBlock = false
    } else {
      ai.moveDir = 0
      if (targetBusy && Math.random() < 0.4) {
        ai.wantBlock = true
      } else {
        ai.wantBlock = false
        const roll = Math.random()
        if (roll < 0.65) {
          controller.attack(ai)
          mem.wantChain = Math.random() < 0.85
        } else if (roll < 0.82 && ai.grounded) {
          controller.jump(ai)
          if (Math.random() < 0.6) controller.attack(ai) // follow up with an air strike
        }
      }
    }
  }

  if (ai.anim.startsWith('combo') && mem.wantChain) {
    controller.attack(ai)
  }

  controller.move(ai, ai.moveDir, mem.speedRatio)
  controller.setBlocking(ai, ai.wantBlock)
}
