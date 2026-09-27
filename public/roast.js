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

  // Each style returns a display spelling, or null if it doesn't suit the name.
  const styles = {
    // A-A-Ron: say the opening vowel as letters.
    aaRon(word) {
      if (!isVowel(word[0]) || word[0] === 'y') return null;
      const rest = word.replace(/^[aeiou]+/, '');
      if (rest.length < 2 || !/[aeiouy]/.test(rest)) return null;
      const L = word[0].toUpperCase();
      return `${L}-${L}-${cap(fixEnd(rest))}`;
    },
    // Dee-Nice: long first vowel, chopped into syllables.
    deeNice(word) {
      if (isVowel(word[0])) return null;
      const syl = syllables(word);
      if (syl.length < 2) return null;
      // Jac -> Jay, De -> Dee, Ke -> Kee
      const first = syl[0].replace(/([aeiouy])[aeiouy]*[^aeiouy]*$/, (m, v) => LONG[v]);
      return [first, ...syl.slice(1).map(fixEnd)].map(cap).join('-');
    },
    // Ti-MOTH-ee: stress the wrong syllable, hard.
    wrongStress(word, rng) {
      const syl = syllables(word);
      if (syl.length < 2) return null;
      const i = 1 + Math.floor(rng() * (syl.length - 1));
      // Steal the next syllable's consonants: mo + thy -> MOTH + ee
      if (i < syl.length - 1) {
        const onset = syl[i + 1].match(/^[^aeiouy]+/);
        if (onset && onset[0].length < syl[i + 1].length) {
          syl[i] += onset[0];
          syl[i + 1] = syl[i + 1].slice(onset[0].length);
        }
      }
      // An open stressed syllable gets a long vowel: ni -> NYE
      if (/[aeiouy]$/.test(syl[i]) && i < syl.length - 1) syl[i] = syl[i].replace(/([aeiouy])$/, (v) => (v === 'i' || v === 'y' ? 'ye' : LONG[v]));
      return syl
        .map((s, k) => (k === i ? fixEnd(s).toUpperCase() : cap(fixEnd(s))))
        .map((s) => s.replace(/^Y$/, 'Ee'))
        .join('-');
    },
    // Balakay: pull the opening consonants apart and finish with "-ay".
    balakay(word) {
      if (!CLUSTER.test(word)) return null;
      let w = word.replace(CLUSTER, (c) => `${c.slice(0, -1)}a${c.slice(-1)}`);
      w = w.replace(/([^aeiouy])e$/, '$1ay').replace(/([^aeiouy])$/, '$1ay');
      return cap(w.replace(/kay$/, 'kay'));
    },
    // Mi-KAY: one-syllable names get split and stretched.
    miKay(word) {
      if (syllables(word).length !== 1) return null;
      const m = word.match(/^(.*?[aeiouy]+)([^aeiouy]+)e?$/);
      if (!m) return null;
      const tail = m[2].slice(-1);
      return `${cap(m[1] + m[2].slice(0, -1))}-${tail.toUpperCase()}AY`;
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
    const aaRon = styles.aaRon(word);
    if (aaRon) return aaRon; // the classic
    const options = Object.keys(styles)
      .filter((k) => k !== 'prefix')
      .map((k) => styles[k](word, rng))
      .filter((r) => r && r.replace(/-/g, '') !== cap(word));
    return options.length ? pick(rng, options) : styles.prefix(word, rng);
  }

  const LINES = [
    (n) => `Is there a ${n}? ... ${n}. Just. Went. Out. Wonderful.`,
    (n) => `Oh, look at that. ${n} just went out. Somebody give ${n} a gold star.`,
    (n) => `${n} just went out. The rest of you? You done messed up.`,
    (n) => `${n}! Just went out. Insubordinate. And churlish.`,
    (n) => `Well, well, well. ${n} just went out. I am so... impressed.`,
    (n) => `${n} just went out. Say it correctly: ${n}!`,
    (n) => `Who is ${n}? ... ${n} just went out. Put that on your permanent record.`,
  ];

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

  let voice = null;
  function chooseVoice() {
    if (typeof speechSynthesis === 'undefined') return;
    const voices = speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang));
    voice =
      voices.find((v) => /male|david|daniel|fred|guy|james|george/i.test(v.name) && !/female/i.test(v.name)) ||
      voices.find((v) => /en-US/i.test(v.lang)) ||
      voices[0] ||
      null;
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

  // Speak the text; resolves false if this device can't talk.
  function say(text) {
    if (typeof speechSynthesis === 'undefined' || typeof SpeechSynthesisUtterance === 'undefined') {
      return Promise.resolve(false);
    }
    return new Promise((resolve) => {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(forSpeech(text));
      if (voice) u.voice = voice;
      u.rate = 0.9;
      u.pitch = 0.7;
      u.onend = () => resolve(true);
      u.onerror = () => resolve(false);
      speechSynthesis.speak(u);
      setTimeout(() => resolve(true), 8000); // don't wait forever
    });
  }

  return { mispronounce, goOutLine, forSpeech, say };
})();

if (typeof module !== 'undefined') module.exports = Roast;
