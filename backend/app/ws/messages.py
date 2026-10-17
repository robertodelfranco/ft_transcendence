"""Mensagens do `/ws/app` (ws-manager.md §2.4): o formato do fio mora só aqui.

O envelope é o mesmo do `/ws/game` (`v` e `type`, JSON compacto), e a validação é igualmente
estrita; o `join` daqui não leva `match_id`, porque o socket não é de uma partida.
"""
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter, ValidationError

from app.game.protocol import MAX_MESSAGE_BYTES, PROTOCOL_VERSION, InvalidMessage, Version, to_json


LobbyRemovedReason = Literal["started", "aborted"]


# ---------- Cliente → servidor ----------

class _Strict(BaseModel):
	# campo a mais, faltando ou de tipo errado é recusado; NaN e Infinity também
	model_config = ConfigDict(strict=True, extra="forbid", frozen=True, allow_inf_nan=False)


class AppJoin(_Strict):
	v: Version
	type: Literal["join"]
	token: Annotated[str, Field(min_length=1)]


class AppPing(_Strict):
	v: Version
	type: Literal["ping"]
	t: float # relógio do cliente, ms; volta igual no pong


AppMessage = Annotated[AppJoin | AppPing, Field(discriminator="type")]
_app_message = TypeAdapter(AppMessage)


def parse_app_message(raw: str | bytes) -> AppJoin | AppPing:
	data = raw.encode() if isinstance(raw, str) else raw
	if len(data) > MAX_MESSAGE_BYTES:
		raise InvalidMessage(f"message has {len(data)} bytes, limit is {MAX_MESSAGE_BYTES}")
	try:
		return _app_message.validate_json(data)
	except ValidationError as exc:
		# só onde e o quê: o valor recebido pode ser o token
		first = exc.errors(include_input=False, include_url=False)[0]
		where = ".".join(str(part) for part in first["loc"]) or "message"
		raise InvalidMessage(f"{where}: {first['type']}") from None


# ---------- Servidor → cliente ----------

def _frame(type_: str, **fields: Any) -> str:
	return to_json({"v": PROTOCOL_VERSION, "type": type_, **fields})


def encode_welcome(user_id: int, online_friends: list[int]) -> str:
	return _frame("welcome", user_id=user_id, online_friends=online_friends)


def encode_presence(user_id: int, online: bool) -> str:
	return _frame("presence", user_id=user_id, online=online)


def encode_lobby_update(room: dict[str, Any]) -> str:
	return _frame("lobby_update", room=room) # RoomInfo inteiro, não delta (matches-api.md §4)


def encode_lobby_removed(match_id: int, reason: LobbyRemovedReason) -> str:
	return _frame("lobby_removed", match_id=match_id, reason=reason)


def encode_match_started(match_id: int) -> str:
	return _frame("match_started", match_id=match_id)
