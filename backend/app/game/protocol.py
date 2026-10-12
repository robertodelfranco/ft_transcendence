"""Mensagens de /ws/game (ws-messages.md §2).

O laço de leitura do socket valida o que chega com `parse_client_message`; o que sai é montado
pelas funções `encode_*`, que devolvem o texto pronto para o frame. Este módulo é do Netcode:
importa a porta da Simulation, mas a porta (`app/game/__init__.py`) não o importa.
"""
import json
from collections.abc import Callable, Mapping
from dataclasses import asdict
from enum import IntEnum
from functools import partial
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, StrictInt, TypeAdapter, ValidationError

from app.game import Action, ActionKind, Event, Input, Mode, RoomOptions


PROTOCOL_VERSION = 1
MAX_MESSAGE_BYTES = 4096 # a maior mensagem legítima, o join, tem poucas centenas de bytes
PVP_ONLY_OPTIONS = ("frag_limit", "time_limit_s")


class CloseCode(IntEnum):
	"""Códigos de fechamento (ws-messages.md §2.7); o nome em minúsculas é o code do error."""

	INVALID_MESSAGE = 4400
	UNAUTHENTICATED = 4401
	NOT_A_MEMBER = 4403
	ROOM_NOT_FOUND = 4404
	REPLACED = 4408
	ROOM_FULL = 4409
	SLOW_CONSUMER = 4429
	SERVER_SHUTDOWN = 4503

	@property
	def code(self) -> str:
		return self.name.lower()


class InvalidMessage(Exception):
	"""A mensagem não segue o contrato: quem lê o socket fecha com CloseCode.INVALID_MESSAGE."""


# ---------- Cliente → servidor (§2.2) ----------

# strict: 1.0 não é inteiro, 1 não é booleano, e o v não aceita true (que em Python é == 1)
Version = Annotated[StrictInt, Field(ge=PROTOCOL_VERSION, le=PROTOCOL_VERSION)]
Seq = Annotated[StrictInt, Field(ge=1)]


class _Strict(BaseModel):
	# campo a mais, faltando ou de tipo errado é recusado; NaN e Infinity também (§2.1)
	model_config = ConfigDict(strict=True, extra="forbid", frozen=True, allow_inf_nan=False)


class Join(_Strict):
	v: Version
	type: Literal["join"]
	match_id: Annotated[StrictInt, Field(ge=1)] # quem lê confere que é o mesmo do caminho
	token: Annotated[str, Field(min_length=1)]


class Keys(_Strict):
	up: bool
	down: bool
	left: bool
	right: bool
	rot_left: bool
	rot_right: bool
	sprint: bool


class InputMessage(_Strict):
	v: Version
	type: Literal["input"]
	seq: Seq
	keys: Keys
	mouse_dx: float # rad; o corte por Tick é da Simulation

	def to_simulation(self) -> Input:
		return Input(seq=self.seq, mouse_dx=self.mouse_dx, **self.keys.model_dump())


class ActionMessage(_Strict):
	v: Version
	type: Literal["action"]
	seq: Seq
	kind: ActionKind

	def to_simulation(self) -> Action:
		return Action(seq=self.seq, kind=self.kind)


class Ping(_Strict):
	v: Version
	type: Literal["ping"]
	t: float # relógio do cliente, ms; volta igual no pong


ClientMessage = Annotated[Join | InputMessage | ActionMessage | Ping, Field(discriminator="type")]
_client_message = TypeAdapter(ClientMessage)


def parse_client_message(raw: str | bytes) -> ClientMessage:
	data = raw.encode() if isinstance(raw, str) else raw
	if len(data) > MAX_MESSAGE_BYTES:
		raise InvalidMessage(f"message has {len(data)} bytes, limit is {MAX_MESSAGE_BYTES}")
	try:
		return _client_message.validate_json(data)
	except ValidationError as exc:
		# só onde e o quê: o valor recebido pode ser o token, e o motivo vai para o log
		first = exc.errors(include_input=False, include_url=False)[0]
		where = ".".join(str(part) for part in first["loc"]) or "message"
		raise InvalidMessage(f"{where}: {first['type']}") from None


# ---------- Servidor → cliente (§2.3) ----------

# JSON compacto e sempre finito (§2.1); o ConnectionManager usa o mesmo para mensagens em dict
to_json = partial(json.dumps, separators=(",", ":"), ensure_ascii=False, allow_nan=False)


def _frame(type_: str, **fields: Any) -> str:
	return to_json({"v": PROTOCOL_VERSION, "type": type_, **fields})


def options_payload(mode: Mode, options: RoomOptions) -> dict[str, Any]:
	# RoomOptions completas, como no RoomInfo: o coop não leva as opções do pvp
	payload = asdict(options)
	if mode is Mode.COOP:
		for key in PVP_ONLY_OPTIONS:
			del payload[key]
	return payload


def encode_welcome(*, user_id: int, match_id: int, mode: Mode, map_name: str,
		options: RoomOptions, grid: list[str], snapshot: Mapping[str, Any],
		last_input_seq: int) -> str:
	room = {"match_id": match_id, "mode": mode, "map": map_name,
		"options": options_payload(mode, options)}
	return _frame("welcome", user_id=user_id, room=room, map={"grid": grid},
		snapshot={**snapshot, "last_input_seq": last_input_seq})


def snapshot_encoder(snapshot: Mapping[str, Any]) -> Callable[[int], str]:
	"""Serializa o Snapshot uma vez por envio e devolve o frame de cada destinatário.

	Só `last_input_seq` muda por destinatário (§2.4): o corpo é serializado uma vez e o
	campo é posto na frente, sem passar o Snapshot inteiro pelo json de novo para cada Player.
	"""
	body = to_json(snapshot)
	head = f'{{"v":{PROTOCOL_VERSION},"type":"snapshot","last_input_seq":'
	tail = f",{body[1:]}" if len(body) > 2 else "}" # body[1:] tira o { de abertura
	return lambda last_input_seq: f"{head}{last_input_seq:d}{tail}"


def encode_event(event: Event) -> str:
	return _frame("event", name=event.name, tick=event.tick, data=event.data)


def encode_pong(t: float) -> str:
	return _frame("pong", t=t)


def encode_error(close: CloseCode, message: str) -> str:
	# message é só para log (§2.7); a casca traduz o code
	return _frame("error", code=close.code, message=message)
