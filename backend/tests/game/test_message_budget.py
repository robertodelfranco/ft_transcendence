# backend/tests/game/test_message_budget.py
# O limite de mensagens por socket do /ws/game (ws-messages.md §2.8), com um relógio falso.
import pytest

from app.game.router import MESSAGE_BURST, MESSAGES_PER_S, MessageBudget


class Clock:
	def __init__(self) -> None:
		self.now = 1000.0

	def __call__(self) -> float:
		return self.now


@pytest.fixture
def clock():
	return Clock()


def take(budget: MessageBudget, times: int) -> int:
	return sum(budget.take() for _ in range(times))


def test_a_burst_passes_up_to_the_limit_and_no_further(clock):
	budget = MessageBudget(clock=clock)
	assert take(budget, MESSAGE_BURST) == MESSAGE_BURST
	assert not budget.take()


def test_a_second_refills_the_rate_and_never_more_than_the_burst(clock):
	budget = MessageBudget(clock=clock)
	take(budget, MESSAGE_BURST)
	clock.now += 1
	assert take(budget, 1000) == MESSAGES_PER_S
	clock.now += 3600 # uma hora parado não vira uma rajada de uma hora
	assert take(budget, 1000) == MESSAGE_BURST


def test_the_honest_client_is_never_refused(clock):
	# 30 input/s mais uma action a cada 0,4 s e um ping a cada 2 s, por 10 minutos
	budget = MessageBudget(clock=clock)
	for step in range(30 * 600):
		clock.now += 1 / 30
		assert budget.take()
		if step % 12 == 0:
			assert budget.take()
		if step % 60 == 0:
			assert budget.take()


def test_a_stall_then_the_backlog_at_once_passes(clock):
	# 2 s sem nada chegar, e as 60 mensagens represadas chegam juntas no mesmo instante
	budget = MessageBudget(clock=clock)
	for _ in range(300):
		clock.now += 1 / 30
		budget.take()
	clock.now += 2
	assert take(budget, 60) == 60


def test_a_flood_settles_at_the_rate(clock):
	budget = MessageBudget(clock=clock)
	accepted = 0
	for _ in range(10_000): # 10 mil mensagens em 10 s
		clock.now += 0.001
		accepted += budget.take()
	assert accepted <= MESSAGE_BURST + 10 * MESSAGES_PER_S + 1


def test_a_clock_going_back_does_not_give_or_take_tokens(clock):
	budget = MessageBudget(rate=1, burst=2, clock=clock)
	take(budget, 2)
	clock.now -= 100
	assert not budget.take()
	clock.now += 1
	assert budget.take()


@pytest.mark.parametrize("rate, burst", [(0, 10), (-1, 10), (10, 0)])
def test_a_budget_that_lets_nothing_through_is_a_bug(rate, burst):
	with pytest.raises(ValueError):
		MessageBudget(rate, burst)
