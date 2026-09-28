/**
 * patch-android.mjs — 给 `npx cap add android` 生成的原生工程打上"调音器"所需的补丁
 *
 * 为什么需要它：Capacitor 模板默认【不声明麦克风权限】。而 Capacitor 的
 * BridgeWebChromeClient.onPermissionRequest() 在 WebView 请求 AUDIO_CAPTURE 时，
 * 会自动替我们发起 RECORD_AUDIO / MODIFY_AUDIO_SETTINGS 的运行时授权弹窗并授予
 * （已核对 @capacitor/android 8.x 源码），因此无需任何额外插件，
 * 但 Manifest 里必须先声明这两个权限，否则运行时申请会直接被系统拒绝。
 *
 * 补丁内容（全部幂等，可重复运行）：
 *  1. AndroidManifest.xml：声明 RECORD_AUDIO / MODIFY_AUDIO_SETTINGS / WAKE_LOCK / VIBRATE
 *  2. AndroidManifest.xml：activity 固定竖屏（调音界面是竖屏布局）
 *  3. MainActivity.java：调音期间保持屏幕常亮（WebView 不支持 navigator.wakeLock）
 *  4. values/strings.xml：应用名「精调」
 *  5. values/ic_launcher_background.xml：自适应图标背景色与 App 深色底一致
 *  6. app/build.gradle：release 签名接线 —— 若存在 keystore.properties 则用它签名；
 *     不存在时回退 debug 签名（保证本地也能出可安装的 release 包，仅自测用）
 *
 * 运行：npm run patch
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ANDROID = path.resolve(here, '..', 'android');
const APP = path.join(ANDROID, 'app', 'src', 'main');

if (!existsSync(path.join(ANDROID, 'settings.gradle'))) {
  console.error('  ✗ 还没有 android/ 工程。请先运行：npm run add:android');
  process.exit(1);
}

const BG = '#0B0E13';
const APP_NAME = '精调';
let changed = 0;

const editFile = (p, fn) => {
  const label = path.relative(path.resolve(here, '..'), p);
  if (!existsSync(p)) { console.warn(`  ! 跳过（不存在）：${label}`); return; }
  const before = readFileSync(p, 'utf8');
  const after = fn(before);
  if (after !== before) {
    writeFileSync(p, after);
    changed++;
    console.log(`  ✓ 已修补 ${label}`);
  } else {
    console.log(`  = ${label} 已是目标状态`);
  }
};

const edit = (rel, fn) => editFile(path.join(APP, rel), fn);

// ------------------------------------------------ 1+2. Manifest
edit('AndroidManifest.xml', s => {
  let out = s;
  if (!out.includes('android.permission.RECORD_AUDIO')) {
    const perms = [
      '<!-- 精调：调音所需权限（麦克风；Capacitor 会自动弹出运行时授权） -->',
      '<uses-permission android:name="android.permission.RECORD_AUDIO" />',
      '<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />',
      '<uses-permission android:name="android.permission.WAKE_LOCK" />',
      '<uses-permission android:name="android.permission.VIBRATE" />',
    ].map(l => `    ${l}`).join('\n');
    out = out.replace('</manifest>', `${perms}\n</manifest>`);
  }
  if (!out.includes('android:screenOrientation')) {
    out = out.replace(/(<activity\b[^>]*?)android:exported="true"/,
      '$1android:exported="true"\n            android:screenOrientation="portrait"');
  }
  return out;
});

// ------------------------------------------------ 3. MainActivity 屏幕常亮
edit(path.join('java', 'com', 'jingtiao', 'tuner', 'MainActivity.java'), s => {
  if (s.includes('FLAG_KEEP_SCREEN_ON')) return s;
  let out = s;
  if (!out.includes('import android.view.WindowManager;')) {
    out = out.replace(/import com\.getcapacitor\.BridgeActivity;/,
      'import android.os.Bundle;\nimport android.view.WindowManager;\n\nimport com.getcapacitor.BridgeActivity;');
  }
  if (/onCreate\s*\(/.test(out)) {
    out = out.replace(/(onCreate\s*\([^)]*\)\s*\{\s*super\.onCreate\([^)]*\);)/,
      '$1\n        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);');
  } else {
    out = out.replace(/public class MainActivity extends BridgeActivity \{\s*\}/,
      `public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // 调音时屏幕常亮：WebView 不支持 navigator.wakeLock，用窗口标志兜底
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }
}`);
  }
  return out;
});

// ------------------------------------------------ 4. 应用名
edit(path.join('res', 'values', 'strings.xml'), s => s
  .replace(/(<string name="app_name">)[^<]*(<\/string>)/, `$1${APP_NAME}$2`)
  .replace(/(<string name="title_activity_main">)[^<]*(<\/string>)/, `$1${APP_NAME}$2`));

// ------------------------------------------------ 5. 自适应图标背景色
edit(path.join('res', 'values', 'ic_launcher_background.xml'), s => s
  .replace(/(<color name="ic_launcher_background">)[^<]*(<\/color>)/, `$1${BG}$2`));

// ------------------------------------------------ 6. release 签名接线
editFile(path.join(ANDROID, 'app', 'build.gradle'), s => {
  if (s.includes('signingConfig signingConfigs.release')) return s;
  const SIGNING = [
    '    signingConfigs {',
    '        release {',
    '            def p = new Properties()',
    '            def kf = rootProject.file("../keystore.properties")',
    '            if (kf.exists()) {',
    '                kf.withInputStream { p.load(it) }',
    '                storeFile file(p.storeFile)',
    '                storePassword p.storePassword',
    '                keyAlias p.keyAlias',
    '                keyPassword p.keyPassword',
    '            } else {',
    '                // 未配置签名材料：回退 debug 签名，保证本地也能出可安装的 release 包（仅自测）',
    '                initWith signingConfigs.debug',
    '            }',
    '        }',
    '    }',
    '',
    '    buildTypes {',
  ].join('\n');
  let out = s.replace('\n    buildTypes {', '\n' + SIGNING);
  out = out.replace('    buildTypes {\n        release {\n',
    '    buildTypes {\n        release {\n            signingConfig signingConfigs.release\n');
  return out;
});

console.log(`\n  patch-android 完成：修改 ${changed} 个文件`);
console.log('  接下来：npm run art && npm run sync');
