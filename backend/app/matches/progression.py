"""XP, level, Elo e conquistas do progression.md §2–7. Funções puras: quem grava é o record_match_result."""
from collections.abc import Callable
from dataclasses import dataclass
from math import copysign, floor, isqrt

from app.game import TICK_RATE, MatchOutcome, Mode, PlayerOutcome


ELO_START = 1000 # o server_default de player_stats.elo
ELO_K = 32

# §5: participação, (por unidade, teto) do desempenho e vitória por Mode
XP_PARTICIPATION = 20
XP_PERFORMANCE = {Mode.COOP: (5, 20), Mode.PVP: (10, 10)}
XP_WIN = {Mode.COOP: 100, Mode.PVP: 60}
XP_DRAW = 30 # só existe empate no pvp


def xp_gained(mode: Mode, player: PlayerOutcome, draw: bool) -> int:
	"""XP de um Player num Match; 0 para quem terminou desconectado (§2)."""
	if player.disconnected_at_end:
		return 0
	per_unit, cap = XP_PERFORMANCE[mode]
	# coop pontua Kills, pvp pontua Frags
	performance = per_unit * min(player.kills if mode == Mode.COOP else player.frags, cap)
	result = XP_WIN[mode] if player.won else XP_DRAW if draw else 0
	return XP_PARTICIPATION + performance + result


def threshold(level: int) -> int:
	"""O XP total em que o level começa (§6)."""
	return 100 * (level - 1) ** 2


def level_for(xp: int) -> int:
	# isqrt(xp // 100) == floor(sqrt(xp / 100)) para inteiros, sem arredondamento de float
	return 1 + isqrt(xp // 100)


def elo_delta(rating_a: int, rating_b: int, score_a: float) -> int:
	"""Quanto A ganha (B perde o mesmo), com os ratings de antes do Match (§7)."""
	expected_a = 1 / (1 + 10 ** ((rating_b - rating_a) / 400))
	raw = ELO_K * (score_a - expected_a)
	# metade afastada de zero; o round() do Python arredonda metade para o par
	return int(copysign(floor(abs(raw) + 0.5), raw))


@dataclass(frozen=True)
class Achievement:
	code: str
	mode: Mode | None # None: vale nos dois Modes
	earned: Callable[[PlayerOutcome, MatchOutcome], bool]


# §3, nesta ordem (é a do catalog da API); cada condição olha um Match só, sem somar partidas
ACHIEVEMENTS = (
	Achievement("coop_first_win", Mode.COOP, lambda p, o: p.won),
	Achievement("coop_exterminator", Mode.COOP, lambda p, o: p.kills >= 5),
	Achievement("coop_no_deaths_win", Mode.COOP, lambda p, o: p.won and p.deaths == 0),
	Achievement("pvp_first_win", Mode.PVP, lambda p, o: p.won),
	Achievement("pvp_five_frags", Mode.PVP, lambda p, o: p.frags >= 5),
	# a duração é da Room, não do Player: quem entra perto do fim também ganha (§4)
	Achievement("first_five_seconds", None, lambda p, o: o.duration_ticks >= 5 * TICK_RATE),
	Achievement("pvp_time_limit_win", Mode.PVP, lambda p, o: p.won and o.reason == "time_limit"),
)


def achievements_earned(mode: Mode, player: PlayerOutcome, outcome: MatchOutcome) -> list[str]:
	"""Os codes que o Player cumpriu neste Match; nenhum para quem terminou desconectado (§2)."""
	if player.disconnected_at_end:
		return []
	return [a.code for a in ACHIEVEMENTS if a.mode in (None, mode) and a.earned(player, outcome)]
