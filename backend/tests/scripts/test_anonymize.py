# Anonimização de conta a pedido do dono (rooms.md §4, decisão 11; issue #211).
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from sqlalchemy import func, select

from app.auth.models import Friendship, OAuthAccount, RefreshToken, User
from app.matches.models import Match, MatchPlayer, PlayerStats, UserAchievement
from app.scripts.anonymize import anonymize
from app.users.avatar import discard_avatar, store_avatar


pytestmark = pytest.mark.anyio


async def make_user(session, name: str) -> User:
	user = User(email=f"{name}@example.com", username=name, password_hash="argon2-hash")
	session.add(user)
	await session.flush()
	return user


async def count(session, model, *where) -> int:
	return await session.scalar(select(func.count()).select_from(model).where(*where))


async def test_anonymize_keeps_the_match_and_drops_everything_else(db_session, tmp_path: Path):
	ana = await make_user(db_session, "ana_anon")
	bia = await make_user(db_session, "bia_anon")
	ana.avatar_url = store_avatar(tmp_path, ana.id, b"png")
	db_session.add_all([
		RefreshToken(user_id=ana.id, token_hash=uuid.uuid4().hex * 2, family_id=uuid.uuid4(),
			expires_at=datetime.now(timezone.utc) + timedelta(days=7)),
		OAuthAccount(user_id=ana.id, provider="42", provider_user_id=f"anon-{ana.id}"),
		Friendship(user_id=ana.id, friend_id=bia.id),
		Friendship(user_id=bia.id, friend_id=ana.id),
	])
	match = Match(mode="coop", map="crypt", max_players=2, options={}, status="finished",
		created_by=ana.id, result="win", reason="boss_defeated")
	db_session.add(match)
	await db_session.flush()
	db_session.add_all([
		*(MatchPlayer(match_id=match.id, user_id=user_id, won=True, survived=True,
			disconnected_at_end=False) for user_id in (ana.id, bia.id)),
		PlayerStats(user_id=ana.id, mode="coop"),
		UserAchievement(user_id=ana.id, code="first_win", match_id=match.id),
	])
	await db_session.flush()

	result = await anonymize(db_session, " ANA_ANON@example.com ") # como chega de um e-mail colado
	discard_avatar(tmp_path, result.old_avatar_url)

	await db_session.refresh(ana)
	assert ana.username == f"deleted_{ana.id}"
	assert ana.email == f"deleted_{ana.id}@anonymized.invalid"
	assert (ana.password_hash, ana.avatar_url, ana.last_seen_at) == (None, None, None)
	assert not any((tmp_path / "avatars").iterdir()) # o arquivo saiu do disco
	for model in (RefreshToken, OAuthAccount, PlayerStats, UserAchievement):
		assert await count(db_session, model, model.user_id == ana.id) == 0
	assert await count(db_session, Friendship, Friendship.friend_id == ana.id) == 0 # as duas direções
	assert await count(db_session, Friendship, Friendship.user_id == ana.id) == 0
	# o histórico da Bia continua com a partida, e a Ana aparece só pelo nome anônimo
	assert await count(db_session, MatchPlayer, MatchPlayer.match_id == match.id) == 2
	assert await count(db_session, User, User.id == bia.id) == 1


async def test_an_unknown_email_changes_nothing(db_session):
	assert await anonymize(db_session, "nobody@example.com") is None
