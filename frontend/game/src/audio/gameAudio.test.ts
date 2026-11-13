import { afterEach, expect, test, vi } from "vitest";
import { createGameAudio } from "./gameAudio";

function fakeContext() {
  const parameter = () => ({
    setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(), setTargetAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
  });
  const oscillators: Array<{
    type: string; frequency: ReturnType<typeof parameter>;
    connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn>;
    start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>;
    onended: (() => void) | null;
  }> = [];
  const sources: Array<{ stop: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }> = [];
  const filters: Array<{ disconnect: ReturnType<typeof vi.fn> }> = [];
  const context = {
    state: "running", currentTime: 0, sampleRate: 48000, destination: {},
    createBuffer: vi.fn((_channels: number, length: number) => {
      const samples = new Float32Array(length);
      return { getChannelData: () => samples };
    }),
    createBufferSource: vi.fn(() => {
      const source = { buffer: null, connect: vi.fn(), disconnect: vi.fn(),
        start: vi.fn(), stop: vi.fn(), onended: null };
      sources.push(source);
      return source;
    }),
    createBiquadFilter: vi.fn(() => {
      const filter = { type: "bandpass", Q: { value: 0 }, frequency: parameter(),
        connect: vi.fn(), disconnect: vi.fn() };
      filters.push(filter);
      return filter;
    }),
    createGain: vi.fn(() => ({ gain: parameter(), connect: vi.fn(), disconnect: vi.fn() })),
    createOscillator: vi.fn(() => {
      const voice = { type: "sine", frequency: parameter(), connect: vi.fn(),
        disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null };
      oscillators.push(voice);
      return voice;
    }),
    close: vi.fn(async () => {}),
  };
  vi.stubGlobal("AudioContext", class { constructor() { return context; } });
  return { context, oscillators, sources, filters };
}

afterEach(() => vi.unstubAllGlobals());

test("charge waits for a gesture, reuses two voices, and sustains the full-charge pitch", async () => {
  const { context, oscillators } = fakeContext();
  const audio = createGameAudio();
  audio.updateCharge(0);
  expect(context.createOscillator).not.toHaveBeenCalled();
  await audio.unlock();
  audio.updateCharge(0);
  audio.updateCharge(1);
  audio.updateCharge(3);
  audio.updateCharge(8);
  expect(context.createOscillator).toHaveBeenCalledTimes(2);
  expect(oscillators[0].frequency.setTargetAtTime).toHaveBeenLastCalledWith(440, 0, 0.08);
  audio.updateCharge(null);
  expect(oscillators.every(voice => voice.stop.mock.calls.length === 1)).toBe(true);
  const calls = oscillators[0].stop.mock.calls.length;
  audio.updateCharge(null);
  expect(oscillators[0].stop).toHaveBeenCalledTimes(calls);
  await audio.dispose();
});

test("stopAll clears charge and dispose disconnects the voices and closes the context", async () => {
  const { context, oscillators } = fakeContext();
  const audio = createGameAudio();
  await audio.unlock();
  audio.updateCharge(1);
  audio.stopAll();
  expect(oscillators.every(voice => voice.stop.mock.calls.length === 1)).toBe(true);
  expect(oscillators.every(voice => voice.disconnect.mock.calls.length === 1)).toBe(true);
  await audio.dispose();
  expect(context.close).toHaveBeenCalledOnce();
  audio.updateCharge(1);
  expect(context.createOscillator).toHaveBeenCalledTimes(2);
});


test("pickup plays a short rising tone only after audio is unlocked", async () => {
  const { context, oscillators } = fakeContext();
  const audio = createGameAudio();
  audio.playPickup();
  expect(context.createOscillator).not.toHaveBeenCalled();
  await audio.unlock();
  audio.playPickup();
  expect(oscillators).toHaveLength(1);
  expect(oscillators[0].type).toBe("sine");
  expect(oscillators[0].frequency.setValueAtTime).toHaveBeenCalledWith(660, 0);
  expect(oscillators[0].frequency.exponentialRampToValueAtTime).toHaveBeenCalledWith(1320, 0.18);
  expect(oscillators[0].stop).toHaveBeenCalledWith(0.18);
  await audio.dispose();
});


test("result and Door sounds wait for interaction; stopAll releases scheduled notes", async () => {
  const { context, oscillators } = fakeContext();
  const audio = createGameAudio();
  audio.playVictory();
  audio.playDefeat();
  audio.playDraw();
  audio.playDoor(1);
  expect(context.createOscillator).not.toHaveBeenCalled();
  await audio.unlock();
  audio.playDoor(0);
  audio.playDoor(Number.NaN);
  expect(context.createOscillator).not.toHaveBeenCalled();
  audio.playVictory();
  audio.playDefeat();
  audio.playDraw();
  audio.playDoor(0.5);
  expect(oscillators.length).toBeGreaterThan(0);
  expect(oscillators.some(voice => voice.start.mock.calls.some(([time]) => Number(time) > 0))).toBe(true);
  audio.stopAll();
  expect(oscillators.every(voice => voice.disconnect.mock.calls.length === 1)).toBe(true);
  expect(oscillators.every(voice => voice.stop.mock.calls.some(call => call.length === 0))).toBe(true);
  const count = oscillators.length;
  await audio.dispose();
  audio.playVictory();
  audio.playDefeat();
  audio.playDraw();
  audio.playDoor(1);
  expect(oscillators).toHaveLength(count);
});


test.each(["playVictory", "playDefeat", "playDraw"] as const)("%s schedules a three-second melody", async method => {
  const { oscillators } = fakeContext();
  const audio = createGameAudio();
  await audio.unlock();
  audio[method]();
  expect(oscillators.length).toBeGreaterThan(3);
  const ends = oscillators.flatMap(voice => voice.stop.mock.calls.map(([time]) => Number(time)));
  expect(Math.max(...ends)).toBeCloseTo(3);
  expect(Math.min(...ends)).toBeGreaterThan(0);
  await audio.dispose();
});

test("sliding Door reuses its noise buffer and releases sources and filters", async () => {
  const { context, sources, filters } = fakeContext();
  const audio = createGameAudio();
  await audio.unlock();
  audio.playDoor(1);
  audio.playDoor(0.5);
  expect(context.createBuffer).toHaveBeenCalledTimes(1);
  expect(sources).toHaveLength(2);
  audio.stopAll();
  expect(sources.every(source => source.stop.mock.calls.length > 0)).toBe(true);
  expect(sources.every(source => source.disconnect.mock.calls.length === 1)).toBe(true);
  expect(filters.every(filter => filter.disconnect.mock.calls.length === 1)).toBe(true);
  await audio.dispose();
});
