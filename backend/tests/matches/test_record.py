# backend/tests/matches/test_record.py
# Fim de partida no banco (rooms.md §2.5 e §2.6): record_match_result uma vez só e abort_unfinished.
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


async def test_pvp_result_keeps_won_per_player_and_leaves_elo_and_xp_for_f5_5(db_session, sessions):
	ids = await new_users(db_session, "akita", "roberto")
	match_id = await new_match(db_session, ids[0], mode="pvp")

	await record_match_result(match_id, pvp(ids), ENDED, sessions=sessions)

	rows = await match_players(db_session, match_id)
	assert [row.won for row in rows] == [True, False]
	assert {(row.elo_before, row.elo_after, row.xp_gained) for row in rows} == {(None, None, 0)}


async def test_second_call_writes_nothing(db_session, sessions):
	ids = await new_users(db_session, "akita", "caio", "rafael")
	match_id = await new_match(db_session, ids[0])
	await record_match_result(match_id, coop(ids), ENDED, sessions=sessions)
	first = [counters(row) for row in await match_players(db_session, match_id)]

	# outro resultado na repetida: se ela gravasse, o reason e os contadores mudariam
	other = MatchOutcome(result="loss", reason="forfeit", winner_ids=(), duration_ticks=1,
		players=tuple(player(user_id) for user_id in ids))
	assert await record_match_result(match_id, other, ENDED, sessions=sessions) == []

	match = await db_session.get(Match, match_id, populate_existing=True) # relido do banco
	assert (match.status, match.reason, match.duration_ticks) == ("finished", "boss_defeated", 13680)
	assert [counters(row) for row in await match_players(db_session, match_id)] == first


@pytest.mark.parametrize("status", ["lobby", "aborted", "finished"])
async def test_a_match_that_is_not_running_is_ignored(db_session, sessions, status):
	# lobby: o commit do start falhou; aborted: o _abort chegou antes do game_over
	ids = await new_users(db_session, "akita", "caio", "rafael")
	match_id = await new_match(db_session, ids[0], status=status)

	assert await record_match_result(match_id, coop(ids), ENDED, sessions=sessions) == []

	assert (await status_of(db_session, match_id))[0] == status
	assert await match_players(db_session, match_id) == []


async def test_stats_and_achievements_are_not_written_yet(db_session, sessions):
	# a fronteira da F5.3: player_stats é a F5.4, conquistas a F5.7, na mesma transação
	ids = await new_users(db_session, "akita", "caio", "rafael")
	match_id = await new_match(db_session, ids[0])

	await record_match_result(match_id, coop(ids), ENDED, sessions=sessions)

	assert await count(db_session, PlayerStats) == 0
	assert await count(db_session, UserAchievement) == 0


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
