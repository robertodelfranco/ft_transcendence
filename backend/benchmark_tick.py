"""F2.13: 4 Rooms x 5 Players, sem banco nem rede externa.

Rode da pasta backend/: `python benchmark_tick.py --ticks 300 --warmup 60 --repeat 3`.
O cenário é o de tests/game/test_performance.py: 20 Enemies, Boss e até 10 Projectiles
por Room. O modo runtime usa o RoomManager e o ConnectionManager reais com sockets
em memória; mede serialização e enfileiramento, mas não latência de rede.
"""

import argparse
import asyncio
import json
import math
import os
import platform
import sys
import time

from app.game import (TICK_RATE, Input, Mode, Room, RoomOptions, create_room, enqueue,
	set_connected, step)
from app.game.rooms import RoomManager
from app.game.state import Projectile, ProjectileKind, ProjectileState
from app.game.world import Map, parse_map
from app.ws.manager import ConnectionManager


ROOMS = 4
PLAYERS_PER_ROOM = 5
PROJECTILES_PER_ROOM = 10
BUDGET_MS = 5.0
DT = 1 / TICK_RATE
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


def players(index: int) -> list[tuple[int, str]]:
	return [(index * PLAYERS_PER_ROOM + n, f"p{index}_{n}")
		for n in range(1, PLAYERS_PER_ROOM + 1)]


def feed(room: Room, seq: int) -> None:
	for user_id, _ in players(room.match_id - 1):
		enqueue(room, user_id, Input(seq=seq, up=True, down=False, left=False, right=False,
			rot_left=user_id % 2 == 0, rot_right=user_id % 2 == 1,
			sprint=False, mouse_dx=0.0))
	moving = sum(shot.state == ProjectileState.MOVING for shot in room.projectiles)
	for number in range(PROJECTILES_PER_ROOM - moving):
		room.projectiles.append(Projectile(id=f"t_{seq}_{number}",
			kind=ProjectileKind.FIREBALL, owner_id=players(room.match_id - 1)[0][0],
			x=1.5, y=1.5, dx=1.0, dy=0.0))


def percentile(sorted_samples: list[float], percent: float) -> float:
	return sorted_samples[max(0, math.ceil(percent * len(sorted_samples)) - 1)]


def summary(samples_ms: list[float]) -> dict[str, float | int]:
	if not samples_ms:
		raise ValueError("no tick samples")
	ordered = sorted(samples_ms)
	return {
		"count": len(ordered),
		"p50_ms": round(percentile(ordered, 0.50), 3),
		"p95_ms": round(percentile(ordered, 0.95), 3),
		"p99_ms": round(percentile(ordered, 0.99), 3),
		"max_ms": round(ordered[-1], 3),
	}


def create_simulation_rooms(game_map: Map, repeat: int) -> list[Room]:
	rooms = []
	for index in range(ROOMS):
		room = create_room(index + 1, Mode.COOP, game_map,
			RoomOptions(start_hp=10**6), players(index), seed=repeat * ROOMS + index)
		for user_id, _ in players(index):
			set_connected(room, user_id, True)
		rooms.append(room)
	return rooms


def simulation_trial(game_map: Map, ticks: int, warmup: int, repeat: int) -> dict:
	rooms = create_simulation_rooms(game_map, repeat)
	per_room_ms: list[float] = []
	cohort_ms: list[float] = []
	for seq in range(1, warmup + ticks + 1):
		for room in rooms:
			feed(room, seq)  # Inputs chegam antes do Tick; custo do feeder fora da medida.
		cohort_start = time.perf_counter_ns()
		for room in rooms:
			started = time.perf_counter_ns()
			step(room, DT)
			if seq > warmup:
				per_room_ms.append((time.perf_counter_ns() - started) / 1_000_000)
		if seq > warmup:
			cohort_ms.append((time.perf_counter_ns() - cohort_start) / 1_000_000)
	if any(room.result is not None or len(room.enemies) != 20 for room in rooms):
		raise RuntimeError("scenario ended or lost Enemies during measurement")
	return {"per_room_tick": summary(per_room_ms), "four_room_cycle": summary(cohort_ms)}


class MemorySocket:
	def __init__(self) -> None:
		self.messages = 0

	async def send_text(self, data: str) -> None:
		self.messages += 1

	async def close(self, code: int = 1000, reason: str | None = None) -> None:
		pass


async def no_record(*args) -> list:
	return []


async def no_abort(*args) -> int:
	return 0


async def runtime_trial(game_map: Map, ticks: int, warmup: int) -> dict:
	measurements: list[float] = []
	connections = ConnectionManager()
	manager = RoomManager(connections, load=lambda _name, _mode: game_map,
		on_tick=lambda seconds: measurements.append(seconds * 1000),
		record=no_record, abort=no_abort)
	sockets: list[MemorySocket] = []
	try:
		for index in range(ROOMS):
			match_id = index + 1
			seats = players(index)
			manager.create(match_id, Mode.COOP, "perf", PLAYERS_PER_ROOM,
				RoomOptions(start_hp=10**6), created_by=seats[0][0])
			for user_id, name in seats:
				manager.join(match_id, user_id, name, "/media/avatars/default.png")
			manager.start(match_id)
			for user_id, _ in seats:
				socket = MemorySocket()
				sockets.append(socket)
				await connections.connect(user_id, "game", socket, match_id)
				manager.player_connected(match_id, user_id)

		# A task real roda a 30 Hz; compensar deriva para alimentar um Input por Tick.
		next_feed = time.monotonic()
		for seq in range(1, warmup + ticks + 1):
			for index in range(ROOMS):
				room = manager.game_room(index + 1)
				if room is None:
					raise RuntimeError("Room disappeared during benchmark")
				feed(room, seq)
			next_feed += DT
			await asyncio.sleep(max(0.0, next_feed - time.monotonic()))
		async with asyncio.timeout(5):
			while min(manager.game_room(index + 1).tick for index in range(ROOMS)) < warmup + ticks:
				await asyncio.sleep(0.005)
		await asyncio.sleep(0)  # deixar as tasks de escrita consumirem as filas
		measured = measurements[ROOMS * warmup:ROOMS * (warmup + ticks)]
		if len(measured) != ROOMS * ticks or not any(socket.messages for socket in sockets):
			raise RuntimeError("incomplete Tick or Snapshot measurement")
		return {"per_room_tick": summary(measured),
			"ticks_by_room": [manager.game_room(index + 1).tick for index in range(ROOMS)],
			"socket_messages": sum(socket.messages for socket in sockets)}
	finally:
		await manager.close()
		await connections.close_all(1000)


def main() -> None:
	parser = argparse.ArgumentParser(description=__doc__)
	parser.add_argument("--ticks", type=int, default=300)
	parser.add_argument("--warmup", type=int, default=60)
	parser.add_argument("--repeat", type=int, default=3)
	args = parser.parse_args()
	if args.ticks < 100 or args.warmup < 0 or args.repeat < 1:
		parser.error("--ticks must be >= 100, --warmup >= 0, and --repeat >= 1")
	game_map = parse_map(ARENA, "perf", Mode.COOP)
	result = {
		"scenario": {"rooms": ROOMS, "players_per_room": PLAYERS_PER_ROOM,
			"enemies_per_room": len(game_map.enemies), "boss_per_room": 1,
			"max_projectiles_per_room": PROJECTILES_PER_ROOM,
			"tick_rate_hz": TICK_RATE, "warmup_ticks": args.warmup,
			"measured_ticks_per_room": args.ticks, "repeats": args.repeat,
			"percentile_method": "nearest rank"},
		"environment": {"python": sys.version.split()[0], "platform": platform.platform(),
			"cpu_count": os.cpu_count()},
		"simulation": [], "runtime_in_memory": [],
	}
	for repeat in range(args.repeat):
		result["simulation"].append(simulation_trial(game_map, args.ticks, args.warmup, repeat))
		result["runtime_in_memory"].append(asyncio.run(runtime_trial(game_map, args.ticks, args.warmup)))
	result["within_5ms_each_repeat"] = {
		"simulation": all(trial["per_room_tick"]["p99_ms"] < BUDGET_MS
			for trial in result["simulation"]),
		"runtime_in_memory": all(trial["per_room_tick"]["p99_ms"] < BUDGET_MS
			for trial in result["runtime_in_memory"]),
	}
	print(json.dumps(result, indent=2))


if __name__ == "__main__":
	main()
