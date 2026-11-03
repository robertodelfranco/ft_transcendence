import { expect, test } from "vitest";
import { createPlayerFeedback } from "./playerFeedback";

test("damage renews without accumulating and expires with elapsed time", () => {
  const feedback = createPlayerFeedback();
  feedback.snapshot(true, "pvp", 0);
  feedback.hit(0);
  expect(feedback.state(110).damage).toBeCloseTo(0.5);
  feedback.hit(110);
  expect(feedback.state(110).damage).toBe(1);
  expect(feedback.state(1000).damage).toBe(0);
});

test("death cancels damage, ignores further hits, and only PvP respawn has a transient", () => {
  const feedback = createPlayerFeedback();
  feedback.snapshot(true, "pvp", 0);
  feedback.hit(10);
  feedback.snapshot(false, "pvp", 20);
  feedback.hit(30);
  expect(feedback.state(30)).toEqual({ damage: 0, dead: true, respawn: 0 });
  feedback.snapshot(true, "pvp", 40);
  expect(feedback.state(40)).toEqual({ damage: 0, dead: false, respawn: 1 });
  expect(feedback.state(1000).respawn).toBe(0);
  feedback.snapshot(false, "coop", 1010);
  feedback.snapshot(true, "coop", 1020);
  expect(feedback.state(1020).respawn).toBe(0);
});

test("reconnection restores death without inventing a respawn and reset clears all effects", () => {
  const feedback = createPlayerFeedback();
  feedback.snapshot(false, "pvp", 0);
  feedback.reset();
  feedback.snapshot(true, "pvp", 100);
  expect(feedback.state(100)).toEqual({ damage: 0, dead: false, respawn: 0 });
  feedback.hit(110);
  feedback.clearTransient();
  expect(feedback.state(110).damage).toBe(0);
  feedback.snapshot(false, "coop", 200);
  feedback.reset();
  expect(feedback.state(200)).toEqual({ damage: 0, dead: false, respawn: 0 });
});
