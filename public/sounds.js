'use strict';

// Game sounds, synthesised with the Web Audio API so no audio files are needed.
const Sounds = (() => {
  let ctx = null;
  let muted = localStorage.getItem('fivecrowns-muted') === '1';

  // Browsers only allow audio after the user interacts with the page.
  function unlock() {
    if (!ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      ctx = new AudioCtx();
    }
    if (ctx.state === 'suspended') ctx.resume();
  }
  for (const ev of ['pointerdown', 'keydown', 'touchstart']) {
    window.addEventListener(ev, unlock, { capture: true });
  }

  function tone(freq, start, duration, { type = 'sine', volume = 0.3 } = {}) {
    const t = ctx.currentTime + start;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(volume, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  function ready() {
    return !muted && ctx && ctx.state === 'running';
  }

  return {
    // Bell-like "ding" when it becomes your turn.
    ding() {
      if (!ready()) return;
      tone(1319, 0, 0.9, { volume: 0.35 });
      tone(2637, 0, 0.5, { volume: 0.08 });
    },
    // Rising fanfare when someone goes out.
    celebrate() {
      if (!ready()) return;
      const notes = [523, 659, 784, 1047];
      notes.forEach((f, i) => tone(f, i * 0.12, 0.3, { type: 'triangle', volume: 0.3 }));
      [1047, 1319, 1568].forEach((f) => tone(f, 0.5, 1.0, { type: 'triangle', volume: 0.2 }));
    },
    get muted() {
      return muted;
    },
    toggleMute() {
      muted = !muted;
      localStorage.setItem('fivecrowns-muted', muted ? '1' : '0');
      return muted;
    },
  };
})();
