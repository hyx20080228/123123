# 精调 · Android 打包工程（Capacitor）

把 `tuner/` 的 PWA 原样装进 Android 壳，产出可安装的 APK。
**不需要改写任何网页代码**：`android/` 原生工程已生成、已打补丁、已换好图标，入库可直接用。

---

## 目录

```
android-build/
├── package.json              依赖与一键脚本
├── capacitor.config.json     appId=com.jingtiao.tuner / webDir=www / 深色背景
├── scripts/
│   ├── build-www.mjs         把 tuner/ 复制成 www/（Capacitor 的 webDir）
│   ├── patch-android.mjs     给原生工程打"调音器"补丁（幂等）
│   └── make_android_assets.py 用与 PWA 相同的图形重画各密度图标/闪屏
├── ci/build-apk.yml          GitHub Actions 云构建工作流（拷到 .github/workflows 即用）
└── android/                  Capacitor 生成的原生工程（已入库，含你的图标与权限）
```

---

## 路径 A：GitHub Actions 云构建（推荐，本机零环境）

不需要装 JDK / Android Studio / SDK。

```bash
# 在仓库根目录执行一次
mkdir -p .github/workflows
cp tuner/android-build/ci/build-apk.yml .github/workflows/
git add .github && git commit -m "ci: 添加 APK 云构建" && git push
```

然后：GitHub 仓库页 → **Actions → build APK → Run workflow**（选 debug 或 release）。
约 3–5 分钟后在 **Artifacts** 下载 `jingtiao-apk`，解压得到 APK，传到手机安装即可。

> debug 包未做正式签名（用调试证书），自用完全没问题；
> 要对外分发请按下面「签名发布版」配置 Secrets 后跑 release。

---

## 路径 B：本机构建

环境：**Node ≥ 20**、**JDK 17**、**Android SDK**（装 Android Studio 即自带，SDK Platform 35）。

```bash
cd tuner/android-build
npm install          # 首次
npm run build        # tuner/ → www/
npx cap sync android # www/ → android 资源
npm run apk          # = cd android && ./gradlew assembleDebug
```

产物：`android/app/build/outputs/apk/debug/app-debug.apk`

首次跑 Gradle 会下载依赖（几百 MB，几分钟）。国内网络慢可加镜像：
在 `android/settings.gradle` 的 `repositories` 前加阿里云 maven，或设置
`ANDROID_HOME` 后用 `sdkmanager --proxy` 等，略。

改了网页代码后重新出包：`npm run sync && npm run apk`。

## 路径 C：Android Studio

```bash
cd tuner/android-build && npm install && npm run sync && npx cap open android
```

在 Android Studio 里 **Build → Build APK(s)**，或右上角运行到真机。

---

## 签名发布版（对外分发 / 上架）

```bash
# 1) 生成 keystore（妥善保管，丢失即无法升级覆盖安装）
keytool -genkeypair -v -keystore app.keystore -alias jingtiao \
        -keyalg RSA -keysize 2048 -validity 10000

# 2) 在 android-build/ 下写 keystore.properties（已被 .gitignore 忽略，绝不入库）
cat > keystore.properties <<EOF
storeFile=/绝对路径/app.keystore
storePassword=你的密码
keyAlias=jingtiao
keyPassword=你的密码
EOF

# 3) 出 release 包（build.gradle 已接线：有 keystore.properties 就用它签名）
npm run apk:release
```

`patch-android.mjs` 已把签名逻辑写进 `android/app/build.gradle`：
存在 `keystore.properties` → 用它签 release；不存在 → 回退 debug 签名（仅自测）。

云构建签名：把 keystore 做 base64（`base64 -w0 app.keystore`）存入仓库
Secrets `KEYSTORE_B64`，另配 `KEYSTORE_PASSWORD` / `KEY_ALIAS` / `KEY_PASSWORD`，
workflow 会自动还原并签名。

版本号在 `android/app/build.gradle` 的 `versionCode` / `versionName`（升级必须递增 versionCode）。

---

## 这个壳为"调音"做了什么（patch-android.mjs，幂等可重跑）

| 补丁 | 原因 |
|------|------|
| Manifest 声明 `RECORD_AUDIO` / `MODIFY_AUDIO_SETTINGS` | Capacitor 的 `BridgeWebChromeClient.onPermissionRequest()` 在 WebView 请求麦克风时**自动弹出运行时授权并授予**（已核对 @capacitor/android 8.x 源码），但 Manifest 不声明就会被系统直接拒绝 |
| Manifest 声明 `WAKE_LOCK` / `VIBRATE` | 调音时震动的硬件反馈 |
| activity `screenOrientation=portrait` | 调音界面是竖屏布局 |
| `MainActivity` 加 `FLAG_KEEP_SCREEN_ON` | WebView 不支持 `navigator.wakeLock`，用窗口标志兜底保证调音时不熄屏 |
| 应用名「精调」、自适应图标背景色 `#0B0E13` | 与 App 深色底一致 |
| 各密度 `ic_launcher*` / `splash.png` 重画 | 与 PWA 图标同一套图形（`make_android_assets.py` 按模板实际尺寸重绘，不猜尺寸） |

另外 `app.js` 检测到 Capacitor 环境时**不注册 Service Worker**（资源已内置在 APK 里，
再叠 SW 只会让升级读到旧缓存）；WebView 以 `https://` scheme 加载，属安全上下文，
麦克风约束（关闭系统降噪/AGC）与 PWA 版完全一致。

---

## 小米 / HyperOS 安装与使用注意

1. 安装：把 APK 传到手机后用文件管理器打开，允许「安装未知应用」。
   （云构建的 debug 包与自签 release 包都走这条路。）
2. 首次启动会弹麦克风授权 —— 必须允许，否则无法调音。
3. 建议把本 App 加入**电池优化白名单**（设置 → 应用 → 省电策略 → 无限制），
   避免后台被冻结影响实时音频。
4. 若在「设置 → 麦克风诊断」里看到"系统降噪仍然开启"，到
   设置 → 声音 → 通话/录音降噪 里关闭相关项（HyperOS 个别版本对 WebView 音频链仍会介入）。

---

## 常见问题

- **`npx cap sync` 报 webDir 不存在**：先 `npm run build`。
- **改了图标/闪屏想重画**：`npm run art`（需要 pillow）。
- **Gradle 报 SDK 版本**：`android/variables.gradle` 里调 `compileSdkVersion` / `targetSdkVersion`。
- **想换包名**：改 `capacitor.config.json` 的 `appId` 后重新 `npx cap add android`（会重建 android/，需重跑 `npm run patch && npm run art`）。
- **APK 装上了但麦克风没声音**：看 App 内「设置 → 📊 麦克风诊断」，它会列出实际生效的
  采样率与系统处理开关。
