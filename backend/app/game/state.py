from enum import StrEnum
from collections import deque
from dataclasses import dataclass, field
from random import Random


class Mode(StrEnum):
	COOP = "coop"
	PVP = "pvp"

class EnemyState(StrEnum):
	ALERT = "alert"
	ATTACK = "attack"
	DYING = "dying"

class BossState(StrEnum):
	IDLE = "idle"
	ALERT = "alert"
	ATTACK = "attack"
	DYING = "dying"

class ProjectileState(StrEnum):
	MOVING = "moving"
	HIT = "hit"

class ProjectileKind(StrEnum):
	FIREBALL = "fireball"
	BULLET = "bullet"

class ActionKind(StrEnum):
	FIRE = "fire"
	DOOR = "door"


@dataclass(frozen=True, slots=True)
class Input:
	seq:		int
	up:			bool
	down:		bool
	left:		bool
	right:		bool
	rot_left:	bool
	rot_right:	bool
	sprint:		bool
	mouse_dx:	float # rad


@dataclass(frozen=True, slots=True)
class Action:
	seq:	int
	kind:	ActionKind


@dataclass(frozen=True, slots=True)
class Event:
	name:	str
	tick:	int
	data:	dict


@dataclass(frozen=True, slots=True)
class PickupOptions:
	potion:	bool = True
	mana:	bool = True
	armor:	bool = True


@dataclass(frozen=True, slots=True)
class RoomOptions:
	theme:			str = "dungeon"
	start_hp:		int = 10
	pickups:		PickupOptions = field(default_factory=PickupOptions)
	frag_limit:		int = 5 # pvp
	time_limit_s:	int = 180 # seg, only pvp


@dataclass(slots=True)
class Player:
	user_id: 			int
	name: 				str
	x: 					float
	y: 					float
	angle: 				float # norte = 0, dx = sin(angle), dy = -cos(angle)
	hp: 				int
	mana: 				float # fracionária na Room, inteira no Snapshot
	armor: 				int = 0
	keys: 				int = 0
	alive: 				bool = True
	connected: 			bool = False # nasce desconectado, vira True no primeiro join
	joined: 			bool = False # já abriu o socket do jogo alguma vez
	left: 				bool = False # (saiu) fora do Snapshot, dentro do resultado
	respawn_at_tick:	int | None = None # pvp: primeiro Tick em que pode renascer
	input_queue: 		deque[Input | Action] = field(default_factory=deque)
	last_input_seq:		int = 0
	last_queued_seq:	int = 0 # maior seq que entrou na fila
	fire_ready_tick:	int = 0 # Tick a partir do qual pode atirar de novo
	kills: 				int = 0
	frags: 				int = 0
	deaths: 			int = 0
	damage_dealt: 		int = 0
	damage_taken: 		int = 0
	armor_absorbed: 	int = 0
	keys_collected: 	int = 0
	potions_used: 		int = 0


@dataclass(slots=True)
class Enemy:
	id: 				str
	x:					float
	y: 					float
	state: 				EnemyState = EnemyState.ALERT
	state_tick: 		int = 0 # Tick em que entrou no state atual
	target_player_id:	int | None = None


@dataclass(slots=True)
class Boss:
	x: 					float
	y: 					float
	hp: 				int
	state: 				BossState = BossState.IDLE
	state_tick: 		int = 0 # Tick em que entrou no state atual
	target_player_id:	int | None = None
	attack_ready_tick:	int = 0 # antes dele, o Boss não começa outro attack


@dataclass(slots=True)
class Projectile:
	id: 		str
	kind: 		ProjectileKind
	owner_id:	int | None # user_id, None no bullet do Boss
	x: 			float
	y: 			float
	dx: 		float
	dy: 		float
	state: 		ProjectileState = ProjectileState.MOVING
	state_tick:	int = 0 # Tick em que entrou no state atual


@dataclass(slots=True)
class Door:
	x: 		int # célula
	y: 		int
	locked:	bool = True
	open:	bool = False


@dataclass(slots=True)
class Room:
	match_id: 		int
	mode: 			Mode
	options: 		RoomOptions
	numbers: 		dict[str, float | None] # o numbers do Ruleset do Mode
	rng: 			Random
	initial_grid:	tuple[str, ...] # o Grid do welcome, não muda
	grid: 			list[list[str]] # cópia do Map, muda com Door e Pickup
	spawn_points:	tuple[tuple[float, float], ...] # posições fixas do Map, em ordem
	tick: 			int = 0
	players: 		dict[int, Player] = field(default_factory=dict) # user_id, Players
	enemies: 		list[Enemy] = field(default_factory=list)
	boss: 			Boss | None = None
	projectiles:	list[Projectile] = field(default_factory=list)
	next_projectile_id:	int = 1 # o id de um Projectile nunca se repete na Room
	doors: 			list[Door] = field(default_factory=list)
	result: 		dict | None = None # o data do game_over, None enquanto na partida
	outcome: 		"MatchOutcome | None" = None # congelado no Tick do game_over
	pending_events:	list[tuple[str, dict]] = field(default_factory=list) # saem no próximo step
	# user_id → (célula do Player, passos de cada célula até ela); cache, fora do Snapshot
	path_fields:	dict[int, tuple[tuple[int, int], dict[tuple[int, int], int]]] = field(
		default_factory=dict)
	free_cells:		frozenset[tuple[int, int]] | None = None # cache: sem parede nem Door fechada


@dataclass(frozen=True, slots=True)
class PlayerOutcome:
	user_id:				int
	won:					bool
	survived:				bool
	kills:					int
	frags:					int
	deaths:					int
	damage_dealt:			int
	damage_taken:			int
	armor_absorbed:			int
	keys_collected:			int
	potions_used:			int
	disconnected_at_end:	bool


@dataclass(frozen=True, slots=True)
class MatchOutcome:
	result:			str # win, loss ou draw
	reason:			str # boss_defeated, all_dead, frag_limit, time_limit ou forfeit
	winner_ids:		tuple[int, ...]
	duration_ticks:	int
	players:		tuple[PlayerOutcome, ...]
