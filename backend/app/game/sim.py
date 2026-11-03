import math
from collections import deque
from collections.abc import Callable
from random import Random

from app.game.movement import Body, CollisionWorld, apply_input, is_solid
from app.game.rules import (BOSS_ATTACK_COOLDOWN_S, BOSS_ATTACK_RANGE, BOSS_ATTACK_WINDUP_S,
	BOSS_HP, BOSS_MIN_RANGE, BOSS_RADIUS, BOSS_SIGHT_RANGE, BOSS_SPEED, BULLET_DAMAGE, DOOR_REACH,
	ENEMY_ATTACK_INTERVAL_S, ENEMY_ATTACK_RANGE, ENEMY_CHASE_RANGE, ENEMY_DAMAGE, ENEMY_DYING_S,
	ENEMY_RADIUS, ENEMY_RETARGET_MARGIN, ENEMY_SEPARATION, ENEMY_SPEED, FIREBALL_BOSS_DAMAGE,
	FIREBALL_COOLDOWN_S, FIREBALL_PLAYER_DAMAGE, POTION_HEAL, PROJECTILE_HIT_RADIUS,
	PROJECTILE_HIT_S, PROJECTILE_MAX_SUBSTEP, PROJECTILE_RADIUS, PROJECTILE_SPEED, TICK_RATE)
from app.game.rulesets import RULESETS
from app.game.state import (Action, ActionKind, Boss, BossState, Door, Enemy, EnemyState, Event,
	Input, MatchOutcome, Mode, Player, PlayerOutcome, Projectile, ProjectileKind,
	ProjectileState, Room, RoomOptions)
from app.game.world import SOLID_CHARS, Map

MAX_QUEUE = TICK_RATE # 1 s de mensagens (ws-messages.md §2.9)
CATCH_UP_FROM = 3 # com 3 ou mais Inputs esperando, o Tick aplica 2
# em Ticks inteiros: somando dt em float, 0.4 - 12 * (1/30) sobra 9.7e-17 e o cooldown vira 13
FIREBALL_COOLDOWN_TICKS = round(FIREBALL_COOLDOWN_S * TICK_RATE)
PROJECTILE_HIT_TICKS = round(PROJECTILE_HIT_S * TICK_RATE)
ENEMY_ATTACK_TICKS = round(ENEMY_ATTACK_INTERVAL_S * TICK_RATE)
ENEMY_DYING_TICKS = round(ENEMY_DYING_S * TICK_RATE)
BOSS_WINDUP_TICKS = round(BOSS_ATTACK_WINDUP_S * TICK_RATE)
BOSS_COOLDOWN_TICKS = round(BOSS_ATTACK_COOLDOWN_S * TICK_RATE)
PICKUP_KINDS = {"K": "key", "P": "potion", "M": "mana", "A": "armor"}
# 8 vizinhas: primeiro as do lado, depois as diagonais
NEIGHBORS = ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1))


def create_room(match_id: int, mode: Mode, game_map: Map, options: RoomOptions,
		players: list[tuple[int, str]], seed: int) -> Room:
	if len(players) > len(game_map.spawns):
		raise ValueError(f"{len(players)} Players para {len(game_map.spawns)} Spawns")
	ruleset = RULESETS[mode]
	numbers = ruleset.numbers
	disabled = {char for char, enabled in (
		("P", options.pickups.potion),
		("M", options.pickups.mana),
		("A", options.pickups.armor),
	) if not enabled}
	initial_grid = tuple("".join("0" if cell in disabled else cell for cell in row)
		for row in game_map.grid)
	room = Room(match_id=match_id, mode=mode, options=options, numbers=numbers,
		rng=Random(seed), initial_grid=initial_grid,
		grid=[list(row) for row in initial_grid],
		spawn_points=tuple((spawn.x, spawn.y) for spawn in game_map.spawns))
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
	ruleset.on_start(room)
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
	return room.outcome # None antes do game_over



def step(room: Room, dt: float) -> list[Event]:
	room.tick += 1
	# o que aconteceu fora do step (conexão, saída) sai aqui, com o Tick atual
	events = [Event(name, room.tick, data) for name, data in room.pending_events]
	room.pending_events.clear()
	# depois do game_over, só as animações andam (ws-messages.md §2.6)
	if room.result is None:
		for player in room.players.values():
			_consume_queue(room, player, dt, events)
		_update_enemies(room, dt, events)
		_update_boss(room, dt)
		_update_projectiles(room, dt, events)
		_regen_mana(room, dt)
		_apply_ruleset(room, events)
	_expire_animations(room)
	return events


def _apply_ruleset(room: Room, events: list[Event]) -> None:
	ruleset = RULESETS[room.mode]
	# a lista sai antes do laço: on_player_death pode emitir Events (o respawn do pvp)
	dead = [event.data["player_id"] for event in events if event.name == "player_died"]
	for user_id in dead:
		ruleset.on_player_death(room, room.players[user_id], events)
	result = ruleset.check_end(room)
	if result is None:
		ruleset.on_tick(room, events)
		return
	room.result = result
	room.outcome = _freeze_outcome(room, result)
	events.append(Event("game_over", room.tick, result))


def _freeze_outcome(room: Room, result: dict) -> MatchOutcome:
	# no Tick do game_over: depois dele, o Tick continua andando e um Player ainda pode cair
	winners = tuple(result["winner_ids"])
	players = tuple(PlayerOutcome(user_id=player.user_id, won=player.user_id in winners,
		survived=player.alive and not player.left, kills=player.kills, frags=player.frags,
		deaths=player.deaths, damage_dealt=player.damage_dealt, damage_taken=player.damage_taken,
		armor_absorbed=player.armor_absorbed, keys_collected=player.keys_collected,
		potions_used=player.potions_used, disconnected_at_end=not player.connected)
		for player in room.players.values())
	return MatchOutcome(result=result["result"], reason=result["reason"], winner_ids=winners,
		duration_ticks=room.tick, players=players)


def _expire_animations(room: Room) -> None:
	# sai da Room o Enemy que já ficou ENEMY_DYING_S em dying e o Projectile que já ficou
	# PROJECTILE_HIT_S em hit; fora do _update_*, porque continua depois do game_over
	room.enemies = [enemy for enemy in room.enemies
		if enemy.state != EnemyState.DYING or room.tick - enemy.state_tick < ENEMY_DYING_TICKS]
	room.projectiles = [shot for shot in room.projectiles
		if shot.state == ProjectileState.MOVING
		or room.tick - shot.state_tick < PROJECTILE_HIT_TICKS]


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


def _update_enemies(room: Room, dt: float, events: list[Event]) -> None:
	for enemy in room.enemies:
		if enemy.state != EnemyState.DYING:
			_update_enemy(room, enemy, dt, events)


def _update_enemy(room: Room, enemy: Enemy, dt: float, events: list[Event]) -> None:
	if enemy.state == EnemyState.ATTACK:
		if room.tick - enemy.state_tick < ENEMY_ATTACK_TICKS:
			return # golpe em andamento: parado
		_strike(room, enemy, events)
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
		length = ENEMY_SPEED * dt
		dir_x, dir_y = _chase_direction(room, enemy, target, length)
		_walk(enemy, dir_x, dir_y, length, lambda x, y: _enemy_fits(room, enemy, x, y))


def _pick_target(room: Room, enemy: Enemy) -> Player | None:
	# o Player com menos passos de caminho; fora de ENEMY_CHASE_RANGE, não é candidato
	cell = _cell(enemy.x, enemy.y)
	steps = {}
	for player in room.players.values():
		if player.alive and not player.left:
			path_field = _path_field(room, player)
			if cell in path_field:
				steps[player.user_id] = path_field[cell]
	if not steps:
		return None
	nearest = min(steps, key=steps.get)
	current = enemy.target_player_id
	# o alvo atual só perde para quem está ENEMY_RETARGET_MARGIN passos mais perto
	if current in steps and steps[nearest] > steps[current] - ENEMY_RETARGET_MARGIN:
		return room.players[current]
	return room.players[nearest]


def _chase_direction(room: Room, enemy: Enemy, target: Player,
		length: float) -> tuple[float, float]:
	cell = _cell(enemy.x, enemy.y)
	path_field = _path_field(room, target)
	if path_field[cell] == 0:
		return _unit(target.x - enemy.x, target.y - enemy.y) # na célula do alvo: em linha reta
	next_x, next_y = _downhill(_free_cells(room), path_field, cell, target)
	direction = _unit(next_x + 0.5 - enemy.x, next_y + 0.5 - enemy.y) # o centro da próxima célula
	if _touches_wall(room.grid, enemy.x + direction[0] * length, enemy.y + direction[1] * length,
			ENEMY_RADIUS):
		# entrou na célula raspando a quina: volta para o centro dela antes de seguir
		to_center = (cell[0] + 0.5 - enemy.x, cell[1] + 0.5 - enemy.y)
		if to_center != (0.0, 0.0):
			direction = _unit(*to_center)
	return direction


def _unit(dx: float, dy: float) -> tuple[float, float]:
	length = math.hypot(dx, dy)
	return dx / length, dy / length


def _path_field(room: Room, player: Player) -> dict[tuple[int, int], int]:
	# refeito só quando o Player muda de célula; Door aberta limpa o cache todo
	cell = _cell(player.x, player.y)
	cached = room.path_fields.get(player.user_id)
	if cached is not None and cached[0] == cell:
		return cached[1]
	path_field = _bfs(_free_cells(room), cell, ENEMY_CHASE_RANGE)
	room.path_fields[player.user_id] = (cell, path_field)
	return path_field


def _free_cells(room: Room) -> frozenset[tuple[int, int]]:
	# consultar um conjunto é bem mais barato que is_solid, chamado até 3 vezes por vizinha na BFS
	if room.free_cells is None:
		room.free_cells = frozenset((x, y) for y, row in enumerate(room.grid)
			for x, char in enumerate(row) if char not in SOLID_CHARS)
	return room.free_cells


def _bfs(free: frozenset[tuple[int, int]], start: tuple[int, int],
		max_steps: int) -> dict[tuple[int, int], int]:
	# busca em largura: quantos passos cada célula livre está de start, até max_steps
	steps = {start: 0}
	queue = deque([start])
	while queue:
		x, y = queue.popleft()
		if steps[(x, y)] == max_steps:
			continue
		for dx, dy in NEIGHBORS:
			neighbor = (x + dx, y + dy)
			if neighbor in steps or neighbor not in free or _cuts_corner(free, x, y, dx, dy):
				continue
			steps[neighbor] = steps[(x, y)] + 1
			queue.append(neighbor)
	return steps


def _downhill(free: frozenset[tuple[int, int]], path_field: dict[tuple[int, int], int],
		cell: tuple[int, int], target: Player) -> tuple[int, int]:
	# a vizinha com menos passos; existe sempre que a célula atual está a 1 passo ou mais.
	# No empate, a mais perto do alvo em linha reta: sem isso, a ordem de NEIGHBORS faz
	# o Enemy andar em L numa sala aberta
	x, y = cell
	best, best_key = cell, (path_field[cell], 0.0)
	for dx, dy in NEIGHBORS:
		neighbor = (x + dx, y + dy)
		if neighbor not in path_field or _cuts_corner(free, x, y, dx, dy):
			continue
		key = (path_field[neighbor],
			math.hypot(neighbor[0] + 0.5 - target.x, neighbor[1] + 0.5 - target.y))
		if key < best_key:
			best, best_key = neighbor, key
	return best


def _cuts_corner(free: frozenset[tuple[int, int]], x: int, y: int, dx: int, dy: int) -> bool:
	# na diagonal, as duas células do lado precisam estar livres: o Enemy não raspa a quina
	return bool(dx and dy) and ((x + dx, y) not in free or (x, y + dy) not in free)


def _cell(x: float, y: float) -> tuple[int, int]:
	return math.floor(x), math.floor(y)


def _walk(entity: Enemy | Boss, dir_x: float, dir_y: float, length: float,
		fits: Callable[[float, float], bool]) -> None:
	# em linha reta; bloqueado, um lado perpendicular e depois o outro (try_move_again do C)
	for step_x, step_y in ((dir_x, dir_y), (dir_y, -dir_x), (-dir_y, dir_x)):
		x, y = entity.x + step_x * length, entity.y + step_y * length
		if fits(x, y):
			entity.x, entity.y = x, y
			return


def _enemy_fits(room: Room, enemy: Enemy, x: float, y: float) -> bool:
	if _touches_wall(room.grid, x, y, ENEMY_RADIUS):
		return False
	# quem está em dying não conta
	return all(math.hypot(x - other.x, y - other.y) >= ENEMY_SEPARATION
		for other in room.enemies if other is not enemy and other.state != EnemyState.DYING)


def _strike(room: Room, enemy: Enemy, events: list[Event]) -> None:
	# só acerta quem ainda está no alcance; no C o dano saía sem conferir a distância
	target = room.players.get(enemy.target_player_id)
	if target is None or not target.alive or target.left:
		return
	if math.hypot(target.x - enemy.x, target.y - enemy.y) <= ENEMY_ATTACK_RANGE:
		_hurt_player(room, target, ENEMY_DAMAGE, None, "enemy", events)


def _hurt_player(room: Room, player: Player, amount: int, by: int | None, source: str,
		events: list[Event]) -> None:
	# a Armor segura primeiro, ponto por ponto; o resto sai do HP, que não passa de 0
	absorbed = min(player.armor, amount)
	lost = min(amount - absorbed, player.hp)
	player.armor -= absorbed
	player.hp -= lost
	player.armor_absorbed += absorbed
	player.damage_taken += lost
	if by is not None and room.mode == Mode.PVP:
		room.players[by].damage_dealt += lost # só HP perdido, nunca o que a Armor segurou
	events.append(Event("player_hit", room.tick, {"target": player.user_id, "by": by,
		"source": source, "amount": lost, "absorbed": absorbed}))
	if player.hp == 0:
		# morto sai de _blocking_bodies, _pick_target e _targets, que filtram alive
		player.alive = False
		player.deaths += 1
		if by is not None and room.mode == Mode.PVP:
			room.players[by].frags += 1
		events.append(Event("player_died", room.tick, {"player_id": player.user_id, "by": by}))


def _kill_enemy(room: Room, enemy: Enemy, killer_id: int | None, events: list[Event]) -> None:
	enemy.state, enemy.state_tick = EnemyState.DYING, room.tick
	if killer_id is not None:
		room.players[killer_id].kills += 1
	events.append(Event("enemy_died", room.tick, {"enemy_id": enemy.id, "killer_id": killer_id}))


def _update_boss(room: Room, dt: float) -> None:
	boss = room.boss
	if boss is None or boss.state == BossState.DYING:
		return
	if boss.state == BossState.ATTACK:
		if room.tick - boss.state_tick < BOSS_WINDUP_TICKS:
			return # mirando: parado
		_boss_shoot(room, boss)
		boss.state = BossState.ALERT
	# escolhe o alvo antes e aplica as distâncias a ele; senão o state oscila com dois Players
	target = _boss_target(room, boss)
	boss.target_player_id = None if target is None else target.user_id
	if target is None:
		boss.state = BossState.IDLE
		return
	boss.state = BossState.ALERT
	dx, dy = target.x - boss.x, target.y - boss.y
	distance = math.hypot(dx, dy)
	if distance <= BOSS_ATTACK_RANGE and room.tick >= boss.attack_ready_tick:
		# o cooldown conta do início do attack: dois bullets ficam a BOSS_ATTACK_COOLDOWN_S
		boss.state, boss.state_tick = BossState.ATTACK, room.tick
		boss.attack_ready_tick = room.tick + BOSS_COOLDOWN_TICKS
	elif distance > BOSS_MIN_RANGE:
		_walk(boss, dx / distance, dy / distance, BOSS_SPEED * dt,
			lambda x, y: _boss_fits(room, x, y))


def _boss_target(room: Room, boss: Boss) -> Player | None:
	# quem o Boss já viu segue alvo até morrer ou sair; alvo novo precisa estar a BOSS_SIGHT_RANGE
	current = room.players.get(boss.target_player_id)
	if current is not None and current.alive and not current.left:
		return current
	return min(_in_sight(room, boss),
		key=lambda player: math.hypot(player.x - boss.x, player.y - boss.y), default=None)


def _in_sight(room: Room, boss: Boss) -> list[Player]:
	# só distância, sem linha de visão: como no C, o Boss vê através de parede
	return [player for player in room.players.values() if player.alive and not player.left
		and math.hypot(player.x - boss.x, player.y - boss.y) <= BOSS_SIGHT_RANGE]


def _boss_shoot(room: Room, boss: Boss) -> None:
	target = room.players.get(boss.target_player_id)
	if target is None or not target.alive or target.left:
		return # o alvo morreu ou saiu durante a mira: o tiro se perde
	dx, dy = target.x - boss.x, target.y - boss.y
	distance = math.hypot(dx, dy)
	room.projectiles.append(Projectile(id=f"b_{room.next_projectile_id}",
		kind=ProjectileKind.BULLET, owner_id=None, x=boss.x, y=boss.y,
		dx=dx / distance, dy=dy / distance))
	room.next_projectile_id += 1
	# rodízio: o próximo tiro vai no Player seguinte, por user_id, entre os que o Boss vê
	in_sight = sorted(player.user_id for player in _in_sight(room, boss))
	following = [user_id for user_id in in_sight if user_id > target.user_id] or in_sight
	if following:
		boss.target_player_id = following[0]


def _boss_fits(room: Room, x: float, y: float) -> bool:
	if _touches_wall(room.grid, x, y, BOSS_RADIUS):
		return False
	# no C o retorno deste teste era ignorado, e o Boss atravessava Enemies
	return all(math.hypot(x - enemy.x, y - enemy.y) >= ENEMY_SEPARATION
		for enemy in room.enemies if enemy.state != EnemyState.DYING)


def _hurt_boss(room: Room, boss: Boss, by: int, events: list[Event]) -> None:
	dealt = min(FIREBALL_BOSS_DAMAGE, boss.hp)
	boss.hp -= dealt
	room.players[by].damage_dealt += dealt
	if boss.hp == 0:
		boss.state, boss.state_tick = BossState.DYING, room.tick
		room.players[by].kills += 1
		events.append(Event("boss_died", room.tick, {"killer_id": by}))
	elif boss.state == BossState.IDLE:
		# no C, em idle era invulnerável; aqui leva dano e acorda mirando em quem atirou
		boss.state, boss.target_player_id = BossState.ALERT, by


def _update_projectiles(room: Room, dt: float, events: list[Event]) -> None:
	for shot in room.projectiles:
		if shot.state == ProjectileState.MOVING:
			_fly(room, shot, dt, events)


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
			elif isinstance(target, Boss):
				_hurt_boss(room, target, shot.owner_id, events)
			elif target is not None:
				damage = (BULLET_DAMAGE if shot.kind == ProjectileKind.BULLET
					else FIREBALL_PLAYER_DAMAGE)
				_hurt_player(room, target, damage, shot.owner_id, shot.kind, events)
			return
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
	# a Door aberta muda os caminhos
	room.path_fields.clear()
	room.free_cells = None
	events.append(Event("door_opened", room.tick, {"x": column, "y": row, "by": player.user_id}))
