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

// How many enemies can be actively approaching/attacking the player at
// once. The rest of the swarm mills around waiting for a slot to open —
// keeps 10-20 enemies on screen without it being an unplayable dogpile.
export const MAX_ENGAGED = 3
export const ENGAGE_RANGE = 260

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

const JAB: MoveSpec = { clip: 'comboJab', activeFrame: 3, damage: 6, stun: 190, pushback: 10, range: 76 }
const CROSS: MoveSpec = { clip: 'comboCross', activeFrame: 4, damage: 8, stun: 220, pushback: 14, range: 78 }
const FINISHER: MoveSpec = { clip: 'comboFinisher', activeFrame: 3, damage: 17, stun: 480, pushback: 46, range: 82, launches: true }
const AIR_ATTACK: MoveSpec = { clip: 'airAttack', activeFrame: 1, damage: 10, stun: 300, pushback: 24, range: 74 }
const DASH_ATTACK: MoveSpec = { clip: 'dash', activeFrame: 3, damage: 11, stun: 280, pushback: 30, range: 84 }

export interface FightEvent {
  type: 'hit' | 'block' | 'ko' | 'finisher' | 'launch'
  x: number
  y: number
  who: 'player' | string // 'player' or the defeated enemy's id
  damage?: number
  attackerName?: string // set when an enemy is the attacker, for "defeated by" attribution
}

// Enemy archetype: same stickman, different fighting style. Visually all
// enemies stay in a warm red/orange/yellow "villain" family (vs. the
// player's cool blue) so the player is always the one unmistakable figure
// in a crowd — the behavior profile is what actually tells them apart.
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
  // AI bookkeeping (enemies only)
  engaged: boolean
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
    engaged: false,
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

export class FightController {
  player: FighterState
  enemies: FighterState[] = []
  over = false
  victory = false
  events: FightEvent[] = []

  constructor(playerCharacterId: string = DEFAULT_CHARACTER) {
    this.player = makeFighter(true, ARENA_W * 0.5, 1, playerCharacterId, PLAYER_TINT)
  }

  /** Spawns the whole swarm at once, spread across both sides of the player. */
  spawnSwarm(count: number, profiles: EnemyProfile[], characterId: string) {
    this.enemies = []
    // Fan the swarm evenly across both sides of the player instead of a
    // linear offset (which clamps most enemies onto the same edge once the
    // spread exceeds the arena bounds — looked like a pile-up, not a mob).
    const margin = 24
    const gap = 60 // keep clear space immediately around the player's start
    const leftCount = Math.ceil(count / 2)
    const rightCount = count - leftCount
    const leftSpan = Math.max(1, this.player.x - gap - margin)
    const rightSpan = Math.max(1, ARENA_W - margin - (this.player.x + gap))

    for (let i = 0; i < count; i++) {
      const profile = profiles[i % profiles.length]
      const onLeft = i % 2 === 0
      let x: number
      if (onLeft) {
        const slot = Math.floor(i / 2)
        x = margin + (leftSpan * (slot + 0.5)) / leftCount + (Math.random() - 0.5) * 20
      } else {
        const slot = Math.floor(i / 2)
        x = this.player.x + gap + (rightSpan * (slot + 0.5)) / rightCount + (Math.random() - 0.5) * 20
      }
      x = Math.max(margin, Math.min(ARENA_W - margin, x))
      const facing = x < this.player.x ? 1 : -1
      const e = makeFighter(false, x, facing, characterId, profile.tint, profile, Math.round(MAX_HEALTH * profile.healthMult), profile.dmgMult, profile.speedMult)
      this.enemies.push(e)
    }
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

  /** Every living fighter on the opposing side of `attacker` (player -> all enemies, enemy -> just the player). */
  private opponentsOf(attacker: FighterState): FighterState[] {
    if (attacker.isPlayer) return this.enemies.filter((e) => !e.dead)
    return this.player.dead ? [] : [this.player]
  }

  private resolveHit(attacker: FighterState, move: MoveSpec) {
    let best: FighterState | null = null
    let bestDist = Infinity
    for (const defender of this.opponentsOf(attacker)) {
      const dist = Math.abs(attacker.x - defender.x)
      if (dist > move.range) continue
      const facingRight = attacker.x < defender.x
      if ((facingRight && attacker.facing !== 1) || (!facingRight && attacker.facing !== -1)) continue
      if (dist < bestDist) {
        bestDist = dist
        best = defender
      }
    }
    if (!best) return
    const defender = best
    const dir = attacker.x < defender.x ? 1 : -1

    if (defender.blocking) {
      defender.x += dir * (move.pushback * 0.35)
      defender.x = Math.max(24, Math.min(ARENA_W - 24, defender.x))
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
      defender.x = Math.max(24, Math.min(ARENA_W - 24, defender.x))
      defender.anim = 'hit'
      defender.frame = 0
      defender.frameTimer = 0
      defender.hitstunTimer = move.stun
      const kind = damage >= 12 ? 'finisher' : 'hit'
      this.events.push({ type: kind, x: defender.x, y: GROUND_Y - 100, who, damage, attackerName })
    }

    if (defender.health <= 0 && !defender.dead) {
      defender.dead = true
      defender.engaged = false
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
      f.facing = f.moveDir as 1 | -1
      const speed = (WALK_SPEED + (RUN_SPEED - WALK_SPEED) * f.speedRatio) * f.speedMult
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

  /** Promotes the nearest un-engaged enemy into an open attack slot so the swarm keeps pressure on without dogpiling. */
  private updateEngagement() {
    let engagedCount = 0
    for (const e of this.enemies) {
      if (e.engaged && (e.dead || Math.abs(e.x - this.player.x) > ENGAGE_RANGE * 1.4)) e.engaged = false
      if (e.engaged && !e.dead) engagedCount++
    }
    if (engagedCount >= MAX_ENGAGED) return
    const candidates = this.enemies
      .filter((e) => !e.dead && !e.engaged)
      .sort((a, b) => Math.abs(a.x - this.player.x) - Math.abs(b.x - this.player.x))
    for (const c of candidates) {
      if (engagedCount >= MAX_ENGAGED) break
      c.engaged = true
      engagedCount++
    }
  }

  update(dt: number) {
    if (this.over) return

    this.updateEngagement()

    if (this.player.grounded && !this.isBusy(this.player) && this.player.anim !== 'block' && this.player.moveDir === 0) {
      const nearest = this.enemies.filter((e) => !e.dead).sort((a, b) => Math.abs(a.x - this.player.x) - Math.abs(b.x - this.player.x))[0]
      if (nearest) this.player.facing = this.player.x < nearest.x ? 1 : -1
    }
    for (const e of this.enemies) {
      if (e.dead || this.isBusy(e) || e.anim === 'block') continue
      if (e.moveDir === 0) e.facing = e.x < this.player.x ? 1 : -1
    }

    this.updateFighter(this.player, dt)
    for (const e of this.enemies) this.updateFighter(e, dt)

    const playerDone = this.player.anim === 'death' && this.player.frame >= CLIPS.death.frames.length - 1
    if (this.player.dead && playerDone) {
      this.over = true
      this.victory = false
      return
    }

    if (this.enemies.length > 0 && this.enemies.every((e) => e.dead && e.anim === 'death' && e.frame >= CLIPS.death.frames.length - 1)) {
      this.over = true
      this.victory = true
    }
  }
}

// ---------------- AI ----------------
// Move categories available to both the player and every enemy, and how
// they read on the receiving end:
//   - Jab / Cross     quick pokes, short hitstun, small pushback — pure combo filler
//   - Finisher        the 3rd combo hit — big damage AND launches the
//                      defender into a spinning, screen-crossing "sent
//                      flying" ragdoll (the absurd Matrix-fight payoff)
//   - Dash Strike     a lunging punch that covers ground, used to close
//                      distance aggressively or punish whiffs
//   - Air Strike      aerial attack, used to contest jump-ins or start
//                      offense from above
// Every EnemyProfile tunes how much an opponent leans on each category —
// a "Marathoner" dash-strikes constantly, an "Influencer" lives in the
// air, "Reply-All" never stops chaining jabs — so the swarm doesn't just
// feel like one enemy copy-pasted twenty times.
export function runEnemyAI(controller: FightController, ai: FighterState, dt: number) {
  const target = controller.player
  if (!controller.canAct(ai) || controller.over || target.dead) {
    ai.moveDir = 0
    ai.wantBlock = false
    return
  }

  if (!ai.engaged) {
    // Not their turn to attack yet — drift toward the player slowly so the
    // swarm visibly closes in, without piling on all at once.
    const dist = Math.abs(ai.x - target.x)
    ai.moveDir = dist > 70 ? (ai.x < target.x ? 1 : -1) : 0
    ai.aiSpeedRatio = 0.15
    ai.wantBlock = false
    controller.move(ai, ai.moveDir, ai.aiSpeedRatio)
    controller.setBlocking(ai, false)
    return
  }

  const profile = ai.profile
  ai.aiThink -= dt * 1000
  const dist = Math.abs(ai.x - target.x)
  const strikeRange = 58

  if (ai.aiThink <= 0) {
    ai.aiThink = profile.thinkMin + Math.random() * (profile.thinkMax - profile.thinkMin)
    const targetBusy = target.anim.startsWith('combo') || target.anim === 'dashAttack' || target.anim === 'airAttack'

    if (dist > strikeRange) {
      ai.moveDir = ai.x < target.x ? 1 : -1
      ai.aiSpeedRatio = dist > 140 ? 1 : 0.4
      ai.wantBlock = false
      if (ai.grounded && dist < 210 && dist > strikeRange + 12 && Math.random() < profile.dashBias) {
        controller.swipeStrike(ai, ai.x < target.x ? 1 : -1)
      }
    } else if (dist < strikeRange - 30) {
      ai.moveDir = ai.x < target.x ? -1 : 1
      ai.aiSpeedRatio = 0
      ai.wantBlock = false
    } else {
      ai.moveDir = 0
      if (targetBusy && Math.random() < profile.blockBias) {
        ai.wantBlock = true
      } else {
        ai.wantBlock = false
        const roll = Math.random()
        if (roll < profile.aggression) {
          controller.attack(ai)
          ai.aiWantChain = Math.random() < profile.chainBias
        } else if (roll < profile.aggression + 0.17 && ai.grounded) {
          controller.jump(ai)
          if (Math.random() < profile.airBias) controller.attack(ai)
        }
      }
    }
  }

  if (ai.anim.startsWith('combo') && ai.aiWantChain) {
    controller.attack(ai)
  }

  controller.move(ai, ai.moveDir, ai.aiSpeedRatio)
  controller.setBlocking(ai, ai.wantBlock)
}
