import math
from random import Random

from app.game.rules import (BOSS_HP, MOUSE_MAX_ROT_SPEED, PLAYER_ROT_SPEED, PLAYER_SPEED,
	PLAYER_SPRINT_MULT, RULESET_NUMBERS, TICK_RATE)
from app.game.state import (Action, Boss, Door, Enemy, Event, Input, MatchOutcome, Mode, Player,
	Room, RoomOptions)
from app.game.world import Map

MAX_QUEUE = TICK_RATE # 1 s de mensagens (ws-messages.md §2.9)
CATCH_UP_FROM = 3 # com 3 ou mais Inputs esperando, o Tick aplica 2


def create_room(match_id: int, mode: Mode, game_map: Map, options: RoomOptions,
		players: list[tuple[int, str]], seed: int) -> Room:
	if len(players) > len(game_map.spawns):
		raise ValueError(f"{len(players)} Players para {len(game_map.spawns)} Spawns")
	numbers = RULESET_NUMBERS[mode]
	room = Room(match_id=match_id, mode=mode, options=options, numbers=numbers,
		rng=Random(seed), initial_grid=game_map.grid, grid=game_map.new_grid())
	# o enésimo Player nasce no enésimo Spawn, olhando para onde a letra aponta
	for (user_id, name), spawn in zip(players, game_map.spawns):
		room.players[user_id] = Player(user_id=user_id, name=name, x=spawn.x, y=spawn.y,
			angle=math.atan2(spawn.dx, -spawn.dy), hp=options.start_hp,
			mana=float(numbers["MANA_MAX"]))
	for number, (x, y) in enumerate(game_map.enemies, start=1):
		room.enemies.append(Enemy(id=f"e_{number}", x=x, y=y))
	if game_map.boss is not None:
		boss_x, boss_y = game_map.boss
		room.boss = Boss(x=boss_x, y=boss_y, hp=BOSS_HP)
	for x, y in game_map.doors:
		room.doors.append(Door(x=x, y=y))
	return room


def enqueue(room: Room, user_id: int, message: Input | Action) -> None:
	player = room.players[user_id]
	if player.left or message.seq <= player.last_queued_seq:
		return
	if len(player.input_queue) >= MAX_QUEUE:
		return
	player.last_queued_seq = message.seq
	player.input_queue.append(message)


def set_connected(room: Room, user_id: int, connected: bool) -> None:
	player = room.players[user_id]
	if player.left:
		return
	was_connected = player.connected
	player.connected = connected
	player.input_queue.clear()
	if connected:
		# todo join aceito é uma conexão nova: o seq do cliente recomeça em 1
		player.last_input_seq = 0
		player.last_queued_seq = 0
		if not player.joined:
			player.joined = True
			room.pending_events.append(("player_joined", {"player_id": user_id, "name": player.name}))
		elif not was_connected:
			room.pending_events.append(("player_reconnected", {"player_id": user_id}))
	elif was_connected:
		room.pending_events.append(("player_disconnected", {"player_id": user_id}))


def leave(room: Room, user_id: int) -> None:
	player = room.players[user_id]
	if player.left:
		return
	player.left = True
	player.connected = False
	player.input_queue.clear()
	room.pending_events.append(("player_left", {"player_id": user_id}))


def last_input_seq(room: Room, user_id: int) -> int:
	return room.players[user_id].last_input_seq

def match_outcome(room: Room) -> MatchOutcome | None:
	if room.result is None:
		return None
	raise NotImplementedError("o resultado da partida entra com o Ruleset (R4)")



def step(room: Room, dt: float) -> list[Event]:
	room.tick += 1
	# o que aconteceu fora do step (conexão, saída) sai aqui, com o Tick atual
	events = [Event(name, room.tick, data) for name, data in room.pending_events]
	room.pending_events.clear()
	for player in room.players.values():
		_consume_queue(player, dt)
	return events


def _consume_queue(player: Player, dt: float) -> None:
	waiting = sum(isinstance(message, Input) for message in player.input_queue)
	budget = 2 if waiting >= CATCH_UP_FROM else 1
	while player.input_queue and budget > 0:
		message = player.input_queue.popleft()
		if isinstance(message, Action):
			continue # fire e door entram no R3
		if player.alive:
			_apply_input(player, message, dt)
		player.last_input_seq = message.seq
		budget -= 1


def _apply_input(player: Player, inp: Input, dt: float) -> None:
	# esqueleto: giro e passo, sem colisão (a colisão entra no R2)
	max_turn = MOUSE_MAX_ROT_SPEED * dt
	player.angle += max(-max_turn, min(max_turn, inp.mouse_dx))
	player.angle += (inp.rot_right - inp.rot_left) * PLAYER_ROT_SPEED * dt
	forward = inp.up - inp.down
	strafe = inp.right - inp.left
	length = math.hypot(forward, strafe)
	if length == 0:
		return
	speed = PLAYER_SPEED * (PLAYER_SPRINT_MULT if inp.sprint else 1.0)
	dir_x, dir_y = math.sin(player.angle), -math.cos(player.angle)
	# frente = (dir_x, dir_y); direita = (-dir_y, dir_x)
	move_x = (dir_x * forward - dir_y * strafe) / length
	move_y = (dir_y * forward + dir_x * strafe) / length
	player.x += move_x * speed * dt
	player.y += move_y * speed * dt
