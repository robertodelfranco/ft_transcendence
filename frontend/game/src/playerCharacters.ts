// Cada entrada vira um card no Lobby e uma sprite carregada antes da partida.
// Os IDs também são aceitos por backend/app/game/characters.py.
export const PLAYER_CHARACTERS = [
  { id: "nemesis", sprite: "/assets/player/nemesis.png", projectileSprite: "/assets/player/fireball_0.png" },
  { id: "sucubus", sprite: "/assets/player/sucubus.png", projectileSprite: "/assets/player/projectiles/sucubus_atack.png" },
  { id: "oil", sprite: "/assets/player/oil.png", projectileSprite: "/assets/player/projectiles/oil_atack.png" },
] as const;

export type CharacterId = (typeof PLAYER_CHARACTERS)[number]["id"];
export const DEFAULT_CHARACTER: CharacterId = "nemesis";

export function playerCharacter(id: string | undefined) {
  return PLAYER_CHARACTERS.find((character) => character.id === id) ?? PLAYER_CHARACTERS[0];
}

export function isCharacterId(id: unknown): id is CharacterId {
  return PLAYER_CHARACTERS.some((character) => character.id === id);
}
