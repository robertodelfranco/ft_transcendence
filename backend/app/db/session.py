from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import get_settings


# um engine por processo (um worker só); só conecta no primeiro uso
engine = create_async_engine(get_settings().database_url, pool_pre_ping=True)
# fora de request (authenticate_ws_token, record_match_result): async with SessionLocal() as session
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def get_session() -> AsyncIterator[AsyncSession]:
	# uma sessão por requisição; o commit é de quem escreve (auth.md §2.7)
	async with SessionLocal() as session:
		yield session


DbSession = Annotated[AsyncSession, Depends(get_session)]
