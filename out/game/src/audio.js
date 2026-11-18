// All sound is synthesised with WebAudio: an engine hum that follows speed, a
// two-tone siren while the heat is on, and short blips for shots, pickups and
// cash. No audio files, no network. Everything is guarded: if the browser
// refuses audio, the game plays silent.

export function createAudio() {
  let ctx = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = 0;
  let muted = false;
  let started = false;

  function ensure() {
    if (started) return;
    started = true;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      ctx = new AudioCtx();
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineGain);
      engineGain.connect(ctx.destination);
      engineOsc.start();
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'square';
      sirenOsc.frequency.value = 660;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(ctx.destination);
      sirenOsc.start();
    } catch {
      ctx = null;
    }
  }

  function blip(freq, dur, type, vol) {
    if (!ctx || muted) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(vol || 0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + dur);
    } catch {
      // A blip that cannot play is not worth stopping the game for.
    }
  }

  return {
    unlock() {
      ensure();
      if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
    },
    setMuted(value) {
      muted = value;
      if (engineGain) engineGain.gain.value = 0;
      if (sirenGain) sirenGain.gain.value = 0;
    },
    isMuted() {
      return muted;
    },
    /** Called every frame with the world: engine follows the car, siren follows the heat. */
    update(state, dt) {
      if (!ctx || muted) return;
      try {
        const p = state.player;
        const car = p.inCar ? state.cars.find((c) => c.id === p.inCar) : null;
        const speed = car ? Math.abs(car.speed) : 0;
        if (engineGain) engineGain.gain.value = car ? 0.03 + (speed / 520) * 0.05 : 0;
        if (engineOsc) engineOsc.frequency.value = 55 + (speed / 520) * 110;
        if (sirenGain && sirenOsc) {
          if (state.wanted > 0) {
            sirenTimer += dt;
            sirenOsc.frequency.value = Math.floor(sirenTimer * 2.2) % 2 === 0 ? 660 : 880;
            sirenGain.gain.value = 0.025;
          } else {
            sirenGain.gain.value = 0;
          }
        }
      } catch {
        // Audio stays best-effort.
      }
    },
    shot() {
      blip(190, 0.09, 'square', 0.1);
    },
    punch() {
      blip(120, 0.08, 'triangle', 0.12);
    },
    pickup() {
      blip(880, 0.12, 'sine', 0.12);
      setTimeout(() => blip(1320, 0.12, 'sine', 0.1), 70);
    },
    cash() {
      blip(1040, 0.1, 'sine', 0.12);
      setTimeout(() => blip(1560, 0.16, 'sine', 0.1), 80);
    },
    busted() {
      blip(220, 0.5, 'sawtooth', 0.12);
    },
    crash() {
      blip(70, 0.25, 'sawtooth', 0.14);
    },
  };
}
