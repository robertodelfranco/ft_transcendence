import math
from random import Random

from app.game.movement import Body, CollisionWorld, apply_input
from app.game.rules import BOSS_HP, DOOR_REACH, POTION_HEAL, RULESET_NUMBERS, TICK_RATE
from app.game.state import (Action, ActionKind, Boss, BossState, Door, Enemy, EnemyState, Event,
	Input, MatchOutcome, Mode, Player, Room, RoomOptions)
from app.game.world import Map

MAX_QUEUE = TICK_RATE # 1 s de mensagens (ws-messages.md §2.9)
CATCH_UP_FROM = 3 # com 3 ou mais Inputs esperando, o Tick aplica 2
PICKUP_KINDS = {"K": "key", "P": "potion", "M": "mana", "A": "armor"}


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
		_consume_queue(room, player, dt, events)
	return events


def _consume_queue(room: Room, player: Player, dt: float, events: list[Event]) -> None:
	waiting = sum(isinstance(message, Input) for message in player.input_queue)
	budget = 2 if waiting >= CATCH_UP_FROM else 1
	while player.input_queue and budget > 0:
		message = player.input_queue.popleft()
		if isinstance(message, Action):
			if player.alive:
				_apply_action(room, player, message, events)
			continue
		if player.alive:
			_move(room, player, message, dt)
			_collect_pickup(room, player, events)
		player.last_input_seq = message.seq
		budget -= 1


def _move(room: Room, player: Player, inp: Input, dt: float) -> None:
	world = CollisionWorld(grid=room.grid, bodies=_blocking_bodies(room, player))
	body = apply_input(Body(player.x, player.y, player.angle), inp, world, dt)
	player.x, player.y, player.angle = body.x, body.y, body.angle


def _blocking_bodies(room: Room, player: Player) -> tuple[tuple[float, float], ...]:
	# só bloqueia quem está vivo e na partida (rules.md §4)
	bodies = [(other.x, other.y) for other in room.players.values()
		if other is not player and other.alive and not other.left]
	bodies += [(enemy.x, enemy.y) for enemy in room.enemies if enemy.state != EnemyState.DYING]
	if room.boss is not None and room.boss.state != BossState.DYING:
		bodies.append((room.boss.x, room.boss.y))
	return tuple(bodies)


def _collect_pickup(room: Room, player: Player, events: list[Event]) -> None:
	# a célula é a da posição nova, depois do passo
	column, row = math.floor(player.x), math.floor(player.y)
	kind = PICKUP_KINDS.get(room.grid[row][column])
	if kind is None or not _use_pickup(room, player, kind):
		return
	room.grid[row][column] = "0"
	data = {"kind": kind, "by": player.user_id, "x": column, "y": row}
	events.append(Event("item_picked", room.tick, data))


def _use_pickup(room: Room, player: Player, kind: str) -> bool:
	# False quando o Pickup não serve a este Player: ele fica no chão para um companheiro
	numbers = room.numbers
	if kind == "key":
		player.keys += 1
		player.keys_collected += 1
	elif kind == "potion":
		if player.hp >= room.options.start_hp:
			return False
		player.hp = min(player.hp + POTION_HEAL, room.options.start_hp)
		player.potions_used += 1
	elif kind == "mana":
		if player.mana >= numbers["MANA_MAX"]:
			return False
		player.mana = min(player.mana + numbers["MANA_PICKUP"], float(numbers["MANA_MAX"]))
	else: # armor: não acumula
		if player.armor >= numbers["ARMOR_POINTS"]:
			return False
		player.armor = numbers["ARMOR_POINTS"]
	return True


def _apply_action(room: Room, player: Player, action: Action, events: list[Event]) -> None:
	if action.kind == ActionKind.DOOR:
		_open_door(room, player, events)
	# fire entra com a fireball (F1.5)


def _open_door(room: Room, player: Player, events: list[Event]) -> None:
	# a célula visada fica a DOOR_REACH à frente do Player
	column = math.floor(player.x + math.sin(player.angle) * DOOR_REACH)
	row = math.floor(player.y - math.cos(player.angle) * DOOR_REACH)
	door = next((door for door in room.doors if (door.x, door.y) == (column, row)), None)
	if door is None or door.open:
		return
	if door.locked:
		if player.keys == 0:
			return
		player.keys -= 1 # a chave gasta é a de quem apertou
		door.locked = False
	door.open = True
	room.grid[row][column] = "O"
	events.append(Event("door_opened", room.tick, {"x": column, "y": row, "by": player.user_id}))
