import * as THREE from "three";
import { BILLBOARD_URLS, createBillboardAssets, type BillboardAssets } from "./billboardAssets";

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
  billboards: BillboardAssets;
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
    // A fireball da mão também é um quadro dos billboards: uma carga e um proprietário por URL.
    const assetUrls = [...new Set([...Object.values(urls), ...BILLBOARD_URLS])];
    const loader = new THREE.TextureLoader();
    const results = await Promise.allSettled(
      assetUrls.map(url => loader.loadAsync(url)),
    );
    if (results.some(result => result.status === "rejected")) {
      results.forEach(result => {
        if (result.status === "fulfilled") result.value.dispose();
      });
      throw new Error("asset_load_failed");
    }
    const textures = new Map<string, THREE.Texture>();
    results.forEach((result, index) => {
      if (result.status !== "fulfilled") return;
      const texture = result.value;
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.magFilter = THREE.NearestFilter;
      texture.minFilter = THREE.NearestFilter;
      texture.generateMipmaps = false;
      textures.set(assetUrls[index], texture);
    });
    let billboards: BillboardAssets;
    try {
      billboards = createBillboardAssets(textures);
    } catch (error) {
      textures.forEach(texture => texture.dispose());
      throw new Error("asset_load_failed", { cause: error });
    }
    const texture = (slot: keyof typeof urls) => textures.get(urls[slot])!;
    let disposed = false;
    return {
      floor: theme.floor,
      ceiling: theme.ceiling,
      walls: { no: texture("no"), so: texture("so"), we: texture("we"), ea: texture("ea") },
      door: texture("door"),
      hand: texture("hand"),
      fireball: texture("fireball"),
      billboards,
      dispose() {
        if (disposed) return;
        disposed = true;
        textures.forEach(texture => texture.dispose());
      },
    };
  }
}
