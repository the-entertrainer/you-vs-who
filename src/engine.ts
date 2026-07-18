import type { Character } from './data'
import { HIT_MESSAGES } from './data'

export const ARENA_W = 240
export const ARENA_H = 160
export const GROUND_Y = 132
export const FIGHTER_W = 22
export const FIGHTER_H = 40
export const MAX_HEALTH = 100

export type ActionState =
  | 'idle'
  | 'walk'
  | 'punch'
  | 'grab'
  | 'special'
  | 'block'
  | 'hitstun'
  | 'ko'

export type MoveType = 'punch' | 'grab' | 'special'

interface MoveSpec {
  startup: number
  active: number
  recovery: number
  range: number
  damage: number
  pushback: number
  stun: number
  breaksBlock: boolean
  cooldown: number
}

const MOVES: Record<MoveType, MoveSpec> = {
  punch: { startup: 90, active: 90, recovery: 160, range: 28, damage: 6, pushback: 6, stun: 260, breaksBlock: false, cooldown: 0 },
  grab: { startup: 180, active: 120, recovery: 260, range: 24, damage: 11, pushback: 26, stun: 420, breaksBlock: true, cooldown: 0 },
  special: { startup: 260, active: 160, recovery: 420, range: 46, damage: 16, pushback: 30, stun: 600, breaksBlock: false, cooldown: 2600 },
}

export interface FighterState {
  character: Character
  x: number
  facing: 1 | -1
  health: number
  state: ActionState
  stateTimer: number
  activeMove: MoveType | null
  moveTimer: number
  cooldowns: Record<MoveType, number>
  blocking: boolean
  hitFlash: number
  bobPhase: number
  isWinner: boolean
}

export function createFighter(character: Character, x: number, facing: 1 | -1): FighterState {
  return {
    character,
    x,
    facing,
    health: MAX_HEALTH,
    state: 'idle',
    stateTimer: 0,
    activeMove: null,
    moveTimer: 0,
    cooldowns: { punch: 0, grab: 0, special: 0 },
    blocking: false,
    hitFlash: 0,
    bobPhase: Math.random() * Math.PI * 2,
    isWinner: false,
  }
}

export interface FightEvent {
  type: 'hit' | 'block' | 'special' | 'ko'
  x: number
  y: number
  message?: string
}

export class FightController {
  a: FighterState
  b: FighterState
  events: FightEvent[] = []
  over = false
  winner: FighterState | null = null
  timeUp = false
  timeRemaining = 60

  constructor(charA: Character, charB: Character) {
    this.a = createFighter(charA, 40, 1)
    this.b = createFighter(charB, ARENA_W - 40 - FIGHTER_W, -1)
  }

  canAct(f: FighterState) {
    return f.state === 'idle' || f.state === 'walk' || f.state === 'block'
  }

  move(f: FighterState, dir: -1 | 0 | 1) {
    if (!this.canAct(f) || this.over) return
    if (dir === 0) {
      if (f.state === 'walk') f.state = 'idle'
      return
    }
    f.x += dir * 1.6
    f.x = Math.max(4, Math.min(ARENA_W - FIGHTER_W - 4, f.x))
    f.state = 'walk'
  }

  setBlocking(f: FighterState, on: boolean) {
    if (this.over) return
    if (on && this.canAct(f)) {
      f.blocking = true
      f.state = 'block'
    } else if (!on) {
      f.blocking = false
      if (f.state === 'block') f.state = 'idle'
    }
  }

  attack(f: FighterState, move: MoveType) {
    if (this.over || !this.canAct(f) || f.cooldowns[move] > 0) return false
    f.blocking = false
    f.state = move
    f.activeMove = move
    f.moveTimer = 0
    return true
  }

  private distance() {
    return Math.abs(this.b.x - this.a.x)
  }

  private resolveHit(attacker: FighterState, defender: FighterState, move: MoveSpec) {
    const dist = this.distance()
    if (dist > move.range + FIGHTER_W) return
    const dir = attacker.x < defender.x ? 1 : -1
    if (defender.blocking && !move.breaksBlock) {
      defender.x += dir * (move.pushback * 0.3)
      defender.health = Math.max(0, defender.health - move.damage * 0.12)
      defender.hitFlash = 120
      this.events.push({ type: 'block', x: defender.x, y: GROUND_Y - 20 })
      return
    }
    defender.health = Math.max(0, defender.health - move.damage)
    defender.x += dir * move.pushback
    defender.x = Math.max(4, Math.min(ARENA_W - FIGHTER_W - 4, defender.x))
    defender.state = 'hitstun'
    defender.stateTimer = 0
    defender.blocking = false
    defender.hitFlash = 180
    const msg = HIT_MESSAGES[Math.floor(Math.random() * HIT_MESSAGES.length)]
    this.events.push({
      type: move === MOVES.special ? 'special' : 'hit',
      x: defender.x,
      y: GROUND_Y - 24,
      message: msg,
    })
    if (defender.health <= 0) {
      defender.state = 'ko'
      this.over = true
      this.winner = attacker
      attacker.isWinner = true
      this.events.push({ type: 'ko', x: defender.x, y: GROUND_Y - 30 })
    }
  }

  private updateFighter(f: FighterState, dt: number, opponent: FighterState) {
    for (const k of Object.keys(f.cooldowns) as MoveType[]) {
      f.cooldowns[k] = Math.max(0, f.cooldowns[k] - dt)
    }
    if (f.hitFlash > 0) f.hitFlash = Math.max(0, f.hitFlash - dt)
    f.facing = f.x < opponent.x ? 1 : -1
    f.bobPhase += dt * 0.006

    if (f.state === 'punch' || f.state === 'grab' || f.state === 'special') {
      const move = MOVES[f.state]
      f.moveTimer += dt
      if (f.moveTimer >= move.startup && f.moveTimer < move.startup + move.active) {
        if (f.activeMove) {
          this.resolveHit(f, opponent, move)
          f.activeMove = null // only resolve once per swing
        }
      }
      if (f.moveTimer >= move.startup + move.active + move.recovery) {
        f.cooldowns[f.state as MoveType] = move.cooldown
        f.state = 'idle'
        f.moveTimer = 0
      }
    } else if (f.state === 'hitstun') {
      f.stateTimer += dt
      if (f.stateTimer >= 320) {
        f.state = 'idle'
        f.stateTimer = 0
      }
    }
  }

  update(dt: number) {
    if (this.over) return
    this.updateFighter(this.a, dt, this.b)
    this.updateFighter(this.b, dt, this.a)
    this.timeRemaining -= dt / 1000
    if (this.timeRemaining <= 0 && !this.over) {
      this.timeRemaining = 0
      this.over = true
      this.timeUp = true
      this.winner = this.a.health >= this.b.health ? this.a : this.b
      this.winner.isWinner = true
    }
  }

  drainEvents(): FightEvent[] {
    const e = this.events
    this.events = []
    return e
  }
}

export function runAI(controller: FightController, ai: FighterState, target: FighterState, dt: number, memory: { thinkCooldown: number }) {
  if (controller.over) return
  memory.thinkCooldown -= dt
  const dist = Math.abs(target.x - ai.x)
  const canAct = controller.canAct(ai)

  if (memory.thinkCooldown > 0) {
    return
  }
  memory.thinkCooldown = 180 + Math.random() * 220

  if (!canAct) return

  const preferredRange = 26
  if (dist > preferredRange + 6) {
    controller.move(ai, ai.x < target.x ? 1 : -1)
    return
  }
  if (dist < preferredRange - 14) {
    controller.move(ai, ai.x < target.x ? -1 : 1)
    return
  }

  const roll = Math.random()
  if (target.state === 'punch' || target.state === 'grab' || target.state === 'special') {
    if (roll < 0.55) {
      controller.setBlocking(ai, true)
      return
    }
  }
  controller.setBlocking(ai, false)

  if (roll < 0.12 && ai.cooldowns.special === 0) {
    controller.attack(ai, 'special')
  } else if (roll < 0.4) {
    controller.attack(ai, 'grab')
  } else if (roll < 0.85) {
    controller.attack(ai, 'punch')
  } else {
    controller.move(ai, 0)
  }
}
