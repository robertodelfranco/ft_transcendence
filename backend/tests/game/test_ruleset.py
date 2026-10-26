from app.game.rules import (BOSS_DYING_S, BULLET_DAMAGE, ENEMY_DYING_S, FIREBALL_BOSS_DAMAGE,
	TICK_RATE)
from app.game.sim import create_room, enqueue, leave, match_outcome, set_connected, step
from app.game.state import (Action, ActionKind, BossState, Enemy, EnemyState, Input, Mode,
	Projectile, ProjectileKind, ProjectileState, RoomOptions)
from app.game.world import parse_map

DT = 1 / TICK_RATE
BOSS_DYING_TICKS = round(BOSS_DYING_S * TICK_RATE)
ENEMY_DYING_TICKS = round(ENEMY_DYING_S * TICK_RATE)
NO_KEYS = {"up": False, "down": False, "left": False, "right": False,
	"rot_left": False, "rot_right": False, "sprint": False}
# o corredor do test_boss.py: os Players nascem em (1, 1) e (1, 2), o Boss em (30, 2),
# longe demais para acordar
WIDTH = 32
CORRIDOR = ("1" * WIDTH + "\n" + "1E" + "0" * (WIDTH - 3) + "1\n"
	+ "1W" + "0" * (WIDTH - 4) + "B1\n" + "1" + "0" * (WIDTH - 2) + "1\n" + "1" * WIDTH + "\n")
PVP_CORRIDOR = "1111111\n1E000W1\n1111111\n"


def new_room():
	game_map = parse_map(CORRIDOR, "t", Mode.COOP)
	return create_room(12, Mode.COOP, game_map, RoomOptions(), [(7, "roberto"), (9, "augusto")], seed=1)


def new_pvp_room():
	game_map = parse_map(PVP_CORRIDOR, "pvp_t", Mode.PVP)
	return create_room(12, Mode.PVP, game_map, RoomOptions(), [(7, "roberto"), (9, "augusto")], seed=1)


def run(room, ticks):
	events = []
	for _ in range(ticks):
		events += step(room, DT)
	return events


def aim_at_boss(room, by=7):
	# uma fireball a 1 célula do Boss, que morre com ela
	boss = room.boss
	boss.hp = FIREBALL_BOSS_DAMAGE
	room.projectiles.append(Projectile(id="t_boss", kind=ProjectileKind.FIREBALL, owner_id=by,
		x=boss.x - 1.0, y=boss.y, dx=1.0, dy=0.0))


def aim_at_player(room, user_id):
	# um bullet a 1 célula do Player, que morre com ele
	player = room.players[user_id]
	player.hp = BULLET_DAMAGE
	room.projectiles.append(Projectile(id=f"t_{user_id}", kind=ProjectileKind.BULLET,
		owner_id=None, x=player.x + 1.0, y=player.y, dx=-1.0, dy=0.0))


def named(events, name):
	return [event for event in events if event.name == name]


def test_pvp_kill_credits_only_hp_lost_and_one_frag():
	room = new_pvp_room()
	target = room.players[9]
	target.hp, target.armor = 1, 1
	room.projectiles.append(Projectile(id="pvp_hit", kind=ProjectileKind.FIREBALL,
		owner_id=7, x=target.x - 1.0, y=target.y, dx=1.0, dy=0.0))

	events = run(room, 3)

	assert named(events, "player_hit")[0].data["amount"] == 1
	assert named(events, "player_died")[0].data == {"player_id": 9, "by": 7}
	assert room.players[7].damage_dealt == 1 # Armor não é HP perdido
	assert room.players[7].frags == 1
	assert target.deaths == 1


def test_boss_entering_dying_ends_the_match_with_a_win_for_every_player():
	room = new_room()
	aim_at_boss(room)
	events = run(room, 5)
	[died] = named(events, "boss_died")
	[over] = named(events, "game_over")
	assert over.tick == died.tick
	assert over.data == {"result": "win", "winner_ids": [7, 9], "reason": "boss_defeated"}


def test_the_last_living_player_dying_ends_the_match_with_a_loss():
	room = new_room()
	aim_at_player(room, 9)
	assert named(run(room, 5), "game_over") == [] # ainda sobra o 7
	aim_at_player(room, 7)
	events = run(room, 5)
	[died] = named(events, "player_died")
	[over] = named(events, "game_over")
	assert over.tick == died.tick
	assert over.data == {"result": "loss", "winner_ids": [], "reason": "all_dead"}


def test_boss_and_last_player_dying_on_the_same_tick_is_a_win():
	room = new_room()
	aim_at_player(room, 9)
	run(room, 5)
	aim_at_boss(room)
	aim_at_player(room, 7)
	events = run(room, 5)
	[boss_died] = named(events, "boss_died")
	[player_died] = named(events, "player_died")
	assert boss_died.tick == player_died.tick # o cenário aconteceu mesmo
	[over] = named(events, "game_over")
	assert over.data["result"] == "win"


def test_everyone_leaving_ends_the_match_with_a_forfeit():
	room = new_room()
	leave(room, 7)
	assert named(run(room, 1), "game_over") == []
	leave(room, 9)
	events = run(room, 1)
	[left] = named(events, "player_left")
	[over] = named(events, "game_over")
	assert over.tick == left.tick
	assert over.data == {"result": "loss", "winner_ids": [], "reason": "forfeit"}


def test_everyone_disconnecting_does_not_end_the_match():
	room = new_room()
	for user_id in (7, 9):
		set_connected(room, user_id, True)
		set_connected(room, user_id, False)
	assert named(run(room, 30), "game_over") == []


def test_game_over_comes_out_only_once():
	room = new_room()
	aim_at_boss(room)
	events = run(room, 105)
	assert len(named(events, "game_over")) == 1


def test_after_game_over_inputs_actions_and_damage_have_no_effect():
	room = new_room()
	aim_at_boss(room)
	run(room, 5)
	player = room.players[7]
	before = (player.x, player.y, player.angle, player.mana)
	enqueue(room, 7, Input(seq=1, mouse_dx=0.5, **{**NO_KEYS, "up": True}))
	enqueue(room, 7, Action(seq=2, kind=ActionKind.FIRE))
	aim_at_player(room, 7)
	events = run(room, 10)
	assert (player.x, player.y, player.angle, player.mana) == before
	assert player.hp == BULLET_DAMAGE and player.alive
	assert named(events, "player_hit") == []
	assert not any(shot.kind == ProjectileKind.FIREBALL and shot.state == ProjectileState.MOVING
		for shot in room.projectiles)


def test_after_game_over_the_tick_advances_and_the_boss_keeps_dying():
	room = new_room()
	aim_at_boss(room)
	run(room, 5)
	boss = room.boss
	tick, dying_since = room.tick, boss.state_tick
	run(room, BOSS_DYING_TICKS)
	assert room.tick == tick + BOSS_DYING_TICKS
	assert boss.state == BossState.DYING and boss.state_tick == dying_since


def test_after_game_over_a_dying_enemy_still_leaves_the_room():
	room = new_room()
	aim_at_boss(room)
	run(room, 5)
	room.enemies.append(Enemy(id="e_t", x=10.5, y=3.5, state=EnemyState.DYING,
		state_tick=room.tick))
	run(room, ENEMY_DYING_TICKS)
	assert room.enemies == []


def test_match_outcome_is_none_before_game_over():
	room = new_room()
	run(room, 5)
	assert match_outcome(room) is None


def test_match_outcome_freezes_the_match_at_the_game_over_tick():
	room = new_room()
	set_connected(room, 7, True)
	aim_at_player(room, 9) # o 9 morre antes do Boss
	run(room, 5)
	aim_at_boss(room)
	[over] = named(run(room, 5), "game_over")
	set_connected(room, 7, False) # cai depois do game_over
	run(room, 30)
	outcome = match_outcome(room)
	assert (outcome.result, outcome.reason, outcome.winner_ids) == ("win", "boss_defeated", (7, 9))
	assert outcome.duration_ticks == over.tick
	players = {player.user_id: player for player in outcome.players}
	assert players[7].won and players[7].survived and not players[7].disconnected_at_end
	assert players[7].kills == 1 and players[7].damage_dealt == FIREBALL_BOSS_DAMAGE
	assert players[9].won and not players[9].survived and players[9].deaths == 1
	assert players[9].damage_taken == BULLET_DAMAGE
