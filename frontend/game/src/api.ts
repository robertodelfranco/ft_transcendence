// Interface pública do jogo para a casca (mount-game.md §2.6, arq. §8.3).
// Os nomes são camelCase, e não os do fio: quem converte é o net/.

export type HudStatus = "connecting" | "running" | "finished" | "disconnected" | "error";

export interface HudState {
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  armor: number;
  keys: number;
  alive: boolean;
  ping: number | null; // ms; null enquanto não medido (F2.12)
  players: Array<{ id: number; name: string; hp: number; alive: boolean; connected: boolean }>;
  scoreboard: { players: Array<{ id: number; frags: number }>; timeLeftS: number } | null;
  killfeed: Array<{ by: number | null; victim: number; tick: number }>;
  status: HudStatus;
  error?: string; // code que a casca traduz; nunca frase
}

export interface EndResult {
  result: "win" | "loss" | "draw";
  winnerIds: number[];
  reason: string;
}

export interface MountOptions {
  matchId: number;
  getAccessToken: () => Promise<string>;
  onHud: (hud: HudState) => void;
  onEnd: (result: EndResult) => void;
  wsUrl?: string; // padrão: wss://<host>/ws/game/<matchId>
}

export interface MountedGame {
  unmount(): void;
}
