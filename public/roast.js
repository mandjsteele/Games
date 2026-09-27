'use strict';

// "Substitute teacher" style announcer: confidently mispronounces player names
// and sarcastically announces when someone goes out.
const Roast = (() => {
  const VOWELS = 'aeiouy';
  const LETTER_NAMES = {
    a: 'A', b: 'Bee', c: 'See', d: 'Dee', e: 'E', f: 'Eff', g: 'Gee', h: 'Aitch', i: 'I', j: 'Jay',
    k: 'Kay', l: 'Ell', m: 'Em', n: 'En', o: 'O', p: 'Pee', q: 'Queue', r: 'Arr', s: 'Ess', t: 'Tee',
    u: 'You', v: 'Vee', w: 'Double-You', x: 'Ex', y: 'Why', z: 'Zee',
  };

  // Small deterministic random generator so every phone picks the same joke.
  function seeded(text) {
    let h = 2166136261;
    for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    return () => {
      h = Math.imul(h ^ (h >>> 15), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      h ^= h >>> 16;
      return (h >>> 0) / 4294967296;
    };
  }
  const pick = (rng, list) => list[Math.floor(rng() * list.length)];
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const isVowel = (c) => VOWELS.includes(c);

  const DIGRAPHS = ['th', 'ch', 'sh', 'ph', 'wh', 'qu'];
  const CLUSTER = /^(bl|br|cl|cr|dr|fl|fr|gl|gr|pl|pr|sl|sm|sn|sp|st|sw|tr|tw|chr)/;
  const LONG = { a: 'ay', e: 'ee', i: 'ie', o: 'oh', u: 'oo', y: 'ie' };

  // Rough syllables: split consonant runs between vowels (one consonant goes
  // to the next syllable, longer runs are shared), silent final "e" sticks.
  function syllables(word) {
    const groups = [...word.matchAll(/[aeiouy]+/g)];
    if (groups.length < 2 || /^[^aeiouy]*[aeiouy]+[^aeiouy]+e$/.test(word)) return [word];
    if (/[^aeiouy]e$/.test(word) && groups.length === 2) return [word];
    const cuts = [];
    for (let g = 0; g < groups.length - 1; g++) {
      const from = groups[g].index + groups[g][0].length;
      const to = groups[g + 1].index;
      const run = word.slice(from, to);
      let cut = from;
      if (run.length >= 2 && !DIGRAPHS.includes(run.slice(-2)) ) cut = to - 1;
      if (run.length >= 3 && DIGRAPHS.includes(run.slice(-2))) cut = to - 2;
      if (run === 'ck') cut = to;
      cuts.push(cut);
    }
    const parts = [];
    let prev = 0;
    for (const c of cuts) { parts.push(word.slice(prev, c)); prev = c; }
    parts.push(word.slice(prev));
    // Fold a trailing silent-e syllable ("ele" in Steele) into the one before.
    if (parts.length > 1 && /^[^aeiouy]*e$/.test(parts[parts.length - 1])) {
      const last = parts.pop();
      parts[parts.length - 1] += last;
    }
    return parts.filter(Boolean);
  }

  const fixEnd = (s) => s.replace(/ise$/, 'ice').replace(/ine$/, 'in').replace(/([^aeiou])y$/, '$1ee');

  // Opening consonants a voice can actually say ("dr", "th"), used to tidy A-A-Ron style names.
  const ONSETS = /^(?:[^aeiouy]|bl|br|ch|cl|cr|dr|fl|fr|gl|gr|pl|pr|sh|sl|st|th|tr)?[aeiouy]/;

  // Each style returns a display spelling, or null if it doesn't suit the name.
  // Every style changes how the name SOUNDS, not just how it looks.
  const styles = {
    // A-A-Ron: say the opening vowel as a letter, twice.
    aaRon(word) {
      if (!isVowel(word[0]) || word[0] === 'y') return null;
      let rest = word.replace(/^[aeiou]+/, '');
      while (rest.length > 2 && !ONSETS.test(rest)) rest = rest.slice(1); // Andrew -> Drew
      if (rest.length < 2 || !/[aeiouy]/.test(rest)) return null;
      const L = word[0].toUpperCase();
      return `${L}-${L}-${cap(fixEnd(rest))}`;
    },
    // Matt-Hew / Step-Hen / Heat-Her: read "th", "ph", "ch", "sh" letter by letter.
    literal(word) {
      const m = /[tpcsg]h/.exec(word.slice(1));
      if (!m) return null;
      const at = m.index + 2; // index of the "h"
      const left = word.slice(0, at);
      let right = word.slice(at);
      if (right.length > 1 && !isVowel(right[1])) return null; // Ashley -> skip
      if (right.length === 1) right += 'ay'; // Joseph -> Josep-Hay
      return `${cap(left)}-${cap(fixEnd(right))}`;
    },
    // Dee-Nice / Kay-Ren: long first vowel, chopped into syllables.
    deeNice(word) {
      if (isVowel(word[0])) return null;
      const syl = syllables(word);
      if (syl.length < 2) return null;
      // Jac -> Jay, De -> Dee, Ka -> Kay
      const first = syl[0].replace(/([aeiouy])[aeiouy]*[^aeiouy]*$/, (m, v) => LONG[v]);
      return [first, ...syl.slice(1).map(fixEnd)].map(cap).join('-');
    },
    // Balakay: pull the opening consonants apart and finish with "-ay".
    balakay(word) {
      if (!CLUSTER.test(word)) return null;
      let w = word.replace(CLUSTER, (c) => `${c.slice(0, -1)}a${c.slice(-1)}`);
      w = w.replace(/([^aeiouy])e$/, '$1ay').replace(/([^aeiouy])$/, '$1ay');
      return cap(w);
    },
    // Mat-Tay: one-syllable names get split and stretched.
    miKay(word) {
      if (syllables(word).length !== 1) return null;
      const m = word.match(/^(.*?[aeiouy]+)([^aeiouy]+)e?$/);
      if (!m) return null;
      const tail = m[2].slice(-1);
      return `${cap(m[1] + m[2].slice(0, -1))}-${cap(tail)}ay`;
    },
    // Jay-Sue: when all else fails, add a confident prefix.
    prefix(word, rng) {
      return `${pick(rng, ['Jay', 'Dee', 'La', 'Shay'])}-${cap(word)}`;
    },
  };

  function mispronounce(name) {
    const word = String(name).trim().split(/\s+/)[0].toLowerCase().replace(/[^a-z]/g, '');
    if (word.length < 2) return String(name);
    const rng = seeded(word);
    // Best jokes first; the rest are backups.
    for (const key of ['literal', 'aaRon', 'balakay', 'deeNice', 'miKay']) {
      const r = styles[key](word, rng);
      if (r) return r;
    }
    return styles.prefix(word, rng);
  }

  // Just the made-up name, no extra lines.
  const LINES = [(n) => `${n} just went out!`];

  // Returns the text for the announcement; `seed` keeps every phone in sync.
  function goOutLine(name, seed = '') {
    const rng = seeded(`${name}|${seed}`);
    return pick(rng, LINES)(mispronounce(name));
  }

  // Turn the display spelling into something a text-to-speech voice reads well.
  function forSpeech(text) {
    return text
      .replace(/\b([A-Z])-(?=[A-Z])/g, '$1. ') // "A-A-Ron" -> "A. A. Ron"
      .replace(/\b([A-Z]{2,})\b/g, (m) => m.charAt(0) + m.slice(1).toLowerCase()) // don't spell out "MOTH"
      .replace(/-/g, ' ');
  }

  // Voices: each player can pick their favourite; otherwise prefer a natural-
  // sounding male English voice (Android: iol/iom/tpd, Chrome: "UK English Male",
  // Windows/Edge: Guy, Andrew, Christopher, Davis...).
  const MALE = /\bmale\b|iol|iom|tpd|guy|andrew|christopher|davis|david|daniel|fred|alex|arthur|james|george|ryan|eric|tom|aaron|rishi|lee/i;
  const FEMALE = /female|iob|iog|tpc|tpf|sfg|samantha|victoria|karen|moira|tessa|zira|susan|aria|jenny/i;
  const NICE = /natural|neural|network|enhanced|premium|online/i;
  let voice = null;

  function voices() {
    if (typeof speechSynthesis === 'undefined') return [];
    return speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang));
  }

  function score(v) {
    let s = 0;
    // Natural-sounding (network/neural) voices matter most, then a male voice.
    if (NICE.test(v.name) || NICE.test(v.voiceURI || '')) s += 4;
    if (MALE.test(v.name) && !FEMALE.test(v.name)) s += 2;
    if (FEMALE.test(v.name)) s -= 2;
    if (v.localService === false) s += 1; // online voices are usually higher quality
    if (/en[-_]US/i.test(v.lang)) s += 1;
    return s;
  }

  function chooseVoice() {
    const list = voices();
    let saved = null;
    try { saved = localStorage.getItem('fivecrowns-voice'); } catch {}
    voice = list.find((v) => v.voiceURI === saved) || list.slice().sort((a, b) => score(b) - score(a))[0] || null;
  }
  if (typeof speechSynthesis !== 'undefined') {
    chooseVoice();
    speechSynthesis.addEventListener?.('voiceschanged', chooseVoice);
    // Some browsers (Safari) only allow speech after it has been used during a tap.
    const unlock = () => {
      speechSynthesis.speak(new SpeechSynthesisUtterance(''));
      window.removeEventListener('click', unlock, true);
    };
    window.addEventListener('click', unlock, true);
  }

  function setVoice(uri) {
    try { localStorage.setItem('fivecrowns-voice', uri); } catch {}
    chooseVoice();
  }

  // Speak the text; resolves false if this device can't talk.
  function say(text) {
    if (typeof speechSynthesis === 'undefined' || typeof SpeechSynthesisUtterance === 'undefined') {
      return Promise.resolve(false);
    }
    return new Promise((resolve) => {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(forSpeech(text));
      try {
        if (voice) {
          u.voice = voice;
          u.lang = voice.lang;
        }
      } catch {} // fall back to the default voice
      // The phone's normal speed and pitch sound the most natural.
      u.rate = 1;
      u.pitch = 1;
      u.onend = () => resolve(true);
      u.onerror = () => resolve(false);
      speechSynthesis.speak(u);
      setTimeout(() => resolve(true), 10000); // don't wait forever
    });
  }

  return {
    mispronounce, goOutLine, forSpeech, say, setVoice,
    voices,
    get voice() { return voice; },
  };
})();

if (typeof module !== 'undefined') module.exports = Roast;
