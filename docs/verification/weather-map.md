# v1.1.2 天气地图验收与取舍

日期：2026-11-17（Asia/Shanghai）。规格见 [天气地图](../specs/2026-11-17-weather-map.md)，当前执行状态见 [任务](../tasks/weather-map.md)。本轮保留已有未提交改动、AI 配置和 CA，没有提交、重置或付费模型调用。

## 五分钟查看

1. 打开 `http://localhost:3300/zh-Hans/weather/seoul-1835848`，查看当前天气并打开“地图选点”。桌面为大窗口，手机接近全屏。
2. 地图显示真实 OSM、天气图标和温度。点天气标记看相应地点摘要，点搜索旁的地球按钮查看当前与收藏地点的范围。
3. 搜索台北并选择结果，预览对应城市天气。拖动、缩放和任意落针不会打开新城市的完整预报；点“查看天气”才进入该点。
4. 关闭地图，在主页面切繁中、英文、韩文后重新打开。界面跟随应用语言，OSM 底图保留当地地名，地图没有独立语言设置。
5. Android／iOS 在搜索页打开地图，点天气标记并确认新点；新版普通包已安装在本机两个模拟器。真机应将天气服务地址改为同网段地址或受信任 HTTPS。

参考 [Rain 当前地图源码](https://github.com/darkmoonight/Rain/blob/main/lib/features/map/presentation/map_screen.dart) 的当前地点／保存城市标记、搜索和选中天气摘要。采用本项目原有组件、图标及配色，没有复制参考项目代码或图片。

## 实现与实际操作

| 验收 | 实现位置 | 执行与观察 |
| --- | --- | --- |
| M1 窗口与布局 | `MapDialog.tsx`、`Modal.tsx` 的地图变体、`globals.css` | 1440／1024／768／390 四宽度×四语，地图完整绘制，无横向溢出；390×420 键盘尺寸视口下聚焦坐标框仍可见；其他弹窗保留原尺寸 |
| M2 真实底图 | `/api/map-tiles/[z]/[x]/[y]`、`web/lib/map-tiles.ts`、`location_picker.dart` | 标准真实 OSM PNG，经服务端缓存转发；检测 256×256 与 PNG 结构、尺寸上限，返回 `X-Map-Source: openstreetmap`；两端均无测试图层和地图语言菜单 |
| M3 天气标记 | `useMapWeather.tsx`、`map-weather.ts`、`weather.ts`、Flutter picker | 复用完整快照和摘要；最多准备当前、搜索选中及收藏的 20 个地点，缺失一批补齐。温度、天气、可用的观测时间与时区同源；旧值、缺测和示例来源明确标记 |
| M4 请求与竞态 | Web AbortController、Flutter AbortableRequest | 拖动／缩放／落针零完整预报；搜索新城一份摘要；确认后才取完整预报。旧摘要不能把另一城市的温度混到选中地点，关闭取消在途请求 |
| M5 构建交付 | `qa/weather-map-*.ts`、`build-local-mobile.ts` | Node／Flutter、真实浏览器、Android／iOS 模拟器、普通入口构建／安装、源码和归档校验分别记录；未把模拟器当真机 |

地图使用同一 URL 的标准 OSM 图片，不根据界面语言改写底图文字。商业样式仍可配置并随应用语言选用；本轮没有商业密钥，未宣称完成商业地名翻译验收。历史 `/api/tiles` 测试生成器在正常配置关闭，客户端已移除测试选择路径。

## 同条件尺寸对照

`qa/weather-map-size.ts` 在同机 Chromium、900px 高视口分别测旧生产构建和当前生产构建的实际 DOM 矩形，均使用简中首尔页。

| 视口宽度 | 窗口宽：前→后 | 实际地图：前→后 | 地图语言选择器 |
| --- | --- | --- | --- |
| 1440 | 640→1180 px | 592×315→1138×649 px | 1→0 |
| 390 | 354→374 px | 320×315→348×689 px | 1→0 |

原始记录：`qa/evidence/weather-map-size-before.json`、`weather-map-size-after.json`。旧构建使用当时配置的测试底图，本表只比较几何尺寸；新构建的真实供图和解码另有证据，没有用旧测试图证明新地图可用。

## 实测结果与复现

- `cd web && npm test`：**80/80**。新增地图候选、同源快照与零温、摘要时间、瓦片坐标与格式、同瓦片并发／跨实例／重启、ETag 条件重验、容量驱逐以及 40 张突发排队测试。
- `flutter analyze`：无问题；`flutter test`：**23/23**。覆盖当前快照复用、只补缺失摘要、拖动无预报、标记选择、关闭取消与迟到返回。既有定位、反查、问答测试仍通过。
- `qa/weather-map-browser.ts`：**22 场景**，含四语×四宽度、390×420、搜索／确认原坐标、迟到摘要、缺测、瓦片失败重试与相同真实 URL 哈希一致。54 张不同真实瓦片记录为 OSM 来源；生成测试图层为 0，浏览器错误与模型调用为 0。记录在 `qa/evidence/weather-map-browser.json`。
- 当前真实天气生产构建的 `qa/weather-map-production.ts`：1440／390 及首页迟到 GPS 共 **3 场景**，选中摘要与主页面当前温度一致，真实图片全部解码；首页瓦片 0、拖动天气请求增量 0、测试瓦片 0。直接打开地图立即取消未完成的自动定位意图，迟到 GPS 不关闭地图或切换当前地点。记录在 `weather-map-production.json`。`qa/map-resource-budget.ts` 另验地图脚本仍按需加载。
- 当前 HTTP 与原有 CA 验证的 HTTPS：原始 HTML SEO **各 84 份**、sitemap **各 28**、findings 0，见 `weather-map-production-seo.json`、`weather-map-production-https-seo.json`。未再次调用真实模型；问答草稿受控回归 **18** 条通过。

独立 Web 验收命令：

```bash
cd /Users/yzin/code/weather-atlas/web
NEXT_DIST_DIR=.next-weather-map SITE_URL=http://localhost:3300 npm run build
cd ..
QA_DIST_DIR=.next-weather-map QA_PERF_CHECKS=weather-map-browser node qa/next-performance-check.ts
```

需要先安装 Playwright Chromium；本机通过 `PLAYWRIGHT_BROWSERS_PATH` 指向已安装浏览器。供图出口通过进程级 Node 代理配置，无代理的可联网环境可直接运行。没有把代理地址或密钥加入可分发配置。测试服务使用 3332／3333，关闭后释放端口；日常 HTTP／HTTPS 继续运行。

## 原生实际运行

| 平台 | 设备与系统 | 模式 | 结果 |
| --- | --- | --- | --- |
| Android | sdk gphone64 arm64，Android 17 API 37，emulator-5554 | debug，真实原生 HTTP 与图像解码 | 1/1；首尔 13°、台北 8°，拖动／选标记／落针零预报，确认后原坐标取完整预报 |
| iOS | iPhone Air 模拟器，iOS 26.5，arm64 | debug，真实原生 HTTP 与图像解码 | 1/1；同一流程通过，未使用卫星 GPS 或实体手机 |

原生使用受控天气 HTTP 上游来固定数值，底图始终是真实 OSM。两端各发起 24 次瓦片请求：Android 成功 15、正常取消 9、无悬挂请求，成功传输 361,941 B；iOS 成功 24、无取消，480,950 B。不能把请求次数当作全部新下载，真实缓存命中见各响应的 `cache` 字段。

每端 API 为：进入前当前预报 1 次、缺失台北摘要 1 次、确认坐标后完整预报 1 次；拖动、标记选择和落针均无额外预报。Android 实际天气上游增量为完整 2／摘要 1；iOS 因复用先前缓存，上游增量为完整 1／摘要 0；模型均 0。结果和真实请求在 `weather-map-native-android.json`、`weather-map-native-ios.json`。已查看两端实际地图截图，标记与选中城市一致。

复现入口：

```bash
QA_DIST_DIR=.next-weather-map QA_PERF_CHECKS=weather-map-native \
  FLUTTER_SDK=<Flutter SDK> VERIFICATION_WORK=<日志与 Gradle 缓存目录> \
  QA_ANDROID_DEVICE=emulator-5554 QA_IOS_DEVICE=<iOS 模拟器 ID> \
  node qa/next-performance-check.ts
```

该脚本使用真实 OSM 和受控天气，自动收集 PNG 截图及分阶段请求。APK／模拟器应用在集成测试后必须恢复普通 `lib/main.dart` 产物；本轮已恢复与正常构建相同 SHA 的 APK、相同 kernel 的模拟器包，并重新安装启动。产物校验拒绝将 `weather_map_test.dart` 等集成测试作为交付入口。

## 缓存、网络与过程取舍

1. 直接 OSM 在 Web 经现有出口正常，但 Android 直连六个请求在 30 秒内没有完成；天气 API 正常。保留 `weather-map-initial-native/android-direct.json` 与日志后，增加真实瓦片转发。手机只需能访问天气服务，无需单独配置供图代理；服务端需能联网。
2. 转发缓存跨进程锁定同一瓦片，验证 20 个并发／两个服务对象／重新创建实例只下载一次。缓存遵守上游 Cache-Control，没有有效头时默认 7 天；ETag 过期条件重验保留相同内容。内存图片最多 128 张／8 MiB，磁盘最多 512 张／64 MiB，和天气／AI 限流目录分开。出错返回失败，不生成替代图片。
3. 初期直接限制 24 个并发，会在跨洲平移动画和测试快速切换视图时误拒绝正常瓦片。已改为搜索／坐标定位直接跳转，手动拖动与缩放保留；每进程 12 个上游并发、最多排队 128 个、最长等待 10 秒。40 张突发测试与真实界面复测通过。旧 503 观察保留在 `weather-map-initial-native/proxy-burst-observation.json`。
4. 仅对当前、选中与收藏前 20 个地点准备天气，不随视野扫描全球城市，不抓雷达或整片热力场。多数数据来自已有快照／摘要；搜索可预览新城市。邻近标记可通过放大区分，未引入聚类依赖。天气仍为 15 分钟新鲜、3 小时旧值。
5. 用实际 PNG 解码确认底图；首张图片返回不能代表整幅地图完成，因此 Web 截图等待所有瓦片完成，原生截图等待当前传输完成后再取图。截图记录器曾因默认缓冲不足返回 500，已提高到 16 MiB 并保留错误信息；落针按异步手势等待，不以固定 200 ms 假定已完成。确认返回父页面后没有地图图像是正常行为，完成阶段不再等待图像。
6. 通用 iOS 模拟器构建遇到 Flutter 3.38.9 的双架构字符串检查错误，lipo 实际已含两架构。没有改工程去排除架构；改用明确的 iPhone Air 目标、`flutter run --no-resident --target lib/main.dart`，成功生成并运行 arm64 普通入口产物。原失败日志为 `weather-map-ios-simulator-universal-failed.log`。
7. 使用真实天气的生产浏览器验证与固定天气的集成测试分列，示例天气在地图摘要也标示来源。保留原有 AI 凭据与证书，不为地图改版重新消耗模型调用。公网部署、GSC、真实用户 p75、实体手机与发布签名仍沿原报告的资源边界。

## 构建、签名和交付

`qa/build-local-mobile.ts` 明确以 `lib/main.dart` 构建 v1.1.2+4：Android debug；iPhone Air arm64 debug 模拟器；iOS arm64 release `--no-codesign`。Android 调试签名与 v1.1.1 一致，已实际覆盖安装启动。iOS 模拟器为 ad-hoc，已安装启动；真机产物未签名，不能冒充已可供真机安装。

构建命令与时间见 `weather-map-mobile-builds.json`；入口、签名／架构及普通包恢复校验见 `weather-map-artifacts.json`。日志投影在 `qa/evidence/logs/weather-map-*`，截图为 `weather-map-<宽度>.png`、`weather-map-production-<宽度>.png`、`weather-map-android-map-*.png`、`weather-map-ios-map-*.png`。

交付目录：`/Users/yzin/Documents/Codex/2026-11-16/weather-atlas-24-24-readme-md/outputs/v1.1.2`。

- `Weather-Atlas-Source-v1.1.2.zip`
- `Weather-Atlas-Android-Debug-v1.1.2.apk`
- `Weather-Atlas-iOS-Simulator-arm64-Debug-v1.1.2.app.zip`
- `Weather-Atlas-iOS-Device-arm64-Unsigned-v1.1.2.app.zip`
- `Weather-Atlas-Verification-Evidence.zip`、交付清单与 CRC／SHA-256／实际密钥排除结果

本地 Web 为 `http://localhost:3300/zh-Hans`，手机浏览器为 `https://192.168.5.22:3443/zh-Hans`，证书安装入口 3444 保留。启动 HTTP：`cd web && npm start -- --hostname 0.0.0.0 --port 3300`；HTTPS：根目录 `npm run dev:https`。Native 普通包默认 Android 模拟器 `10.0.2.2:3300`、iOS 模拟器 `127.0.0.1:3300`；真机在服务地址设置中改成局域网地址或公开 HTTPS。公网、真机与签名接续见 `qa/PUBLIC-ACCEPTANCE.md`。
