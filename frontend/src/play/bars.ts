import type { HudState } from "../../game/src/index";

// Fração da barra entre 0 e 1; o número mostrado continua o recebido. Sem máximo positivo
// (antes do welcome) não há barra, para zero não parecer morte
export function fraction(value: number, max: number): number | null {
  if (max <= 0)
    return null;
  return Math.min(Math.max(value / max, 0), 1);
}

// Limiar visual da hud.md §3, não regra de dano: vivo e com no máximo 25% do máximo
export function isLowHp({ hp, maxHp }: Pick<HudState, "hp" | "maxHp">): boolean {
  return hp > 0 && maxHp > 0 && hp / maxHp <= 0.25;
}