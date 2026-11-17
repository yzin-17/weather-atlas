# Flutter 右下角问答入口

日期：2026-11-17。

## 实现与体验

截图中逐小时标题旁的问答入口移到页面右下角，随页面滚动保持固定。采用与 Web 相同的 `#28523d` 背景、白色星芒、四语短标签、52 高度和浅阴影；复用既有会话打开逻辑，点击进入对话，返回后仍可继续使用。

- `mobile/lib/weather_ask_button.dart`：封装入口视觉，使用 Web 同一星芒路径绘制图标，横向内边距 20、图文间距 9，使用 Web 的透明度和偏移绘制浅阴影。
- `mobile/lib/main.dart`：通过 `Scaffold.floatingActionButton` 固定在右下角，遵循 Flutter 底部安全区；列表末尾预留 104 高度，方便将末尾操作滚到浮动入口上方。逐小时标题保留依据跳转锚点。
- `mobile/lib/locale.dart`：短标签分别为“问天气”“問天氣”“Ask weather”“날씨 질문”，完整提示供辅助功能使用。有可用预报时展示入口。

## 验证结果

| 命令／操作 | 结果 | 证据 |
| --- | --- | --- |
| `cd mobile && flutter test` | 全量 79 项通过，包含新增四语入口交互 | `qa/evidence/flutter-ask-launcher-test.log` |
| 阴影微调后 `flutter test test/weather_ask_launcher_test.dart` | 四语 4 项再次通过 | `flutter-ask-launcher-targeted.log` |
| `flutter analyze` | 无问题 | `flutter-ask-launcher-analyze.log` |
| 下述 iOS 构建命令 | 构建成功，`1.1.2+5`、arm64 Debug 模拟器应用 | `flutter-ask-launcher-ios-config.log`、`flutter-ask-launcher-ios-build-final.log` |
| 安装并启动 iPhone Air，iOS 26.5 | 普通应用显示成都天气，右下角入口、文字、星芒与浅阴影可见 | `flutter-ask-launcher-installed.json`、`flutter-ask-launcher-native.png` |

简写日志均位于 `qa/evidence/`。四语交互使用 390×844 视口和底部 34 安全区，检查右下角位置、滚动后位置保持、点击打开对话、返回恢复入口、无布局异常，以及打开入口不增加天气或模型调用。本轮未发送真实模型请求。

构建命令，在 `mobile/` 执行：

```sh
flutter build ios --simulator --debug --config-only --target lib/main.dart \
  --dart-define=WEATHER_API_BASE=http://127.0.0.1:3300
xcrun xcodebuild -quiet -workspace ios/Runner.xcworkspace -scheme Runner \
  -configuration Debug -sdk iphonesimulator \
  -destination id=23AB3E1A-4C30-462C-943C-B9CB5B894E96 \
  -derivedDataPath build/ios-ask-launcher ARCHS=arm64 ONLY_ACTIVE_ARCH=YES \
  FLUTTER_TARGET=lib/main.dart FLUTTER_BUILD_DIR=build/ask-launcher-normal build
```

当前安装产物：`/Users/yzin/code/weather-atlas/mobile/build/ios-ask-launcher/Build/Products/Debug-iphonesimulator/Runner.app`。连接现有 HTTP 服务 `http://127.0.0.1:3300`；此产物供 arm64 iOS 模拟器使用，不能安装到实体 iPhone。本轮未另做 Android 构建。

## 过程取舍

1. 对齐 Web 的入口视觉，同时采用 Flutter 原生浮动入口的安全区和触控反馈；图标直接绘制，没有为单个图标引入额外依赖。底部预留滚动空间，让列表末尾仍可操作。
2. 原生运行画面发现默认 Material 阴影明显重于 Web，因此替换为与 Web 相同参数的浅阴影，并复测四语专项和重建应用。截图最终来自 iPhone Air 模拟器，不代表真机或性能验收。
3. 首轮新增测试使用 `tester.pageBack()`，其查找英文返回提示导致三种非英文用例失败；改为点击实际的 `BackButton`，全量通过。保留 `flutter-ask-launcher-test-first-failure.log`。
4. 单元测试结束后才构建普通入口，明确 `lib/main.dart` 和独立 Flutter 构建目录，避免测试入口混入可运行应用。沿用现有应用版本号，安装记录和截图区分本轮产物。
