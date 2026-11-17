# 成都模拟定位与天气刷新验收

日期：2026-11-17，时区：Asia/Shanghai。

## 复现与修复

设备为 iPhone Air、iOS 26.5、arm64 模拟器，由 Device Hub 承载。服务为 `http://127.0.0.1:3300`。将模拟位置设为成都 `30.5728,104.0668` 后，原生日志收到 `didUpdateLocations`；原有定位权限此前为使用期间允许。没有模拟坐标时，权限允许仍不保证取得位置。

`mobile/lib/controller.dart` 原先把获取位置的异常全部映射为 `gpsFail`。本轮保留 10 秒获取位置上限，区分系统定位关闭、权限未允许、权限已禁止、获取位置超时及其他获取失败；`mobile/lib/locale.dart` 补全四语提示。迟到错误仍遵守手选城市优先规则。

天气失败与定位失败分别保存状态。新增天气请求超时、连接失败、服务返回错误、数据不可读取及供方暂无新数据的提示。`mobile/lib/main.dart` 在首次天气失败或缓存回退时显示原因及重试。缓存和更新时间继续保留；刷新成功清除错误。城市名仍由反向地理编码取得，查天气继续使用原坐标。

## 天气刷新排查结论

直接连接现有服务，深圳和成都均返回 HTTP 200、`source=open-meteo`、`stale=false`；成都时区为 `Asia/Shanghai`。原生测试从普通应用入口启动，确认实际服务地址为 `http://127.0.0.1:3300`，成都定位后的预报和再次强制刷新均成功。

截图中旧版只保留布尔失败状态，未记录该次异常类型，因此不能追溯并断言其具体原因。普通应用完成构建后，实际复现了另一条确定的误报路径：天气缓存超过 15 分钟时，服务端立即返回 `stale=true` 并在后台更新；Flutter 原先直接将这个状态显示为“刷新失败”，即使后台天气已经更新成功，当前屏仍停留在失败提示。

`web/app/api/weather/route.ts` 现支持 `fresh=1`，复用已有的服务端 `getWeather(..., {fresh:true})` 等待更新语义。Flutter 的 `WeatherApi.weather` 每次网络取天气都带此参数：客户端已有缓存照常立即展示，15 分钟内服务端缓存仍然复用；需要更新时等待共享加载完成，实际失败才回退旧数据。SSR 与未传参数的请求继续按原来的后台更新方式工作。保留原有 15 分钟／3 小时缓存边界，没有为了消除错误文案而关闭缓存。

排查脚本最初沿用宿主机代理时得到的 502，绕开代理直接访问本地服务后消失；该脚本结果不能作为 App 同样使用代理或上游失败的证据。

## 命令与结果

在仓库根目录设置模拟位置和权限：

```sh
xcrun simctl location 23AB3E1A-4C30-462C-943C-B9CB5B894E96 set 30.5728,104.0668
xcrun simctl privacy 23AB3E1A-4C30-462C-943C-B9CB5B894E96 grant location dev.weatheratlas.weatherAtlas
```

以下命令在 `mobile/` 执行，`flutter` 使用本机已安装工具链：

```sh
flutter test test/location_failure_test.dart -r expanded
flutter test -r expanded
flutter analyze
flutter test integration_test/chengdu_location_test.dart -d 23AB3E1A-4C30-462C-943C-B9CB5B894E96 --dart-define=WEATHER_API_BASE=http://127.0.0.1:3300
flutter build ios --simulator --debug --config-only --dart-define=WEATHER_API_BASE=http://127.0.0.1:3300
xcrun xcodebuild -quiet -workspace ios/Runner.xcworkspace -scheme Runner -configuration Debug -sdk iphonesimulator -destination id=23AB3E1A-4C30-462C-943C-B9CB5B894E96 -derivedDataPath build/ios-chengdu-location ARCHS=arm64 ONLY_ACTIVE_ARCH=YES FLUTTER_TARGET=lib/main.dart FLUTTER_BUILD_DIR=build/chengdu-normal build
```

- 新增专项 14 项通过：五类定位失败、取位置期间权限／系统服务变化、成都坐标保持、天气 503 与重试、连接／超时／数据异常及恢复、四语缓存错误展示和点击重试。四语界面用例另以 390×844 复测通过。
- 初次全量 Flutter 测试 56 项通过；纳入当前工作区独立名称恢复测试后的最终全量为 75 项通过。分析最终无问题。
- 原生专项 1 项通过：模拟器实际定位插件返回 `30.5728,104.0668`，页面显示“成都市”，天气为 Open-Meteo、`Asia/Shanghai`、非旧数据；再次强制刷新成功。
- 新增 Node 实际路由测试将独立缓存老化 16 分钟，验证 `fresh=1` 等到非旧数据，随后再次请求仍复用新鲜版本；测试使用临时目录与演示供方，不访问真实上游或模型。
- Web 最终 `npm test` 为 125 项通过，`npm run typecheck` 与 `NEXT_DIST_DIR=.next-chengdu-location npm run build` 通过。先在 3322 验证生产候选与真实天气，再替换本地 3300 服务；成都返回 HTTP 200、非旧数据。保留原有 `.env.ai.local`，没有清空模型配置。
- 原生证据：`qa/evidence/chengdu-location-native.log`；单元与分析：`chengdu-location-unit.log`、`chengdu-location-analyze.log`；窄屏：`chengdu-location-narrow.log`；Web 测试／类型／构建：`chengdu-location-web-*.log`；服务：`chengdu-location-http.log`；最终普通应用构建：`chengdu-location-ios-build-final.log`。

## 过程取舍与验收边界

1. 不把模拟器未提供位置写成权限被拒绝，也不在普通用户提示里要求配置模拟器。设置成都属于本次开发环境操作，应用本身没有固定成都或伪造真实定位。
2. 保留粗略前台定位与 10 秒等待上限。没有把延长等待、最后一次已知位置或默认城市当成本次定位成功。
3. 区分定位和天气错误，不输出原始异常、密钥或问答正文到用户界面。使用已有服务端等待更新选项修复后台缓存更新的误报，不增加客户端轮询、自动模型调用或无限重试。本轮没有模型调用。
4. 原生测试第一轮在首帧挂载前查找组件失败，已补首帧等待；证据保留于 `chengdu-location-native-first-failure.log`。第二轮安装后权限为未决定，测试停在真实系统授权弹窗，未取得坐标；证据保留于 `chengdu-location-native-permission-pending.log`。实际安装后重新授予模拟器权限，下一轮通过。程序授予权限不等同于手工完成首次授权界面或真机 GPS 验收。
5. 采用当前设备需要的 arm64 模拟器构建。交付为 Debug 模拟器应用，不作为真机签名或 App Store 发布包。原有服务端凭据和本地配置保持原状。
6. 390 宽度检查发现既有标题栏横向溢出 46 像素，四语均复现。只为标题文字增加可伸缩约束及单行截断，不压缩右侧操作区。失败证据保留于 `chengdu-location-narrow-first-failure.log`，修复后专项及全量复测通过。
7. 首次普通应用构建虽成功，但实际启动白屏／退出。读取本地 Dart VM 的 `rootLib` 后确认入口为 `flutter_test_listener/.../listener.dart`，说明产物混入测试监听入口；单凭构建成功和缺少专项测试字符串不足以证明普通入口正确。最终显式传入 `FLUTTER_TARGET=lib/main.dart` 和独立 `FLUTTER_BUILD_DIR=build/chengdu-normal`，并在所有测试结束后构建、安装。

## 普通应用交付

普通入口产物为 `mobile/build/ios-chengdu-location/Build/Products/Debug-iphonesimulator/Runner.app`。安装后重新设置模拟位置及定位权限，已打开应用。最终界面显示“成都市／高新区 · 中国”、16°C、`Asia/Shanghai`，预报更新于 15:30，无定位失败或天气刷新失败提示。实际 Dart VM 入口核对为 `package:weather_atlas/main.dart`；证据见 `qa/evidence/chengdu-location-final-runtime.json` 和 `chengdu-location-normal.png`。

交付 ZIP：`/Users/yzin/Documents/Codex/2026-11-16/weather-atlas-24-24-readme-md/outputs/v1.1.2-chengdu-location/Weather-Atlas-iOS-Chengdu-Location-Simulator-arm64-Debug-v1.1.2.app.zip`。ZIP 完整性通过，40,268,453 字节，SHA-256 为 `bbb6c67136f48e887fe08876f79c3146cf6cc0d38d49206baf869a65dfcb9948`。版本 1.1.2、构建号 5，arm64、Debug、adhoc 签名。没有 `test_api` 或成都专项测试入口；普通应用入口另外经过运行时核对。

当前 HTTP 服务继续在 `http://localhost:3300` 运行。重启本轮生产构建时，在 `web/` 执行：

```sh
NEXT_DIST_DIR=.next-chengdu-location WEATHER_MODE=live WEATHER_CACHE_DIR=/Users/yzin/code/weather-atlas/.weather-cache SITE_URL=http://localhost:3300 NODE_USE_ENV_PROXY=1 HTTPS_PROXY=http://127.0.0.1:7890 HTTP_PROXY=http://127.0.0.1:7890 NO_PROXY=localhost,127.0.0.1,.local npm start -- --hostname 0.0.0.0 --port 3300
```

`npm start` 沿用根目录本地私有凭据文件。代理端口为本机现有配置；iOS 模拟器使用 `http://127.0.0.1:3300`。没有改变其他独立服务或 HTTPS 实例。
