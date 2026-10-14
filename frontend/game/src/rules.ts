// Espelho de backend/app/game/rules.py. Mudou lá, muda aqui:
// o rules.test.ts compara os dois pelo fixtures/mirror.json.
export const TICK_RATE = 30; // Hz
export const PLAYER_SPEED = 3.6; // cél/s
export const PLAYER_SPRINT_MULT = 2.0; // multiplicador
export const PLAYER_ROT_SPEED = 1.8; // rad/s
export const MOUSE_MAX_ROT_SPEED = 18.85; // rad/s (6π)
export const PLAYER_RADIUS = 0.05; // cél
export const BODY_BLOCK_DISTANCE = 0.6; // cél
export const FIREBALL_COOLDOWN_S = 0.4; // s
export const DOOR_REACH = 1.0; // cél
export const POTION_HEAL = 3; // HP

export const ENEMY_SPEED = 1.5; // cél/s
export const ENEMY_RADIUS = 0.2; // cél
export const ENEMY_SEPARATION = 0.6; // cél
export const ENEMY_RETARGET_MARGIN = 1.0; // cél
export const ENEMY_CHASE_RANGE = 12; // cél
export const ENEMY_ATTACK_RANGE = 0.7; // cél
export const ENEMY_ATTACK_INTERVAL_S = 1.4; // s
export const ENEMY_DAMAGE = 1; // HP
export const ENEMY_DYING_S = 1.5; // s

export const BOSS_HP = 60; // HP
export const BOSS_SPEED = 2.0; // cél/s
export const BOSS_RADIUS = 0.2; // cél
export const BOSS_SIGHT_RANGE = 20.0; // cél
export const BOSS_MIN_RANGE = 8.0; // cél
export const BOSS_ATTACK_RANGE = 18.0; // cél
export const BOSS_ATTACK_WINDUP_S = 1.2; // s
export const BOSS_ATTACK_COOLDOWN_S = 2.2; // s
export const BOSS_DYING_S = 1.2; // s
export const BULLET_DAMAGE = 2; // HP
export const FIREBALL_BOSS_DAMAGE = 10; // HP

export const PROJECTILE_SPEED = 12.0; // cél/s
export const PROJECTILE_HIT_RADIUS = 0.3; // cél
export const PROJECTILE_RADIUS = 0.1; // cél
export const PROJECTILE_MAX_SUBSTEP = 0.1; // cél
export const PROJECTILE_HIT_S = 0.4; // s
export const FIREBALL_PLAYER_DAMAGE = 2; // HP

// valores por Ruleset (rules.md §2.6)
export const RULESET_NUMBERS = {
  coop: {
    MANA_MAX: 100, // Mana
    FIREBALL_MANA_COST: 10, // Mana
    MANA_REGEN_PER_S: 10.0, // Mana/s
    MANA_PICKUP: 30, // Mana
    ARMOR_POINTS: 3, // Armor
    RESPAWN_DELAY_S: null, // não existe respawn no coop
  },
  pvp: {
    MANA_MAX: 100, // Mana
    FIREBALL_MANA_COST: 20, // Mana
    MANA_REGEN_PER_S: 5.0, // Mana/s
    MANA_PICKUP: 20, // Mana
    ARMOR_POINTS: 2, // Armor
    RESPAWN_DELAY_S: 3.0, // s
  },
} as const;
