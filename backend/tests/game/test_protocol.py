# backend/tests/game/test_protocol.py
# Mensagens de /ws/game (ws-messages.md §2): o que entra é validado, o que sai segue o exemplo do contrato.
import json
import re
from pathlib import Path

import pytest

from app.game import Action, ActionKind, Event, Input, Mode, RoomOptions, create_room, to_snapshot
from app.game.protocol import (MAX_MESSAGE_BYTES, ActionMessage, CloseCode, InputMessage,
	InvalidMessage, Join, Ping, encode_error, encode_event, encode_pong, encode_welcome,
	options_payload, parse_client_message, snapshot_encoder)
from app.game.world import parse_map


CONTRACTS = Path(__file__).resolve().parents[3] / "docs" / "contracts"
EXAMPLE = json.loads((CONTRACTS / "snapshot.example.json").read_text(encoding="utf-8"))
MAP_TEXT = "1111111\n1N0E0S1\n1K0D0I1\n10000B1\n1111111\n"
KEYS = {"up": True, "down": False, "left": False, "right": False,
	"rot_left": False, "rot_right": False, "sprint": True}
VALID_INPUT = {"v": 1, "type": "input", "seq": 3572, "keys": KEYS, "mouse_dx": -0.0125}


def dumps(message) -> str:
	return json.dumps(message)


def with_changes(base: dict, **changes) -> dict:
	return {**base, **changes}


def without(base: dict, key: str) -> dict:
	return {k: v for k, v in base.items() if k != key}


def new_room():
	game_map = parse_map(MAP_TEXT, "t", Mode.COOP)
	return create_room(12, Mode.COOP, game_map, RoomOptions(), [(7, "roberto"), (9, "augusto")], 1)


# ---------- cliente → servidor ----------

def test_contract_examples_are_accepted():
	# as quatro mensagens do cliente em ws-messages.md §3
	join = parse_client_message('{"v": 1, "type": "join", "match_id": 12, "token": "<access jwt>"}')
	action = parse_client_message('{"v": 1, "type": "action", "seq": 3573, "kind": "fire"}')
	ping = parse_client_message('{"v": 1, "type": "ping", "t": 1759420800123}')
	assert join == Join(v=1, type="join", match_id=12, token="<access jwt>")
	assert isinstance(parse_client_message(dumps(VALID_INPUT)), InputMessage)
	assert action == ActionMessage(v=1, type="action", seq=3573, kind=ActionKind.FIRE)
	assert ping == Ping(v=1, type="ping", t=1759420800123)


def test_bytes_are_accepted_like_text():
	assert parse_client_message(dumps(VALID_INPUT).encode()) == parse_client_message(dumps(VALID_INPUT))


def test_input_becomes_the_simulation_input():
	message = parse_client_message(dumps(VALID_INPUT))
	assert message.to_simulation() == Input(seq=3572, up=True, down=False, left=False, right=False,
		rot_left=False, rot_right=False, sprint=True, mouse_dx=-0.0125)


def test_action_becomes_the_simulation_action():
	message = parse_client_message('{"v": 1, "type": "action", "seq": 4, "kind": "door"}')
	assert message.to_simulation() == Action(seq=4, kind=ActionKind.DOOR)


def test_integer_mouse_dx_is_a_number():
	# JSON.stringify(0) manda "0", sem casa decimal
	message = parse_client_message(dumps(with_changes(VALID_INPUT, mouse_dx=0)))
	assert message.mouse_dx == 0.0


@pytest.mark.parametrize("raw", [
	dumps(with_changes(VALID_INPUT, type="jump")), # tipo desconhecido
	dumps(without(VALID_INPUT, "type")),
	dumps(without(VALID_INPUT, "v")),
	dumps(with_changes(VALID_INPUT, v=2)),
	dumps(with_changes(VALID_INPUT, v=True)), # True == 1 em Python
	dumps(with_changes(VALID_INPUT, v=1.0)),
	dumps(with_changes(VALID_INPUT, extra=1)), # campo a mais
	dumps(with_changes(VALID_INPUT, keys=without(KEYS, "sprint"))), # tecla faltando
	dumps(with_changes(VALID_INPUT, keys=with_changes(KEYS, jump=True))),
	dumps(with_changes(VALID_INPUT, keys=with_changes(KEYS, up=1))), # 1 não é booleano
	dumps(with_changes(VALID_INPUT, seq=0)), # seq começa em 1
	dumps(with_changes(VALID_INPUT, seq=1.5)),
	dumps(with_changes(VALID_INPUT, seq="7")),
	dumps(with_changes(VALID_INPUT, mouse_dx="0.1")),
	dumps(with_changes(VALID_INPUT, mouse_dx=None)),
	dumps(VALID_INPUT).replace("-0.0125", "NaN"), # §2.1: número sempre finito
	dumps(VALID_INPUT).replace("-0.0125", "Infinity"),
	dumps(VALID_INPUT).replace("-0.0125", "1e400"),
	'{"v": 1, "type": "action", "seq": 4, "kind": "jump"}',
	'{"v": 1, "type": "join", "match_id": 0, "token": "x"}',
	'{"v": 1, "type": "join", "match_id": 12, "token": ""}',
	'{"v": 1, "type": "ping"}',
	"[]", '"input"', "1", "null", "{", "", # não é objeto, ou nem é JSON
])
def test_invalid_messages_are_refused(raw):
	with pytest.raises(InvalidMessage):
		parse_client_message(raw)


def test_oversized_message_is_refused_before_parsing():
	padded = with_changes(VALID_INPUT, padding="x" * MAX_MESSAGE_BYTES)
	with pytest.raises(InvalidMessage, match="bytes"):
		parse_client_message(dumps(padded))


def test_refusal_never_echoes_the_received_value():
	# o motivo vai para o log; um token recebido não pode ir junto
	with pytest.raises(InvalidMessage) as refused:
		parse_client_message('{"v": 1, "type": "join", "match_id": "12", "token": "secret-jwt"}')
	assert "secret-jwt" not in str(refused.value)
	assert "match_id" in str(refused.value)


# ---------- códigos de fechamento ----------

def contract_close_codes() -> dict[int, str]:
	# a tabela de ws-messages.md §2.7, sem o 1000, que não leva error
	text = (CONTRACTS / "ws-messages.md").read_text(encoding="utf-8")
	section = text.split("### 2.7", 1)[1].split("\n### ", 1)[0]
	return {int(code): name for code, name in re.findall(r"^\| `(4\d{3})` \| `(\w+)` \|", section, re.M)}


def test_close_codes_match_the_contract():
	assert {close.value: close.code for close in CloseCode} == contract_close_codes()


# ---------- servidor → cliente ----------

def test_welcome_has_the_shape_of_the_contract_example():
	room = new_room()
	welcome = json.loads(encode_welcome(user_id=7, match_id=12, mode=Mode.COOP, map_name="t",
		options=RoomOptions(), grid=list(room.initial_grid), snapshot=to_snapshot(room),
		last_input_seq=0))
	example = EXAMPLE["welcome"]
	assert welcome.keys() == example.keys()
	assert welcome["room"].keys() == example["room"].keys()
	assert welcome["room"]["options"].keys() == example["room"]["options"].keys()
	assert welcome["snapshot"].keys() == example["snapshot"].keys()
	assert welcome["snapshot"]["players"][0].keys() == example["snapshot"]["players"][0].keys()
	assert (welcome["v"], welcome["type"], welcome["user_id"]) == (1, "welcome", 7)
	assert welcome["room"] == {"match_id": 12, "mode": "coop", "map": "t",
		"options": {"theme": "dungeon", "start_hp": 10,
			"pickups": {"potion": True, "mana": True, "armor": True}}}
	assert welcome["map"]["grid"] == list(room.initial_grid)


def test_coop_options_leave_out_the_pvp_ones():
	assert "frag_limit" not in options_payload(Mode.COOP, RoomOptions())
	assert options_payload(Mode.PVP, RoomOptions(frag_limit=7))["frag_limit"] == 7
	assert options_payload(Mode.PVP, RoomOptions())["time_limit_s"] == 180


def test_snapshot_frame_has_the_shape_of_the_contract_example():
	frame = json.loads(snapshot_encoder(to_snapshot(new_room()))(0))
	assert frame.keys() == EXAMPLE["snapshot"].keys()
	assert (frame["v"], frame["type"], frame["last_input_seq"]) == (1, "snapshot", 0)


def test_snapshot_frame_changes_only_last_input_seq():
	snapshot = to_snapshot(new_room())
	frame_for = snapshot_encoder(snapshot)
	first, second = json.loads(frame_for(41)), json.loads(frame_for(42))
	assert first == {"v": 1, "type": "snapshot", "last_input_seq": 41, **snapshot}
	assert {**first, "last_input_seq": 42} == second


def test_snapshot_encoder_refuses_non_finite_numbers():
	snapshot = to_snapshot(new_room())
	snapshot["players"][0]["x"] = float("nan")
	with pytest.raises(ValueError):
		snapshot_encoder(snapshot)


def test_event_pong_and_error_frames():
	event = Event(name="enemy_died", tick=3590, data={"enemy_id": "e_14", "killer_id": 12})
	assert json.loads(encode_event(event)) == {"v": 1, "type": "event", "name": "enemy_died",
		"tick": 3590, "data": {"enemy_id": "e_14", "killer_id": 12}}
	assert json.loads(encode_pong(1759420800123)) == {"v": 1, "type": "pong", "t": 1759420800123}
	assert json.loads(encode_error(CloseCode.NOT_A_MEMBER, "user 33 is not in match 12")) == {
		"v": 1, "type": "error", "code": "not_a_member", "message": "user 33 is not in match 12"}


def test_frames_are_compact_json():
	assert encode_pong(1) == '{"v":1,"type":"pong","t":1}'
