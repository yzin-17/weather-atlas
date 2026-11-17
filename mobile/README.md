# Weather Atlas · Flutter

Android 与 iOS 使用同一套 Flutter 界面。城市搜索、预报和问答通过项目中的 Next.js 服务访问。先按根目录 README 启动 Web 服务；真实天气需要服务端可以连接 Open-Meteo，远程模型密钥仅在服务端设置。

默认城市为深圳；推荐城市依次为深圳、首尔、香港、东京、纽约、伦敦。已有手选地点和收藏沿用用户保存的内容，自动定位成功后显示真实位置。本轮普通应用产物使用包含流式问答、定位错误提示和名称恢复的固定源码快照，验证与交付见 [Flutter 名称恢复](../docs/verification/flutter-reverse-recovery.md)。

## 运行

本项目使用 Flutter 3.38.9 / Dart 3.10.8 验证。保留 `pubspec.lock`；Android 使用 JDK 17 或 21 和 Flutter 所需的 Android SDK。iOS 最低版本为 15，需要 macOS、Xcode 和 CocoaPods。

Android 构建默认限制为 Gradle 2 GB、2 个 worker，Kotlin 在同一进程执行，减少与模拟器并行时的内存压力。该设置影响构建资源，不代表 App 的运行帧率；大型构建机可在自己的 Gradle 配置中调整。

```sh
cd mobile
flutter pub get
flutter devices
flutter run -d <device-id>
```

Android 模拟器默认连接 `http://10.0.2.2:3000`，iOS 模拟器默认连接 `http://127.0.0.1:3000`。实体设备连接与电脑相同的网络，让 Next.js 监听局域网地址。在右上角语言菜单选择「天气服务地址」，输入电脑的局域网地址，例如 `http://192.168.1.20:3000`。设置会保存在设备上。Android debug 构建允许局域网 HTTP。公开部署或 iOS 真机可使用 HTTPS。

也可在首次构建时指定默认服务地址：

```sh
flutter run --dart-define=WEATHER_API_BASE=https://weather.example.org
flutter build apk --debug --dart-define=WEATHER_API_BASE=https://weather.example.org
```

## 操作

- 首页搜索全球城市，可输入两个字的中文城市名。搜索页右上角的地图按钮用于选点；地图只保留选中位置标记，拖动／缩放／落针不取天气，确认后才进入该点天气。
- 已授权且上次未手动固定城市时，打开应用自动读取一次粗略前台位置。首次进入可点「使用当前位置」授权。手动选城覆盖延迟返回的定位；系统拒绝定位后搜索仍然可用。
- 定位失败区分系统定位关闭、未授权、权限被禁止、10 秒超时及其他错误；天气刷新另行区分连接、超时、服务响应或数据错误，保留已有预报并支持重试。成都模拟定位、真实天气刷新和过程取舍见 [专项记录](../qa/CHENGDU-LOCATION.md)。
- v1.1.1 起，当前位置和地图确认点并行解析城市名，收藏与分享显示解析后的名称，天气、时区和链接仍以原坐标为准。旧版已保存的坐标地点恢复时也会补全名称。失败保留区域名或四位小数坐标；地名超时不阻塞天气，迟到解析不覆盖手动选城。已知城市四语本地化，其他地点保留供方可用名称。服务端配置及公共服务边界见根目录 README。
- 名称解析临时失败时最多自动重试两次，按服务端退避时间等待；无覆盖时提供四语“重新识别城市”按钮，在途禁用并显示识别状态。失败后恢复前台可再试，切城／语言／服务地址与销毁会取消排队重试。仅重查名称，不重取天气、GPS 或问答；未增加网络监听依赖，持续在前台且两次重试均失败后，可手动重试。普通包构建号升为 `1.1.2+5`，运行与交付记录见 [Flutter 名称恢复](../docs/verification/flutter-reverse-recovery.md)。
- 选址返回后，天气未完成时显示四语加载文案和进度占位；加载完成后才出现该点预报。新增四语延迟用例，全量测试 25/25；Android／iOS 模拟器专项各 4/4。详见 [选址加载态](../docs/verification/selection-loading.md)。
- 地图只保留选中位置标记，确认入口在地图外；打开、拖动、缩放或选点不加载天气摘要。中文地点采用供方的当地名称，惠州显示“惠州市”；天气仍使用原坐标。实现与限制见 [地图简化](../docs/verification/map-clean.md)。
- 天气区显示当地时间、24 个逐小时点和 7 天预报。周温度条按同一周的温度范围绘制。书签按钮保存当前城市；其他城市区的加号可以在不切换首页地点的情况下添加城市。
- 点右下角固定的“问天气”入口，滚动页面仍可打开。入口沿用 Web 的绿色胶囊、星芒图标和四语短标签，避开底部安全区；逐小时标题不再放重复入口。实现、验证与取舍见 [右下角问答入口](../qa/FLUTTER-ASK-LAUNCHER.md)。Flutter 使用 `ai_ui_stream` 接入 Web 同一 SSE 协议，支持逐字显示、历史、停止和手动重试。发送立即清空输入；失败不回填，重试使用历史问题并保留当前草稿。天气读取失败提供独立四语提示，具体原因与验证见 [失败与输入记录](../qa/AI-FAILURE-INPUT.md)。首次提问后隐藏推荐问题，关闭再打开保留同一会话；应用重启不持久化问答正文。
- 输入“今天广州天气怎样”，可追问“出门穿什么衣服”“明天下午呢”；输入“首尔和台北明天早上 7–9 点，哪里更容易下雨？”后，可输入“那下午呢？”和“哪个更冷？”。依据打开对应城市、时区及快照，当前城市有效小时可返回首页定位。409 刷新主页面及单城／两城上下文版本，保留日期锚点后重试。详情、测试、构建与取舍见 [Flutter 流式对话验收](../qa/FLUTTER-AI-STREAM.md)。
- 右上角菜单提供简中、繁中、英文、韩文以及跟随系统。切界面语言复用已加载的天气；地图使用应用语言，不再提供独立语言菜单。标准 OSM 底图保留当地地名。
- 地点操作区的链接图标复制当前语言的城市地址。正式发布时用 `--dart-define=WEATHER_SITE_URL=https://<项目域名>` 指定公开站点；未配置时使用当前服务地址，本机模拟器地址仅供本机验证。

## 地图底图

默认使用天气服务的 `/api/map-tiles/{z}/{x}/{y}`，转发并缓存真实 OpenStreetMap 标准 PNG，文字由 OSM 预先渲染。这样模拟器和手机不需要为 OSM 另配代理；天气服务本身须能访问真实供图方。保留署名，严格检查瓦片坐标与图片，磁盘最多 512 张／64 MiB，遵守上游缓存头，无有效缓存头时默认 7 天。App 切语言时默认底图沿用当地地名。商业样式可在构建时传入各语言公开 XYZ 模板及署名，自动随应用语言选用；每个值为完整 HTTPS URL，包含 `{z}/{x}/{y}`。例如：

```sh
flutter run --dart-define-from-file=tiles.local.json
```

```json
{
  "TILES_EN": "https://example.org/en/{z}/{x}/{y}.png",
  "TILES_KO": "https://example.org/ko/{z}/{x}/{y}.png",
  "TILES_ZH_HANS": "https://example.org/zh-hans/{z}/{x}/{y}.png",
  "TILES_ZH_HANT": "https://example.org/zh-hant/{z}/{x}/{y}.png",
  "TILES_ATTRIBUTION": "Your tile provider"
}
```

以上域名是模板占位符。客户端地图令牌使用提供商允许分发的公开令牌；具体地名翻译取决于瓦片服务的数据覆盖。

当前普通包使用真实底图，已移除 `USE_TEST_TILES` 分支。历史四语测试生成器仍用于复查旧记录，正常服务关闭该端点。本机 3000 被其他服务占用，当前构建指定 Android `http://10.0.2.2:3300`、iOS `http://127.0.0.1:3300`；真机在设置中填局域网可达地址。

## 测试与实现

```sh
flutter analyze
flutter test -r expanded
flutter test integration_test/app_flow_test.dart -d <模拟器ID> --dart-define=WEATHER_API_BASE=http://127.0.0.1:3300
```

`lib/controller.dart` 统一处理地点选择顺序、在途请求合并、失败重试和本地偏好。最多保留 15 个地点的天气快照，15 分钟内复用新鲜数据，刷新失败时保留原地点已有的预报及更新时间。缓存同时区分服务地址与坐标。收藏摘要仅请求当前地点之外尚未命中缓存的坐标，逐小时列表按需创建可见项。`lib/data.dart` 使用 IANA 时区转换小时数据，并保留上游每日民用日期和缺失的降水概率。

`test/widget_test.dart` 通过模拟 HTTP 和定位服务检查异步切城、离线缓存、时区、语言、问答依据和 Widget 交互。iOS 与 Android 权限提示、地图加载质量和弱网表现可在真机按上述流程验收。

`test/comparison_test.dart` 覆盖四语三轮追问和台北依据；`integration_test/app_flow_test.dart` 连接实际本机服务验证原生界面。模拟器不能代替真机 GPS、权限恢复或 profile 帧耗时。未配置发布签名时，Android release 当前使用 debug Key，不能标为正式发布签名；iOS 模拟器 `.app` 不能在真机安装。

`test/reverse_test.dart` 覆盖原坐标、区域回退、四语、恢复及切换竞态；`integration_test/reverse_flow_test.dart` 在 Android／iOS 使用实际 HTTP、界面菜单和剪贴板验证名称、链接、回退及迟到响应。早期 v1.1.2 天气地图版本全量单元／Widget 测试为 23/23；本轮按移除天气图层后的行为收敛为 21/21，分析无问题。当前 `integration_test/weather_map_test.dart` 验证真实 OSM 解码、唯一选中标记、拖动零天气请求与确认坐标。早期天气摘要测试的历史结果仍保留。命令与证据见 [天气地图验收](../docs/verification/weather-map.md)。未重复调用真实模型，原模型验收仍按原报告日期解释。

本次原版／新版 Android 调试包已实际安装升级，城市和收藏保留；Android 规则／真实模型三轮及 iOS 规则／真实模型路径均有运行证据。`integration_test/location_test.dart` 区分 `LOCATION_CASE=granted|denied|timeout`，覆盖系统权限、定位失败后的手动搜索。iOS 实际系统弹窗还由根目录 `qa/ios-permission-ui.swift` 独立 XCTest 验证，生成脚本为 `qa/ios-permission-project.rb`，不修改产品工程。Android 模拟器的低精度定位成功专项未通过，超时回退通过；不要把模拟坐标或 Widget 测试写成真机 GPS 通过。具体命令、四语网络预算、产物地址和限制见 [本次报告](../qa/LOCAL-VERIFICATION.md)。

`integration_test/resilience_test.dart` 在原生 App 内启动真实回环 HTTP 服务，以城市快照构造断连／延迟，覆盖首次失败后点击重试、旧时间标记、22 秒客户端超时、持久缓存回退、恢复后四语零天气请求及慢城市响应竞态。Android／iOS 模拟器均已通过。运行方式与主流程集成测试相同，目标文件替换为该文件；其受控故障不等于真实运营商弱网或卫星 GPS 验收。
