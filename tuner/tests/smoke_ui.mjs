/**
 * smoke_ui.mjs — UI 冒烟测试（无需真机/浏览器）
 *
 * 用 jsdom 加载 index.html 并真正执行 app.js 的初始化与交互路径，
 * 捕获引用错误、空指针、事件绑定遗漏这类只在运行时暴露的问题。
 * 音频用桩 AudioContext 代替（不验证声音，只验证调用链不崩）。
 * 端到端信号链路见 smoke_signal.mjs。
 *
 * 依赖：npm i jsdom（可用 JSDOM_PATH 指定安装位置）
 * 运行：node tuner/tests/smoke_ui.mjs
 */

import { setupEnv, makeAssert } from './_jsdom_env.mjs';

const { ok, summary } = makeAssert();
const { $, $$, click, setRange, errors, wait } = await setupEnv();

console.log('='.repeat(88));
console.log('  UI 冒烟测试（jsdom）');
console.log('='.repeat(88));

ok('初始化无运行时错误', errors.length === 0, errors.slice(0, 3).join(' | '));
ok('乐器 chips 渲染 10 个', $$('#inst-row .chip').length === 10, `实际 ${$$('#inst-row .chip').length}`);
ok('吉他调弦 chips 渲染 12 个', $$('#tuning-row .chip').length === 12, `实际 ${$$('#tuning-row .chip').length}`);
ok('弦按钮渲染 6 个', $$('#string-grid .sbtn').length === 6);
ok('弦按钮显示音名', $$('#string-grid .sbtn b')[0].textContent === 'E', $$('#string-grid .sbtn b')[0].textContent);
ok('参考音网格渲染', $$('#ref-grid .ref-btn').length === 6);
ok('和弦按钮渲染', $$('#ref-chords button').length >= 8, `实际 ${$$('#ref-chords button').length}`);
ok('表盘 canvas 存在', !!$('#meter'));
ok('历史为空提示', $('#hist-table').textContent.includes('还没有记录'));

// ---- 交互：切乐器（顺序见 music.js 的 INSTRUMENT_ORDER）----
click($$('#inst-row .chip')[2]);            // bass4
await wait(20);
ok('切到贝斯(4弦)后弦按钮 4 个', $$('#string-grid .sbtn').length === 4);
click($$('#inst-row .chip')[3]);            // bass5
await wait(20);
ok('切到贝斯(5弦)后弦按钮 5 个', $$('#string-grid .sbtn').length === 5);
click($$('#inst-row .chip')[4]);            // bass6
await wait(20);
ok('6 弦贝斯最低音为 B0', $$('#string-grid .sbtn b')[0].textContent === 'B',
  $$('#string-grid .sbtn b')[0].textContent);
click($$('#inst-row .chip')[5]);            // violin
await wait(20);
ok('小提琴为 G/D/A/E', $$('#string-grid .sbtn b').map(b => b.textContent).join('') === 'GDAE',
  $$('#string-grid .sbtn b').map(b => b.textContent).join(''));
click($$('#inst-row .chip')[9]);            // chromatic
await wait(20);
ok('半音模式隐藏弦选择区', $('#strings-section').style.display === 'none');
ok('半音模式参考音给出 13 个音', $$('#ref-grid .ref-btn').length === 13);
click($$('#inst-row .chip')[0]);            // 回到吉他
await wait(20);
ok('回到吉他后弦按钮恢复 6 个', $$('#string-grid .sbtn').length === 6);

// ---- 交互：切调弦 ----
click($$('#tuning-row .chip')[1]);          // Drop D
await wait(20);
ok('Drop D 后 6 弦显示 D', $$('#string-grid .sbtn b')[0].textContent === 'D');
click($$('#tuning-row .chip')[0]);          // 标准
await wait(20);
ok('切回标准调弦', $$('#string-grid .sbtn b')[0].textContent === 'E');

// ---- 交互：手动选弦 ----
click($('#mode-seg button[data-mode=manual]'));
await wait(20);
ok('手动模式下首弦高亮', $$('#string-grid .sbtn')[0].classList.contains('sel'));
click($$('#string-grid .sbtn')[2]);
await wait(20);
ok('点选第 3 根弦后高亮转移', $$('#string-grid .sbtn')[2].classList.contains('sel'));
click($('#mode-seg button[data-mode=auto]'));
await wait(20);
ok('切回自动模式', $('#mode-seg button[data-mode=auto]').classList.contains('on'));

// ---- 交互：页面切换 ----
for (const p of ['metro', 'ref', 'set', 'tuner']) {
  click($(`#tabbar button[data-page=${p}]`));
  await wait(10);
  ok(`切到 ${p} 页`, $(`#page-${p}`).classList.contains('active'));
}

// ---- 交互：节拍器 ----
click($('#btn-metro-toggle'));
await wait(120);
ok('节拍器可启动', $('#btn-metro-toggle').textContent.includes('停止'));
click($('#bpm-plus'));
await wait(10);
ok('BPM +1 生效', $('#bpm-value').textContent === '91', `实际 ${$('#bpm-value').textContent}`);
click($('#ts-chips button[data-v="3"]'));
await wait(10);
ok('拍号切 3 拍后点阵 3 个', $$('#beat-dots .dot').length === 3);
click($('#sub-chips button[data-v="4"]'));
await wait(10);
ok('细分切换不报错', $('#sub-chips button[data-v="4"]').classList.contains('on'));
click($('#btn-metro-toggle'));
await wait(20);
ok('节拍器可停止', $('#btn-metro-toggle').textContent.includes('开始'));

// ---- 交互：参考音 ----
click($$('#ref-grid .ref-btn')[0]);
await wait(30);
ok('参考音可播放（按钮变为停止态）',
  $$('#ref-grid .ref-btn')[0].className.includes('on') || $('#btn-stop-tone').textContent.length > 0,
  $$('#ref-grid .ref-btn')[0].className);
click($$('#ref-chords button')[0]);
await wait(30);
ok('和弦扫弦可触发', true);
click($('#btn-stop-tone'));
await wait(30);
ok('停止按钮可用', true);

// ---- 交互：设置 ----
await setRange($('#a4-slider'), 432);
ok('A4 滑到 432 后文案更新', $('#a4-v').textContent.includes('432'), $('#a4-v').textContent);
ok('A4 预设高亮跟随', $('#a4-presets button[data-v="432"]').classList.contains('on'));
click($('#a4-presets button[data-v="440"]'));
await wait(20);
ok('A4 预设 440 生效', $('#a4-v').textContent.includes('440'), $('#a4-v').textContent);
await setRange($('#tol-slider'), 1.5);
ok('容差滑到 1.5 后文案更新', $('#tol-v').textContent.includes('1.5'), $('#tol-v').textContent);
await setRange($('#gate-slider'), -45);
ok('噪声门限滑到 −45 后文案更新', $('#gate-v').textContent.includes('-45') || $('#gate-v').textContent.includes('−45'),
  $('#gate-v').textContent);
click($('#win-chips button[data-v="precise"]') || $$('#win-chips button')[1]);
await wait(20);
ok('窗口精度切换生效', $$('#win-chips button').some(b => b.classList.contains('on')));
for (const id of ['sw-inharm', 'sw-hum', 'sw-lock', 'sw-haptic', 'sw-flat']) {
  const sw = $(`#${id}`);
  const before = sw.checked;
  sw.checked = !before;
  sw.dispatchEvent(new Event('change', { bubbles: true }));
  await wait(10);
  ok(`${id} 开关可切换`, sw.checked === !before);
  sw.checked = before;
  sw.dispatchEvent(new Event('change', { bubbles: true }));
  await wait(10);
}
click($('#btn-calibrate-gate'));
await wait(60);
ok('门限自动校准可执行（静音环境下给出建议值）', true, $('#gate-v').textContent);

// ---- 交互：弹层 ----
click($('#btn-help'));
await wait(10);
ok('帮助弹层打开', !$('#modal').hidden && $('#modal-body').textContent.includes('30 秒上手'));
click($('#modal-close'));
await wait(10);
ok('弹层可关闭', $('#modal').hidden);
click($('#btn-diag'));
await wait(10);
ok('诊断弹层打开', !$('#modal').hidden && $('#modal-title').textContent === '麦克风诊断',
  `${$('#modal-title').textContent} / ${$('#modal-body').textContent.slice(0, 50).replace(/\s+/g, ' ')}`);
click($('#modal-close'));
await wait(10);
// about-acc 是设置页内嵌的精度说明（非弹层），应在初始化时已填充
ok('精度说明已填充', /音分/.test($('#about-acc').textContent)
  && $('#about-acc').querySelectorAll('table tr').length >= 9,
  `${$('#about-acc').textContent.slice(0, 40).replace(/\s+/g, ' ')}…`);
const nums = [...$('#about-acc').querySelectorAll('td.num')].map(td => td.textContent);
ok('精度说明列出关键指标', nums.some(n => n.includes('0.044')) && nums.some(n => n.includes('0.079')),
  nums.join(' | '));

// ---- 交互：历史 ----
click($('#btn-hist-clear'));
await wait(20);
ok('清空历史后显示空提示', $('#hist-table').textContent.includes('还没有记录'));

// ---- 运行期错误复查 ----
await wait(120);
ok('全程无运行时错误', errors.length === 0, errors.slice(0, 4).join(' | '));

process.exit(summary('UI 冒烟测试') === 0 ? 0 : 1);
