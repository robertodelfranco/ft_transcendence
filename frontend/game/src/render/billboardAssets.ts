import * as THREE from "three";

const sequence = (prefix: string, count: number) =>
  Array.from({ length: count }, (_, i) => `/assets/${prefix}${i}.png`);

// Theme dungeon. A escolha entre Themes entra na F3.8.
const urls = {
  enemy: sequence("enemy/skeleton/skeleton_", 10),
  boss: sequence("enemy/boss_mage/boss_mage_", 10),
  fireball: sequence("player/fireball_", 4),
  key: ["/assets/collectables/key.png"],
  potion: ["/assets/collectables/pot.png"],
  mana: ["/assets/placeholders/mana.svg"],
  armor: ["/assets/placeholders/armor.svg"],
  player: ["/assets/placeholders/player.svg"],
};

export const BILLBOARD_URLS = [...new Set(Object.values(urls).flat())];

export interface SpriteFrame {
  texture: THREE.Texture;
  width: number;
  height: number;
  anchorX: number;
  anchorY: number;
}

export interface SpriteSheet {
  frames: SpriteFrame[];
  referenceHeight: number;
}

export type BillboardAssets = Record<keyof typeof urls, SpriteSheet>;

// Mede transparência uma vez no carregamento; nunca durante o render.
// A base opaca encosta no chão, mesmo com margem transparente no PNG.
export function createBillboardAssets(textures: ReadonlyMap<string, THREE.Texture>): BillboardAssets {
  const entries = Object.entries(urls).map(([kind, paths]) => {
    let referenceHeight = 1;
    const frames = paths.map(path => {
      const texture = textures.get(path);
      if (!texture) throw new Error("billboard_asset_missing");
      const image = texture.image as HTMLImageElement;
      const width = image.naturalWidth;
      const height = image.naturalHeight;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("billboard_canvas_unavailable");
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, width, height).data;
      let left = width, right = -1, top = height, bottom = -1;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (pixels[(y * width + x) * 4 + 3] === 0) continue;
          left = Math.min(left, x);
          right = Math.max(right, x);
          top = Math.min(top, y);
          bottom = Math.max(bottom, y);
        }
      }
      if (bottom === -1) throw new Error("billboard_asset_empty");
      referenceHeight = Math.max(referenceHeight, bottom - top + 1);
      return {
        texture, width, height,
        anchorX: (left + right + 1) / (2 * width),
        anchorY: 1 - (bottom + 1) / height,
      };
    });
    return [kind, { frames, referenceHeight }];
  });
  return Object.fromEntries(entries) as BillboardAssets;
}
