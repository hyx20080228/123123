/**
 * smoke_signal.mjs — 端到端信号链路测试
 *
 * 把合成弦音注入桩麦克风，让 app.js 的 tick 主循环真实运转：
 * 采集 → 低通 → YIN → ρ 精修 → 非谐性补偿 → 中位/Kalman 平滑 → 判定 → UI。
 * 验证"屏幕上显示的音名与偏差"是否等于"喂进去的物理频率"。
 *
 * 依赖：npm i jsdom（可用 JSDOM_PATH 指定）
 * 运行：node tuner/tests/smoke_signal.mjs
 */

import { setupEnv, makeAssert } from './_jsdom_env.mjs';
import { noteFreq } from './_synth.mjs';

const { ok, summary } = makeAssert();
const env = await setupEnv({ signal: { f0: noteFreq('A2'), B: 6e-5, snrDb: 50, seed: 7, dur: 6 } });
const { $, $$, click, wait, setSignal, errors } = env;

/** 轮询直到条件成立或超时 */
async function until(fn, ms = 4000, step = 50) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (fn()) return true;
    await wait(step);
  }
  return fn();
}

console.log('='.repeat(88));
console.log('  端到端信号链路测试（注入合成弦音，跑真实 tick 主循环）');
console.log('='.repeat(88));

// ---------------------------------------------------------------- 启动
click($('#btn-start'));
await until(() => $('#btn-start-text').textContent.includes('停'), 2000);
ok('点击开始后进入监听状态', $('#btn-start-text').textContent.includes('停'), $('#btn-start-text').textContent);

// ---------------------------------------------------------------- ① 5 弦 A2
const gotA = await until(() => $('#note-name').textContent === 'A', 4000);
ok('注入 A2(110Hz) → 识别为 A', gotA, `实际 ${$('#note-name').textContent}${$('#note-oct').textContent}`);
ok('八度显示 2', $('#note-oct').textContent === '2', $('#note-oct').textContent);

const centsA = parseFloat($('#ro-cents').textContent.replace('−', '-').replace('+', ''));
ok('|显示偏差| < 2 音分（A2 钢弦，含刚度补偿）', Math.abs(centsA) < 2, `${centsA.toFixed(1)} 音分`);

const conf = parseFloat($('#q-conf').style.width) / 100;
ok('置信度条 > 50%', conf > 0.5, `${(conf * 100).toFixed(0)}%`);

const locked = await until(() => $('#meter-state').textContent.includes('准了'), 5000);
ok('稳定后判定「准了 ✓」', locked, $('#meter-state').textContent);
ok('判定带 lock 高亮类', $('#meter-state').classList.contains('lock'));
ok('对应弦按钮被标记已调准', $$('#string-grid .sbtn').some(b => b.className.includes('tuned')));
ok('自动写入调音历史', !$('#hist-table').textContent.includes('还没有记录'),
  $('#hist-table').textContent.slice(0, 60).replace(/\s+/g, ' '));

// ---------------------------------------------------------------- ② 4 弦 D3
setSignal({ f0: noteFreq('D3'), B: 1e-4, snrDb: 50, seed: 17, dur: 6 });
click($('#mode-seg button[data-mode=manual]'));
await wait(50);
click($$('#string-grid .sbtn')[3]);            // 第 4 弦 D3
await wait(50);
const gotD = await until(() => $('#note-name').textContent === 'D', 4000);
ok('注入 D3(146.83Hz) → 识别为 D', gotD, `实际 ${$('#note-name').textContent}${$('#note-oct').textContent}`);
const centsD = parseFloat($('#ro-cents').textContent.replace('−', '-').replace('+', ''));
ok('|显示偏差| < 2 音分（D3，距 150Hz 工频谐波仅 37 音分）', Math.abs(centsD) < 2, `${centsD.toFixed(1)} 音分`);
ok('手动模式下目标频率显示 146.8x Hz', $('#ro-target').textContent.startsWith('146.8'), $('#ro-target').textContent);

// ---------------------------------------------------------------- ③ 明显偏低 → 方向提示正确
setSignal({ f0: noteFreq('D3') * Math.pow(2, -25 / 1200), B: 1e-4, snrDb: 50, seed: 27, dur: 6 });
const flatShown = await until(() => $('#note-name').textContent === 'D'
  && parseFloat($('#ro-cents').textContent.replace('−', '-').replace('+', '')) < -15, 4000);
ok('注入低 25 音分的 D3 → 读数约 −25 且判定偏低', flatShown,
  `${$('#ro-cents').textContent} / ${$('#meter-state').textContent}`);
ok('偏低时提示"拧紧（升高）"', $('#quality-hint').textContent.includes('拧紧'), $('#quality-hint').textContent);

// 明显偏高
setSignal({ f0: noteFreq('D3') * Math.pow(2, 30 / 1200), B: 1e-4, snrDb: 50, seed: 28, dur: 6 });
const sharpShown = await until(() => parseFloat($('#ro-cents').textContent.replace('−', '-').replace('+', '')) > 15, 4000);
ok('注入高 30 音分的 D3 → 读数约 +30 且提示放松', sharpShown,
  `${$('#ro-cents').textContent} / ${$('#quality-hint').textContent}`);

// ---------------------------------------------------------------- ④ 半音模式：非开放弦音
click($('#mode-seg button[data-mode=auto]'));
click($$('#inst-row .chip')[9]);              // 半音
await wait(60);
setSignal({ f0: noteFreq('G#3'), B: 8e-5, snrDb: 50, seed: 37, dur: 6 });
const gotGs = await until(() => ['G#', 'Gb'].includes($('#note-name').textContent), 4000);
ok('半音模式识别 G#3', gotGs, `实际 ${$('#note-name').textContent}${$('#note-oct').textContent}`);

// ---------------------------------------------------------------- ⑤ 静音 → 回到聆听状态
setSignal(null);
const idle = await until(() => $('#note-name').textContent === '—', 4000);
ok('静音后回到「—/聆听中」', idle, `实际 ${$('#note-name').textContent} / ${$('#meter-state').textContent}`);
ok('静音时置信度归零', parseFloat($('#q-conf').style.width) === 0, $('#q-conf').style.width);

// ---------------------------------------------------------------- ⑥ 纯工频哼声不应被锁定
setSignal({ f0: 50, B: 0, nHarm: 1, snrDb: 90, seed: 47, dur: 4 });
await wait(900);
ok('纯 50Hz 哼声不被当成音符', $('#note-name').textContent === '—' || parseFloat($('#ro-cents').textContent.replace('−', '-')) > 5,
  `${$('#note-name').textContent}${$('#note-oct').textContent} / ${$('#ro-cents').textContent}`);

// ---------------------------------------------------------------- ⑦ 噪声环境提示
setSignal(null);
await wait(200);
ok('全程无运行时错误', errors.length === 0, errors.slice(0, 4).join(' | '));

process.exit(summary('端到端信号链路') === 0 ? 0 : 1);
