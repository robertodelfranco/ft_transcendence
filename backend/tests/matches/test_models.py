# backend/tests/matches/test_models.py
# As tabelas de partidas conferidas contra rooms.md §2.7: o DDL sem banco e o RESTRICT num Postgres de verdade.
import pytest
from sqlalchemy import CheckConstraint, Table, delete
from sqlalchemy.dialects import postgresql
from sqlalchemy.exc import IntegrityError
from sqlalchemy.schema import CreateIndex, CreateTable

from app.auth.models import User
from app.db.base import Base
from app.matches.models import Match


PG = postgresql.dialect()
TIMESTAMPTZ = "TIMESTAMP WITH TIME ZONE"
COUNTER = ("INTEGER", False)

# coluna → (tipo no Postgres, aceita NULL), copiado da §2.7
SCHEMA = {
	"matches": {
		"id": ("BIGINT", False),
		"mode": ("TEXT", False),
		"map": ("TEXT", False),
		"max_players": ("SMALLINT", False),
		"options": ("JSONB", False),
		"status": ("TEXT", False),
		"created_by": ("BIGINT", False),
		"created_at": (TIMESTAMPTZ, False),
		"started_at": (TIMESTAMPTZ, True),
		"ended_at": (TIMESTAMPTZ, True),
		"duration_ticks": ("INTEGER", True),
		"result": ("TEXT", True),
		"reason": ("TEXT", True),
	},
	"match_players": {
		"match_id": ("BIGINT", False),
		"user_id": ("BIGINT", False),
		"won": ("BOOLEAN", False),
		"survived": ("BOOLEAN", False),
		"disconnected_at_end": ("BOOLEAN", False),
		**dict.fromkeys(["kills", "frags", "deaths", "damage_dealt", "damage_taken",
			"armor_absorbed", "keys_collected", "potions_used", "xp_gained"], COUNTER),
		"elo_before": ("INTEGER", True),
		"elo_after": ("INTEGER", True),
	},
	"player_stats": {
		"user_id": ("BIGINT", False),
		"mode": ("TEXT", False),
		**dict.fromkeys(["matches_played", "wins", "losses", "draws", "kills", "frags",
			"deaths", "playtime_s", "xp", "elo", "level"], COUNTER),
		"updated_at": (TIMESTAMPTZ, False),
	},
	"user_achievements": {
		"user_id": ("BIGINT", False),
		"code": ("TEXT", False),
		"unlocked_at": (TIMESTAMPTZ, False),
		"match_id": ("BIGINT", True),
	},
}


def table(name: str) -> Table:
	return Base.metadata.tables[name]


def ddl(name: str) -> str:
	return str(CreateTable(table(name)).compile(dialect=PG))


@pytest.mark.parametrize("name", SCHEMA)
def test_columns_types_and_nullability(name):
	columns = {c.name: (c.type.compile(dialect=PG), c.nullable) for c in table(name).columns}
	assert columns == SCHEMA[name]


def test_primary_keys():
	assert {name: [c.name for c in table(name).primary_key] for name in SCHEMA} == {
		"matches": ["id"],
		"match_players": ["match_id", "user_id"], # idempotência do record_match_result
		"player_stats": ["user_id", "mode"],
		"user_achievements": ["user_id", "code"], # desbloqueio repetido vira DO NOTHING
	}
	assert "id BIGSERIAL NOT NULL" in ddl("matches")


def test_foreign_keys_and_on_delete():
	fks = {(name, fk.parent.name): (fk.target_fullname, fk.ondelete)
		for name in SCHEMA for fk in table(name).foreign_keys}
	assert fks == {
		("matches", "created_by"): ("users.id", "RESTRICT"),
		("match_players", "match_id"): ("matches.id", "CASCADE"),
		("match_players", "user_id"): ("users.id", "RESTRICT"),
		("player_stats", "user_id"): ("users.id", "CASCADE"),
		("user_achievements", "user_id"): ("users.id", "CASCADE"),
		("user_achievements", "match_id"): ("matches.id", "SET NULL"),
	}


def test_checks():
	checks = {ck.name: str(ck.sqltext) for name in SCHEMA
		for ck in table(name).constraints if isinstance(ck, CheckConstraint)}
	assert checks == {
		"ck_matches_mode": "mode IN ('coop', 'pvp')",
		"ck_matches_status": "status IN ('lobby', 'running', 'finished', 'aborted')",
		"ck_matches_result": "result IN ('win', 'loss', 'draw')",
		"ck_matches_reason": "reason IN ('boss_defeated', 'all_dead', 'frag_limit', "
			"'time_limit', 'forfeit', 'server_shutdown')",
		"ck_player_stats_mode": "mode IN ('coop', 'pvp')",
	}


def test_server_defaults():
	assert "status TEXT DEFAULT 'lobby' NOT NULL" in ddl("matches")
	assert "elo INTEGER DEFAULT '1000' NOT NULL" in ddl("player_stats")
	assert "level INTEGER DEFAULT '1' NOT NULL" in ddl("player_stats")
	assert "kills INTEGER DEFAULT '0' NOT NULL" in ddl("match_players")


def test_indexes_match_the_contract():
	indexes = {str(CreateIndex(ix).compile(dialect=PG))
		for name in SCHEMA for ix in table(name).indexes}
	assert indexes == {
		"CREATE INDEX ix_matches_status_created ON matches (status, created_at DESC)",
		"CREATE INDEX ix_match_players_user ON match_players (user_id, match_id DESC)",
		"CREATE INDEX ix_player_stats_elo ON player_stats (mode, elo DESC)",
		"CREATE INDEX ix_player_stats_xp ON player_stats (mode, xp DESC)",
	}


@pytest.mark.anyio
async def test_user_who_created_a_match_cannot_be_deleted(db_session):
	# passa pela migração 0001 de verdade: defaults do servidor e o RESTRICT do histórico
	host = User(email="host@example.com", username="host")
	db_session.add(host)
	await db_session.flush()
	match = Match(mode="coop", map="dungeon", max_players=5, options={}, created_by=host.id)
	db_session.add(match)
	await db_session.flush()
	await db_session.refresh(match)
	assert match.status == "lobby"

	with pytest.raises(IntegrityError, match="fk_matches_created_by_users"):
		await db_session.execute(delete(User).where(User.id == host.id))
