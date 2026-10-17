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
  dispose(): void;
}

// O chamador possui os assets e os libera depois do Renderer.
export class AssetLoader {
  async load(theme = dungeonTheme): Promise<Assets> {
    const slots = ["no", "so", "we", "ea"] as const;
    const loader = new THREE.TextureLoader();
    const results = await Promise.allSettled(
      slots.map(slot => loader.loadAsync(theme.walls[slot])),
    );
    if (results.some(result => result.status === "rejected")) {
      results.forEach(result => {
        if (result.status === "fulfilled") result.value.dispose();
      });
      throw new Error("asset_load_failed");
    }
    const walls = {} as Assets["walls"];
    results.forEach((result, index) => {
      if (result.status !== "fulfilled") return;
      const texture = result.value;
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.magFilter = THREE.NearestFilter;
      texture.minFilter = THREE.NearestFilter;
      texture.generateMipmaps = false;
      walls[slots[index]] = texture;
    });
    let disposed = false;
    return {
      floor: theme.floor,
      ceiling: theme.ceiling,
      walls,
      dispose() {
        if (disposed) return;
        disposed = true;
        Object.values(walls).forEach(texture => texture.dispose());
      },
    };
  }
}
