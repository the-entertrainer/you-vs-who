// Character roster registry. Each entry points at a sprite folder under
// src/assets/<id>/ (see anim.ts). Only one fighter exists today — drop a new
// sprite pack in as its own folder and add an entry here to expand the roster.

export interface CharacterDef {
  id: string
  name: string
}

export const CHARACTERS: CharacterDef[] = [{ id: 'fighter', name: 'THE INTERN' }]

export const DEFAULT_PLAYER_ID = CHARACTERS[0].id
export const DEFAULT_RIVAL_ID = CHARACTERS[0].id
