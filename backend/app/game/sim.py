import math
from random import Random

from app.game.movement import Body, CollisionWorld, apply_input, is_solid
from app.game.rules import (BOSS_HP, DOOR_REACH, ENEMY_ATTACK_INTERVAL_S, ENEMY_ATTACK_RANGE,
	ENEMY_DAMAGE, ENEMY_DYING_S, ENEMY_RADIUS, ENEMY_RETARGET_MARGIN, ENEMY_SEPARATION,
	ENEMY_SPEED, FIREBALL_COOLDOWN_S, POTION_HEAL, PROJECTILE_HIT_RADIUS, PROJECTILE_HIT_S, PROJECTILE_MAX_SUBSTEP, PROJECTILE_RADIUS,
	PROJECTILE_SPEED, RULESET_NUMBERS, TICK_RATE)
from app.game.state import (Action, ActionKind, Boss, BossState, Door, Enemy, EnemyState, Event,
	Input, MatchOutcome, Mode, Player, Projectile, ProjectileKind, ProjectileState, Room,
	RoomOptions)
from app.game.world import Map

MAX_QUEUE = TICK_RATE # 1 s de mensagens (ws-messages.md §2.9)
CATCH_UP_FROM = 3 # com 3 ou mais Inputs esperando, o Tick aplica 2
# em Ticks inteiros: somando dt em float, 0.4 - 12 * (1/30) sobra 9.7e-17 e o cooldown vira 13
FIREBALL_COOLDOWN_TICKS = round(FIREBALL_COOLDOWN_S * TICK_RATE)
PROJECTILE_HIT_TICKS = round(PROJECTILE_HIT_S * TICK_RATE)
ENEMY_ATTACK_TICKS = round(ENEMY_ATTACK_INTERVAL_S * TICK_RATE)
ENEMY_DYING_TICKS = round(ENEMY_DYING_S * TICK_RATE)
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
	_update_enemies(room, dt)
	_update_projectiles(room, dt, events)
	_regen_mana(room, dt)
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
	else:
		_fire(room, player)


def _fire(room: Room, player: Player) -> None:
	cost = room.numbers["FIREBALL_MANA_COST"]
	# a Mana exata decide, não a arredondada do Snapshot (rules.md §4)
	if room.tick < player.fire_ready_tick or player.mana < cost:
		return
	player.mana -= cost
	player.fire_ready_tick = room.tick + FIREBALL_COOLDOWN_TICKS
	# nasce na posição do Player, indo para onde ele olha
	room.projectiles.append(Projectile(id=f"f_{room.next_projectile_id}",
		kind=ProjectileKind.FIREBALL, owner_id=player.user_id, x=player.x, y=player.y,
		dx=math.sin(player.angle), dy=-math.cos(player.angle)))
	room.next_projectile_id += 1


def _update_enemies(room: Room, dt: float) -> None:
	for enemy in room.enemies:
		if enemy.state != EnemyState.DYING:
			_update_enemy(room, enemy, dt)
	# sai da Room quem já ficou ENEMY_DYING_S em dying
	room.enemies = [enemy for enemy in room.enemies
		if enemy.state != EnemyState.DYING or room.tick - enemy.state_tick < ENEMY_DYING_TICKS]


def _update_enemy(room: Room, enemy: Enemy, dt: float) -> None:
	if enemy.state == EnemyState.ATTACK:
		if room.tick - enemy.state_tick < ENEMY_ATTACK_TICKS:
			return # golpe em andamento: parado
		_strike(room, enemy)
		enemy.state = EnemyState.ALERT
	target = _pick_target(room, enemy)
	enemy.target_player_id = None if target is None else target.user_id
	if target is None:
		return
	dx, dy = target.x - enemy.x, target.y - enemy.y
	distance = math.hypot(dx, dy)
	if distance <= ENEMY_ATTACK_RANGE:
		# no mesmo Tick do golpe anterior: dois golpes ficam a ENEMY_ATTACK_INTERVAL_S exatos
		enemy.state, enemy.state_tick = EnemyState.ATTACK, room.tick
	else:
		_enemy_walk(room, enemy, dx / distance, dy / distance, ENEMY_SPEED * dt)


def _pick_target(room: Room, enemy: Enemy) -> Player | None:
	def distance(player: Player) -> float:
		return math.hypot(player.x - enemy.x, player.y - enemy.y)
	candidates = [player for player in room.players.values() if player.alive and not player.left]
	if not candidates:
		return None
	nearest = min(candidates, key=distance)
	current = room.players.get(enemy.target_player_id)
	# o alvo atual só perde para quem está ENEMY_RETARGET_MARGIN mais perto
	if (current is not None and current.alive and not current.left
			and distance(nearest) > distance(current) - ENEMY_RETARGET_MARGIN):
		return current
	return nearest


def _enemy_walk(room: Room, enemy: Enemy, dir_x: float, dir_y: float, length: float) -> None:
	# em linha reta; bloqueado, um lado perpendicular e depois o outro (try_move_again do C)
	for step_x, step_y in ((dir_x, dir_y), (dir_y, -dir_x), (-dir_y, dir_x)):
		x, y = enemy.x + step_x * length, enemy.y + step_y * length
		if _enemy_fits(room, enemy, x, y):
			enemy.x, enemy.y = x, y
			return


def _enemy_fits(room: Room, enemy: Enemy, x: float, y: float) -> bool:
	if _touches_wall(room.grid, x, y, ENEMY_RADIUS):
		return False
	# quem está em dying não conta
	return all(math.hypot(x - other.x, y - other.y) >= ENEMY_SEPARATION
		for other in room.enemies if other is not enemy and other.state != EnemyState.DYING)


def _strike(room: Room, enemy: Enemy) -> None:
	# só acerta quem ainda está no alcance; no C o dano saía sem conferir a distância
	target = room.players.get(enemy.target_player_id)
	if target is None or not target.alive or target.left:
		return
	if math.hypot(target.x - enemy.x, target.y - enemy.y) <= ENEMY_ATTACK_RANGE:
		_hurt_player(target, ENEMY_DAMAGE)


def _hurt_player(player: Player, amount: int) -> None:
	# Armor, player_hit e a morte entram no R3.6
	player.hp = max(player.hp - amount, 0)


def _kill_enemy(room: Room, enemy: Enemy, killer_id: int | None, events: list[Event]) -> None:
	enemy.state, enemy.state_tick = EnemyState.DYING, room.tick
	if killer_id is not None:
		room.players[killer_id].kills += 1
	events.append(Event("enemy_died", room.tick, {"enemy_id": enemy.id, "killer_id": killer_id}))


def _update_projectiles(room: Room, dt: float, events: list[Event]) -> None:
	for shot in room.projectiles:
		if shot.state == ProjectileState.MOVING:
			_fly(room, shot, dt, events)
	# sai da Room quem já ficou PROJECTILE_HIT_S em hit
	room.projectiles = [shot for shot in room.projectiles
		if shot.state == ProjectileState.MOVING
		or room.tick - shot.state_tick < PROJECTILE_HIT_TICKS]


def _fly(room: Room, shot: Projectile, dt: float, events: list[Event]) -> None:
	distance = PROJECTILE_SPEED * dt
	# subpassos de no máximo PROJECTILE_MAX_SUBSTEP: o C só testava o ponto de chegada
	substeps = max(1, math.ceil(distance / PROJECTILE_MAX_SUBSTEP))
	length = distance / substeps
	targets = _targets(room, shot)
	for _ in range(substeps):
		x, y = shot.x + shot.dx * length, shot.y + shot.dy * length
		target = _target_at(targets, x, y)
		if target is not None or _touches_wall(room.grid, x, y, PROJECTILE_RADIUS):
			# para no ponto anterior, como no C: o impacto não fica dentro da parede
			shot.state, shot.state_tick = ProjectileState.HIT, room.tick
			if isinstance(target, Enemy):
				_kill_enemy(room, target, shot.owner_id, events)
			return # o dano em Player e Boss entra nos R3.6 e R3.7
		shot.x, shot.y = x, y


def _targets(room: Room, shot: Projectile) -> list[Enemy | Boss | Player]:
	# quem este Projectile pode acertar; não existe fogo amigo (rules.md §4)
	players = [player for player in room.players.values() if player.alive and not player.left]
	if shot.kind == ProjectileKind.BULLET:
		return players
	targets = [enemy for enemy in room.enemies if enemy.state != EnemyState.DYING]
	if room.boss is not None and room.boss.state != BossState.DYING:
		targets.append(room.boss)
	if room.mode == Mode.PVP:
		targets += [player for player in players if player.user_id != shot.owner_id]
	return targets


def _target_at(targets: list[Enemy | Boss | Player], x: float,
		y: float) -> Enemy | Boss | Player | None:
	for target in targets:
		if math.hypot(x - target.x, y - target.y) < PROJECTILE_HIT_RADIUS:
			return target
	return None


def _touches_wall(grid: list[list[str]], x: float, y: float, radius: float) -> bool:
	# os 4 cantos da caixa da entidade, a radius do centro
	return any(is_solid(grid, corner_x, corner_y)
		for corner_x in (x - radius, x + radius)
		for corner_y in (y - radius, y + radius))


def _regen_mana(room: Room, dt: float) -> None:
	# por Tick, e não por Input: com o catch-up, um Tick aplica 2 Inputs
	numbers = room.numbers
	for player in room.players.values():
		if not player.alive or player.left:
			continue
		player.mana = min(player.mana + numbers["MANA_REGEN_PER_S"] * dt,
			float(numbers["MANA_MAX"]))


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
