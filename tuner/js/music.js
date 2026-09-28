/**
 * music.js — 乐器调弦表与乐理数据
 */

/** 音名 → 相对 C 的半音数 */
const SEMI = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };

/**
 * 解析音名，如 "E2" / "A#3" / "D4"
 * @returns {number} MIDI 编号
 */
export function noteToMidi(note) {
  const m = /^([A-Ga-g])([#b]?)(-?\d)$/.exec(note.trim());
  if (!m) throw new Error(`无法解析音名: ${note}`);
  const letter = m[1].toUpperCase();
  const acc = m[2];
  const oct = parseInt(m[3], 10);
  let semi = SEMI[letter + acc];
  if (semi === undefined) semi = SEMI[letter] + (acc === '#' ? 1 : acc === 'b' ? -1 : 0);
  return (oct + 1) * 12 + semi;
}

export function midiToFreq(midi, a4 = 440) {
  return a4 * Math.pow(2, (midi - 69) / 12);
}

export function noteToFreq(note, a4 = 440) {
  return midiToFreq(noteToMidi(note), a4);
}

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export function midiToNote(midi) {
  return NAMES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
}

/** 音分 → 人类可读偏差 */
export function centsText(c) {
  const s = c >= 0 ? '+' : '−';
  return `${s}${Math.abs(c).toFixed(1)}`;
}

// ---------------------------------------------------------------------------
// 乐器 & 调弦
// ---------------------------------------------------------------------------

export const INSTRUMENTS = {
  guitar: {
    id: 'guitar',
    name: '吉他',
    icon: '🎸',
    strings: 6,
    minFreq: 60,
    maxFreq: 1300,
    tunings: [
      { id: 'std',    name: '标准调弦',   notes: ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'], desc: 'E A D G B E（最常用）' },
      { id: 'dropd',  name: 'Drop D',     notes: ['D2', 'A2', 'D3', 'G3', 'B3', 'E4'], desc: '6 弦降全音，重金属/民谣常用' },
      { id: 'halfdown', name: '降半音',   notes: ['D#2', 'G#2', 'C#3', 'F#3', 'A#3', 'D#4'], desc: 'Eb Ab Db Gb Bb Eb' },
      { id: 'fulldown', name: '降全音',   notes: ['D2', 'G2', 'C3', 'F3', 'A3', 'D4'], desc: 'D G C F A D' },
      { id: 'dadgad', name: 'DADGAD',     notes: ['D2', 'A2', 'D3', 'G3', 'A3', 'D4'], desc: '凯尔特/指弹常用' },
      { id: 'openg',  name: 'Open G',     notes: ['D2', 'G2', 'D3', 'G3', 'B3', 'D4'], desc: '开放 G 和弦' },
      { id: 'opend',  name: 'Open D',     notes: ['D2', 'A2', 'D3', 'F#3', 'A3', 'D4'], desc: '开放 D 和弦' },
      { id: 'opene',  name: 'Open E',     notes: ['E2', 'B2', 'E3', 'G#3', 'B3', 'E4'], desc: '开放 E 和弦' },
      { id: 'opena',  name: 'Open A',     notes: ['E2', 'A2', 'C#3', 'E3', 'A3', 'E4'], desc: '开放 A 和弦' },
      { id: 'openc',  name: 'Open C',     notes: ['C2', 'G2', 'C3', 'G3', 'C4', 'E4'], desc: '开放 C 和弦' },
      { id: 'dropc',  name: 'Drop C',     notes: ['C2', 'G2', 'C3', 'F3', 'A3', 'D4'], desc: 'Drop C 全音降' },
      { id: 'nashville', name: 'Nashville 高八度', notes: ['E3', 'A3', 'D4', 'G4', 'B3', 'E4'], desc: '12 弦音色模拟' },
    ],
    chords: [
      { name: 'C',  frets: [null, 3, 2, 0, 1, 0] },
      { name: 'D',  frets: [null, null, 0, 2, 3, 2] },
      { name: 'E',  frets: [0, 2, 2, 1, 0, 0] },
      { name: 'Em', frets: [0, 2, 2, 0, 0, 0] },
      { name: 'G',  frets: [3, 2, 0, 0, 0, 3] },
      { name: 'A',  frets: [null, 0, 2, 2, 2, 0] },
      { name: 'Am', frets: [null, 0, 2, 2, 1, 0] },
      { name: 'F',  frets: [1, 3, 3, 2, 1, 1] },
      { name: 'Dm', frets: [null, null, 0, 2, 3, 1] },
      { name: 'E7', frets: [0, 2, 0, 1, 0, 0] },
      { name: 'A7', frets: [null, 0, 2, 0, 2, 0] },
      { name: 'D7', frets: [null, null, 0, 2, 1, 2] },
    ],
  },

  ukulele: {
    id: 'ukulele',
    name: '尤克里里',
    icon: '🪕',
    strings: 4,
    minFreq: 230,
    maxFreq: 1400,
    tunings: [
      { id: 'std',     name: '标准 (High G)', notes: ['G4', 'C4', 'E4', 'A4'], desc: 'G C E A，最常用' },
      { id: 'lowg',    name: 'Low G',         notes: ['G3', 'C4', 'E4', 'A4'], desc: '低音 G，音域更宽' },
      { id: 'd',       name: 'D 调弦',        notes: ['A4', 'D4', 'F#4', 'B4'], desc: 'Baritone 前的老式调法' },
      { id: 'baritone',name: '中音尤克里里',  notes: ['D3', 'G3', 'B3', 'E4'], desc: '与吉他高 4 弦相同' },
    ],
    chords: [
      { name: 'C',  frets: [0, 0, 0, 3] },
      { name: 'Am', frets: [2, 0, 0, 0] },
      { name: 'F',  frets: [2, 0, 1, 0] },
      { name: 'G',  frets: [0, 2, 3, 2] },
      { name: 'Em', frets: [0, 4, 3, 2] },
      { name: 'Dm', frets: [2, 2, 1, 0] },
      { name: 'A',  frets: [2, 1, 0, 0] },
      { name: 'E',  frets: [1, 4, 0, 2] },
    ],
  },

  bass4: {
    id: 'bass4',
    name: '贝斯 (4弦)',
    icon: '🎸',
    strings: 4,
    minFreq: 30,
    maxFreq: 500,
    tunings: [
      { id: 'std',   name: '标准',     notes: ['E1', 'A1', 'D2', 'G2'], desc: 'E A D G' },
      { id: 'dropd', name: 'Drop D',   notes: ['D1', 'A1', 'D2', 'G2'], desc: 'D A D G' },
      { id: 'halfdown', name: '降半音', notes: ['D#1', 'G#1', 'C#2', 'F#2'], desc: 'Eb Ab Db Gb' },
      { id: 'hip',   name: 'Hipshot C', notes: ['C1', 'A1', 'D2', 'G2'], desc: '带降音装置' },
    ],
    chords: [],
  },

  bass5: {
    id: 'bass5',
    name: '贝斯 (5弦)',
    icon: '🎸',
    strings: 5,
    minFreq: 28,
    maxFreq: 500,
    tunings: [
      { id: 'std',   name: '标准 (低B)', notes: ['B0', 'E1', 'A1', 'D2', 'G2'], desc: 'B E A D G' },
      { id: 'highc', name: '高 C',       notes: ['E1', 'A1', 'D2', 'G2', 'C3'], desc: 'E A D G C' },
      { id: 'dropa', name: 'Drop A',     notes: ['A0', 'E1', 'A1', 'D2', 'G2'], desc: 'A E A D G' },
    ],
    chords: [],
  },

  bass6: {
    id: 'bass6',
    name: '贝斯 (6弦)',
    icon: '🎸',
    strings: 6,
    minFreq: 28,
    maxFreq: 600,
    tunings: [
      { id: 'std', name: '标准', notes: ['B0', 'E1', 'A1', 'D2', 'G2', 'C3'], desc: 'B E A D G C' },
    ],
    chords: [],
  },

  violin: {
    id: 'violin',
    name: '小提琴',
    icon: '🎻',
    strings: 4,
    minFreq: 180,
    maxFreq: 1400,
    tunings: [
      { id: 'std', name: '标准 GDAE', notes: ['G3', 'D4', 'A4', 'E5'], desc: 'G D A E（五度定弦）' },
      { id: 'cajun', name: 'Cajun 调弦', notes: ['F3', 'C4', 'G4', 'D5'], desc: '整体降全音' },
    ],
    chords: [],
  },

  viola: {
    id: 'viola',
    name: '中提琴',
    icon: '🎻',
    strings: 4,
    minFreq: 120,
    maxFreq: 1200,
    tunings: [
      { id: 'std', name: '标准 CGDA', notes: ['C3', 'G3', 'D4', 'A4'], desc: 'C G D A' },
    ],
    chords: [],
  },

  cello: {
    id: 'cello',
    name: '大提琴',
    icon: '🎻',
    strings: 4,
    minFreq: 60,
    maxFreq: 700,
    tunings: [
      { id: 'std', name: '标准 CGDA', notes: ['C2', 'G2', 'D3', 'A3'], desc: 'C G D A（八度低于中提琴）' },
    ],
    chords: [],
  },

  mandolin: {
    id: 'mandolin',
    name: '曼陀林',
    icon: '🪕',
    strings: 4,
    minFreq: 180,
    maxFreq: 1500,
    tunings: [
      { id: 'std', name: '标准 GDAE（双弦）', notes: ['G3', 'D4', 'A4', 'E5'], desc: '与小提琴同音高' },
    ],
    chords: [],
  },

  chromatic: {
    id: 'chromatic',
    name: '半音（通用）',
    icon: '🎼',
    strings: 0,
    minFreq: 27,
    maxFreq: 4200,
    tunings: [
      { id: 'auto', name: '自动识别最近音', notes: [], desc: '任意乐器、任意音高，自动显示最近音名' },
    ],
    chords: [],
  },
};

export const INSTRUMENT_ORDER = ['guitar', 'ukulele', 'bass4', 'bass5', 'bass6', 'violin', 'viola', 'cello', 'mandolin', 'chromatic'];

/** 弦号显示：吉他习惯从 1 弦（最细，高音 E）开始编号 */
export function stringLabels(instId, nStrings) {
  const labels = [];
  for (let i = 0; i < nStrings; i++) {
    labels.push(`${nStrings - i} 弦`);
  }
  return labels;
}

export function getInstrument(id) {
  return INSTRUMENTS[id] || INSTRUMENTS.guitar;
}

export function getTuning(instId, tuningId) {
  const inst = getInstrument(instId);
  return inst.tunings.find(t => t.id === tuningId) || inst.tunings[0];
}

/** 某调弦下所有弦的目标频率 */
export function tuningFrequencies(instId, tuningId, a4 = 440) {
  const t = getTuning(instId, tuningId);
  return t.notes.map(n => ({ note: n, midi: noteToMidi(n), freq: noteToFreq(n, a4) }));
}
