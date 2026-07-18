import { CLIPS, DEFAULT_CHARACTER, type AnimName } from './anim'

export const ARENA_W = 640
export const ARENA_H = 270
export const GROUND_Y = 200
export const SPRITE_W = 96
export const SPRITE_H = 100
export const MAX_HEALTH = 100

export const WALK_SPEED = 112
export const RUN_SPEED = 236
export const JUMP_VELOCITY = -380
export const GRAVITY = 1050

// Classic best-of-3 duel structure.
export const ROUND_TIME = 60 // seconds on the clock per round
export const ROUNDS_TO_WIN = 2

// Every hitbox/reach/edge-margin distance below was originally tuned against
// a 132px-wide sprite. SPRITE_W later shrank for the mobile redesign but
// these numbers didn't move with it, so attacks landed (or whiffed) at
// distances that no longer matched what was on screen. Scale them all by
// the same ratio the sprite itself shrank by.
const HITBOX_SCALE = SPRITE_W / 132
const hb = (n: number) => Math.round(n * HITBOX_SCALE)

// "Sent flying" launch physics — the over-the-top payoff for landing a
// full 3-hit combo finisher. Big horizontal yeet, floaty hang-time arc,
// fast spin, comedic Matrix-fight-scene energy.
export const LAUNCH_VX = 520
export const LAUNCH_VY = -320
export const LAUNCH_GRAVITY = 620
export const LAUNCH_SPIN = 18 // radians/sec

export const PLAYER_TINT = 'rgba(46, 130, 220, 0.55)'

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

const JAB: MoveSpec = { clip: 'comboJab', activeFrame: 3, damage: 6, stun: 190, pushback: hb(10), range: hb(76) }
const CROSS: MoveSpec = { clip: 'comboCross', activeFrame: 4, damage: 8, stun: 220, pushback: hb(14), range: hb(78) }
const FINISHER: MoveSpec = { clip: 'comboFinisher', activeFrame: 3, damage: 17, stun: 480, pushback: hb(46), range: hb(82), launches: true }
const AIR_ATTACK: MoveSpec = { clip: 'airAttack', activeFrame: 1, damage: 10, stun: 300, pushback: hb(24), range: hb(74) }
const DASH_ATTACK: MoveSpec = { clip: 'dash', activeFrame: 3, damage: 11, stun: 280, pushback: hb(30), range: hb(84) }

export interface FightEvent {
  type: 'hit' | 'block' | 'ko' | 'finisher' | 'launch'
  x: number
  y: number
  who: 'player' | string // 'player' or the opponent's id
  damage?: number
  attackerName?: string // set when the opponent is the attacker, for "defeated by" attribution
}

// Rival archetype: same stickman, different fighting style — a Tekken/MK
// style roster of one shared sprite recolored and re-tuned per personality.
export interface EnemyProfile {
  id: string
  name: string
  tint: string
  healthMult: number
  dmgMult: number
  speedMult: number
  aggression: number
  dashBias: number
  airBias: number
  blockBias: number
  chainBias: number
  thinkMin: number
  thinkMax: number
}

export const DEFAULT_AI_PROFILE: EnemyProfile = {
  id: 'default',
  name: 'RIVAL',
  tint: 'rgba(214, 64, 32, 0.55)',
  healthMult: 1,
  dmgMult: 1,
  speedMult: 1,
  aggression: 0.65,
  dashBias: 0.3,
  airBias: 0.6,
  blockBias: 0.4,
  chainBias: 0.85,
  thinkMin: 90,
  thinkMax: 220,
}

export interface FighterState {
  id: string
  isPlayer: boolean
  characterId: string
  tint: string
  maxHealth: number
  dmgMult: number
  speedMult: number
  profile: EnemyProfile
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
  moveHasHit: boolean
  hitstunTimer: number
  blocking: boolean
  hitFlash: number
  dead: boolean
  moveDir: -1 | 0 | 1
  speedRatio: number // 0 (walk) .. 1 (full run), analog — proportional to drag distance
  wantBlock: boolean
  spinAngle: number
  launchVX: number
  launchVY: number
  lastHitBy?: string
  // AI bookkeeping (opponent only)
  aiThink: number
  aiWantChain: boolean
  aiSpeedRatio: number
}

let nextId = 0

function makeFighter(
  isPlayer: boolean,
  x: number,
  facing: 1 | -1,
  characterId: string,
  tint: string,
  profile: EnemyProfile = DEFAULT_AI_PROFILE,
  maxHealth: number = MAX_HEALTH,
  dmgMult = 1,
  speedMult = 1,
): FighterState {
  return {
    id: `f${nextId++}`,
    isPlayer,
    characterId,
    tint,
    maxHealth,
    dmgMult,
    speedMult,
    profile,
    x,
    y: GROUND_Y,
    vy: 0,
    grounded: true,
    facing,
    health: maxHealth,
    anim: 'idle',
    frame: 0,
    frameTimer: 0,
    comboStep: 0,
    chainBuffered: false,
    moveHasHit: false,
    hitstunTimer: 0,
    blocking: false,
    hitFlash: 0,
    dead: false,
    moveDir: 0,
    speedRatio: 0,
    wantBlock: false,
    spinAngle: 0,
    launchVX: 0,
    launchVY: 0,
    aiThink: 0,
    aiWantChain: false,
    aiSpeedRatio: 0,
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

/** One best-of-3 duel round: a player and a single AI opponent, Tekken/MK style. */
export class FightController {
  player: FighterState
  opponent: FighterState
  over = false // this round has ended
  victory = false // did the player win this round
  draw = false // round timed out tied, or a simultaneous double-KO
  roundTime = ROUND_TIME
  events: FightEvent[] = []

  constructor(playerCharacterId: string = DEFAULT_CHARACTER, opponentProfile: EnemyProfile = DEFAULT_AI_PROFILE, opponentCharacterId: string = DEFAULT_CHARACTER) {
    this.player = makeFighter(true, ARENA_W * 0.32, 1, playerCharacterId, PLAYER_TINT)
    this.opponent = makeFighter(
      false,
      ARENA_W * 0.68,
      -1,
      opponentCharacterId,
      opponentProfile.tint,
      opponentProfile,
      Math.round(MAX_HEALTH * opponentProfile.healthMult),
      opponentProfile.dmgMult,
      opponentProfile.speedMult,
    )
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
    f.x += dir * hb(14)
    f.x = Math.max(hb(24), Math.min(ARENA_W - hb(24), f.x))
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

  private targetOf(attacker: FighterState): FighterState | null {
    const defender = attacker.isPlayer ? this.opponent : this.player
    return defender.dead ? null : defender
  }

  private resolveHit(attacker: FighterState, move: MoveSpec) {
    const defender = this.targetOf(attacker)
    if (!defender) return
    const dist = Math.abs(attacker.x - defender.x)
    if (dist > move.range) return
    const facingRight = attacker.x < defender.x
    if ((facingRight && attacker.facing !== 1) || (!facingRight && attacker.facing !== -1)) return

    const dir = attacker.x < defender.x ? 1 : -1

    if (defender.blocking) {
      defender.x += dir * (move.pushback * 0.35)
      defender.x = Math.max(hb(24), Math.min(ARENA_W - hb(24), defender.x))
      this.events.push({ type: 'block', x: defender.x, y: GROUND_Y - 90, who: defender.isPlayer ? 'player' : defender.id })
      return
    }

    const damage = Math.round(move.damage * attacker.dmgMult)
    defender.health = Math.max(0, defender.health - damage)
    defender.blocking = false
    defender.comboStep = 0
    defender.hitFlash = 160

    const who = defender.isPlayer ? 'player' : defender.id
    const attackerName = attacker.isPlayer ? undefined : attacker.profile.name

    if (move.launches) {
      defender.anim = 'launched'
      defender.frame = 0
      defender.frameTimer = 0
      defender.grounded = false
      defender.spinAngle = 0
      defender.launchVX = dir * LAUNCH_VX
      defender.launchVY = LAUNCH_VY
      defender.lastHitBy = attackerName
      this.events.push({ type: 'launch', x: defender.x, y: GROUND_Y - 100, who, damage, attackerName })
    } else {
      defender.x += dir * move.pushback
      defender.x = Math.max(hb(24), Math.min(ARENA_W - hb(24), defender.x))
      defender.anim = 'hit'
      defender.frame = 0
      defender.frameTimer = 0
      defender.hitstunTimer = move.stun
      const kind = damage >= 12 ? 'finisher' : 'hit'
      this.events.push({ type: kind, x: defender.x, y: GROUND_Y - 100, who, damage, attackerName })
    }

    if (defender.health <= 0 && !defender.dead) {
      defender.dead = true
      if (!move.launches) {
        defender.anim = 'death'
        defender.frame = 0
        defender.frameTimer = 0
        this.events.push({ type: 'ko', x: defender.x, y: GROUND_Y - 100, who, attackerName })
      }
      // if launched, the KO event fires on landing instead — see updateFighter
    }
  }

  private updateFighter(f: FighterState, dt: number) {
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
      f.x = Math.max(hb(18), Math.min(ARENA_W - hb(18), f.x))
      this.stepAnim(f, dt)
      if (f.y >= GROUND_Y) {
        f.y = GROUND_Y
        f.grounded = true
        f.spinAngle = 0
        if (f.dead) {
          f.anim = 'death'
          f.frame = 0
          f.frameTimer = 0
          this.events.push({ type: 'ko', x: f.x, y: GROUND_Y - 100, who: f.isPlayer ? 'player' : f.id, attackerName: f.lastHitBy })
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
        this.resolveHit(f, activeMove)
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
      const speed = (WALK_SPEED + (RUN_SPEED - WALK_SPEED) * f.speedRatio) * f.speedMult
      f.x += f.moveDir * speed * dt
      f.x = Math.max(hb(24), Math.min(ARENA_W - hb(24), f.x))
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

    this.updateFighter(this.player, dt)
    this.updateFighter(this.opponent, dt)

    // Classic 1v1 fighters always turn to face their opponent — movement
    // doesn't override it (you can walk backward while still facing them).
    if (this.player.grounded && !this.isBusy(this.player) && this.player.anim !== 'block') {
      this.player.facing = this.player.x < this.opponent.x ? 1 : -1
    }
    if (this.opponent.grounded && !this.isBusy(this.opponent) && this.opponent.anim !== 'block') {
      this.opponent.facing = this.opponent.x < this.player.x ? 1 : -1
    }

    if (!this.player.dead && !this.opponent.dead) {
      this.roundTime = Math.max(0, this.roundTime - dt)
    }

    const playerDone = this.player.dead && this.player.anim === 'death' && this.player.frame >= CLIPS.death.frames.length - 1
    const opponentDone = this.opponent.dead && this.opponent.anim === 'death' && this.opponent.frame >= CLIPS.death.frames.length - 1

    if (playerDone || opponentDone) {
      this.over = true
      this.victory = opponentDone && !playerDone
      this.draw = playerDone && opponentDone
      return
    }

    if (this.roundTime <= 0) {
      this.over = true
      if (this.player.health === this.opponent.health) {
        this.draw = true
      } else {
        this.victory = this.player.health > this.opponent.health
      }
    }
  }
}

// ---------------- AI ----------------
// Move categories available to both the player and the opponent, and how
// they read on the receiving end:
//   - Jab / Cross     quick pokes, short hitstun, small pushback — pure combo filler
//   - Finisher        the 3rd combo hit — big damage AND launches the
//                      defender into a spinning, screen-crossing "sent
//                      flying" ragdoll (the absurd Matrix-fight payoff)
//   - Dash Strike     a lunging punch that covers ground, used to close
//                      distance aggressively or punish whiffs
//   - Air Strike      aerial attack, used to contest jump-ins or start
//                      offense from above
// Every EnemyProfile tunes how much the rival leans on each category and
// how it plays footsies: proper 1v1 AI needs to poke, punish recovery
// frames, bait with retreats, and block reads — not just "walk in and
// swing," which is all a swarm mob needed.
export function runEnemyAI(controller: FightController, ai: FighterState, dt: number) {
  const target = controller.player
  if (!controller.canAct(ai) || controller.over || target.dead) {
    ai.moveDir = 0
    ai.wantBlock = false
    return
  }

  const profile = ai.profile
  ai.aiThink -= dt * 1000
  const dist = Math.abs(ai.x - target.x)
  const strikeRange = hb(58)
  const targetBusy = target.anim.startsWith('combo') || target.anim === 'dashAttack' || target.anim === 'airAttack'
  // The target's active move already connected or whiffed and it's now
  // sitting in recovery frames — the textbook window a real fighting-game
  // AI punishes instead of just blocking through it.
  const targetRecovering = targetBusy && target.moveHasHit

  // React fast to a punishable opening instead of waiting out the normal
  // "think" cooldown — this is what makes the AI feel alert rather than lagging.
  if (targetRecovering && dist <= strikeRange + hb(20)) {
    ai.aiThink = Math.min(ai.aiThink, 35)
  }

  if (ai.aiThink <= 0) {
    ai.aiThink = profile.thinkMin + Math.random() * (profile.thinkMax - profile.thinkMin)

    if (dist > strikeRange) {
      ai.moveDir = ai.x < target.x ? 1 : -1
      ai.aiSpeedRatio = dist > hb(140) ? 1 : 0.4
      ai.wantBlock = false
      if (ai.grounded && dist < hb(210) && dist > strikeRange + hb(12) && Math.random() < profile.dashBias) {
        controller.swipeStrike(ai, ai.x < target.x ? 1 : -1)
      }
    } else if (dist < strikeRange - hb(30)) {
      ai.moveDir = ai.x < target.x ? -1 : 1
      ai.aiSpeedRatio = 0
      ai.wantBlock = false
    } else if (targetRecovering) {
      // Punish: the target just whiffed or is still recovering from a
      // connected hit — swing now instead of rolling to block.
      ai.moveDir = 0
      ai.wantBlock = false
      controller.attack(ai)
      ai.aiWantChain = Math.random() < profile.chainBias
    } else if (targetBusy && Math.random() < profile.blockBias) {
      ai.moveDir = 0
      ai.wantBlock = true
    } else {
      ai.wantBlock = false
      const roll = Math.random()
      if (roll < profile.aggression) {
        ai.moveDir = 0
        controller.attack(ai)
        ai.aiWantChain = Math.random() < profile.chainBias
      } else if (roll < profile.aggression + 0.17 && ai.grounded) {
        ai.moveDir = 0
        controller.jump(ai)
        if (Math.random() < profile.airBias) controller.attack(ai)
      } else {
        // Footsies: back off out of strike range to reset spacing and bait
        // a whiff, instead of always trading blows at point-blank.
        ai.moveDir = ai.x < target.x ? -1 : 1
        ai.aiSpeedRatio = 0.3
      }
    }
  }

  if (ai.anim.startsWith('combo') && ai.aiWantChain) {
    controller.attack(ai)
  }

  controller.move(ai, ai.moveDir, ai.aiSpeedRatio)
  controller.setBlocking(ai, ai.wantBlock)
}
