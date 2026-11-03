export interface GameAudio {
  unlock(): Promise<void>;
  playStep(): void;
  playFire(): void;
  playHit(): void;
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
  const voices = new Map<OscillatorNode, GainNode>();
  const musicVoices = new Set<OscillatorNode>();

  function tone(frequency: number, endFrequency: number, duration: number,
    volume: number, type: OscillatorType, music = false): void {
    if (disposed || context?.state !== "running" || !master || voices.size >= 32) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;
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

  function stopAll(): void {
    stopMusic();
    voices.forEach((gain, voice) => {
      voice.onended = null;
      voice.stop();
      voice.disconnect();
      gain.disconnect();
    });
    voices.clear();
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
    playStep: () => tone(110, 45, 0.09, 0.3, "triangle"),
    playFire: () => tone(600, 80, 0.25, 0.2, "sawtooth"),
    playHit: () => tone(150, 35, 0.16, 0.4, "square"),
    startMusic() {
      if (disposed || context?.state !== "running" || musicTimer !== null) return;
      // Motivo original em Lá menor; agendamento curto evita filas após aba suspensa.
      const melody = [110, 130.81, 164.81, 146.83, 110, 164.81, 130.81, 98];
      const tick = () => {
        tone(melody[note % melody.length], melody[note % melody.length], 1.1, 0.08, "sine", true);
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
    },
  };
}
