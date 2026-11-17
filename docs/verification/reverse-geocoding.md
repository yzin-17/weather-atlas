# v1.1.1 反向地理编码验收

验收日期：2026-11-17，Asia/Shanghai。对应 [规格](../specs/2026-11-17-reverse-geocoding.md)、[任务](../tasks/reverse-geocoding.md)；完整过程与安装方式见 [本地报告](../../qa/LOCAL-VERIFICATION.md#v111-反向地理编码增量验收)。

## 2026-11-17 Web 城市名加载态补充

针对坐标解析期间大标题直接显示长坐标的问题，`usePlaceLabel.tsx` 现在分别返回地点与解析状态。`WeatherScreen.tsx` 在未取得当前语言城市名时显示四语“正在识别城市…”与旋转提示，带 `role=status`、`aria-busy`；减少动态效果的系统偏好下停止动画。标题保留一行高度，小字继续显示原坐标；国家缺失时使用“所选位置”，避免把“当地时间”放在地名位置。

成功后显示城市名；无结果、503 或原有 8.5 秒客户端超时后结束加载，回退区域名或四位小数坐标。已有有效名称不被失败结果清除，缓存命中后直接显示名称。状态按坐标与语言识别，旧请求完成不能覆盖新选择；加载提示只用于展示，不写入收藏、分享链接或 AI 的地点对象。天气仍独立按原坐标获取，不等待地名。

验收命令与结果：

- `cd web && npm test`：实际 71/71；独立 `.next-place-loading` 与默认生产构建均成功。
- `QA_DIST_DIR=.next-place-loading QA_PERF_CHECKS=place-loading,reverse-browser node qa/next-performance-check.ts`：加载态专项 21 条通过（四宽度×四语 16 组，外加 503／无结果／超时／有效名称缓存／迟到结果五组）；原地图选点、四语、收藏改名与 GPS 回归 7 条通过。最终复测分开执行，日志分别为 `place-loading-browser-final.log`、`place-loading-reverse-final.log`。
- `APP_URL=http://127.0.0.1:3300 QA_PLACE_RUN=place-loading-production node qa/place-loading.ts`：默认生产服务再次通过 21 条，解析期间可见 24 小时天气，坐标保持 `30.5542,104.0596`，地名完成没有新增天气请求；浏览器错误与真实模型调用均为 0。结果 `qa/evidence/place-loading-production.json`；独立受控上游结果为 `place-loading.json`。
- 最终 HTTP／原有 CA 校验的 HTTPS 原始 HTML SEO 各 84 份通过，sitemap 28，结果为 `place-loading-seo.json`、`place-loading-https-seo.json`。固定城市页不出现地名加载提示。

已查看 1440／390 的加载截图及英文窄屏解析完成截图，证据为 `qa/evidence/place-loading-1440.png`、`place-loading-390.png`、`place-loading-390-resolved-en.png`；默认生产截图使用 `place-loading-production-` 前缀。实际解析使用受控名称响应，包含真实等待超时，没有把本轮模拟名称当作 Photon 真实数据。

过程取舍：不阻塞整页天气，也不把“正在识别城市”当作城市名保存。保留一行标题而不为未知名称预留多行空白；16 组样本中 15 组下方日期纵向位移为 0，390 英文因“所选位置”换成短国家名上移 18 px，页面无溢出。初次零位移断言过严，保留其观察记录，改为限制最多一行自然重排并记录实际差值。生产首测还发现旧天气合法刷新会产生天气 API 请求，因此验收统计地名完成前后的请求增量，并核对所有请求仍使用原坐标，而不错误要求整页请求恒为零。

当前 HTTP 3300 与 HTTPS 3443 已更新，原模型配置与证书保留。源码 ZIP 和取舍记录同步；本轮仅修改 Web，Android／iOS 二进制沿用已有 v1.1.1+3，不宣称原生端新增此加载界面。完整交付见 [本地报告](../../qa/LOCAL-VERIFICATION.md)。

## 实现与取舍

- `web/lib/reverse.ts`、`web/app/api/reverse/route.ts` 代理 Photon／OpenStreetMap。只返回名称元数据；忽略反查几何坐标，不把选点吸附到城市中心。优先城市，其次区域，最后原坐标。公共实例无 SLA；发布前应配置兼容 Photon 的自建或有保障服务。
- 首次实测 2.5 秒预算导致三个城市超时，保留失败记录后改为独立 6 秒。客户端预算 8.5 秒，名称与天气并行；上游拥堵时直接降级。成功缓存 7 天、失败 5 分钟、故障旧名称上限 30 天，每个缓存命名空间最多 1024 条。与天气缓存分开，共享目录全局串行且开始间隔至少 1 秒。
- `usePlaceLabel.tsx` 和 Flutter `controller.dart` 用地点／语言／服务／意图令牌阻止迟到名称覆盖新选择；旧收藏可原地改名，改名不重取天气摘要。目录点无反查，拖图和未确认点无反查。已知城市四语翻译；京都保留上游 `Kyoto`，地区字段可能保留英文。分享查询参数中的名字不能作为已验证标签。
- 原坐标会发给天气和反查供方；不额外采集完整街道地址、不扩大定位精度。反查日志仅有类别／状态／耗时，缓存键使用供方与坐标的哈希；RUM 不新增地点字段。

## 实际结果

| 操作／命令 | 结果 | 本地原始记录 |
| --- | --- | --- |
| `cd web && npm test` | 55/55，新增反查 7 项；真实 HTTP 超时、容量、跨实例复用／间隔、四语及回退通过 | `qa/evidence/logs/reverse-node-all.log` |
| `flutter analyze`、`flutter test` | 无分析问题、21/21，新增 5 项 | `qa/evidence/logs/reverse-flutter-*.log` |
| `APP_URL=http://127.0.0.1:3300 node qa/reverse-browser.ts` | 1440／390 宽度，7 个结果场景；四语切换天气增量 0、收藏改名摘要增量 0；GPS、原点分享、回退与竞态通过 | `qa/evidence/reverse-browser.json`、`reverse-web-*.png` |
| `node qa/reverse-live.ts` | 首尔、台北、京都、海上 × 四语共 16 次 API 查询；三城城市级结果、海上为空。首尔冷反查 2458 ms，其余语言缓存约 1–4 ms；不把已缓存城市当作冷测 | `qa/evidence/reverse-live.json`、`reverse-live-before-timeout-fix.json` |
| 两端 `flutter test integration_test/reverse_flow_test.dart -d <设备ID> ...` | Android／iOS 各 1/1，约 30／35 秒；真实 HTTP、实际菜单及剪贴板，六个场景通过 | `qa/evidence/reverse-android.json`、`reverse-ios.json` |
| 两端 `integration_test/app_flow_test.dart` | 各 1/1，约 50／47 秒；原天气、四语、地图、三轮规则问答和城市依据通过 | `qa/evidence/logs/reverse-*-app-regression.log` |
| `node qa/reverse-upgrade.ts`（专用空白 Android 模拟器） | 实际旧包安装、`install -r` 新包；旧 `point` 自动改名台北，收藏、25.0478／121.5319、manual 模式、服务地址保留 | `qa/evidence/reverse-upgrade.json`、`reverse-upgrade-*.png` |
| 普通 iOS 应用＋XCTest 复制链接，再 `IOS_DEVICE=<ID> node qa/reverse-ios-normal.ts` | 旧点／收藏补名，实际剪贴板原坐标链接在浏览器打开仍为台北；安装与构建 kernel 一致，含反查功能、无测试入口 | `qa/evidence/reverse-ios-normal.json`、`reverse-ios-normal.png` |
| 生产 `npm run build`、`qa/smoke.ts`、`qa/seo-check.ts` | 构建及 smoke 通过；真实天气 24 个城市原始 HTML、sitemap、404／noindex 通过 | `qa/evidence/logs/reverse-smoke.log`、`reverse-seo.log`、`qa/evidence/seo-v1-1-1.json` |

原生专项为 Android 17／API 37 `sdk_gphone64_arm64` 模拟器、iOS 26.5 iPhone Air 模拟器；不是实体 GPS 验收。集成阶段的旧链接记录还含 `labelLocale`，最终源码已去除此非必要参数，普通包剪贴板与 Web 回归使用最终格式。最初集成脚本语法错误、浏览器测试选择器错误保留原始日志，不计作产品功能通过。

## 产物与边界

版本 `1.1.1+3`；Android 普通入口 Debug APK 为 159,127,250 B、Android Debug 签名。iOS 为 arm64 模拟器 Debug／ad-hoc 和 arm64 设备 Release／未签名，最低 iOS 15；设备产物须 Apple Team 签名后才能安装。普通模拟器构建提示 `SdkRoot`，但 Xcode 构建、实际安装启动、kernel 比对和分享深链均已独立验证通过。

交付目录：`/Users/yzin/Documents/Codex/2026-11-16/weather-atlas-24-24-readme-md/outputs/v1.1.1`，文件名及哈希见该目录 `DELIVERY-MANIFEST.json`。旧 v1.1.0 产物和历史证据保留。原始文件随源码及独立证据 ZIP 提供，不在 Git 跟踪范围内；上表为恢复附件后的路径，不覆盖原验收基线清单。

本轮新增真实模型调用 0 次。原性能 A/B、85 次模型调用及真实用户样本结论保持原条件和日期，未将反查耗时作为天气性能改善。HTTP 3300 与既有局域网 HTTPS 3443 保持可用；HTTPS 证书与私钥未改写、未打包。公网、GSC、商业地图、实体设备／发布签名、真实 RUM 流量仍按主报告缺口处理。
