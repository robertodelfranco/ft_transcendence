import * as THREE from "three";

export const dungeonTheme = {
  floor: 0x545454,
  ceiling: 0x161e00,
  walls: {
    no: "/assets/map/dungeon_wall_1.png",
    so: "/assets/map/dungeon_wall_9.png",
    we: "/assets/map/dungeon_wall_2.png",
    ea: "/assets/map/dungeon_wall_10.png",
  },
};

export interface Assets {
  floor: number;
  ceiling: number;
  walls: Record<"no" | "so" | "we" | "ea", THREE.Texture>;
  door: THREE.Texture;
  hand: THREE.Texture;
  fireball: THREE.Texture;
  dispose(): void;
}

// O chamador possui os assets e os libera depois do Renderer.
export class AssetLoader {
  async load(theme = dungeonTheme): Promise<Assets> {
    const urls = {
      ...theme.walls,
      door: "/assets/map/door_2.png",
      hand: "/assets/player/player_hand_white.png",
      fireball: "/assets/player/fireball_1.png",
    };
    const slots = ["no", "so", "we", "ea", "door", "hand", "fireball"] as const;
    const loader = new THREE.TextureLoader();
    const results = await Promise.allSettled(
      slots.map(slot => loader.loadAsync(urls[slot])),
    );
    if (results.some(result => result.status === "rejected")) {
      results.forEach(result => {
        if (result.status === "fulfilled") result.value.dispose();
      });
      throw new Error("asset_load_failed");
    }
    const textures = {} as Record<typeof slots[number], THREE.Texture>;
    results.forEach((result, index) => {
      if (result.status !== "fulfilled") return;
      const texture = result.value;
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.magFilter = THREE.NearestFilter;
      texture.minFilter = THREE.NearestFilter;
      texture.generateMipmaps = false;
      textures[slots[index]] = texture;
    });
    let disposed = false;
    return {
      floor: theme.floor,
      ceiling: theme.ceiling,
      walls: { no: textures.no, so: textures.so, we: textures.we, ea: textures.ea },
      door: textures.door,
      hand: textures.hand,
      fireball: textures.fireball,
      dispose() {
        if (disposed) return;
        disposed = true;
        Object.values(textures).forEach(texture => texture.dispose());
      },
    };
  }
}
