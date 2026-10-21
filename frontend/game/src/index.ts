// Ponto de entrada do jogo para a casca (mount-game.md §2.6): só mountGame e os tipos públicos.
import { createMountGame, type SceneRenderer } from "./mount";
import { AssetLoader, type Assets } from "./render/assets";
import { ThreeRenderer } from "./render/renderer";

export type { EndResult, HudState, HudStatus, MountedGame, MountOptions } from "./api";

// Junta o AssetLoader e o ThreeRenderer do Render na forma que o mount.ts espera. Os assets são
// de quem os carregou: saem depois do Renderer, e também quando o unmount chega no meio do init
function createThreeScene(canvas: HTMLCanvasElement): SceneRenderer {
  const renderer = new ThreeRenderer(canvas);
  let assets: Assets | null = null;
  let disposed = false;

  return {
    async init(map) {
      // só o dungeon existe por enquanto; o sewer entra com os Themes do Render (mount-game.md §5.3)
      const loaded = await new AssetLoader().load();
      if (disposed) {
        loaded.dispose();
        return;
      }
      assets = loaded;
      await renderer.init(map, loaded);
    },
    render: (view, dt) => renderer.render(view, dt),
    resize: (width, height) => renderer.resize(width, height),
    dispose() {
      if (disposed) return;
      disposed = true;
      renderer.dispose();
      assets?.dispose();
    },
  };
}

export const mountGame = createMountGame({ createRenderer: createThreeScene });
