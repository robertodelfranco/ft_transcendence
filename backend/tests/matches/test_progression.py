# backend/tests/matches/test_progression.py
# Fórmulas do progression.md §5–7: XP por Match, level por XP e Elo do PvP. Sem banco.
import pytest

from app.game import TICK_RATE, MatchOutcome, Mode, PlayerOutcome
from app.matches.progression import (ACHIEVEMENTS, achievements_earned, elo_delta, level_for,
	threshold, xp_gained)


def player(won: bool = False, kills: int = 0, frags: int = 0, deaths: int = 0, survived: bool = True,
		disconnected: bool = False) -> PlayerOutcome:
	return PlayerOutcome(user_id=1, won=won, survived=survived, kills=kills, frags=frags, deaths=deaths,
		damage_dealt=0, damage_taken=0, armor_absorbed=0, keys_collected=0, potions_used=0,
		disconnected_at_end=disconnected)


def match(reason: str, ticks: int) -> MatchOutcome:
	# as condições só leem reason e duration_ticks do Match; o resto fica vazio
	return MatchOutcome(result="win", reason=reason, winner_ids=(), duration_ticks=ticks, players=())


# ---------- XP (§5) ----------

@pytest.mark.parametrize("mode, outcome, draw, xp", [
	(Mode.COOP, player(won=True, kills=5), False, 145),  # 20 + 25 + 100
	(Mode.COOP, player(kills=4), False, 40),             # derrota: 20 + 20
	(Mode.PVP, player(won=True, frags=5), False, 130),   # 20 + 50 + 60
	(Mode.PVP, player(frags=2), True, 70),               # empate: 20 + 20 + 30
	(Mode.PVP, player(), False, 20),                     # derrota sem Frag: só a participação
	(Mode.COOP, player(won=True, kills=30), False, 220), # teto: a parcela para em 20 Kills
	(Mode.PVP, player(won=True, frags=15), False, 180),  # teto: a parcela para em 10 Frags
	(Mode.COOP, player(won=True, kills=9, disconnected=True), False, 0), # desconectado no fim
	(Mode.PVP, player(won=True, frags=5, disconnected=True), False, 0),
])
def test_xp_gained(mode, outcome, draw, xp):
	assert xp_gained(mode, outcome, draw) == xp


def test_coop_kills_do_not_count_in_pvp_and_frags_do_not_count_in_coop():
	# cada Mode pontua só o próprio contador
	assert xp_gained(Mode.COOP, player(frags=5), False) == 20
	assert xp_gained(Mode.PVP, player(kills=5), False) == 20


# ---------- level (§6) ----------

@pytest.mark.parametrize("xp, level, to_next", [
	(0, 1, 100), (99, 1, 1), (100, 2, 300), (399, 2, 1),
	(400, 3, 500), (899, 3, 1), (900, 4, 700),
	(235, 2, 165), # o exemplo da §6: 90 + 145
	(1840, 5, 660), (410, 3, 490), # os exemplos do matches-api.md §3
])
def test_level_and_xp_to_next_level(xp, level, to_next):
	assert level_for(xp) == level
	assert threshold(level + 1) - xp == to_next


@pytest.mark.parametrize("level, start", [(1, 0), (2, 100), (3, 400), (5, 1600)])
def test_threshold_is_where_the_level_starts(level, start):
	assert threshold(level) == start


# ---------- Elo (§7) ----------

@pytest.mark.parametrize("rating_a, rating_b, score_a, delta", [
	(1000, 1000, 1, 16), (1000, 1000, 0, -16), (1000, 1000, 0.5, 0),
	(1000, 1200, 1, 24), (1200, 1000, 1, 8), (1000, 1200, 0.5, 8),
])
def test_elo_delta(rating_a, rating_b, score_a, delta):
	assert elo_delta(rating_a, rating_b, score_a) == delta


def test_half_rounds_away_from_zero():
	# expected = 1/(1 + 10^(−400/400)) = 10/11; 32 × (1 − 10/11) = 2,909… → 3, e o simétrico −3.
	# o caso 0,5 exato não sai dos ratings inteiros; o que importa é o sinal não mudar o arredondamento
	assert elo_delta(1400, 1000, 1) == 3
	assert elo_delta(1000, 1400, 0) == -3


# ---------- conquistas (§2–3, roteiro do §8) ----------

def earned(mode: Mode, outcome: PlayerOutcome, reason: str, ticks: int = 5 * TICK_RATE) -> list[str]:
	return achievements_earned(mode, outcome, match(reason, ticks))


def test_catalog_follows_the_contract_order():
	# é a ordem do catalog da API e do desempate do unlocked
	assert [(a.code, a.mode) for a in ACHIEVEMENTS] == [
		("coop_first_win", Mode.COOP), ("coop_exterminator", Mode.COOP),
		("coop_no_deaths_win", Mode.COOP), ("pvp_first_win", Mode.PVP), ("pvp_five_frags", Mode.PVP),
		("first_five_seconds", None), ("pvp_time_limit_win", Mode.PVP)]


# lista exata: prova também o que não desbloqueia (vitória de um Mode não vale no outro)
@pytest.mark.parametrize("mode, outcome, reason, codes", [
	(Mode.COOP, player(kills=4), "all_dead", ["first_five_seconds"]),
	(Mode.COOP, player(kills=5), "all_dead", ["coop_exterminator", "first_five_seconds"]), # sem vitória
	(Mode.COOP, player(won=True), "boss_defeated",
		["coop_first_win", "coop_no_deaths_win", "first_five_seconds"]),
	(Mode.COOP, player(won=True, deaths=1), "boss_defeated", ["coop_first_win", "first_five_seconds"]),
	(Mode.PVP, player(won=True, frags=5), "frag_limit",
		["pvp_first_win", "pvp_five_frags", "first_five_seconds"]),
	(Mode.PVP, player(frags=5), "time_limit", ["pvp_five_frags", "first_five_seconds"]), # derrota
	(Mode.PVP, player(frags=4), "frag_limit", ["first_five_seconds"]),
	(Mode.PVP, player(won=True), "time_limit", ["pvp_first_win", "first_five_seconds", "pvp_time_limit_win"]),
	(Mode.PVP, player(), "time_limit", ["first_five_seconds"]), # empate: won é false para os dois
	(Mode.PVP, player(won=True), "forfeit", ["pvp_first_win", "first_five_seconds"]),
])
def test_achievements_earned(mode, outcome, reason, codes):
	assert earned(mode, outcome, reason) == codes


@pytest.mark.parametrize("ticks, codes", [(5 * TICK_RATE - 1, []), (5 * TICK_RATE, ["first_five_seconds"])])
def test_five_seconds_counts_room_ticks_and_not_survival(ticks, codes):
	# morto e conectado vale: a condição é a duração da Room, sem arredondar (§4)
	assert earned(Mode.COOP, player(deaths=1, survived=False), "all_dead", ticks) == codes


@pytest.mark.parametrize("mode", list(Mode))
def test_disconnected_at_the_end_earns_nothing(mode):
	assert earned(mode, player(won=True, kills=9, frags=9, disconnected=True), "time_limit") == []
