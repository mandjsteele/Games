'use strict';

// Game sounds. The tones are synthesised into small WAV clips at load time and
// played through an <audio> element, which is more reliable on phones than the
// Web Audio API (iPhones mute Web Audio when the ring/silent switch is on).
const Sounds = (() => {
  const RATE = 22050;
  let muted = localStorage.getItem('fivecrowns-muted') === '1';
  let unlocked = false;
  const player = new Audio();
  player.preload = 'auto';

  // Build a WAV clip from a list of notes: { f, start, dur, vol, shape }
  function makeClip(notes, length) {
    const n = Math.ceil(length * RATE);
    const data = new Float32Array(n);
    for (const { f, start, dur, vol = 0.3, shape = 'sine' } of notes) {
      const s0 = Math.floor(start * RATE);
      const len = Math.min(Math.floor(dur * RATE), n - s0);
      for (let i = 0; i < len; i++) {
        const t = i / RATE;
        const phase = (f * t) % 1;
        const wave = shape === 'triangle' ? 1 - 4 * Math.abs(phase - 0.5) : Math.sin(2 * Math.PI * phase);
        const attack = Math.min(1, t / 0.01);
        const decay = Math.exp((-5 * t) / dur);
        data[s0 + i] += wave * vol * attack * decay;
      }
    }
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
    // Rising fanfare when someone goes out.
    celebrate: makeClip([
      ...[523, 659, 784, 1047].map((f, i) => ({ f, start: i * 0.12, dur: 0.35, vol: 0.3, shape: 'triangle' })),
      ...[1047, 1319, 1568].map((f) => ({ f, start: 0.5, dur: 1.0, vol: 0.2, shape: 'triangle' })),
    ], 1.6),
  };

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
  function play(name) {
    if (muted) return;
    player.src = clips[name];
    player.currentTime = 0;
    player.play().then(() => { unlocked = true; }).catch((err) => {
      if (err && err.name === 'NotAllowedError') onBlocked();
    });
  }

  return {
    ding() {
      play('ding');
      if (navigator.vibrate) navigator.vibrate(150);
    },
    celebrate() {
      play('celebrate');
      if (navigator.vibrate) navigator.vibrate([100, 60, 100, 60, 250]);
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
      localStorage.setItem('fivecrowns-muted', muted ? '1' : '0');
      return muted;
    },
  };
})();
