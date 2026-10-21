# backend/tests/ws/test_messages.py
# Mensagens do /ws/app contra ws-manager.md §2.4.
import json

import pytest

from app.game.protocol import MAX_MESSAGE_BYTES, InvalidMessage
from app.ws.messages import (AppJoin, AppPing, encode_lobby_removed, encode_lobby_update,
	encode_match_started, encode_presence, encode_welcome, parse_app_message)


def test_join_and_ping_are_parsed():
	assert parse_app_message('{"v":1,"type":"join","token":"abc"}') == AppJoin(v=1, type="join",
		token="abc")
	assert parse_app_message('{"v":1,"type":"ping","t":12.5}') == AppPing(v=1, type="ping", t=12.5)


@pytest.mark.parametrize("raw", [
	'{"type":"join","token":"abc"}', # sem v
	'{"v":2,"type":"join","token":"abc"}', # outra versão
	'{"v":true,"type":"join","token":"abc"}', # true não é 1
	'{"v":1,"type":"join","token":""}',
	'{"v":1,"type":"join","token":"abc","match_id":12}', # o join do /ws/game não serve aqui
	'{"v":1,"type":"ping","t":NaN}',
	'{"v":1,"type":"ping","t":"1"}',
	'{"v":1,"type":"input","seq":1}', # mensagem do jogo
	'{"v":1,"type":"lobby_update"}', # mensagem do servidor
	"{not json",
	"[]",
])
def test_invalid_messages_are_refused(raw):
	with pytest.raises(InvalidMessage):
		parse_app_message(raw)


def test_the_error_never_echoes_the_token():
	with pytest.raises(InvalidMessage) as refused:
		parse_app_message('{"v":1,"type":"join","token":"secret-token","extra":1}')
	assert "secret-token" not in str(refused.value)


def test_oversized_message_is_refused_before_parsing():
	with pytest.raises(InvalidMessage, match="bytes"):
		parse_app_message('{"v":1,"type":"join","token":"' + "a" * MAX_MESSAGE_BYTES + '"}')


def test_server_messages_follow_the_contract():
	room = {"match_id": 12, "status": "lobby"}
	assert [json.loads(text) for text in (
		encode_welcome(7, [9, 15]),
		encode_presence(21, True),
		encode_lobby_update(room),
		encode_lobby_removed(13, "aborted"),
		encode_match_started(12),
	)] == [
		{"v": 1, "type": "welcome", "user_id": 7, "online_friends": [9, 15]},
		{"v": 1, "type": "presence", "user_id": 21, "online": True},
		{"v": 1, "type": "lobby_update", "room": room},
		{"v": 1, "type": "lobby_removed", "match_id": 13, "reason": "aborted"},
		{"v": 1, "type": "match_started", "match_id": 12},
	]
