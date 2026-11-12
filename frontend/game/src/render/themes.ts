import type { RoomOptions } from "../types";

export interface Theme {
  floor: number;
  ceiling: number;
  walls: Record<"no" | "so" | "we" | "ea", string>;
  wallRoughness: number;
  sprites: { enemy: string; boss: string; bullet: string };
  light: { ambient: number; directional: number; torch: number; flame: number };
  fogDensity: number;
}

export const dungeonTheme: Theme = {
  wallRoughness: 0.95,
  floor: 0x545454,
  ceiling: 0x161e00,
  walls: {
    no: "/assets/map/dungeon_wall_1.png",
    so: "/assets/map/dungeon_wall_9.png",
    we: "/assets/map/dungeon_wall_2.png",
    ea: "/assets/map/dungeon_wall_10.png",
  },
  sprites: {
    enemy: "enemy/skeleton/skeleton_",
    boss: "enemy/boss_mage/boss_mage_",
    bullet: "player/fireball_",
  },
  light: { ambient: 0xffffff, directional: 0xffffff, torch: 0xffaa55, flame: 0xffb347 },
  fogDensity: 0.08,
};

export const sewerTheme: Theme = {
  wallRoughness: 0.28,
  floor: 0x0000a8,
  ceiling: 0x161e00,
  walls: {
    no: "/assets/map/dungeon_wall_5.png",
    so: "/assets/map/dungeon_wall_6.png",
    we: "/assets/map/dungeon_wall_7.png",
    ea: "/assets/map/dungeon_wall_8.png",
  },
  sprites: {
    enemy: "enemy/sea_dragon/sea_dragon_",
    boss: "enemy/boss_skeleton/boss_skeleton_",
    bullet: "enemy/boss_attack/boss_attack_",
  },
  // Paleta inicial do esgoto; não altera o orçamento de luzes e sombras.
  light: { ambient: 0xc3d9cf, directional: 0xb5d4cf, torch: 0x88ccaa, flame: 0xaaffcc },
  fogDensity: 0.08,
};

export const themes: Record<RoomOptions["theme"], Theme> = {
  dungeon: dungeonTheme,
  sewer: sewerTheme,
};
