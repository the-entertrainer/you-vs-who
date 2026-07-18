import type { EnemyProfile } from './engine'

// Five office archetypes, each a fighting-style remix of the same stickman
// (recolored, not re-drawn) rather than distinct sprite art. Waves cycle
// through this roster, getting tougher every full lap.
export const ENEMY_ROSTER: EnemyProfile[] = [
  {
    id: 'micromanager',
    name: 'THE MICROMANAGER',
    tint: 'rgba(123, 63, 160, 0.55)',
    tagline: 'WANTS A STATUS UPDATE ON YOUR FACE',
    healthMult: 1,
    dmgMult: 1,
    speedMult: 0.95,
    aggression: 0.5,
    dashBias: 0.18,
    airBias: 0.35,
    blockBias: 0.55,
    chainBias: 0.7,
    thinkMin: 100,
    thinkMax: 170,
  },
  {
    id: 'reply_all',
    name: 'REPLY-ALL',
    tint: 'rgba(204, 150, 20, 0.55)',
    tagline: "CC'D THE ENTIRE COMPANY ON THIS ASS-KICKING",
    healthMult: 0.68,
    dmgMult: 0.7,
    speedMult: 1.1,
    aggression: 0.85,
    dashBias: 0.12,
    airBias: 0.2,
    blockBias: 0.12,
    chainBias: 0.97,
    thinkMin: 55,
    thinkMax: 95,
  },
  {
    id: 'marathoner',
    name: 'THE MARATHONER',
    tint: 'rgba(34, 150, 90, 0.55)',
    tagline: 'ALREADY DID 10K BEFORE THIS MEETING',
    healthMult: 1.05,
    dmgMult: 0.95,
    speedMult: 1.4,
    aggression: 0.45,
    dashBias: 0.6,
    airBias: 0.15,
    blockBias: 0.2,
    chainBias: 0.55,
    thinkMin: 80,
    thinkMax: 130,
  },
  {
    id: 'influencer',
    name: 'THE INFLUENCER',
    tint: 'rgba(204, 32, 130, 0.55)',
    tagline: 'GOING LIVE FOR THIS ONE, LIKE AND SUBSCRIBE',
    healthMult: 0.85,
    dmgMult: 1.05,
    speedMult: 1.05,
    aggression: 0.55,
    dashBias: 0.2,
    airBias: 0.75,
    blockBias: 0.25,
    chainBias: 0.7,
    thinkMin: 80,
    thinkMax: 130,
  },
  {
    id: 'hero',
    name: 'THE HERO OF THEIR OWN STORY',
    tint: 'rgba(204, 32, 24, 0.55)',
    tagline: 'TOOK CREDIT FOR YOUR PROJECT, NOW TAKES THE L',
    healthMult: 1.35,
    dmgMult: 1.15,
    speedMult: 1.1,
    aggression: 0.62,
    dashBias: 0.32,
    airBias: 0.4,
    blockBias: 0.3,
    chainBias: 0.95,
    thinkMin: 70,
    thinkMax: 110,
  },
]

/** Wave 1 = roster[0], wave 6 = roster[0] again but tougher, and so on. */
export function profileForWave(wave: number): EnemyProfile {
  const base = ENEMY_ROSTER[(wave - 1) % ENEMY_ROSTER.length]
  const lap = Math.floor((wave - 1) / ENEMY_ROSTER.length)
  if (lap === 0) return base
  const healthMult = base.healthMult * (1 + lap * 0.22)
  const dmgMult = base.dmgMult * (1 + lap * 0.1)
  return { ...base, healthMult, dmgMult }
}
