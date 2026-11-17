# 公网、真实供图、模型与真机接续验收

本文件列出资源到位后可直接执行的动作。当前实际状态以 `LOCAL-VERIFICATION.md` 为准，下面步骤本身不代表已完成。

## 真实服务与模型

天气出口需要可正常访问 Open-Meteo 预报端点。先前本机 429 已在 2026-11-17 收尾复测恢复，首尔／台北实际数据与模型联验另见主报告；本机 Node 26 使用现有进程级代理。部署环境仍需先运行 `node qa/live-weather.ts`，再执行 `APP_URL=https://<项目域名> node qa/smoke.ts`；保留新 JSON，核对 source 为 `open-meteo`，不假设本机恢复代表其他出口可用。

已按授权复用现有环境凭据运行 `gpt-4.1-mini`，四语受控天气及恢复后真实天气的独立调用、Web／原生记录见主报告。部署后使用服务端 `AI_API_KEY`、`AI_BASE_URL`、`AI_MODEL`，不要把密钥放入 `NEXT_PUBLIC_`、Flutter define、报告或源码 ZIP。设置 `WEATHER_TRACE=1` 后重启服务，收集 `model-call` 和 `model-result`，记录实际模型、调用次数、状态和耗时。比较模型需支持严格 JSON Schema；服务端继续独立校验和计算。

## 可选的商业四语样式

v1.1.2 默认真实 OSM 已在 Web、Android 与 iOS 模拟器验收，使用服务端瓦片缓存转发，不需要商业密钥。用户已取消地图内独立语言设置，应用界面四语保留；下面仅用于以后另行配置商业翻译样式，不能与当前默认 OSM 当地地名混为一项。

Web 配置四个 `NEXT_PUBLIC_MAP_STYLE_*` 和受来源限制的公开地图 Key，Flutter 配置四个 `TILES_*` XYZ URL 与 `TILES_ATTRIBUTION`。关闭所有测试瓦片开关，重新构建。

在主页面切换应用语言后重开地图，首尔、台北各选同一中心、缩放、图钉，保存 Network 真实请求 URL（报告隐去令牌），截图并标出可辨认的地名。另选供图数据中确实缺译的地点，检查实际回退与署名。不能把同一 OSM URL 的缓存清除当作本地化样式切换。

## 部署与搜索状态

需要项目既有部署目标、实际域名及相应权限。当前源码没有记录这些资源。得到目标后按其部署方式设置 `SITE_URL=https://<项目域名>`、`WEATHER_MODE=live`，关闭测试瓦片，保留持久缓存目录；完成部署后：

```sh
APP_URL=https://<项目域名> SITE_URL=https://<项目域名> node qa/seo-check.ts
APP_URL=https://<项目域名> SITE_URL=https://<项目域名> node qa/seo-audit.ts
APP_URL=https://<项目域名> node qa/smoke.ts
```

当前 live sitemap 应为 28 项（4 个可索引的语言首页＋24 个城市 URL）；demo 应为 0。首页保留自身 canonical，不指向默认首尔；根路径 `/` 为语言分流重定向，不单独列入 sitemap。

生产地址必须是 HTTP／HTTPS 站点根源，不能含子路径、查询、片段或凭据；正式环境使用 HTTPS。检查 `/social-image` 的 1200×630 PNG、四语 OG locale、Vary、API noindex 响应头，以及无可用天气快照时城市暂时 noindex／恢复后的 index。demo 应允许爬虫读取页面 noindex，而非全站 Disallow。源码或本地通过不代表分享平台缓存、Google 站名／favicon／富结果已更新；外部实际展示需部署后复核。

在 Google Search Console 使用该域名的既有属性，或按其实际要求完成 DNS／HTML 所有权验证；提交 `/sitemap.xml`，再对四语首页、首尔、台北、英文 London 等代表 URL 执行 URL 检查及实时测试。分别记录操作日期、sitemap“已提交”、实时测试“可抓取”和索引状态“已收录”。不能把提交成功写成收录成功。当前三项均未执行，无公网结果可替代。

## 真实用户指标

公开部署设置 `RUM_ENVIRONMENT=production`，确认浏览器 `/api/vitals` 返回 204，服务端执行 `cd web && npm run rum:report`。受控访问使用其他数据集。观察至少覆盖常用页面类型、四种语言与手机／平板／桌面，按实际样本量、窗口、分组 p75 报告；低流量分组注明不足，不能合并本地 Lighthouse 或受控访问伪造真实流量。

指标日记录在 `WEATHER_CACHE_DIR`，文件名为 `rum:YYYY-MM-DD` 的 SHA-256 摘要加 `.json`；可通过 `qa/rum-report.ts` 读取，无公开原始记录查询接口。字段不含精确定位、URL、问题正文或 IP。

## 真机与签名

需要可连接的 Android、iPhone，以及项目发布 Key／Apple Team 与描述文件。真机连接同一局域网的 `http://192.168.5.22:3300`，或公开 HTTPS；局域网地址可能变化，以当时 `ifconfig` 为准。手机浏览器定位需要 HTTPS，普通局域网 HTTP 只能验布局和手动搜索。

```sh
cd mobile
flutter devices
flutter run --profile -d <真机ID> --dart-define=WEATHER_API_BASE=https://<项目域名>
flutter test integration_test/app_flow_test.dart -d <真机ID> --dart-define=WEATHER_API_BASE=https://<项目域名> --dart-define=USE_TEST_TILES=true
```

主流程覆盖首次授权、拒绝后在系统设置恢复、真实 GPS、前后台切换、断网／恢复、切语言、地图和三轮追问。另用 profile 与 DevTools 录制逐小时往返横滑、至少 100 个收藏城市的长列表、地图放大／缩小／平移各 10 次，记录型号、系统、刷新率、帧预算（60 Hz 为 16.67 ms、120 Hz 为 8.33 ms）、慢帧数量和总帧数；保存原始时间线，修复后使用相同数据量与操作复测。

Android release 需要替换 `android/app/build.gradle.kts` 的 debug 签名配置后验证 `apksigner verify --print-certs`。iOS 需要真实 Team／设备描述文件签名，模拟器 `.app` 或未签名设备 `.app` 都不能称为可真机安装的 IPA。
