import { FIREBALL_CHARGE_S } from "../rules";

export const RESULT_MUSIC_S = 3;

export interface GameAudio {
  unlock(): Promise<void>;
  playStep(): void;
  playFire(): void;
  playHit(): void;
  playPickup(): void;
  playVictory(): void;
  playDefeat(): void;
  playDraw(): void;
  playDoor(volume: number): void;
  updateCharge(seconds: number | null): void;
  startMusic(): void;
  stopMusic(): void;
  stopAll(): void;
  dispose(): Promise<void>;
}

// Não cria AudioContext antes do gesto do User. Nenhum som decide regras da Room.
export function createGameAudio(): GameAudio {
  let context: AudioContext | null = null;
  let master: GainNode | null = null;
  let disposed = false;
  let musicTimer: ReturnType<typeof setInterval> | null = null;
  let note = 0;
  const voices = new Map<AudioScheduledSourceNode, GainNode>();
  const noiseFilters = new Map<AudioBufferSourceNode, BiquadFilterNode>();
  let slidingBuffer: AudioBuffer | null = null;
  const musicVoices = new Set<OscillatorNode>();
  const chargeVoices = new Set<OscillatorNode>();

  function tone(frequency: number, endFrequency: number, duration: number,
    volume: number, type: OscillatorType, music = false, delay = 0): void {
    if (disposed || context?.state !== "running" || !master || voices.size >= 32) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime + delay;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(endFrequency, now + duration);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain);
    gain.connect(master);
    voices.set(oscillator, gain);
    if (music) musicVoices.add(oscillator);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
      voices.delete(oscillator);
      musicVoices.delete(oscillator);
    };
    oscillator.start(now);
    oscillator.stop(now + duration);
  }

  function stopMusic(): void {
    if (musicTimer !== null) clearInterval(musicTimer);
    musicTimer = null;
    note = 0;
    musicVoices.forEach(voice => voice.stop());
    musicVoices.clear();
  }

  function resultMelody(frequencies: readonly number[], bass: number): void {
    const beat = 0.36;
    frequencies.forEach((frequency, index) => {
      const delay = index * beat;
      const duration = index === frequencies.length - 1 ? RESULT_MUSIC_S - delay : 0.4;
      tone(frequency, frequency, duration, 0.2, "triangle", false, delay);
    });
    tone(bass, bass, RESULT_MUSIC_S, 0.08, "sine");
  }

  function slidingDoor(volume: number): void {
    const level = Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 0;
    if (!level || disposed || context?.state !== "running" || !master || voices.size >= 31) return;
    const duration = 0.9;
    if (!slidingBuffer) {
      slidingBuffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate);
      const samples = slidingBuffer.getChannelData(0);
      for (let index = 0; index < samples.length; index++) samples[index] = Math.random() * 2 - 1;
    }
    const source = context.createBufferSource();
    source.buffer = slidingBuffer;
    const filter = context.createBiquadFilter();
    filter.type = "bandpass";
    filter.Q.value = 0.7;
    const gain = context.createGain();
    const now = context.currentTime;
    filter.frequency.setValueAtTime(260, now);
    filter.frequency.exponentialRampToValueAtTime(950, now + 0.4);
    filter.frequency.exponentialRampToValueAtTime(180, now + duration);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.5 * level, now + 0.12);
    gain.gain.linearRampToValueAtTime(0.35 * level, now + 0.6);
    gain.gain.linearRampToValueAtTime(0, now + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    voices.set(source, gain);
    noiseFilters.set(source, filter);
    source.onended = () => {
      source.disconnect(); filter.disconnect(); gain.disconnect();
      voices.delete(source); noiseFilters.delete(source);
    };
    source.start(now);
    source.stop(now + duration);
    tone(65, 35, 0.1, 0.12 * level, "sine", false, 0.8);
  }

  function stopCharge(): void {
    if (!context) return;
    const now = context.currentTime;
    for (const voice of chargeVoices) {
      const gain = voices.get(voice);
      gain?.gain.cancelScheduledValues(now);
      gain?.gain.setTargetAtTime(0, now, 0.015);
      voice.stop(now + 0.06);
    }
    chargeVoices.clear();
  }

  function updateCharge(seconds: number | null): void {
    if (seconds === null) { stopCharge(); return; }
    if (disposed || context?.state !== "running" || !master) return;
    const now = context.currentTime;
    const progress = Math.min(1, Math.max(0, seconds / FIREBALL_CHARGE_S));
    if (chargeVoices.size === 0) {
      if (voices.size > 30) return;
      for (const type of ["sine", "triangle"] as const) {
        const voice = context.createOscillator();
        const gain = context.createGain();
        voice.type = type;
        voice.frequency.setValueAtTime(110, now);
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(type === "sine" ? 0.18 : 0.06, now + 0.08);
        voice.connect(gain);
        gain.connect(master);
        voices.set(voice, gain);
        chargeVoices.add(voice);
        voice.onended = () => {
          voice.disconnect(); gain.disconnect(); voices.delete(voice); chargeVoices.delete(voice);
        };
        voice.start(now);
      }
    }
    for (const voice of chargeVoices) {
      const harmonic = voice.type === "triangle" ? 1.505 : 1;
      voice.frequency.setTargetAtTime((110 + progress * 330) * harmonic, now, 0.08);
    }
  }

  function stopAll(): void {
    chargeVoices.clear();
    stopMusic();
    voices.forEach((gain, voice) => {
      voice.onended = null;
      voice.stop();
      voice.disconnect();
      gain.disconnect();
    });
    voices.clear();
    noiseFilters.forEach(filter => filter.disconnect());
    noiseFilters.clear();
  }

  return {
    async unlock() {
      if (disposed) return;
      try {
        if (!context) {
          context = new AudioContext();
          master = context.createGain();
          master.gain.value = 0.3;
          master.connect(context.destination);
        }
        if (context.state === "suspended") await context.resume();
        if (!disposed && context.state !== "running") throw new Error("audio_unavailable");
      } catch (cause) {
        throw new Error("audio_unavailable", { cause });
      }
    },
    updateCharge,
    playStep: () => tone(110, 45, 0.09, 0.3, "triangle"),
    playFire: () => tone(600, 80, 0.25, 0.2, "sawtooth"),
    playHit: () => tone(150, 35, 0.16, 0.4, "square"),
    playPickup: () => tone(660, 1320, 0.18, 0.2, "sine"),
    playVictory() {
      resultMelody([392, 523.25, 659.25, 587.33, 659.25, 783.99, 1046.5], 261.63);
    },
    playDefeat() {
      resultMelody([440, 392, 349.23, 329.63, 293.66, 246.94, 220], 110);
    },
    playDraw() {
      resultMelody([392, 440, 392, 349.23, 392, 349.23, 392], 196);
    },
    playDoor: slidingDoor,
    startMusic() {
      if (disposed || context?.state !== "running" || musicTimer !== null) return;
      // Motivo original em Lá menor; agendamento curto evita filas após aba suspensa.
      const melody = [110, 130.81, 164.81, 146.83, 110, 164.81, 130.81, 98];
      const tick = () => {
        tone(melody[note % melody.length], melody[note % melody.length], 1.1, 0.24, "sine", true);
        note++;
      };
      tick();
      musicTimer = setInterval(tick, 800);
    },
    stopMusic,
    stopAll,
    async dispose() {
      if (disposed) return;
      disposed = true;
      stopAll();
      master?.disconnect();
      if (context && context.state !== "closed") await context.close();
      context = null;
      master = null;
      slidingBuffer = null;
    },
  };
}
