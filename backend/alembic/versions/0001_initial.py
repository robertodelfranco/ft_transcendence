"""initial: tabelas de usuários (auth.md §2.9) e de partidas (rooms.md §2.7)

Revision ID: 0001
Revises:
Create Date: 2026-10-13

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# foto do schema nesta revisão: os valores dos CHECK ficam escritos aqui, não importados do app
TIMESTAMPTZ = sa.DateTime(timezone=True)


def created_at(name: str = "created_at") -> sa.Column:
    return sa.Column(name, TIMESTAMPTZ, server_default=sa.func.now(), nullable=False)


def counter(name: str) -> sa.Column:
    return sa.Column(name, sa.Integer(), server_default="0", nullable=False)


def upgrade() -> None:
    # usuários primeiro: tudo aponta para users
    op.create_table(
        "users",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("email", sa.Text(), nullable=False),
        sa.Column("username", sa.Text(), nullable=False),
        sa.Column("password_hash", sa.Text(), nullable=True),
        sa.Column("avatar_url", sa.Text(), nullable=True),
        sa.Column("preferred_language", sa.Text(), server_default="en", nullable=False),
        created_at(),
        sa.Column("last_seen_at", TIMESTAMPTZ, nullable=True),
        sa.PrimaryKeyConstraint("id", name="pk_users"),
        sa.CheckConstraint("email = lower(email)", name="ck_users_email_lowercase"),
        sa.CheckConstraint("username ~ '^[a-z0-9_]{3,20}$'", name="ck_users_username_format"),
        sa.CheckConstraint("preferred_language IN ('pt-BR', 'en', 'es')",
                           name="ck_users_preferred_language"),
        sa.UniqueConstraint("email", name="uq_users_email"),
        sa.UniqueConstraint("username", name="uq_users_username"),
    )
    op.create_table(
        "refresh_tokens",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("token_hash", sa.Text(), nullable=False),
        sa.Column("family_id", sa.Uuid(), nullable=False),
        created_at(),
        sa.Column("expires_at", TIMESTAMPTZ, nullable=False),
        sa.Column("rotated_at", TIMESTAMPTZ, nullable=True),
        sa.Column("replaced_by", sa.BigInteger(), nullable=True),
        sa.Column("revoked_at", TIMESTAMPTZ, nullable=True),
        sa.Column("user_agent", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id", name="pk_refresh_tokens"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE",
                                name="fk_refresh_tokens_user_id_users"),
        sa.ForeignKeyConstraint(["replaced_by"], ["refresh_tokens.id"], ondelete="SET NULL",
                                name="fk_refresh_tokens_replaced_by_refresh_tokens"),
        sa.UniqueConstraint("token_hash", name="uq_refresh_tokens_token_hash"),
    )
    op.create_index("ix_refresh_tokens_family", "refresh_tokens", ["family_id"])
    op.create_table(
        "oauth_accounts",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("provider", sa.Text(), nullable=False),
        sa.Column("provider_user_id", sa.Text(), nullable=False),
        created_at(),
        sa.PrimaryKeyConstraint("id", name="pk_oauth_accounts"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE",
                                name="fk_oauth_accounts_user_id_users"),
        sa.CheckConstraint("provider IN ('google', '42')", name="ck_oauth_accounts_provider"),
        sa.UniqueConstraint("provider", "provider_user_id",
                            name="uq_oauth_accounts_provider_provider_user_id"),
        sa.UniqueConstraint("user_id", "provider", name="uq_oauth_accounts_user_id_provider"),
    )
    op.create_table(
        "friendships",
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("friend_id", sa.BigInteger(), nullable=False),
        created_at(),
        sa.PrimaryKeyConstraint("user_id", "friend_id", name="pk_friendships"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE",
                                name="fk_friendships_user_id_users"),
        sa.ForeignKeyConstraint(["friend_id"], ["users.id"], ondelete="CASCADE",
                                name="fk_friendships_friend_id_users"),
        sa.CheckConstraint("user_id <> friend_id", name="ck_friendships_not_self"),
    )
    op.create_index("ix_friendships_friend", "friendships", ["friend_id"])

    # partidas: matches antes de quem aponta para ela
    op.create_table(
        "matches",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("mode", sa.Text(), nullable=False),
        sa.Column("map", sa.Text(), nullable=False),
        sa.Column("max_players", sa.SmallInteger(), nullable=False),
        sa.Column("options", postgresql.JSONB(), nullable=False),
        sa.Column("status", sa.Text(), server_default="lobby", nullable=False),
        sa.Column("created_by", sa.BigInteger(), nullable=False),
        created_at(),
        sa.Column("started_at", TIMESTAMPTZ, nullable=True),
        sa.Column("ended_at", TIMESTAMPTZ, nullable=True),
        sa.Column("duration_ticks", sa.Integer(), nullable=True),
        sa.Column("result", sa.Text(), nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id", name="pk_matches"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="RESTRICT",
                                name="fk_matches_created_by_users"),
        sa.CheckConstraint("mode IN ('coop', 'pvp')", name="ck_matches_mode"),
        sa.CheckConstraint("status IN ('lobby', 'running', 'finished', 'aborted')",
                           name="ck_matches_status"),
        sa.CheckConstraint("result IN ('win', 'loss', 'draw')", name="ck_matches_result"),
        sa.CheckConstraint("reason IN ('boss_defeated', 'all_dead', 'frag_limit', 'time_limit', "
                           "'forfeit', 'server_shutdown')", name="ck_matches_reason"),
    )
    op.create_index("ix_matches_status_created", "matches", ["status", sa.text("created_at DESC")])
    op.create_table(
        "match_players",
        sa.Column("match_id", sa.BigInteger(), nullable=False),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("won", sa.Boolean(), nullable=False),
        sa.Column("survived", sa.Boolean(), nullable=False),
        sa.Column("disconnected_at_end", sa.Boolean(), nullable=False),
        *(counter(name) for name in ("kills", "frags", "deaths", "damage_dealt", "damage_taken",
                                     "armor_absorbed", "keys_collected", "potions_used",
                                     "xp_gained")),
        sa.Column("elo_before", sa.Integer(), nullable=True),
        sa.Column("elo_after", sa.Integer(), nullable=True),
        sa.PrimaryKeyConstraint("match_id", "user_id", name="pk_match_players"),
        sa.ForeignKeyConstraint(["match_id"], ["matches.id"], ondelete="CASCADE",
                                name="fk_match_players_match_id_matches"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="RESTRICT",
                                name="fk_match_players_user_id_users"),
    )
    op.create_index("ix_match_players_user", "match_players", ["user_id", sa.text("match_id DESC")])
    op.create_table(
        "player_stats",
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("mode", sa.Text(), nullable=False),
        *(counter(name) for name in ("matches_played", "wins", "losses", "draws", "kills",
                                     "frags", "deaths", "playtime_s", "xp")),
        sa.Column("elo", sa.Integer(), server_default="1000", nullable=False),
        sa.Column("level", sa.Integer(), server_default="1", nullable=False),
        created_at("updated_at"),
        sa.PrimaryKeyConstraint("user_id", "mode", name="pk_player_stats"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE",
                                name="fk_player_stats_user_id_users"),
        sa.CheckConstraint("mode IN ('coop', 'pvp')", name="ck_player_stats_mode"),
    )
    op.create_index("ix_player_stats_elo", "player_stats", ["mode", sa.text("elo DESC")])
    op.create_index("ix_player_stats_xp", "player_stats", ["mode", sa.text("xp DESC")])
    op.create_table(
        "user_achievements",
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("code", sa.Text(), nullable=False),
        created_at("unlocked_at"),
        sa.Column("match_id", sa.BigInteger(), nullable=True),
        sa.PrimaryKeyConstraint("user_id", "code", name="pk_user_achievements"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE",
                                name="fk_user_achievements_user_id_users"),
        sa.ForeignKeyConstraint(["match_id"], ["matches.id"], ondelete="SET NULL",
                                name="fk_user_achievements_match_id_matches"),
    )


def downgrade() -> None:
    # ordem inversa do upgrade; os índices caem junto com as tabelas
    for table in ("user_achievements", "player_stats", "match_players", "matches",
                  "friendships", "oauth_accounts", "refresh_tokens", "users"):
        op.drop_table(table)
