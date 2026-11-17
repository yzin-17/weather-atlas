# Flutter 城市名称恢复、原生验证与交付

日期：2026-11-17（Asia/Shanghai）。承接 [共享服务与 Web 名称恢复](reverse-recovery.md)，本轮补齐 Flutter 自动重试和“重新识别城市”。

## 五分钟演示

1. 安装本轮 Android 调试包，或运行本轮 iOS 模拟器应用。Android 模拟器服务为 `http://10.0.2.2:3300`，iOS 模拟器为 `http://127.0.0.1:3300`；Android 真机在「天气服务地址」填写同一局域网的 `http://192.168.5.22:3300`。
2. 从搜索进入地图，确认一个坐标点。名称解析与天气并行；首次识别期间显示四语识别文案，失败后保留区域／坐标、可用预报和“重新识别城市”。按钮在请求中禁用并显示进度，成功后消失。切语言不重取有效天气。
3. 可复查的故障演示使用下方 `integration_test/reverse_recovery_test.dart`：自动完成四语临时故障恢复、无覆盖后点击按钮、在途禁用、三次请求上限、恢复入口和切城取消。它在模拟器内使用真实 HTTP、受控名称与天气，最后另外连接当前真实服务，验证截图坐标 `30.7513,106.2048` 显示“高坪区”。首次编译时间另计。

## 实现与取舍

| 位置 | 行为与边界 |
| --- | --- |
| `mobile/lib/data.dart` | 增加 `ReverseLookup`，保留现有 `reverse()` 调用兼容性。解析 `retryAfterMs` 并限制在 1–10 秒；合法空结果无退避时视为无覆盖，异常结构触发临时故障处理。单次请求超时仍为 8.5 秒。 |
| `mobile/lib/controller.dart` | 当前坐标名称临时失败后最多自动重试两次，总计最多三次。遵守服务端退避；传输、解析、超时、408／429／5xx 默认退避五秒，其他 4xx 不自动重试。真实空覆盖不轮询；共享服务仍控制五秒故障退避、五分钟无覆盖缓存和跨实例上游频率。 |
| `mobile/lib/controller.dart` | 独立维护名称请求、失败与定时器。切城、切语言、切服务地址或销毁取消排队重试；令牌、选择意图、地址、语言与地点身份共同隔离迟到结果。成功名称更新当前点及已有收藏、持久化名称，保持原坐标、收藏身份、天气快照及分享链接坐标。 |
| `mobile/lib/main.dart`、`locale.dart` | 四语识别状态、失败后的按钮及在途禁用；恢复前台且名称仍失败时可开启新一轮。跟随系统语言变化时取消旧名称并重新解析，界面与控制器使用当前 Flutter 绑定的语言来源。 |
| `mobile/test/reverse_recovery_test.dart` | 新增 19 项，覆盖四语自动与手动恢复、参数、时序、上限、HTTP 分类、前台事件、四类取消及系统语言迟到；原有地名竞态与流式问答继续回归。 |
| `mobile/integration_test/reverse_recovery_test.dart` | Android／iOS 真实 HTTP 与实际 Widget 入口的五项专项。受控四语结果与真实服务结果分别记录，不把测试译名写成 Photon 具备四语翻译。 |
| `qa/lib/archive.ts`、`qa/test/archives.test.ts` | 增加本轮专项入口的归档拒绝检查，避免交付集成测试 App。普通包从 `lib/main.dart` 重新构建。 |

没有引入网络状态 SDK、持续 GPS 或后台轮询。两次自动重试后仍失败，持续停留前台时需要手动点击；恢复前台可再试，不声称具备 Web `online` 事件同等的网络连通监听。名称成功后不因普通前后台切换再查名。手动重试不会绕过服务端真实空覆盖缓存。

仅当前点拥有有界自动恢复；其他收藏点的补名沿用原有一次异步请求，未扩成整表循环重试。所有名称恢复不调用天气、摘要或模型。保留已有流式问答、默认深圳、六城推荐、定位失败提示和缓存预报标记。本轮没有重跑无变更的 Web 性能或真实模型实验。

版本显示沿用 `1.1.2`，移动端构建号从 4 升为 5，便于保留数据升级，并与现有 Web 版本核验脚本一致；通过单独交付目录区分本轮。

交付采用已经运行、构建的固定快照。快照建立后，另一项天气强制刷新工作继续修改根工作区的 `data.dart` 及其定位测试；这些后续修改保留在工作区，本轮没有把它们替换进已验收的安装包或源码快照，避免包与源码不同源。

## 命令与结果

Flutter 路径：`/Users/yzin/Documents/Codex/2026-11-16/weather-atlas-24-24-readme-md/work/flutter/bin/flutter`。根工作区为 `/Users/yzin/code/weather-atlas`；普通构建及模拟器专项使用固定候选 `work/flutter-reverse-recovery-source/weather-atlas`，防止并行修改与构建目录混合。

| 命令／操作 | 实际结果与证据 |
| --- | --- |
| `cd mobile && flutter pub get --offline` | 使用锁文件及本机依赖成功，无新增依赖。`qa/evidence/flutter-reverse-recovery-pub-get.log`。 |
| `flutter analyze --no-pub` | 无问题；`flutter-reverse-recovery-final-analyze.log`。 |
| `flutter test --no-pub -r expanded` | 75/75，通过本轮 19 项及工作区已有流式问答、定位失败、地图、缓存和比较测试；`flutter-reverse-recovery-all-tests-final.log`。 |
| 根目录 `npm run typecheck`、`node --test qa/test/archives.test.ts` | 类型检查通过，归档测试 9/9；`flutter-reverse-recovery-node-types.log`、`flutter-reverse-recovery-archives-test.log`。未将既有 Web 124 项结果写成本轮重复执行。 |
| `flutter test integration_test/reverse_recovery_test.dart -d emulator-5554 --no-pub --dart-define=WEATHER_API_BASE=http://10.0.2.2:3300` | Android 五项专项；四语均完成状态、按钮、上限、恢复及取消，真实服务显示“高坪区”。详细原始记录及结构化请求见同前缀 Android 日志与 JSON。 |
| `flutter test integration_test/reverse_recovery_test.dart -d 23AB3E1A-4C30-462C-943C-B9CB5B894E96 --no-pub --dart-define=WEATHER_API_BASE=http://127.0.0.1:3300` | iOS 五项专项通过；`flutter-reverse-recovery-ios.{log,json}`。四语受控共 44 次 HTTP，每语 9 次名称、2 次天气；第二次天气由明确切东京产生，名称恢复阶段天气始终只有首次 1 次。 |

每个平台的四语专项共 44 次受控 HTTP，名称请求 36 次、天气 8 次；两平台合计 88 次受控 HTTP。真实服务专项另列，未混入受控次数。前台恢复在 Widget 测试中通过生命周期通知验证，原生 HTTP 专项直接调用恢复入口；不将这一点写成实体手机后台恢复已验收。模型调用为 0。

## 调试过程与保留的失败

- 首轮四语自动恢复用例在恰好一秒的虚拟帧边界未观察到请求。最终保留 999 毫秒内未触发的检查，再允许 101 毫秒调度窗口，并将请求参数断言移出业务会捕获异常的 HTTP 回调；产品一秒最小退避未变。退避字段另有精确契约测试，原生 HTTP 另测请求上限。前两次失败及诊断分别为 `flutter-reverse-recovery-{first-unit-failure,second-unit-failure,diagnostic}.log`。
- 首次全量还发现当时工作区的四语 390 宽度品牌页头溢出。当前候选包含同期 `Flexible` 与单行省略修复，75 项最终回归通过；原失败为 `flutter-reverse-recovery-narrow-header-failure.log`，没有放宽溢出检查。
- 系统语言补测暴露控制器绕过测试绑定读取实际 dispatcher，已统一到 `WidgetsBinding.instance.platformDispatcher`。原有普通地名单元测试补齐绑定初始化；`flutter-reverse-recovery-binding-failure.log` 保留旧失败。
- iOS 首轮两种语言通过后，其余用例被工具标为 `did not complete`，未取得明确终止原因；`flutter-reverse-recovery-ios-first-disconnect.log` 原样保留。相同模拟器完整复测五项通过，没有将首轮未完成项计为成功。

## 普通构建、安装与交付

普通构建入口固定为 `lib/main.dart`，命令由 `qa/build-local-mobile.ts` 记录，构建号为 `1.1.2+5`。Android 使用 JDK 21 及已有 Gradle 缓存；iOS 使用本机 Xcode／CocoaPods。具体构建、签名、安装、归档证据在 `qa/evidence/flutter-reverse-recovery-*`，交付清单保存大小、SHA-256、ZIP／APK CRC、普通入口及实际模型密钥排除结果。

| 操作 | 实际结果 |
| --- | --- |
| `FLUTTER_SDK=<已有 SDK> VERIFICATION_WORK=<work> QA_MAP_RUN=flutter-reverse-recovery node qa/build-local-mobile.ts` | Android Debug、arm64 iOS 模拟器 Debug、arm64 iOS 设备 Release 未签名三类均退出 0。`flutter-reverse-recovery-mobile-builds.json` 保存实际参数，构建日志保留在本机 work 并复制到验收证据。 |
| `JAVA_HOME=<JDK21> ANDROID_SDK_ROOT=<SDK> ADB_PATH=<adb> node qa/native-artifacts.ts` | Android `versionName=1.1.2`、`versionCode=5`，最小 SDK 24、目标 SDK 36，Android Debug 签名；iOS 两类版本均为 `1.1.2/5`、arm64，分别 ad-hoc／未签名。四语权限字符串齐全。`flutter-reverse-recovery-native-artifacts.json`。 |
| `adb install -r .../app-debug.apk`、`adb shell am start -n dev.weatheratlas.weather_atlas/.MainActivity` | 保留数据升级返回 Success，普通首页启动并实看；`flutter-reverse-recovery-android-install.log`、`flutter-reverse-recovery-android-home.png`。 |
| `xcrun simctl install <设备> .../Runner.app`、`simctl launch` | 显式安装候选后普通首页启动并实看；`flutter-reverse-recovery-ios-reinstall.log`、`flutter-reverse-recovery-ios-home-final.png`。截图中的缓存预报和上游缺少新数据提示保留，没有当作实时新数据。 |
| `codesign --verify --deep --strict .../Debug-iphonesimulator/Runner.app`、`xcrun vtool -show-build .../App.framework/App` | 深度签名检查通过，App.framework 的平台为 IOSSIMULATOR。首轮截到系统桌面，随后查询应用容器不存在；保留首图和启动失败，显式安装后重新验收。未仅凭一次 launch 返回 PID 就认定启动成功。 |

本机为 macOS 27.2（26B123）、Xcode 27.2（27B52）。首次分析、窄屏失败与 iOS 首轮未完成记录均保留，最终结论以上述固定候选和成功记录为准。

2026-11-17 最终归档核对：固定候选再次执行全量单元测试为 75/75。四个 ZIP／APK 均逐条通过 CRC 和实际模型密钥排除检查；Android 与 iOS 模拟器的 `kernel_blob.bin` 包含 `/api/reverse`、`retryCityLabel`，且不含本轮及既有集成测试入口。设备 Release 为 AOT，以构建入口及签名检查为证，不声称完成 kernel 标记检查。交付目录的 `DELIVERY-MANIFEST.json` 与 `ARTIFACT-VERIFICATION.json` 保存文件大小、SHA-256 和独立校验结果。

交付目录：`/Users/yzin/Documents/Codex/2026-11-16/weather-atlas-24-24-readme-md/outputs/v1.1.2-flutter-reverse-recovery`。

- `Weather-Atlas-Source-v1.1.2-flutter-reverse-recovery.zip`：完整 Web／Flutter 源码、测试、说明和本轮证据；排除依赖、私有环境配置、签名密钥及构建缓存。
- `Weather-Atlas-Android-Debug-v1.1.2-build5.apk`：普通 Android 调试包，Android Debug 签名。
- `Weather-Atlas-iOS-Simulator-arm64-Debug-v1.1.2-build5.app.zip`：arm64 iOS 模拟器应用，ad-hoc 签名，供模拟器安装。
- `Weather-Atlas-iOS-Device-arm64-Unsigned-v1.1.2-build5.app.zip`：arm64 设备 Release 未签名应用，不能直接安装到真机。

运行环境为 Android 模拟器 `sdk_gphone64_arm64`／Android 17／SDK 37，以及 iPhone Air 模拟器／iOS 26.5。没有实体手机或可分发的 iOS 发布签名；真实 GPS、真机系统权限及签名安装边界仍按主报告解释。资源到位后，可用已有 `--dart-define=WEATHER_API_BASE=<可达服务>` 对同一源码签名构建并在真机复查前后台、断网恢复及触控。

Web 服务保持可访问：`http://localhost:3300/zh-Hans`、`https://192.168.5.22:3443/zh-Hans`。本轮无需替换共享服务构建；源码包中的 `README.md` 与前轮记录保留其启动命令和 HTTPS CA 配置。
