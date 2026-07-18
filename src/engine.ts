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
  | 'slideKick'
  | 'leapfrog'
  | 'leapfrogLand'
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
  unblockable?: boolean // low/surprise hit that guard can't stop — a mix-up threat
}

const JAB: MoveSpec = { clip: 'comboJab', activeFrame: 3, damage: 6, stun: 190, pushback: hb(10), range: hb(76) }
const CROSS: MoveSpec = { clip: 'comboCross', activeFrame: 4, damage: 8, stun: 220, pushback: hb(14), range: hb(78) }
const FINISHER: MoveSpec = { clip: 'comboFinisher', activeFrame: 3, damage: 17, stun: 480, pushback: hb(46), range: hb(82), launches: true }
const AIR_ATTACK: MoveSpec = { clip: 'airAttack', activeFrame: 1, damage: 10, stun: 300, pushback: hb(24), range: hb(74) }
const DASH_ATTACK: MoveSpec = { clip: 'dash', activeFrame: 3, damage: 11, stun: 280, pushback: hb(30), range: hb(84) }
// Power-up-only moves — free until picked up, then a single-use "wow" swing.
const SLIDE_KICK: MoveSpec = { clip: 'slide', activeFrame: 3, damage: 14, stun: 300, pushback: hb(24), range: hb(72), unblockable: true }

export type PowerUpKind = 'slide' | 'leapfrog'

export interface PowerUpState {
  id: string
  kind: PowerUpKind
  x: number
  y: number
  taken?: boolean
}

// Full weapon-based combat: every fighter is equipped with one of these for
// the whole match. Fists keep the original punch/kick moveset. A gun turns
// every attack in the same combo timeline into a fired shot instead of a
// melee hit, with the combo finisher unloading a bullet-hell fan of bolts.
// A lightsaber reuses the exact same animation timeline as a big-reach,
// high-damage melee weapon — its glowing blade is drawn procedurally
// on top of the unarmed swing, so the existing punch/kick frames double as
// "heavily animation controlled" saber choreography with no new art.
export type WeaponKind = 'fists' | 'gun' | 'lightsaber'

export const BULLET_SPEED = 360
const BULLET_LIFE = 1.1 // seconds before a bolt despawns if it hits nothing

export interface Projectile {
  id: string
  x: number
  y: number
  vx: number
  vy: number
  damage: number
  ownerIsPlayer: boolean
  life: number
}

export interface FightEvent {
  type: 'hit' | 'block' | 'ko' | 'finisher' | 'launch' | 'powerup' | 'shoot' | 'bullethell' | 'deflect'
  x: number
  y: number
  who: 'player' | string // 'player' or the opponent's id
  damage?: number
  attackerName?: string // set when the opponent is the attacker, for "defeated by" attribution
  powerUpKind?: PowerUpKind
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
  // Power-ups picked up off the ground — each is a single free use of a
  // move the sprite pack otherwise never uses in the base moveset.
  hasSlideCharge: boolean
  hasLeapfrogCharge: boolean
  leapfrogFromX: number
  leapfrogToX: number
  leapfrogElapsed: number
  weapon: WeaponKind
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
  weapon: WeaponKind = 'fists',
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
    hasSlideCharge: false,
    hasLeapfrogCharge: false,
    leapfrogFromX: 0,
    leapfrogToX: 0,
    leapfrogElapsed: 0,
    weapon,
    aiThink: 0,
    aiWantChain: false,
    aiSpeedRatio: 0,
  }
}

function clipFor(anim: FighterAnim): AnimName {
  switch (anim) {
    case 'dashAttack':
      return 'dash'
    case 'slideKick':
      return 'slide'
    case 'leapfrog':
      return 'climb'
    case 'leapfrogLand':
      return 'wallslide'
    case 'block':
      return 'idle'
    case 'launched':
      return 'hit'
    default:
      return anim as AnimName
  }
}

const LEAPFROG_DURATION = 0.46 // seconds in the air
const LEAPFROG_ARC_HEIGHT = hb(95)

/** One best-of-3 duel round: a player and a single AI opponent, Tekken/MK style. */
export class FightController {
  player: FighterState
  opponent: FighterState
  over = false // this round has ended
  victory = false // did the player win this round
  draw = false // round timed out tied, or a simultaneous double-KO
  roundTime = ROUND_TIME
  events: FightEvent[] = []
  powerUps: PowerUpState[] = []
  private powerUpTimer = 5 + Math.random() * 3
  private nextPowerUpId = 0
  projectiles: Projectile[] = []
  private nextProjectileId = 0

  constructor(
    playerCharacterId: string = DEFAULT_CHARACTER,
    opponentProfile: EnemyProfile = DEFAULT_AI_PROFILE,
    opponentCharacterId: string = DEFAULT_CHARACTER,
    playerWeapon: WeaponKind = 'fists',
    opponentWeapon: WeaponKind = 'fists',
  ) {
    this.player = makeFighter(true, ARENA_W * 0.32, 1, playerCharacterId, PLAYER_TINT, DEFAULT_AI_PROFILE, MAX_HEALTH, 1, 1, playerWeapon)
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
      opponentWeapon,
    )
  }

  private isBusy(f: FighterState): boolean {
    return (
      f.anim === 'comboJab' ||
      f.anim === 'comboCross' ||
      f.anim === 'comboFinisher' ||
      f.anim === 'airAttack' ||
      f.anim === 'dashAttack' ||
      f.anim === 'slideKick' ||
      f.anim === 'leapfrog' ||
      f.anim === 'leapfrogLand' ||
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

  /** Power-up move: a low, unblockable lunging kick. Consumes the charge. */
  slideKick(f: FighterState) {
    if (!this.canAct(f) || !f.grounded || this.isBusy(f) || !f.hasSlideCharge) return
    f.hasSlideCharge = false
    f.x += f.facing * hb(28)
    f.x = Math.max(hb(24), Math.min(ARENA_W - hb(24), f.x))
    this.startMove(f, 'slideKick')
    f.comboStep = 0
  }

  /** Power-up move: vaults clean over the opponent to the far side. Pure repositioning — no damage. */
  leapfrog(f: FighterState) {
    if (!this.canAct(f) || !f.grounded || this.isBusy(f) || !f.hasLeapfrogCharge) return
    const target = f.isPlayer ? this.opponent : this.player
    f.hasLeapfrogCharge = false
    f.leapfrogFromX = f.x
    const landSide = f.x < target.x ? 1 : -1
    f.leapfrogToX = Math.max(hb(24), Math.min(ARENA_W - hb(24), target.x + landSide * hb(46)))
    f.leapfrogElapsed = 0
    f.grounded = false
    this.startMove(f, 'leapfrog')
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
    if (anim === 'slideKick') return SLIDE_KICK
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

    if (defender.blocking && !move.unblockable) {
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

  /** Lightsaber trades the finisher's launch for extra reach and damage — a lethal-looking but non-launching blade instead. */
  private weaponAdjustedMove(attacker: FighterState, move: MoveSpec): MoveSpec {
    if (attacker.weapon !== 'lightsaber') return move
    return { ...move, range: Math.round(move.range * 1.85), damage: Math.round(move.damage * 1.25), launches: false }
  }

  private spawnBullet(x: number, y: number, vx: number, vy: number, damage: number, ownerIsPlayer: boolean) {
    this.projectiles.push({ id: `b${this.nextProjectileId++}`, x, y, vx, vy, damage, ownerIsPlayer, life: BULLET_LIFE })
  }

  /** Every attack in the same jab/cross/finisher/dash/air timeline fires a shot instead of a melee hit when the attacker is packing a gun. */
  private fireWeapon(attacker: FighterState) {
    const originX = attacker.x + attacker.facing * hb(30)
    const originY = GROUND_Y - SPRITE_H * 0.55
    const who = attacker.isPlayer ? 'player' : attacker.id
    const attackerName = attacker.isPlayer ? undefined : attacker.profile.name

    if (attacker.anim === 'comboFinisher') {
      // Bullet-hell unload: a wide fan of bolts on the combo's big payoff hit.
      const count = 10
      const spread = 0.85
      for (let i = 0; i < count; i++) {
        const t = i / (count - 1) - 0.5
        const angle = t * spread
        this.spawnBullet(
          originX,
          originY,
          Math.cos(angle) * BULLET_SPEED * attacker.facing,
          Math.sin(angle) * BULLET_SPEED,
          5,
          attacker.isPlayer,
        )
      }
      this.events.push({ type: 'bullethell', x: originX, y: originY, who, attackerName })
      return
    }

    let vx = BULLET_SPEED * attacker.facing
    let vy = 0
    let damage = 6
    if (attacker.anim === 'comboCross') damage = 8
    else if (attacker.anim === 'dashAttack') {
      vx *= 1.3
      damage = 11
    } else if (attacker.anim === 'airAttack') {
      vy = BULLET_SPEED * 0.35
      damage = 9
    }
    this.spawnBullet(originX, originY, vx, vy, damage, attacker.isPlayer)
    this.events.push({ type: 'shoot', x: originX, y: originY, who, attackerName })
  }

  private applyProjectileHit(defender: FighterState, p: Projectile) {
    const dir = p.vx >= 0 ? 1 : -1
    if (defender.blocking) {
      defender.x += dir * 3
      defender.x = Math.max(hb(24), Math.min(ARENA_W - hb(24), defender.x))
      this.events.push({ type: 'block', x: defender.x, y: p.y, who: defender.isPlayer ? 'player' : defender.id })
      return
    }
    defender.health = Math.max(0, defender.health - p.damage)
    defender.hitFlash = 140
    if (!this.isBusy(defender) && defender.grounded) {
      defender.anim = 'hit'
      defender.frame = 0
      defender.frameTimer = 0
      defender.hitstunTimer = 140
    }
    const who = defender.isPlayer ? 'player' : defender.id
    this.events.push({ type: 'hit', x: p.x, y: p.y, who, damage: p.damage })

    if (defender.health <= 0 && !defender.dead) {
      defender.dead = true
      defender.anim = 'death'
      defender.frame = 0
      defender.frameTimer = 0
      this.events.push({ type: 'ko', x: defender.x, y: GROUND_Y - 100, who })
    }
  }

  /** Moves every bolt, resolves hits/blocks, and lets a mid-swing lightsaber deflect an incoming shot instead of eating it. */
  private updateProjectiles(dt: number) {
    if (this.projectiles.length === 0) return
    const remaining: Projectile[] = []
    for (const p of this.projectiles) {
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.life -= dt

      let consumed = p.life <= 0 || p.x < -20 || p.x > ARENA_W + 20 || p.y < -20 || p.y > ARENA_H + 20

      if (!consumed) {
        const defender = p.ownerIsPlayer ? this.opponent : this.player
        if (!defender.dead) {
          const dx = Math.abs(p.x - defender.x)
          const dy = Math.abs(p.y - (defender.y - SPRITE_H * 0.5))
          if (dx < hb(20) && dy < hb(45)) {
            const swinging = defender.weapon === 'lightsaber' && (defender.anim.startsWith('combo') || defender.anim === 'dashAttack')
            if (swinging) {
              this.events.push({ type: 'deflect', x: p.x, y: p.y, who: defender.isPlayer ? 'player' : defender.id })
            } else {
              this.applyProjectileHit(defender, p)
            }
            consumed = true
          }
        }
      }

      if (!consumed) remaining.push(p)
    }
    this.projectiles = remaining
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

    if (f.anim === 'leapfrog') {
      f.leapfrogElapsed += dt
      const t = Math.min(1, f.leapfrogElapsed / LEAPFROG_DURATION)
      f.x = f.leapfrogFromX + (f.leapfrogToX - f.leapfrogFromX) * t
      f.y = GROUND_Y - Math.sin(t * Math.PI) * LEAPFROG_ARC_HEIGHT
      this.stepAnim(f, dt)
      if (t >= 1) {
        f.y = GROUND_Y
        f.grounded = true
        this.startMove(f, 'leapfrogLand')
      }
      return
    }

    if (f.anim === 'leapfrogLand') {
      this.stepAnim(f, dt)
      const clip = CLIPS[clipFor(f.anim)]
      const frameDur = 1 / clip.fps
      if (f.frame >= clip.frames.length - 1 && f.frameTimer >= frameDur - 1e-6) {
        f.anim = 'idle'
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
        if (f.weapon === 'gun' && f.anim !== 'slideKick') {
          this.fireWeapon(f)
        } else {
          this.resolveHit(f, this.weaponAdjustedMove(f, activeMove))
        }
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

  /** Spawns a power-up on the ground every so often, one at a time, and
   * grants its charge to whichever fighter (player or AI) walks over it. */
  private updatePowerUps(dt: number) {
    if (this.powerUps.length === 0) {
      this.powerUpTimer -= dt
      if (this.powerUpTimer <= 0) {
        this.powerUpTimer = 11 + Math.random() * 7
        const kind: PowerUpKind = Math.random() < 0.5 ? 'slide' : 'leapfrog'
        const margin = hb(90)
        const x = margin + Math.random() * (ARENA_W - margin * 2)
        this.powerUps.push({ id: `pu${this.nextPowerUpId++}`, kind, x, y: GROUND_Y })
      }
    }

    for (const p of this.powerUps) {
      for (const f of [this.player, this.opponent]) {
        if (f.dead || !f.grounded || this.isBusy(f)) continue
        if (Math.abs(f.x - p.x) > hb(34)) continue
        if (p.kind === 'slide') f.hasSlideCharge = true
        else f.hasLeapfrogCharge = true
        this.events.push({ type: 'powerup', x: p.x, y: GROUND_Y - 70, who: f.isPlayer ? 'player' : f.id, powerUpKind: p.kind })
        p.taken = true
      }
    }
    if (this.powerUps.some((p) => p.taken)) this.powerUps = this.powerUps.filter((p) => !p.taken)
  }

  update(dt: number) {
    if (this.over) return

    this.updateFighter(this.player, dt)
    this.updateFighter(this.opponent, dt)
    this.updatePowerUps(dt)
    this.updateProjectiles(dt)

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
  // A gun-wielder's "reach" is really its bullet range — keep distance and
  // shoot rather than closing to melee. A lightsaber gets a bigger-but-still-
  // finite reach. Fists stay at the original tight spacing.
  const strikeRange = ai.weapon === 'gun' ? hb(320) : ai.weapon === 'lightsaber' ? Math.round(hb(58) * 1.8) : hb(58)
  const tooCloseMargin = ai.weapon === 'gun' ? hb(150) : hb(30)
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

    // Power-ups: a charged leapfrog is an escape valve when the fight is
    // going badly — vault clean over the player and reset the fight.
    if (ai.hasLeapfrogCharge && ai.health < ai.maxHealth * 0.4 && dist < hb(160) && Math.random() < 0.4) {
      controller.leapfrog(ai)
      controller.move(ai, 0, 0)
      return
    }

    if (dist > strikeRange) {
      ai.moveDir = ai.x < target.x ? 1 : -1
      ai.aiSpeedRatio = dist > hb(140) ? 1 : 0.4
      ai.wantBlock = false
      if (ai.grounded && dist < hb(210) && dist > strikeRange + hb(12) && Math.random() < profile.dashBias) {
        controller.swipeStrike(ai, ai.x < target.x ? 1 : -1)
      }
    } else if (dist < strikeRange - tooCloseMargin) {
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
    } else if (ai.hasSlideCharge && Math.random() < 0.55) {
      // Slide kick can't be guarded — a charged AI leans into using it as
      // a surprise mix-up rather than saving it forever.
      ai.moveDir = 0
      ai.wantBlock = false
      controller.slideKick(ai)
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
