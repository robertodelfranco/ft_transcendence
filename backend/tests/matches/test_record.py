# backend/tests/matches/test_record.py
# Fim de partida no banco (rooms.md §2.5 e §2.6): record_match_result uma vez só, abort_unfinished
# e o MatchDetail que a tela de resultado lê (matches-api.md §2.4).
import asyncio
import uuid
from contextlib import asynccontextmanager
from dataclasses import asdict
from datetime import datetime, timezone

import pytest
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.auth.models import User
from app.auth.schemas import DEFAULT_AVATAR_URL
from app.auth.security import create_access_token
from app.game import MatchOutcome, PlayerOutcome
from app.matches.models import Match, MatchPlayer, PlayerStats, UserAchievement
from app.matches.results import abort_unfinished, record_match_result


pytestmark = pytest.mark.anyio

STARTED = datetime(2026, 10, 4, 18, 2, 11, tzinfo=timezone.utc)
ENDED = datetime(2026, 10, 4, 18, 9, 47, tzinfo=timezone.utc)


def player(user_id: int, **counters) -> PlayerOutcome:
	fields = {"won": False, "survived": True, "kills": 0, "frags": 0, "deaths": 0, "damage_dealt": 0,
		"damage_taken": 0, "armor_absorbed": 0, "keys_collected": 0, "potions_used": 0,
		"disconnected_at_end": False}
	return PlayerOutcome(user_id=user_id, **{**fields, **counters})


def coop(ids: list[int]) -> MatchOutcome:
	"""O JSON coop do rooms.md §3: boss morto, o terceiro morreu no caminho e saiu antes do fim."""
	a, b, c = ids
	return MatchOutcome(result="win", reason="boss_defeated", winner_ids=(a, b, c), duration_ticks=13680,
		players=(
			player(a, won=True, kills=9, damage_dealt=118, damage_taken=6, armor_absorbed=4,
				keys_collected=2, potions_used=1),
			player(b, won=True, kills=7, damage_dealt=94, damage_taken=9, keys_collected=1,
				potions_used=2),
			player(c, won=True, survived=False, kills=4, deaths=1, damage_dealt=52, damage_taken=10,
				armor_absorbed=2, disconnected_at_end=True),
		))


def pvp(ids: list[int]) -> MatchOutcome:
	"""O JSON pvp do rooms.md §3: vitória por frag_limit."""
	a, b = ids
	return MatchOutcome(result="win", reason="frag_limit", winner_ids=(a,), duration_ticks=4650,
		players=(
			player(a, won=True, frags=5, deaths=3, damage_dealt=10, damage_taken=6, potions_used=1),
			player(b, survived=False, frags=3, deaths=5, damage_dealt=6, damage_taken=10),
		))


@pytest.fixture
def sessions(db_session):
	# a sessão do teste, que sofre rollback no fim: o commit da função vira SAVEPOINT
	@asynccontextmanager
	async def factory():
		yield db_session
	return factory


async def new_users(db_session, *names: str) -> list[int]:
	users = [User(email=f"{name}@example.com", username=name) for name in names]
	db_session.add_all(users)
	await db_session.flush()
	return [user.id for user in users]


async def new_match(db_session, created_by: int, status: str = "running", mode: str = "coop",
		**columns) -> int:
	match = Match(mode=mode, map="arena", max_players=5, options={}, created_by=created_by,
		status=status, started_at=STARTED if status != "lobby" else None, **columns)
	db_session.add(match)
	await db_session.flush()
	return match.id


async def match_players(db_session, match_id: int) -> list[MatchPlayer]:
	return list(await db_session.scalars(select(MatchPlayer)
		.where(MatchPlayer.match_id == match_id).order_by(MatchPlayer.user_id)))


def counters(row: MatchPlayer) -> dict:
	"""A linha de match_players com os campos do PlayerOutcome, para comparar com asdict."""
	return {name: getattr(row, name) for name in asdict(player(0))}


async def status_of(db_session, match_id: int) -> tuple[str, str | None]:
	# as colunas, não o objeto: o que vale é o que está no banco, não o identity map da sessão
	row = await db_session.execute(select(Match.status, Match.reason).where(Match.id == match_id))
	return tuple(row.one())


async def count(db_session, model) -> int:
	return await db_session.scalar(select(func.count()).select_from(model))


STATS = ("matches_played", "wins", "losses", "draws", "kills", "frags", "deaths", "playtime_s", "xp",
	"level", "elo")


async def stats(db_session, mode: str) -> dict[int, dict]:
	"""As linhas de player_stats de um Mode, por user_id, lidas do banco."""
	rows = await db_session.execute(select(PlayerStats.user_id, *(getattr(PlayerStats, name) for name in STATS))
		.where(PlayerStats.mode == mode))
	return {user_id: dict(zip(STATS, values)) for user_id, *values in rows}


# ---------- record_match_result ----------

async def test_coop_result_finishes_the_match_and_writes_every_player(db_session, sessions):
	ids = await new_users(db_session, "akita", "caio", "rafael")
	match_id = await new_match(db_session, ids[0])
	outcome = coop(ids)

	assert await record_match_result(match_id, outcome, ENDED, sessions=sessions) == []

	match = await db_session.get(Match, match_id, populate_existing=True) # relido do banco
	assert (match.status, match.result, match.reason) == ("finished", "win", "boss_defeated")
	assert (match.ended_at, match.duration_ticks, match.started_at) == (ENDED, 13680, STARTED)
	rows = await match_players(db_session, match_id)
	assert [counters(row) for row in rows] == [asdict(p) for p in outcome.players]


async def test_pvp_result_records_xp_and_elo_for_each_player(db_session, sessions):
	ids = await new_users(db_session, "akita", "roberto")
	match_id = await new_match(db_session, ids[0], mode="pvp")

	await record_match_result(match_id, pvp(ids), ENDED, sessions=sessions)

	# vitória com 5 Frags: 20 + 50 + 60; derrota com 3: 20 + 30. Elo 1000 × 1000: ±16
	rows = await match_players(db_session, match_id)
	assert [(row.won, row.xp_gained, row.elo_before, row.elo_after) for row in rows] == [
		(True, 130, 1000, 1016), (False, 50, 1000, 984)]
	assert {user_id: (row["elo"], row["wins"], row["losses"])
		for user_id, row in (await stats(db_session, "pvp")).items()} == {
		ids[0]: (1016, 1, 0), ids[1]: (984, 0, 1)}


async def test_second_call_writes_nothing(db_session, sessions):
	ids = await new_users(db_session, "akita", "caio", "rafael")
	match_id = await new_match(db_session, ids[0])
	await record_match_result(match_id, coop(ids), ENDED, sessions=sessions)
	first = [counters(row) for row in await match_players(db_session, match_id)]
	first_stats = await stats(db_session, "coop")

	# outro resultado na repetida: se ela gravasse, o reason e os contadores mudariam
	other = MatchOutcome(result="loss", reason="forfeit", winner_ids=(), duration_ticks=1,
		players=tuple(player(user_id) for user_id in ids))
	assert await record_match_result(match_id, other, ENDED, sessions=sessions) == []

	match = await db_session.get(Match, match_id, populate_existing=True) # relido do banco
	assert (match.status, match.reason, match.duration_ticks) == ("finished", "boss_defeated", 13680)
	assert [counters(row) for row in await match_players(db_session, match_id)] == first
	assert await stats(db_session, "coop") == first_stats


@pytest.mark.parametrize("status", ["lobby", "aborted", "finished"])
async def test_a_match_that_is_not_running_is_ignored(db_session, sessions, status):
	# lobby: o commit do start falhou; aborted: o _abort chegou antes do game_over
	ids = await new_users(db_session, "akita", "caio", "rafael")
	match_id = await new_match(db_session, ids[0], status=status)

	assert await record_match_result(match_id, coop(ids), ENDED, sessions=sessions) == []

	assert (await status_of(db_session, match_id))[0] == status
	assert await match_players(db_session, match_id) == []


async def test_coop_result_aggregates_player_stats(db_session, sessions):
	ids = await new_users(db_session, "akita", "caio", "rafael")
	a, b, c = ids
	match_id = await new_match(db_session, a)

	await record_match_result(match_id, coop(ids), ENDED, sessions=sessions)

	# 13680 Ticks a 30 Hz = 456 s; o Elo não muda no coop
	base = {"matches_played": 1, "wins": 1, "losses": 0, "draws": 0, "frags": 0, "playtime_s": 456,
		"elo": 1000}
	assert await stats(db_session, "coop") == {
		a: {**base, "kills": 9, "deaths": 0, "xp": 165, "level": 2},
		b: {**base, "kills": 7, "deaths": 0, "xp": 155, "level": 2},
		# morreu e saiu antes do fim: a partida conta, o XP não
		c: {**base, "kills": 4, "deaths": 1, "xp": 0, "level": 1},
	}
	assert await stats(db_session, "pvp") == {}
	# conquistas são a F5.7, na mesma transação
	assert await count(db_session, UserAchievement) == 0


async def test_a_second_match_adds_to_the_existing_row(db_session, sessions):
	ids = await new_users(db_session, "akita", "caio", "rafael")
	db_session.add(PlayerStats(user_id=ids[1], mode="coop", matches_played=1, losses=1, kills=4,
		playtime_s=100, xp=90))
	match_id = await new_match(db_session, ids[0])

	await record_match_result(match_id, coop(ids), ENDED, sessions=sessions)

	# 90 + 155 = 245: o level é recalculado sobre o total, não sobre o ganho
	assert (await stats(db_session, "coop"))[ids[1]] == {"matches_played": 2, "wins": 1, "losses": 1,
		"draws": 0, "kills": 11, "frags": 0, "deaths": 0, "playtime_s": 556, "xp": 245, "level": 2,
		"elo": 1000}


@pytest.mark.parametrize("result, winner, elos", [
	("win", 0, (1024, 1176)),  # o de rating menor vence
	("win", 1, (992, 1208)),   # o de rating maior vence: o B não é sempre quem ganha
	("draw", None, (1008, 1192)), # o empate transfere para o de rating menor
])
async def test_pvp_elo_starts_from_the_stored_ratings(db_session, sessions, result, winner, elos):
	ids = await new_users(db_session, "akita", "roberto")
	db_session.add_all([PlayerStats(user_id=ids[0], mode="pvp", elo=1000),
		PlayerStats(user_id=ids[1], mode="pvp", elo=1200)])
	match_id = await new_match(db_session, ids[0], mode="pvp")
	outcome = MatchOutcome(result=result, reason="time_limit",
		winner_ids=() if winner is None else (ids[winner],), duration_ticks=9000,
		players=tuple(player(user_id, won=index == winner) for index, user_id in enumerate(ids)))

	await record_match_result(match_id, outcome, ENDED, sessions=sessions)

	rows = await match_players(db_session, match_id)
	assert [(row.elo_before, row.elo_after) for row in rows] == [(1000, elos[0]), (1200, elos[1])]
	pvp_stats = await stats(db_session, "pvp")
	assert (pvp_stats[ids[0]]["elo"], pvp_stats[ids[1]]["elo"]) == elos
	assert pvp_stats[ids[0]]["draws"] == (result == "draw")


async def test_pvp_forfeit_still_costs_the_disconnected_loser_elo(db_session, sessions):
	ids = await new_users(db_session, "akita", "roberto")
	match_id = await new_match(db_session, ids[0], mode="pvp")
	outcome = MatchOutcome(result="win", reason="forfeit", winner_ids=(ids[0],), duration_ticks=900,
		players=(player(ids[0], won=True, frags=1), player(ids[1], disconnected_at_end=True)))

	await record_match_result(match_id, outcome, ENDED, sessions=sessions)

	# sair não preserva o rating (progression.md §2); o XP de quem saiu é 0
	rows = await match_players(db_session, match_id)
	assert [(row.xp_gained, row.elo_after) for row in rows] == [(90, 1016), (0, 984)]
	assert (await stats(db_session, "pvp"))[ids[1]]["losses"] == 1


async def test_pvp_without_two_players_records_the_match_and_keeps_elo(db_session, sessions):
	# não deveria acontecer; se acontecer, o Match é gravado mesmo assim, sem Elo
	(only,) = await new_users(db_session, "akita")
	match_id = await new_match(db_session, only, mode="pvp")
	outcome = MatchOutcome(result="win", reason="forfeit", winner_ids=(only,), duration_ticks=900,
		players=(player(only, won=True),))

	await record_match_result(match_id, outcome, ENDED, sessions=sessions)

	assert (await status_of(db_session, match_id))[0] == "finished"
	(row,) = await match_players(db_session, match_id)
	assert (row.elo_before, row.elo_after) == (None, None)
	assert (await stats(db_session, "pvp"))[only]["elo"] == 1000


# ---------- a corrida, com commit de verdade ----------
# duas transações independentes: o db_session (uma transação só, com rollback) não mostra o lock

@pytest.fixture
async def committing(migrated_db, settings):
	engine = create_async_engine(settings.database_url, poolclass=NullPool)
	yield async_sessionmaker(engine, expire_on_commit=False)
	await engine.dispose()


@pytest.fixture
async def committed_match(committing):
	"""Três Users e um Match em running, commitados. Devolve o match_id e os user_ids."""
	async with committing() as session:
		users = [User(email=f"{uuid.uuid4().hex[:12]}@example.com", username=f"r{uuid.uuid4().hex[:12]}")
			for _ in range(3)]
		session.add_all(users)
		await session.flush()
		ids = [user.id for user in users]
		match = Match(mode="coop", map="arena", max_players=5, options={}, created_by=ids[0],
			status="running")
		session.add(match)
		await session.commit()
	yield match.id, ids
	async with committing() as session: # o RESTRICT pede o Match antes dos Users; o CASCADE leva os players
		await session.execute(delete(Match).where(Match.id == match.id))
		await session.execute(delete(User).where(User.id.in_(ids)))
		await session.commit()


async def test_two_calls_at_once_write_once(committing, committed_match):
	# sem o FOR UPDATE, as duas acham 'running' e a segunda bate na PK de match_players
	match_id, ids = committed_match
	outcome = coop(ids)

	assert await asyncio.gather(
		record_match_result(match_id, outcome, ENDED, sessions=committing),
		record_match_result(match_id, outcome, ENDED, sessions=committing),
	) == [[], []]

	async with committing() as session:
		assert await session.scalar(select(func.count()).select_from(MatchPlayer)
			.where(MatchPlayer.match_id == match_id)) == 3
		assert await session.scalar(select(Match.status).where(Match.id == match_id)) == "finished"
		assert list(await session.scalars(select(PlayerStats.matches_played)
			.where(PlayerStats.user_id.in_(ids)))) == [1, 1, 1]


# ---------- abort_unfinished ----------

async def test_startup_aborts_lobby_and_running_and_leaves_ended_matches(db_session, sessions):
	(host,) = await new_users(db_session, "akita")
	lobby = await new_match(db_session, host, status="lobby")
	running = await new_match(db_session, host)
	finished = await new_match(db_session, host, status="finished", result="win",
		reason="boss_defeated")
	left = await new_match(db_session, host, status="aborted") # o último saiu do lobby: reason NULL

	assert await abort_unfinished(sessions=sessions) == 2

	assert {match_id: await status_of(db_session, match_id)
		for match_id in (lobby, running, finished, left)} == {
		lobby: ("aborted", "server_shutdown"),
		running: ("aborted", "server_shutdown"),
		finished: ("finished", "boss_defeated"),
		left: ("aborted", None),
	}


async def test_abort_of_one_match_leaves_the_others(db_session, sessions):
	(host,) = await new_users(db_session, "akita")
	failed, other = await new_match(db_session, host), await new_match(db_session, host)

	assert await abort_unfinished(failed, sessions=sessions) == 1

	assert await status_of(db_session, failed) == ("aborted", "server_shutdown")
	assert await status_of(db_session, other) == ("running", None)


async def test_abort_after_the_result_changes_nothing(db_session, sessions):
	ids = await new_users(db_session, "akita", "caio", "rafael")
	match_id = await new_match(db_session, ids[0])
	await record_match_result(match_id, coop(ids), ENDED, sessions=sessions)

	assert await abort_unfinished(match_id, sessions=sessions) == 0

	assert await status_of(db_session, match_id) == ("finished", "boss_defeated")


# ---------- GET /api/matches/{id}/result ----------

DETAIL_KEYS = {"match_id", "created_by", "mode", "map", "status", "options", "started_at", "ended_at",
	"duration_s", "result", "reason", "players"}


def bearer(app, user_id: int) -> dict[str, str]:
	secret = app.state.settings.jwt_secret.get_secret_value()
	return {"Authorization": f"Bearer {create_access_token(user_id, secret, 900)}"}


async def test_result_of_a_finished_coop_match_is_open_to_any_logged_user(client, app, db_session, sessions):
	*ids, viewer = await new_users(db_session, "akita", "caio", "rafael", "augusto")
	match_id = await new_match(db_session, ids[0])
	outcome = coop(ids)
	await record_match_result(match_id, outcome, ENDED, sessions=sessions)

	# quem pede não jogou: o link do histórico de terceiros abre esta rota (decisão 7)
	response = await client.get(f"/api/matches/{match_id}/result", headers=bearer(app, viewer))

	assert response.status_code == 200
	body = response.json()
	assert body.keys() == DETAIL_KEYS
	assert {key: body[key] for key in DETAIL_KEYS - {"players"}} == {
		"match_id": match_id, "created_by": ids[0], "mode": "coop", "map": "arena",
		"status": "finished", "options": {}, "started_at": "2026-10-04T18:02:11Z",
		"ended_at": "2026-10-04T18:09:47Z", "duration_s": 456, # 13680 Ticks a 30 Hz
		"result": "win", "reason": "boss_defeated"}
	# em ordem de user_id; elo é sempre null no coop; o terceiro saiu antes do fim e não ganha XP
	assert body["players"] == [
		{**asdict(p), "username": name, "avatar_url": DEFAULT_AVATAR_URL, "xp_gained": xp,
			"elo_before": None, "elo_after": None}
		for p, name, xp in zip(outcome.players, ("akita", "caio", "rafael"), (165, 155, 0))]


async def test_pvp_loser_sees_won_false_even_with_result_win(client, app, db_session, sessions):
	ids = await new_users(db_session, "akita", "roberto")
	match_id = await new_match(db_session, ids[0], mode="pvp")
	await record_match_result(match_id, pvp(ids), ENDED, sessions=sessions)

	body = (await client.get(f"/api/matches/{match_id}/result", headers=bearer(app, ids[1]))).json()

	# result é o desfecho da Room; quem ganhou é players[].won (decisão 4)
	assert (body["mode"], body["result"], body["reason"], body["duration_s"]) == (
		"pvp", "win", "frag_limit", 155)
	assert [p["won"] for p in body["players"]] == [True, False]


@pytest.mark.parametrize("status, code", [
	("lobby", "match_not_finished"),
	("running", "match_not_finished"), # o game_over já saiu, mas a gravação ainda não terminou
	("aborted", "match_aborted"),
])
async def test_a_match_without_result_is_409(client, app, db_session, status, code):
	(host,) = await new_users(db_session, "akita")
	match_id = await new_match(db_session, host, status=status)

	response = await client.get(f"/api/matches/{match_id}/result", headers=bearer(app, host))

	assert response.status_code == 409
	assert response.json()["error"]["code"] == code


async def test_an_unknown_match_is_404(client, app, db_session):
	(user,) = await new_users(db_session, "akita")
	# o maior id do BIGINT: passa na validação e não existe
	response = await client.get(f"/api/matches/{2**63 - 1}/result", headers=bearer(app, user))

	assert response.status_code == 404
	assert response.json()["error"]["code"] == "match_not_found"


async def test_an_id_beyond_bigint_is_422_not_500(client, app, db_session):
	(user,) = await new_users(db_session, "akita")
	response = await client.get(f"/api/matches/{2**63}/result", headers=bearer(app, user))
	assert response.status_code == 422


async def test_result_needs_a_session(client):
	response = await client.get("/api/matches/1/result")
	assert response.status_code == 401
