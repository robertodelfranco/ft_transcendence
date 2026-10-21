# backend/tests/game/test_sim.py
import json
import math
from pathlib import Path
from random import Random

import pytest

import app.game
from app.game.rules import BODY_BLOCK_DISTANCE, BOSS_HP, PLAYER_SPEED, RULESET_NUMBERS, TICK_RATE
from app.game.sim import (create_room, enqueue, last_input_seq, leave, match_outcome,
	set_connected, step)
from app.game.snapshot import initial_grid, to_snapshot
from app.game.state import (Action, ActionKind, BossState, EnemyState, Event, Input, Mode,
	Projectile, ProjectileKind, RoomOptions)
from app.game.world import parse_map

# 3 Spawns (N, E, S), uma chave, uma Door, um Enemy e o Boss
MAP_TEXT = "1111111\n1N0E0S1\n1K0D0I1\n10000B1\n1111111\n"
PLAYERS = [(7, "roberto"), (9, "augusto")]


def new_room(players=PLAYERS, options=RoomOptions(), seed=1):
	game_map = parse_map(MAP_TEXT, "t", Mode.COOP)
	return create_room(12, Mode.COOP, game_map, options, players, seed)


def test_nth_player_is_born_on_the_nth_spawn():
	room = new_room()
	assert list(room.players) == [7, 9]
	assert (room.players[7].x, room.players[7].y) == (1.5, 1.5)
	assert (room.players[9].x, room.players[9].y) == (3.5, 1.5)


def test_spawn_direction_becomes_the_angle():
	room = new_room()
	assert room.players[7].angle == pytest.approx(0.0) # N
	assert room.players[9].angle == pytest.approx(math.pi / 2) # E


def test_player_starts_full_and_disconnected():
	player = new_room(options=RoomOptions(start_hp=7)).players[7]
	assert player.name == "roberto"
	assert player.hp == 7
	assert player.mana == RULESET_NUMBERS[Mode.COOP]["MANA_MAX"]
	assert player.alive and not player.connected


def test_entities_come_from_the_map():
	room = new_room()
	assert [(e.id, e.x, e.y, e.state) for e in room.enemies] == [("e_1", 5.5, 2.5, EnemyState.ALERT)]
	assert (room.boss.x, room.boss.y, room.boss.hp, room.boss.state) == (5.5, 3.5, BOSS_HP, BossState.IDLE)
	assert [(d.x, d.y, d.locked, d.open) for d in room.doors] == [(3, 2, True, False)]


def test_room_starts_at_tick_zero_with_its_own_grid():
	room = new_room()
	assert room.tick == 0 and room.result is None
	assert room.numbers == RULESET_NUMBERS[Mode.COOP]
	room.grid[2][1] = "0" # como se a chave tivesse sido coletada
	assert room.initial_grid[2][1] == "K"
	assert new_room().grid[2][1] == "K"


def test_seed_feeds_the_room_rng():
	assert new_room(seed=42).rng.random() == Random(42).random()


def test_more_players_than_spawns_is_refused():
	with pytest.raises(ValueError):
		new_room(players=[(1, "a"), (2, "b"), (3, "c"), (4, "d")])


DT = 1 / TICK_RATE
STEP = PLAYER_SPEED * DT # quanto um Input andando move o Player


def make_input(seq, **held):
	keys = dict.fromkeys(("up", "down", "left", "right", "rot_left", "rot_right", "sprint"), False)
	keys.update(held)
	return Input(seq=seq, mouse_dx=0.0, **keys)


def enqueue_walking(room, count, first_seq=1):
	# o Player 7 nasce em (1.5, 1.5) olhando para o norte: up diminui o y
	for seq in range(first_seq, first_seq + count):
		enqueue(room, 7, make_input(seq, up=True))


def test_one_input_is_applied_per_tick():
	room = new_room()
	enqueue_walking(room, 2)
	step(room, DT)
	assert room.players[7].y == pytest.approx(1.5 - STEP)
	assert last_input_seq(room, 7) == 1
	step(room, DT)
	assert room.players[7].y == pytest.approx(1.5 - 2 * STEP)
	assert last_input_seq(room, 7) == 2


def test_empty_queue_leaves_the_player_still():
	room = new_room()
	enqueue_walking(room, 1)
	step(room, DT)
	step(room, DT)
	assert room.players[7].y == pytest.approx(1.5 - STEP)
	assert last_input_seq(room, 7) == 1


def test_three_waiting_inputs_apply_two_and_never_more():
	room = new_room()
	enqueue_walking(room, 5)
	step(room, DT) # 5 esperando: aplica 2
	assert last_input_seq(room, 7) == 2
	assert room.players[7].y == pytest.approx(1.5 - 2 * STEP)
	step(room, DT) # 3 esperando: aplica 2
	assert last_input_seq(room, 7) == 4
	step(room, DT) # 1 esperando: aplica 1
	assert last_input_seq(room, 7) == 5


def test_queue_holds_one_second_and_drops_the_rest():
	room = new_room()
	enqueue_walking(room, 40)
	assert len(room.players[7].input_queue) == 30


def test_seq_that_does_not_grow_is_dropped():
	room = new_room()
	for seq in (1, 1, 0, 2):
		enqueue(room, 7, make_input(seq))
	assert [message.seq for message in room.players[7].input_queue] == [1, 2]


def test_action_waits_its_turn_in_the_queue():
	room = new_room()
	enqueue(room, 7, make_input(1, up=True))
	enqueue(room, 7, Action(seq=2, kind=ActionKind.FIRE))
	enqueue(room, 7, make_input(3, up=True))
	step(room, DT)
	assert last_input_seq(room, 7) == 1
	step(room, DT) # consome a Action e aplica o Input seguinte
	assert last_input_seq(room, 7) == 3
	assert len(room.players[7].input_queue) == 0


def test_dead_player_consumes_inputs_without_moving():
	room = new_room()
	room.players[7].alive = False
	enqueue_walking(room, 1)
	step(room, DT)
	assert room.players[7].y == 1.5
	assert last_input_seq(room, 7) == 1


def test_connection_events_come_out_of_the_next_step():
	room = new_room()
	set_connected(room, 7, True)
	assert step(room, DT) == [Event("player_joined", 1, {"player_id": 7, "name": "roberto"})]
	set_connected(room, 7, False)
	assert step(room, DT) == [Event("player_disconnected", 2, {"player_id": 7})]
	set_connected(room, 7, True)
	assert step(room, DT) == [Event("player_reconnected", 3, {"player_id": 7})]
	assert step(room, DT) == []


def test_every_accepted_join_resets_queue_and_seq():
	room = new_room()
	set_connected(room, 7, True)
	enqueue_walking(room, 3)
	step(room, DT)
	set_connected(room, 7, True) # socket substituído (4408), sem queda antes
	assert len(room.players[7].input_queue) == 0
	assert last_input_seq(room, 7) == 0
	enqueue_walking(room, 1) # o seq do cliente recomeça em 1
	assert len(room.players[7].input_queue) == 1
	assert step(room, DT) == [] # socket substituído não gera Event


def test_leave_takes_the_player_out_for_good():
	room = new_room()
	set_connected(room, 7, True)
	step(room, DT)
	leave(room, 7)
	assert room.players[7].left and not room.players[7].connected
	assert step(room, DT) == [Event("player_left", 2, {"player_id": 7})]
	enqueue_walking(room, 1)
	set_connected(room, 7, True)
	assert len(room.players[7].input_queue) == 0
	assert step(room, DT) == []


FIVE_SPAWNS = "11111111\n1NESWN01\n100000B1\n11111111\n"


def test_five_players_take_five_spawns_in_join_order():
	game_map = parse_map(FIVE_SPAWNS, "t", Mode.COOP)
	players = [(5, "a"), (3, "b"), (8, "c"), (1, "d"), (4, "e")]
	room = create_room(12, Mode.COOP, game_map, RoomOptions(), players, seed=1)
	assert [(room.players[user_id].x, room.players[user_id].y) for user_id, _ in players] == [
		(1.5, 1.5), (2.5, 1.5), (3.5, 1.5), (4.5, 1.5), (5.5, 1.5)]


def test_disconnected_player_stands_still_and_can_be_hit():
	room = new_room()
	set_connected(room, 7, True)
	step(room, DT)
	enqueue_walking(room, 3)
	set_connected(room, 7, False)
	assert len(room.players[7].input_queue) == 0
	player = room.players[7]
	room.projectiles.append(Projectile(id="t_7", kind=ProjectileKind.BULLET, owner_id=None,
		x=player.x + 1.0, y=player.y, dx=-1.0, dy=0.0))
	events = step(room, DT) + step(room, DT) + step(room, DT)
	assert Event("player_disconnected", 2, {"player_id": 7}) in events
	assert (player.x, player.y) == (1.5, 1.5)
	assert any(event.name == "player_hit" and event.data["target"] == 7 for event in events)


def test_player_who_left_leaves_the_snapshot_but_keeps_its_counters():
	room = new_room()
	room.players[7].kills = 2
	leave(room, 7)
	step(room, DT)
	assert [player["id"] for player in to_snapshot(room)["players"]] == [9]
	leave(room, 9) # fecha a partida para ter match_outcome
	step(room, DT)
	players = {player.user_id: player for player in match_outcome(room).players}
	assert players[7].kills == 2 and not players[7].survived


EXAMPLE =Path(__file__).resolve().parents[3] / "docs" / "contracts" / "snapshot.example.json"
DOOR_FUNCTIONS = ("load_map", "create_room", "enqueue", "set_connected", "leave", "step",
	"to_snapshot", "initial_grid", "last_input_seq", "match_outcome")


def shape(value):
	# o desenho das chaves em todos os níveis, sem os valores
	if isinstance(value, dict):
		return {key: shape(item) for key, item in value.items()}
	if isinstance(value, list):
		return [shape(value[0])] if value else []
	return None


def test_snapshot_has_the_keys_of_the_contract_example():
	example = json.loads(EXAMPLE.read_text(encoding="utf-8"))["snapshot"]
	for key in ("v", "type", "last_input_seq"): # quem acrescenta é o Netcode
		del example[key]
	room = new_room()
	# uma Room recém-criada não tem Projectile nem célula alterada; o exemplo tem
	room.projectiles.append(Projectile(id="f_1", kind=ProjectileKind.FIREBALL, owner_id=7,
		x=1.5, y=1.5, dx=0.0, dy=-1.0))
	room.grid[2][1] = "0"
	assert shape(to_snapshot(room)) == shape(example)


def test_snapshot_is_plain_json():
	snapshot = json.loads(json.dumps(to_snapshot(new_room()), allow_nan=False))
	assert snapshot["enemies"][0]["state"] == "alert"
	assert snapshot["boss"]["state"] == "idle"


def test_snapshot_values_of_a_new_room():
	room = new_room()
	room.players[7].mana = 59.9
	leave(room, 9)
	room.grid[2][1] = "0"
	snapshot = to_snapshot(room)
	player = snapshot["players"][0]
	assert snapshot["tick"] == 0
	assert [entry["id"] for entry in snapshot["players"]] == [7] # quem saiu não aparece
	assert (player["dx"], player["dy"]) == pytest.approx((0.0, -1.0))
	assert player["mana"] == 59 # arredondada para baixo no fio
	assert snapshot["grid_delta"] == [{"x": 1, "y": 2, "c": "0"}]
	assert snapshot["scoreboard"] is None


def test_initial_grid_does_not_follow_the_room_grid():
	room = new_room()
	room.grid[2][1] = "0"
	assert initial_grid(room) == ["1111111", "1000001", "1K0D001", "1000001", "1111111"]


def run_script():
	room = new_room(seed=3)
	set_connected(room, 7, True)
	snapshots = []
	for seq in range(1, 31):
		enqueue(room, 7, make_input(seq, up=seq % 2 == 0, rot_right=True, sprint=seq > 20))
		step(room, DT)
		snapshots.append(to_snapshot(room))
	return snapshots


def test_same_inputs_give_the_same_snapshots():
	assert run_script() == run_script()


def test_match_outcome_is_none_while_the_match_runs():
	assert match_outcome(new_room()) is None


def test_the_door_exposes_every_function():
	for name in DOOR_FUNCTIONS:
		assert callable(getattr(app.game, name)), name


SOUTH_OF_7 = (1.5, 2.3) # 0,8 célula ao sul de onde o Player 7 nasce


def walk_south(room):
	# três Inputs para o sul; sem obstáculo, o Player 7 anda 3 passos
	for seq in (1, 2, 3):
		enqueue(room, 7, make_input(seq, down=True))
	for _ in range(3):
		step(room, DT)
	return room.players[7].y


def stopped_before(y):
	return SOUTH_OF_7[1] - y >= BODY_BLOCK_DISTANCE


def test_nothing_in_the_way_south():
	assert walk_south(new_room()) == pytest.approx(1.5 + 3 * STEP)


@pytest.mark.parametrize("alive, blocks", [(True, True), (False, False)])
def test_other_player_blocks_only_while_alive(alive, blocks):
	room = new_room()
	other = room.players[9]
	other.x, other.y = SOUTH_OF_7
	other.alive = alive
	assert stopped_before(walk_south(room)) == blocks


def test_player_who_left_does_not_block():
	room = new_room()
	room.players[9].x, room.players[9].y = SOUTH_OF_7
	leave(room, 9)
	assert not stopped_before(walk_south(room))


@pytest.mark.parametrize("state, blocks", [
	(EnemyState.ALERT, True), (EnemyState.ATTACK, True), (EnemyState.DYING, False)])
def test_enemy_blocks_unless_dying(state, blocks):
	room = new_room()
	enemy = room.enemies[0]
	enemy.x, enemy.y = SOUTH_OF_7
	enemy.state = state
	assert stopped_before(walk_south(room)) == blocks


def test_boss_blocks():
	room = new_room()
	room.boss.x, room.boss.y = SOUTH_OF_7
	assert stopped_before(walk_south(room))
