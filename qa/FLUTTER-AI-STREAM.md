# Flutter 流式对话验收与取舍

日期：2026-11-17。本轮仅接入移动端对话，沿用现有服务端及本地私有模型配置。

## 演示路径

启动本地 Web 服务并安装本轮调试包，在逐小时预报旁打开问天气。输入“今天广州天气怎样”，观察输入清空、处理阶段和逐字显示，再问“出门穿什么衣服”“明天下午呢”。点击依据核对广州及 `Asia/Shanghai`。接着输入“首尔和台北明天早上 7–9 点，哪里更容易下雨？”，追问“那下午呢？”和“哪个更冷？”，点击台北依据查看对应城市和时间。生成期间可输入下一条草稿并点击停止，草稿保留；失败或停止后可手动重试。第一次提问后不再显示推荐问题，关闭再打开保留当前会话。

## 实现位置

- `mobile/pubspec.yaml`、`pubspec.lock`：固定 `ai_ui_stream: 1.0.1`，使用 `characters` 处理 Unicode 字素。
- `mobile/lib/weather_chat.dart`：`ChatController`、`HttpChatTransport`、阶段事件、历史、错误映射、取消、45 秒请求上限、手动重新生成、409 上下文版本刷新及结果校验。HTTP 客户端由 `WeatherApi` 持有，对话销毁不会关闭天气请求共用的客户端。
- `mobile/lib/questions.dart`：历史区和固定输入区、发送清空、编辑后不覆盖的新草稿、停止按钮、首次推荐、逐字显示及每条回答自己的城市／快照依据。
- `mobile/lib/main.dart`：在当前地点、语言及服务地址下保留会话；打开其他上下文时建立新会话。当前地点的有效小时依据返回首页并定位；其他城市或旧快照打开独立详情。
- `mobile/lib/locale.dart`：四语阶段、停止、重试及提示文案。
- `mobile/test/weather_chat_test.dart`、`comparison_test.dart`、`widget_test.dart`：协议、状态和界面回归；`integration_test/chat_stream_test.dart`：原生 HTTP SSE 专项。原主流程脚本改为在历史对话中手动输入追问。

## 与 Web 的共同协议与取舍

采用 [ai_ui_stream](https://pub.dev/packages/ai_ui_stream) 读取与 Web Vercel AI SDK 相同的 [UI Message Stream v1](https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol)。请求发到现有 `/api/ask`，带 `Accept: text/event-stream`；处理 `data-phase`、文本片段和 `data-weather`，包括 HTTP JSON 错误与 SSE 内错误。不更换模型、不在 App 放密钥、不增加用于润色或打字效果的模型调用。

服务端仍先验证意图、城市、时区和天气版本并计算数值，客户端再展示结果。这意味着初始等待时显示处理阶段，最终文本到达后在本地逐字显示；不提前展示尚未校验的模型内容。每 24 毫秒按字素推进，长文本约 6 秒内显示完，尊重减少动态效果设置。停止会中断请求并冻结已显示文字，未完成的回答隐藏依据。完整结果已经校验但显示尚未结束时停止，保留可用于追问的完整上下文；该回答仍按停止状态隐藏依据，与 Web 保持一致。

SDK 管理界面历史，但请求体只提交问题、当前坐标、版本及单城／双城上下文，避免反复上传完整历史及各轮天气快照。无隐式重试；用户点重试才增加一次问答请求。409 刷新去重后的当前／上下文城市版本，保持日期锚点后重新生成。关闭页面或停止刷新后，不再触发迟到的问答请求。

历史保存在当前应用进程内，不额外持久化问答正文；重新启动应用会新建对话。会话与服务地址、页面城市、语言绑定；不同上下文不复用历史。已授权使用的服务端凭据仍在根目录忽略的 `.env.ai.local`，移动端只有服务地址。

## 测试过程与边界

`flutter pub get` 成功；`flutter doctor -v` 确认可用 Flutter 3.38.9、Dart 3.10.8、Android 模拟器和 Xcode。工具链提示非标准 Flutter 分支、PATH、旧 Android SDK 许可证查询和缺少 Chrome；这些提示不等于原生构建失败。Android 构建复用已有 JDK 21 与专用 Gradle 缓存，避免重新下载本机已具备的依赖。

首次接入出现逐字步长的 `num`／`int` 编译错误，已修复。SSE 在 `[DONE]` 处取消上游流时，Widget 虚拟时钟不能单独完成真实事件循环上的收尾，现通过测试辅助函数短暂让出事件循环，并保留纯 SDK 和控制器完成状态用例。真实时钟用例也单独通过，产品逻辑无需绕过 SDK。

Android 自动化最初失败于真实 IME 焦点切换覆盖合成输入。专项改用 Flutter 测试输入通道，仍在原生 App 中走真实 HTTP 与 SDK；不把合成输入写成实体键盘或真实设备验收。阶段等待和网络停止采用可控服务器闸门，避免以固定睡眠猜测请求进度。失败日志与最终日志一并保留。

全量 `flutter test -r expanded` 已通过 42 项，覆盖 UTF-8 跨字节分片、Unicode 字素、阶段事件、网络结束后的本地停止、迟到分片、断流、HTTP／SSE 429、单城／双城 409、日期锚点、45 秒超时、停止刷新、四语草稿、关闭重开和城市依据。`flutter analyze` 无问题。原始日志在 `qa/evidence/flutter-ai-stream-tests.log`、`flutter-ai-stream-analyze.log`，失败样本保存在 `flutter-ai-stream-sdk-clock-failure.log`、`flutter-ai-stream-android-ime-failure.log`。

Android 17（API 37）`sdk gphone64 arm64` 模拟器四语专项 4/4 通过，每语种 6 次实际回环 HTTP SSE 请求，共 24 次，外部模型调用 0 次。覆盖五轮单城／双城对话、台北依据详情和第六次在途停止；控制器用例另验证 abort 信号和共用客户端不被关闭。受控服务器没有记录到连接错误，因此不将服务器 `disconnected: 0` 写成已观察到上游模型取消。

Android 另连接运行中的 `http://10.0.2.2:3300`，以真实 `gpt-6-luna` 走完上述六轮广州／首尔／台北对话，六轮全部 `source: model`，依据详情通过。服务端日志确认模型调用 **6 次**、均为 200，HTTP 等待分别 **4028、2267、1718、1830、2315、1556 毫秒**，中位数 **2048.5 毫秒**。该耗时来自 `plannerRequest` 的上游响应头等待，不含天气、搜城、完整响应体或本地逐字显示；单城响应未带 `modelMs` 时使用服务端追踪，不将空值当作 0。观察窗口为 2026-11-17 14:41:26–14:42:04（Asia/Shanghai）。证据：`flutter-ai-stream-android-model.log`、`flutter-ai-stream-model-trace.json`。本轮未重复进行其他任务已通过的 Web 模型调用。

## 构建和原生结果

iOS 26.5、iPhone Air arm64 模拟器四语专项 **4/4**，每语种 6 次实际回环 HTTP SSE 请求，共 24 次，外部模型调用 0 次。证据：`qa/evidence/flutter-ai-stream-ios-fixture.log`。两平台合计 48 次受控 SSE 请求；Android 的六轮真实模型另记，不与规则样本混算。

本机执行命令如下，`FLUTTER_BIN` 指向本机已有 Flutter。Android 命令执行前设置 `GRADLE_USER_HOME=/Users/yzin/Documents/Codex/2026-11-16/weather-atlas-24-24-readme-md/work/gradle-weather-atlas`、`JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home`；构建进程使用 `JAVA_TOOL_OPTIONS='-Dhttp.proxyHost= -Dhttps.proxyHost= -DsocksProxyHost= -Djava.net.useSystemProxies=false'`，不修改系统代理或工程配置。

```sh
cd /Users/yzin/code/weather-atlas/mobile
export FLUTTER_BIN=/Users/yzin/Documents/Codex/2026-11-16/weather-atlas-24-24-readme-md/work/flutter/bin/flutter
"$FLUTTER_BIN" pub get
"$FLUTTER_BIN" doctor -v
"$FLUTTER_BIN" analyze
"$FLUTTER_BIN" test -r expanded
"$FLUTTER_BIN" test integration_test/chat_stream_test.dart -d emulator-5554 --no-pub
"$FLUTTER_BIN" test integration_test/chat_stream_test.dart -d emulator-5554 --no-pub --dart-define=LIVE_CHAT=true --dart-define=WEATHER_API_BASE=http://10.0.2.2:3300
"$FLUTTER_BIN" test integration_test/chat_stream_test.dart -d 23AB3E1A-4C30-462C-943C-B9CB5B894E96 --no-pub
"$FLUTTER_BIN" build apk --debug --no-pub --target lib/main.dart --dart-define=WEATHER_API_BASE=http://10.0.2.2:3300
"$FLUTTER_BIN" build ios --simulator --debug --no-pub --target lib/main.dart --dart-define=WEATHER_API_BASE=http://127.0.0.1:3300
```

最后一条多架构模拟器构建遇到本机 Flutter 的架构检查错误：二进制实际包含 `arm64 x86_64`，检查却将两者视为一个架构名。保留该失败，不改 Flutter SDK 或项目架构配置；沿用刚生成的普通入口配置，显式构建本机可验证的 arm64 模拟器版本：

```sh
xcrun xcodebuild -quiet -workspace ios/Runner.xcworkspace -scheme Runner -configuration Debug -sdk iphonesimulator -destination id=23AB3E1A-4C30-462C-943C-B9CB5B894E96 -derivedDataPath build/ios-ai-stream ARCHS=arm64 ONLY_ACTIVE_ARCH=YES build
```

该构建成功，`Runner.app` 为 arm64、ad-hoc 签名，已通过 `simctl install` 和 `simctl launch`。Android 普通入口 APK 重新构建成功，版本 `1.1.2+4`，`apksigner verify --print-certs` 验证为 Android Debug 签名，`adb install -r` 升级成功。版本号沿用现有工作区版本，本轮通过单独产物名称区分，未改动其他任务的发布版本。最终产物不包含集成测试入口。归档检查同步增加 `chat_stream_test.dart`，防止之后把测试构建误当作安装包；`node --test qa/test/archives.test.ts` 的 9 项检查通过。

交付目录：`/Users/yzin/Documents/Codex/2026-11-16/weather-atlas-24-24-readme-md/outputs/v1.1.2-flutter-ai-stream`。

- `Weather-Atlas-Source-v1.1.2-flutter-ai-stream.zip`：当前工作区源码、测试、文档和证据，保留原有修改，排除密钥、依赖缓存和构建目录。
- `Weather-Atlas-Android-AI-Stream-Debug-v1.1.2.apk`：普通应用入口，默认 `http://10.0.2.2:3300`。
- `Weather-Atlas-iOS-AI-Stream-Simulator-arm64-Debug-v1.1.2.app.zip`：普通应用入口，默认 `http://127.0.0.1:3300`。仅适用于 arm64 iOS 模拟器，不能直接安装到真机。

同目录 `DELIVERY-MANIFEST.json` 和 `ARTIFACT-VERIFICATION.json` 保存字节数、SHA-256、CRC、入口和实际模型密钥排除检查；本轮报告与原始日志另复制到 `qa/`。安装包、源码包均以本轮交付清单为准，不覆盖其他任务的交付目录。

普通入口安装后的 [Android 对话输入区](evidence/flutter-ai-stream-android-composer.png) 已实看，英文长推荐问题完整换行；[iOS 普通首页](evidence/flutter-ai-stream-ios-home.png) 已核对安装启动、主题和天气显示。对话协议与连续追问结果以对应原生专项日志为准。

运行中的 Web 保持 `http://localhost:3300`，Android 真机可在应用「天气服务地址」设置同一局域网可达的 `http://192.168.5.22:3300`；iOS 真机需另行签名构建并选择可达的服务地址。本轮无实体设备键盘／触控或 iOS 真机签名验收，未将模拟器和合成输入结果提升为这些验收。服务端继续使用已有本地私有配置。重新启动 Web 可按根目录现有说明，或在已有生产构建下执行：

```sh
cd /Users/yzin/code/weather-atlas/web
node --env-file-if-exists=../.env.ai.local node_modules/next/dist/bin/next start --hostname 0.0.0.0 --port 3300
```

本机若需要代理访问上游，保留原启动环境中的 `NODE_USE_ENV_PROXY`、`HTTP_PROXY`、`HTTPS_PROXY`、`NO_PROXY`。本轮移动端接入不要求重启或替换 Web 构建。
