// 桌面版 preload：OST 播放器（复用 lza:// 协议加载 1G+ 资源包里的音频）
// 网页版无需改动：此 API 仅桌面渲染进程可见
const { contextBridge } = require('electron');

let audio = null;
let cur = -1;
let total = 0;
let onTrack = null;

function ensureAudio() {
  if (audio) return audio;
  audio = new Audio();
  audio.loop = false;
  audio.addEventListener('ended', () => { next(1); });
  audio.addEventListener('error', () => { next(1); });
  document.addEventListener('click', () => { if (audio.paused && audio.src) audio.play().catch(() => {}); }, { once: true });
  return audio;
}

function next(dir = 1) {
  if (total <= 0) return;
  cur = (cur + dir + total) % total;
  const a = ensureAudio();
  a.src = `lza://audio/bgm/${String(cur + 1).padStart(2, '0')}.wav`;
  a.play().catch(() => {});
  if (onTrack) onTrack(cur);
}

contextBridge.exposeInMainWorld('desktop', {
  /** 播放第 i 首 OST（i 从 0 开始） */
  playBgm: (i = 0) => {
    total = Math.max(total, 1);
    cur = i;
    const a = ensureAudio();
    a.src = `lza://audio/bgm/${String(cur + 1).padStart(2, '0')}.wav`;
    a.play().catch(() => {});
  },
  stopBgm: () => { if (audio) { audio.pause(); audio.src = ''; } },
  nextBgm: () => next(1),
  /** 设置曲目数（资源包加载后由主进程/页面调用） */
  setTrackCount: (n) => { total = n; },
  getTrackCount: () => total,
  /** 订阅切曲事件（返回取消函数） */
  onTrackChange: (fn) => { onTrack = fn; return () => { onTrack = null; }; },
});
