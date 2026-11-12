"""A contagem 3, 2, 1 com a Room congelada no início da partida (#255, ws-messages.md §2.9)."""
from app.game.rules import COUNTDOWN_S, COUNTDOWN_WAIT_S, TICK_RATE
from app.game.sim import create_room, enqueue, leave, match_outcome, set_connected, step
from app.game.snapshot import to_snapshot
from app.game.state import Action, ActionKind, Input, Mode, RoomOptions
from app.game.world import parse_map

DT = 1 / TICK_RATE
COUNTDOWN_TICKS = round(COUNTDOWN_S * TICK_RATE) # 90 Ticks
WAIT_TICKS = round(COUNTDOWN_WAIT_S * TICK_RATE) # 300 Ticks
NO_KEYS = dict.fromkeys(("up", "down", "left", "right", "rot_left", "rot_right", "sprint"), False)
# a sala do test_enemies.py: o Player 7 em (1, 3), o Enemy em (6, 3) e o Player 9 em (9, 3)
ARENA = ("11111111111\n10000000001\n10000000001\n1E0000I00W1\n"
	"10000000001\n10000000001\n11111111111\n")
PVP_CORRIDOR = "1111111\n1E000W1\n1111111\n"


def new_room(mode=Mode.COOP, options=None):
	text, name = (ARENA, "t") if mode == Mode.COOP else (PVP_CORRIDOR, "pvp_t")
	return create_room(12, mode, parse_map(text, name, mode), options or RoomOptions(),
		[(7, "roberto"), (9, "augusto")], seed=1, countdown=True)


def connect(room, *user_ids):
	for user_id in user_ids or tuple(room.players):
		set_connected(room, user_id, True)


def walk(room, seq, user_id=7):
	# anda para a frente e gira: o que um Player apertaria esperando a largada
	enqueue(room, user_id, Input(seq=seq, mouse_dx=0.3, **{**NO_KEYS, "up": True}))


def step_until(room, tick):
	while room.tick < tick:
		step(room, DT)


def position(room, user_id=7):
	player = room.players[user_id]
	return (player.x, player.y, player.angle)


# ---------- sem contagem ----------

def test_without_countdown_the_first_tick_already_counts():
	# o padrão de create_room: é o que os outros testes da Simulation e o cli usam
	room = create_room(12, Mode.COOP, parse_map(ARENA, "t", Mode.COOP), RoomOptions(),
		[(7, "roberto"), (9, "augusto")], seed=1)
	assert room.countdown_end_tick == 1
	start = position(room)
	walk(room, 1)
	step(room, DT)
	assert position(room) != start
	assert room.played_ticks() == 1


# ---------- quando a contagem começa ----------

def test_the_room_waits_frozen_while_a_player_is_not_connected():
	room = new_room()
	connect(room, 7)
	step_until(room, WAIT_TICKS - 1)
	assert room.countdown_end_tick is None
	assert room.frozen()
	assert to_snapshot(room)["countdown_end_tick"] is None


def test_the_countdown_starts_on_the_tick_everyone_is_connected():
	room = new_room()
	connect(room)
	step(room, DT)
	assert room.countdown_end_tick == 1 + COUNTDOWN_TICKS
	assert to_snapshot(room)["countdown_end_tick"] == 1 + COUNTDOWN_TICKS


def test_a_player_who_never_joins_does_not_hold_the_others_past_the_wait():
	room = new_room()
	connect(room, 7)
	step_until(room, WAIT_TICKS)
	assert room.countdown_end_tick == WAIT_TICKS + COUNTDOWN_TICKS


def test_a_reconnection_during_the_countdown_does_not_restart_it():
	room = new_room()
	connect(room)
	step(room, DT)
	end = room.countdown_end_tick
	set_connected(room, 9, False)
	step(room, DT)
	connect(room, 9)
	step(room, DT)
	assert room.countdown_end_tick == end


# ---------- congelada ----------

def test_frozen_inputs_do_not_move_nor_turn_but_are_acknowledged():
	room = new_room()
	connect(room)
	start = position(room)
	for seq in (1, 2, 3):
		walk(room, seq)
		step(room, DT)
	assert position(room) == start
	# sem isso, a Reconciliation do cliente esperaria por esses Inputs para sempre
	assert room.players[7].last_input_seq == 3
	assert not room.players[7].input_queue


def test_frozen_fire_does_nothing():
	room = new_room()
	connect(room)
	enqueue(room, 7, Action(seq=1, kind=ActionKind.FIRE))
	step(room, DT)
	assert room.projectiles == []
	assert room.players[7].mana == room.numbers["MANA_MAX"]


def test_frozen_enemies_wait_and_mana_does_not_regenerate():
	room = new_room()
	connect(room)
	enemy = room.enemies[0]
	start = (enemy.x, enemy.y)
	room.players[7].mana = 50.0
	step_until(room, COUNTDOWN_TICKS)
	assert (enemy.x, enemy.y) == start
	assert room.players[7].mana == 50.0
	assert room.players[7].hp == room.options.start_hp


def test_the_tick_the_countdown_ends_is_the_first_that_moves():
	room = new_room()
	connect(room)
	step(room, DT)
	end = room.countdown_end_tick
	step_until(room, end - 2)
	start = position(room)
	walk(room, 1)
	step(room, DT) # end - 1: ainda congelada
	assert position(room) == start
	assert room.played_ticks() == 0
	walk(room, 2)
	step(room, DT) # end: vale
	assert position(room) != start
	assert room.played_ticks() == 1


# ---------- Ruleset, relógio e duração ----------

def test_leaving_during_the_countdown_ends_the_pvp_match_at_once():
	room = new_room(Mode.PVP)
	connect(room)
	step(room, DT)
	leave(room, 7)
	events = step(room, DT)
	(game_over,) = [event for event in events if event.name == "game_over"]
	assert game_over.data == {"result": "win", "winner_ids": [9], "reason": "forfeit"}
	assert match_outcome(room).duration_ticks == 0 # a partida acabou antes de começar


def test_the_pvp_clock_only_runs_after_the_countdown():
	room = new_room(Mode.PVP, RoomOptions(time_limit_s=1))
	connect(room)
	step(room, DT)
	end = room.countdown_end_tick
	step_until(room, end - 1)
	assert to_snapshot(room)["scoreboard"]["time_left_s"] == 1 # o relógio parado na contagem
	assert room.result is None
	while room.result is None:
		step(room, DT)
	# 1 s jogado são 30 Ticks: do end (o primeiro que vale) até end + 29
	assert room.tick == end + TICK_RATE - 1
	assert room.result["reason"] == "time_limit"
	assert match_outcome(room).duration_ticks == TICK_RATE
