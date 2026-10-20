import time

import pytest

from app.game.rules import TICK_RATE
from app.game.sim import create_room, enqueue, set_connected, step
from app.game.state import Input, Mode, Projectile, ProjectileKind, ProjectileState, RoomOptions
from app.game.world import parse_map

DT = 1 / TICK_RATE
TICKS = 1000
BUDGET_S = 2.0 # 2 ms por Tick, 6% dos 33 ms de um Tick a 30 Hz
# a linha 1 é um corredor fechado só para as Fireballs: passam pelos alvos sem acertar ninguém
ARENA = (
	"1111111111111111111111\n"
	"1000000000000000000001\n"
	"1111111111111111111111\n"
	"1N000N000N000N000N0001\n"
	"1000000000000000000001\n"
	"10I0I0I0I0I0I0I0I0I0I1\n"
	"1000000000000000000001\n"
	"1000000000000000000001\n"
	"10I0I0I0I0I0I0I0I0I0I1\n"
	"1000000000000000000001\n"
	"100000000000000000B001\n"
	"1111111111111111111111\n"
)
PLAYERS = [(1, "a"), (2, "b"), (3, "c"), (4, "d"), (5, "e")]


def feed(room, seq):
	# andando em círculo: o Player troca de célula e a BFS dele é refeita
	for user_id, _ in PLAYERS:
		enqueue(room, user_id, Input(seq=seq, up=True, down=False, left=False, right=False,
			rot_left=user_id % 2 == 0, rot_right=user_id % 2 == 1, sprint=False, mouse_dx=0.0))
	moving = sum(shot.state == ProjectileState.MOVING for shot in room.projectiles)
	for number in range(10 - moving):
		room.projectiles.append(Projectile(id=f"t_{seq}_{number}", kind=ProjectileKind.FIREBALL,
			owner_id=1, x=1.5, y=1.5, dx=1.0, dy=0.0))


@pytest.mark.perf
def test_a_thousand_full_ticks_fit_the_budget():
	# HP alto: ninguém morre, a partida não acaba e a carga fica a mesma até o fim
	room = create_room(1, Mode.COOP, parse_map(ARENA, "perf", Mode.COOP),
		RoomOptions(start_hp=10**6), PLAYERS, seed=1)
	for user_id, _ in PLAYERS:
		set_connected(room, user_id, True)
	elapsed = 0.0
	for seq in range(1, TICKS + 1):
		feed(room, seq) # fora da medida: só o step conta
		start = time.perf_counter()
		step(room, DT)
		elapsed += time.perf_counter() - start
	assert room.result is None and len(room.enemies) == 20
	assert elapsed < BUDGET_S
