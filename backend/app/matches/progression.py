"""XP, level e Elo do progression.md §5–7. Funções puras: quem grava é o record_match_result."""
from math import copysign, floor, isqrt

from app.game import Mode, PlayerOutcome


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
