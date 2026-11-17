# 深圳默认城市与六城推荐

日期：2026-11-17（Asia/Shanghai）。

## 行为与取舍

首页尚未取得位置、定位被拒绝或超时时，默认展示深圳（22.5455、114.0683，Asia/Shanghai）。首页继续按已确认要求申请当前位置；授权后使用实际 GPS。固定城市深链保持其目标城市，迟到定位不能覆盖用户手选。

推荐顺序为深圳、首尔、香港、东京、纽约、伦敦。Web 首页导航、搜索默认列表、初次默认收藏与 Flutter 搜索／地图城市列表共用此顺序。已保存的收藏与移动端手选地点保持原值，不用修改默认配置覆盖用户数据；“其他城市”会过滤当前城市，因此首页深圳对应的列表显示其余五座城市。

公开目录与推荐分别承担索引和浏览入口：八座城市仍有公开四语页面，成都、台北仅从首页推荐中移除，已有链接及 sitemap 36 项继续有效。Flutter 分享补齐深圳、香港的公开路由。

实现：`web/lib/catalog.ts` 的 `defaultCity`／`defaultCities`，`web/app/[locale]/page.tsx`、`web/components/HomeIntro.tsx`；Flutter 的 `mobile/lib/data.dart`、`controller.dart`。新增默认选择／顺序回归位于 `web/tests/seo.test.ts`、`mobile/test/widget_test.dart`，浏览器工具按明确六城顺序验收。

## 执行与结果

| 命令／操作 | 观察与证据 |
| --- | --- |
| `cd web && npm test` | 112/112；`qa/evidence/shenzhen-default-web-tests.log`。 |
| 根目录 `npm run typecheck`、`npm run typecheck:audit` | 严格检查及类型审计通过；`qa/evidence/shenzhen-default-{typecheck,type-audit}.log`。 |
| `cd web && NEXT_DIST_DIR=.next-shenzhen-default SITE_URL=http://localhost:3300 npm run build` | 生产构建通过；`qa/evidence/shenzhen-default-build.log`。 |
| `QA_DIST_DIR=.next-shenzhen-default QA_PERF_CHECKS=home-index-browser,default-cities,home-location,seo-audit node qa/next-performance-check.ts` | 受控天气，无模型调用。四语 × 1440／1024／768／390：首页显示深圳、六城顺序正确、无溢出；搜索选择六城、目的地时区和已有收藏共 26 项；定位 8 项；108 份 HTML 与 36 项 sitemap 无发现。日志 `qa/evidence/shenzhen-default-browser.log`，固定报告 `shenzhen-default-{home-browser,cities,location,seo-controlled}.json`。 |
| 日常 HTTPS 使用 `QA_HOME_BROWSER_RUN=shenzhen-default-https-home node qa/home-index-browser.ts` | 现有 CA 校验通过，19 项首页／语言／导航／定位场景通过，页面错误 0；`qa/evidence/shenzhen-default-https-home-browser.json`。桌面与手机截图均人工核对，固定截图 `shenzhen-default-home-{宽度}.png` 使用受控天气，不能冒充实时天气数值。 |
| 固定原生源码 `flutter pub get --offline`、`flutter analyze --no-pub`、`flutter test --no-pub` | 分析无问题，26/26。覆盖全新配置默认深圳、六城 ID 顺序，保留既有四语、加载与竞态测试。`qa/evidence/shenzhen-default-frozen-{pub-get,flutter-analyze,flutter-tests}.log`。 |
| 固定候选运行 `qa/build-local-mobile.ts`，`QA_MAP_RUN=shenzhen-default` | Android debug、iOS arm64 模拟器 debug、iOS arm64 设备 release --no-codesign 均通过；`qa/evidence/shenzhen-default-mobile-builds.json`，完整日志位于既有 work 目录的同名前缀文件。 |
| `JAVA_HOME=<JDK21> ANDROID_SDK_ROOT=<SDK> ADB_PATH=<adb> node qa/native-artifacts.ts` | Android Debug 签名验证；iOS 模拟器 ad-hoc、设备 release 未签名；`qa/evidence/shenzhen-default-native-artifacts.json`。APK 支持 arm64-v8a／armeabi-v7a／x86_64。 |
| `adb -s emulator-5554 install -r <新版 app-debug.apk>`、`adb shell am start -n dev.weatheratlas.weather_atlas/.MainActivity` | 安装 Success、启动成功，保留应用数据。设备 sdk_gphone64_arm64，Android 17／SDK 37。iOS 构建脚本已在既有 iPhone Air 模拟器安装启动普通入口。没有重跑真机 GPS 或 profile 性能。 |

## 并行工作区与失败记录

当前工作区同时出现 Flutter AI 流式问答改动。首次根目录原生分析报告问答测试两处 lint；全量测试中七个既有问答 Widget 测试 `pumpAndSettle` 超时，新增流式测试仍在等待。本轮中止了自己启动的测试进程，保留 `shenzhen-default-flutter-{analyze,tests}.log`，没有改写或回退另一项工作的问答实现。

为使本轮安装包可复核，交付采用固定源码候选：Web 使用本轮通过 112 项测试和构建的版本；`mobile/` 从上一轮已验收的 `work/selection-loading-source/weather-atlas/mobile` 导出，再应用深圳默认值、六城列表、两城分享路由及本轮回归。候选位置为 `work/shenzhen-default-source/weather-atlas`。工作区的并行问答改动继续保留；本轮 26 项原生通过结果只适用于该候选，不宣称工作区的问答迁移已经通过。

首次导出时误复制了正在改写的 Widget 测试，造成缺少 `chat_fixture.dart` 编译失败。修正为同一稳定基线的测试文件并只加入本轮回归后，分析与全量测试通过。失败记录保留在 `shenzhen-default-frozen-first-{analyze,tests}-failure.log`。首次产物校验未配置 JAVA_HOME，apksigner 找不到 Java；显式设置已有 JDK21 后通过，日志保留在 `shenzhen-default-native-artifacts-first-failure.log`。这些失败没有通过更改产品行为或放宽验收条件绕过。

## 服务与交付

日常 Web：`http://localhost:3300/zh-Hans`；同一局域网手机：`https://192.168.5.22:3443/zh-Hans`。当前生产目录 `.next-shenzhen-default`：

```sh
cd /Users/yzin/code/weather-atlas/web
NEXT_DIST_DIR=.next-shenzhen-default npm start -- --hostname 0.0.0.0 --port 3300
# 另一终端
cd /Users/yzin/code/weather-atlas
NEXT_DIST_DIR=.next-shenzhen-default npm run dev:https
```

交付目录：`/Users/yzin/Documents/Codex/2026-11-16/weather-atlas-24-24-readme-md/outputs/v1.1.2-shenzhen-default`。包含固定候选源码 ZIP、Android 调试 APK、iOS arm64 模拟器 ZIP 与 iOS arm64 未签名设备 ZIP。Android 使用 `http://10.0.2.2:3300`；iOS 模拟器使用 `http://127.0.0.1:3300`，设备产物使用既有局域网主机名。签名、版本、CRC、普通应用入口和凭据排除／SHA-256 见目录中的清单与校验文件。iOS 未签名产物不能直接安装到真机。

公开域名、GSC、实体设备与真实用户流量等总报告缺口保持原状态。本轮没有重复模型调用或性能 A/B。
