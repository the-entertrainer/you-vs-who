export interface CharacterPalette {
  skin: string
  hair: string
  outfit: string
  outfitDark: string
  accent: string
}

export interface Character {
  id: string
  name: string
  title: string
  desc: string
  palette: CharacterPalette
  power: number // special move damage multiplier
  speed: number // movement/attack speed
  winQuote: string
}

export interface Arena {
  id: string
  name: string
  sky: string
  floor: string
  floorLine: string
  prop: string
}

export const CHARACTERS: Character[] = [
  {
    id: 'boss',
    name: 'THE BOSS',
    title: 'Micromanaging Overlord',
    desc: "Equipped with a legendary +5 Monocle of Scrutiny. Specializes in 'quick syncs' that run four hours over.",
    palette: { skin: '#e8b98a', hair: '#2b2b2b', outfit: '#0f3651', outfitDark: '#092338', accent: '#fc5841' },
    power: 3,
    speed: 2,
    winQuote: "That's not synergistic behavior. You're fired.",
  },
  {
    id: 'zombie',
    name: 'COFFEE ZOMBIE',
    title: 'Caffeinated Menace',
    desc: "Hasn't blinked since the 2018 audit. Primary attack: hurling scalding espresso at legal documents.",
    palette: { skin: '#cdb499', hair: '#3a3a3a', outfit: '#3e5100', outfitDark: '#2a3900', accent: '#afd44b' },
    power: 2,
    speed: 4,
    winQuote: 'Need... more... cold brew...',
  },
  {
    id: 'wizard',
    name: 'SPREADSHEET WIZARD',
    title: 'Excel Overlord',
    desc: 'Speaks exclusively in VLOOKUP. Can collapse entire departments with one corrupted cell.',
    palette: { skin: '#e0b48f', hair: '#5c3b1e', outfit: '#2a3900', outfitDark: '#1c2600', accent: '#cbf164' },
    power: 4,
    speed: 2,
    winQuote: '=IF(YOU=LOSER,TRUE,TRUE)',
  },
  {
    id: 'meeting',
    name: 'MEETING ZOMBIE',
    title: 'Calendar-Bound Wraith',
    desc: 'Exists purely between 9am standups and 5pm retros. Cannot be reasoned with, only rescheduled.',
    palette: { skin: '#d8c3a5', hair: '#1f1f1f', outfit: '#42474d', outfitDark: '#2c2f33', accent: '#c2c7ce' },
    power: 2,
    speed: 3,
    winQuote: 'Can we circle back on your defeat?',
  },
  {
    id: 'slack',
    name: 'SLACK LORD',
    title: 'Notification Tyrant',
    desc: 'Sends @channel at 11:58pm on a Friday. Feeds on unread badges and read receipts.',
    palette: { skin: '#e6b791', hair: '#402a1e', outfit: '#4a154b', outfitDark: '#350f36', accent: '#ecb22e' },
    power: 3,
    speed: 3,
    winQuote: 'Seen. Typing... Never responding.',
  },
  {
    id: 'plant',
    name: 'PLANT KILLER',
    title: 'Desk Botanist of Doom',
    desc: "Has murdered eleven succulents this quarter and blames 'the lighting.'",
    palette: { skin: '#d8ab86', hair: '#6b4423', outfit: '#2a3900', outfitDark: '#1c2600', accent: '#b62515' },
    power: 2,
    speed: 3,
    winQuote: 'It was already dying when I got here.',
  },
  {
    id: 'printer',
    name: 'PRINTER WARRIOR',
    title: 'Paper Jam Berserker',
    desc: 'Forged in toner fumes. Screams "PC LOAD LETTER" as a battle cry.',
    palette: { skin: '#c9a37f', hair: '#111111', outfit: '#73777e', outfitDark: '#42474d', accent: '#fc5841' },
    power: 5,
    speed: 1,
    winQuote: 'ERROR 0x04: YOU HAVE BEEN REMOVED.',
  },
  {
    id: 'hr',
    name: 'HR ENFORCER',
    title: 'Compliance Unit',
    desc: 'The physical embodiment of the employee handbook. Resistance is non-compliant.',
    palette: { skin: '#e8b98a', hair: '#3a2418', outfit: '#0f3651', outfitDark: '#092338', accent: '#ffffff' },
    power: 3,
    speed: 3,
    winQuote: "That's going in your file.",
  },
  {
    id: 'it',
    name: 'IT SUPPORT',
    title: 'Ticket Queue Guardian',
    desc: 'Has turned it off and on again exactly one million times. Trusts no one, patches everything.',
    palette: { skin: '#d8c3a5', hair: '#242424', outfit: '#1d1c13', outfitDark: '#000000', accent: '#a8caec' },
    power: 3,
    speed: 3,
    winQuote: 'Have you tried restarting your career?',
  },
  {
    id: 'sales',
    name: 'SALES SHARK',
    title: 'Quota Crushing Menace',
    desc: 'Always be closing. Especially closing on your face with a rolled-up pitch deck.',
    palette: { skin: '#e6b791', hair: '#1a1a1a', outfit: '#b62515', outfitDark: '#5b0300', accent: '#ffffff' },
    power: 4,
    speed: 4,
    winQuote: "Let's circle back after I crush you.",
  },
  {
    id: 'quiet',
    name: 'QUIET QUITTER',
    title: 'Minimum Viable Employee',
    desc: 'Does exactly what the job description says. Not one keystroke more.',
    palette: { skin: '#cdb499', hair: '#4a4a4a', outfit: '#42474d', outfitDark: '#2c2f33', accent: '#afd44b' },
    power: 2,
    speed: 2,
    winQuote: "That's outside my scope. Also, you lost.",
  },
  {
    id: 'intern',
    name: 'THE INTERN',
    title: 'Unpaid Wildcard',
    desc: 'Has nothing to lose and a coffee run to finish. Fights with the fury of the exploited.',
    palette: { skin: '#e0b48f', hair: '#6b4423', outfit: '#0f3651', outfitDark: '#092338', accent: '#fc5841' },
    power: 3,
    speed: 5,
    winQuote: 'Wait, do I get a full-time offer now?',
  },
]

export const ARENAS: Arena[] = [
  {
    id: 'cubicles',
    name: 'Cubicle Farm',
    sky: '#dedacc',
    floor: '#c2c7ce',
    floorLine: '#73777e',
    prop: '#e7e2d5',
  },
  {
    id: 'conference',
    name: 'Conference Room',
    sky: '#a8caec',
    floor: '#2a4d69',
    floorLine: '#0f3651',
    prop: '#f5f1e3',
  },
  {
    id: 'breakroom',
    name: 'Break Room',
    sky: '#fc5841',
    floor: '#ede8da',
    floorLine: '#b62515',
    prop: '#fef9eb',
  },
  {
    id: 'openoffice',
    name: 'Open Office Jungle',
    sky: '#cbf164',
    floor: '#3e5100',
    floorLine: '#2a3900',
    prop: '#afd44b',
  },
  {
    id: 'executive',
    name: 'Executive Suite',
    sky: '#1d1c13',
    floor: '#42474d',
    floorLine: '#0f3651',
    prop: '#a8caec',
  },
]

export const HIT_MESSAGES = [
  'REORG!',
  'SYNERGIZED!',
  'PIP\'D!',
  'GHOSTED!',
  'CC\'D THE WRONG PERSON!',
  'MIC LEFT UNMUTED!',
  'CALENDAR BOMBED!',
  'REPLY-ALL\'D!',
  'STAPLED!',
  'BENCHED!',
]
