"""Anonimiza uma conta a pedido do dono (Privacy Policy, "como pedir a remoção"; rooms.md §4, decisão 11).

Dentro do container do backend:  python -m app.scripts.anonymize <email>
Sai com 0 se anonimizou, 1 se o e-mail não existe, 2 se faltou o argumento.
"""
import asyncio
import sys
from dataclasses import dataclass

from sqlalchemy import delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import DEFAULT_LANGUAGE, Friendship, OAuthAccount, RefreshToken, User
from app.auth.schemas import RESERVED_USERNAME_PREFIX
from app.core.config import get_settings
from app.db.session import SessionLocal, engine
from app.matches.models import PlayerStats, UserAchievement
from app.users.avatar import discard_avatar


def anonymous_username(user_id: int) -> str:
	return f"{RESERVED_USERNAME_PREFIX}{user_id}"


@dataclass(frozen=True)
class Anonymized:
	user_id: int
	old_avatar_url: str | None # o arquivo só sai depois do commit


async def anonymize(session: AsyncSession, email: str) -> Anonymized | None:
	"""Apaga o que identifica o User e mantém a linha, que as partidas dos outros referenciam (RESTRICT).

	Não faz commit: quem chama decide. None se não existe conta com esse e-mail.
	"""
	user = await session.scalar(select(User).where(User.email == email.strip().lower()))
	if user is None:
		return None
	for statement in (
		delete(RefreshToken).where(RefreshToken.user_id == user.id), # as sessões
		delete(OAuthAccount).where(OAuthAccount.user_id == user.id), # o vínculo com a 42
		delete(Friendship).where(or_(Friendship.user_id == user.id, Friendship.friend_id == user.id)),
		# fora do ranking: um deleted_<id> com Elo não é de ninguém
		delete(PlayerStats).where(PlayerStats.user_id == user.id),
		delete(UserAchievement).where(UserAchievement.user_id == user.id),
	):
		await session.execute(statement)
	old_avatar_url = user.avatar_url
	user.username = anonymous_username(user.id)
	user.email = f"{user.username}@anonymized.invalid" # .invalid nunca recebe e-mail (RFC 2606)
	user.password_hash = None
	user.avatar_url = None
	user.preferred_language = DEFAULT_LANGUAGE
	user.last_seen_at = None
	await session.flush()
	return Anonymized(user.id, old_avatar_url)


async def run(email: str) -> int:
	try:
		async with SessionLocal() as session:
			result = await anonymize(session, email)
			if result is None:
				print(f"no account with e-mail {email!r}", file=sys.stderr)
				return 1
			await session.commit()
	finally:
		await engine.dispose() # o asyncio.run fecha o loop: as conexões saem antes
	# depois do commit: um rollback não deixa a conta apontando para um arquivo que já sumiu
	discard_avatar(get_settings().media_dir, result.old_avatar_url)
	print(f"user {result.user_id} anonymized as {anonymous_username(result.user_id)}")
	return 0


def main() -> None:
	if len(sys.argv) != 2:
		print("usage: python -m app.scripts.anonymize <email>", file=sys.stderr)
		sys.exit(2)
	sys.exit(asyncio.run(run(sys.argv[1])))


if __name__ == "__main__":
	main()
