'use strict';

// Game sounds. The tones are synthesised into small WAV clips at load time and
// played through an <audio> element, which is more reliable on phones than the
// Web Audio API (iPhones mute Web Audio when the ring/silent switch is on).
const Sounds = (() => {
  const RATE = 22050;
  let muted = localStorage.getItem('fivecrowns-sound') === 'off';
  let unlocked = false;
  const player = new Audio();
  player.preload = 'auto';

  // Waveforms: sine, triangle, brass (a bright trumpet-like tone) and clap (noise).
  function sample(shape, f, t) {
    const phase = (f * t) % 1;
    if (shape === 'triangle') return 1 - 4 * Math.abs(phase - 0.5);
    if (shape === 'clap') return Math.random() * 2 - 1;
    if (shape === 'brass') {
      let v = 0;
      for (let k = 1; k <= 6; k++) v += Math.sin(2 * Math.PI * f * k * t) / k;
      return v * 0.6;
    }
    return Math.sin(2 * Math.PI * phase);
  }

  // Build a WAV clip from a list of notes: { f, start, dur, vol, shape, hold }.
  // Notes fade out by default; `hold` notes sustain and then release at the end.
  function makeClip(notes, length) {
    const n = Math.ceil(length * RATE);
    const data = new Float32Array(n);
    for (const { f = 0, start, dur, vol = 0.3, shape = 'sine', hold = false } of notes) {
      const s0 = Math.floor(start * RATE);
      const len = Math.min(Math.floor(dur * RATE), n - s0);
      for (let i = 0; i < len; i++) {
        const t = i / RATE;
        const attack = Math.min(1, t / (hold ? 0.03 : 0.005));
        const env = hold ? Math.min(1, (dur - t) / 0.2) : Math.exp((-5 * t) / dur);
        data[s0 + i] += sample(shape, f, t) * vol * attack * env;
      }
    }
    // Keep the mix from distorting.
    const peak = data.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
    if (peak > 0.9) for (let i = 0; i < n; i++) data[i] *= 0.9 / peak;
    const buf = new ArrayBuffer(44 + n * 2);
    const v = new DataView(buf);
    const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE');
    str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, RATE, true); v.setUint32(28, RATE * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    str(36, 'data'); v.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, data[i])) * 32767, true);
    return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
  }

  const clips = {
    silence: makeClip([], 0.05),
    // Bell-like "ding" when it becomes your turn.
    ding: makeClip([
      { f: 1319, start: 0, dur: 0.9, vol: 0.5 },
      { f: 2637, start: 0, dur: 0.5, vol: 0.12 },
    ], 1.0),
    // Trumpet "ta-ta-ta-TAAA!" fanfare with applause when someone goes out.
    celebrate: makeClip([
      ...[0, 0.15, 0.3].map((start) => ({ f: 392, start, dur: 0.12, vol: 0.7, shape: 'brass', hold: true })),
      ...[523, 659, 784].map((f) => ({ f, start: 0.45, dur: 1.2, vol: 0.22, shape: 'brass', hold: true })),
      { f: 1047, start: 0.45, dur: 1.2, vol: 0.12, shape: 'brass', hold: true },
      ...applause(0.5, 2.0),
    ], 2.6),
  };

  // Lots of short random claps that thin out towards the end.
  function applause(start, dur) {
    const claps = [];
    for (let i = 0; i < 90; i++) {
      const at = Math.random() * dur;
      claps.push({ start: start + at, dur: 0.06, vol: 0.4 * (1 - 0.7 * at / dur), shape: 'clap' });
    }
    return claps;
  }

  // Browsers only allow sound after the user taps the page, and Safari only
  // for the element that was played during that tap — so play a silent clip.
  function unlock() {
    if (unlocked) return;
    try {
      if (navigator.audioSession) navigator.audioSession.type = 'playback';
    } catch {}
    player.src = clips.silence;
    player.play().then(() => { unlocked = true; }).catch(() => {});
  }
  for (const ev of ['click', 'touchend', 'keydown']) {
    window.addEventListener(ev, unlock, { capture: true });
  }

  let onBlocked = () => {};
  // Resolves to 'played', 'muted', 'blocked' (page not tapped yet) or an error name.
  function play(name) {
    if (muted) return Promise.resolve('muted');
    player.src = clips[name];
    player.currentTime = 0;
    return player.play().then(() => {
      unlocked = true;
      return 'played';
    }).catch((err) => {
      const reason = (err && err.name) || 'error';
      if (reason === 'NotAllowedError') {
        onBlocked();
        return 'blocked';
      }
      if (reason === 'AbortError') return 'played'; // interrupted by the next sound
      return fallback(name) ? 'played' : reason;
    });
  }

  // Backup player using the Web Audio API, in case the <audio> element fails.
  let ctx = null;
  function fallback(name) {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return false;
      ctx = ctx || new AudioCtx();
      ctx.resume();
      fetch(clips[name])
        .then((r) => r.arrayBuffer())
        .then((b) => ctx.decodeAudioData(b))
        .then((buf) => {
          const src = ctx.createBufferSource();
          src.buffer = buf;
          src.connect(ctx.destination);
          src.start();
        })
        .catch(() => {});
      return true;
    } catch {
      return false;
    }
  }

  return {
    ding() {
      if (!muted && navigator.vibrate) navigator.vibrate(150);
      return play('ding');
    },
    celebrate() {
      if (!muted && navigator.vibrate) navigator.vibrate([100, 60, 100, 60, 250]);
      return play('celebrate');
    },
    // Called when the browser refuses to play (the page hasn't been tapped yet).
    set onBlocked(fn) {
      onBlocked = fn;
    },
    get muted() {
      return muted;
    },
    toggleMute() {
      muted = !muted;
      localStorage.setItem('fivecrowns-sound', muted ? 'off' : 'on');
      return muted;
    },
  };
})();
