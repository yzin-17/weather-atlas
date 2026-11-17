# 首页允许索引的调整与验收

日期：2026-11-17，Asia/Shanghai；Weather Atlas v1.1.1 的 Web 增量。

本文件保留首页开放索引阶段的规则与记录。后续 [SEO 全面巡检](seo-audit.md) 已将 demo 的 robots 全禁改为允许读取页面 noindex，并补齐分享、配置和故障策略；当前行为以该巡检记录为准。

首页进入策略后来按用户要求调整为 [默认请求当前位置](home-location.md)，不再优先恢复旧手选城市；本文件中的恢复场景仍为当时记录。城市 URL 与刷新保留选择、首页可索引和语言互链继续有效。

## 调整原因

此前因为首页会恢复个人城市或自动定位，将所有语言入口设为 noindex，并让固定城市承担公开索引。这是过于保守的产品取舍，不是天气应用或个性化功能的 SEO 必须条件。用户已明确希望首页收录，因此改为四语首页可索引，提供独立、稳定的服务端内容，客户端再恢复个人地点。

`index, follow` 表示允许索引；是否实际收录仍由搜索引擎决定。sitemap 能帮助发现页面但不保证收录，见 [Google 说明](https://developers.google.com/search/help/crawling-index-faq)。本机／局域网通过不能代替公开部署和 GSC 状态。

## 当前规则与实现

| 页面／模式 | 当前行为 | 实现 |
| --- | --- | --- |
| live 的 `/zh-Hans`、`/zh-Hant`、`/en`、`/ko` | `index, follow`，200，自指 canonical，四语与 `x-default` 互指；JSON-LD 为 WebSite／WebPage | `web/lib/seo.ts`、语言入口 `page.tsx` |
| 首页正文 | 四语独立的“全球城市天气”标题、实际功能说明、六个固定城市的普通链接；默认首尔预报保留；只有一个 h1，天气地点为 h2 | 服务端 `HomeIntro.tsx` 经 `ServerScreen.tsx` 传入 `WeatherScreen.tsx`，复用现有字号、留白、链接及焦点样式 |
| 四语城市页 | 原有 index、独立 canonical、城市 Place 结构化数据不变 | 城市路由与 `cityMeta` |
| `/` | 继续按 Accept-Language 做 307 到对应语言首页；它是语言分流地址，不作为独立内容加入 sitemap；默认版本和 `x-default` 为英文首页 | 原根路由保持不变 |
| 任意坐标页 | 继续 noindex，不进入 sitemap，不输出用户精确点的 JSON-LD | 原 Explore 路由保持不变 |
| demo | 首页／城市均 noindex，robots 禁爬，sitemap 为空，避免演示数据被当成真实天气索引 | 首页与城市元数据使用相同模式规则 |
| live sitemap | 4 个语言首页＋6 城市×4 语言，共 28 个 URL；只列规范内容地址 | `web/app/sitemap.ts` |

首页 canonical 保持自身，不指向首尔；品牌首页介绍与城市天气页承担不同内容。没有把语言首页合并成同一个 canonical，四语均可独立发现，语言互链规则参见 [Google 本地化页面说明](https://developers.google.com/search/docs/specialty/international/localized-versions)。公开部署仍须设置正式 `SITE_URL` 并重建，不能保留 localhost。

显式访问 `/ko` 或 `/zh-Hans` 时，URL 中的语言优先，不再被浏览器语言或旧偏好自动切走；这是对 [Google 多语言站点建议](https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites) 的落实。首页菜单切语言仍停留语言首页；用户已授权定位和上次手动城市恢复继续运行，进入目的城市时沿用显式语言。城市深链不触发首页恢复逻辑。

本轮没有增加主页天气预取或地图资源。六个首页城市链接使用 `prefetch={false}`，不随目录展示额外请求六份预报。四语正文与城市链接在原始 HTML 中真实可见，没有隐藏关键词或针对爬虫提供不同内容。

## 实际执行与证据

| 操作／命令 | 结果 | 本地原始记录 |
| --- | --- | --- |
| `cd web && npm test` | **59/59**，涵盖首页 canonical／语言／JSON-LD；新增 live 28 URL 与 demo 零 URL 的索引策略回归 | `qa/evidence/logs/home-index-node.log` |
| `NEXT_DIST_DIR=.next-home-index npm run build`，独立 3314 live／3315 demo | 生产构建及两种模式原始 HTML 验收通过，再更新当前服务 | `qa/evidence/logs/home-index-build.log`、`home-index-live.log`、`home-index-demo.log`；`qa/evidence/home-index-live.json`、`home-index-demo.json` |
| 默认目录 `npm run build` 并重启本项目实例 | 生产构建通过，3300 与既有 HTTPS 3443 恢复；保留证书、环境私有配置、天气缓存及其他项目服务 | `qa/evidence/logs/home-index-build-final.log` |
| `APP_URL=http://127.0.0.1:3300 SITE_URL=http://localhost:3300 QA_SEO_RUN=home-index-production node qa/seo-check.ts` | 普通浏览器／Googlebot 两种 UA 各检查 4 首页＋24 城市，共 56 份原始 HTML；head、索引信号、JSON-LD、首页正文／六城链接通过；无 noindex 响应头且 robots 未禁爬首页；sitemap 28、无效城市 404、坐标 noindex；根路径韩文请求 307 到 `/ko` | `qa/evidence/home-index-production.json` 及同名前缀首页／城市 HTML |
| 同脚本使用既有 HTTPS 3443 与现有 CA | 同样 56 份 HTML 通过，canonical／JSON-LD 使用 HTTPS 源；TLS 校验通过，sitemap 28 | `qa/evidence/home-index-https.json`、相应 HTML |
| `APP_URL=http://127.0.0.1:3300 SITE_URL=http://localhost:3300 node qa/home-index-browser.ts` | 四语×1440／1024／768／390，共 16 个页面组合，无横向溢出；单一 h1、城市链接触控高度≥44px；首页菜单四语更新 canonical／JSON-LD，实际点城市链接、恢复台北时保留韩文、已授权定位原坐标均通过；共 19 条结果，错误 0 | `qa/evidence/home-index-browser.json`、`home-index-1440.png`／`1024.png`／`768.png`／`390.png`、`qa/evidence/logs/home-index-browser-final.log` |
| `APP_URL=http://127.0.0.1:3300 node qa/smoke.ts` | 天气、搜索、四语城市 SSR、规则问答与版本冲突回归通过 | `qa/evidence/logs/home-index-smoke.log` |

本机已安装的 Playwright 浏览器位于工作目录，执行浏览器脚本时设置对应 `PLAYWRIGHT_BROWSERS_PATH`。浏览器拒绝定位及语言偏好是受控设置；授权定位用浏览器坐标覆盖，证明路由和语言行为，不声明为实体 GPS。实际检查桌面与手机宽度截图，沿用既有天气应用布局。

## 运行、交付与公网下一步

当前可打开 [简中首页](http://localhost:3300/zh-Hans)，查看源代码搜索 `name="robots"`，值为 `index, follow`；[sitemap](http://localhost:3300/sitemap.xml) 为 28 项。同一局域网已受信任 HTTPS 为 `https://192.168.5.22:3443`。临时 3314／3315 在完成后关闭。

源码、文档与证据 ZIP 更新到 `outputs/v1.1.1`；APK／iOS 二进制无变化，版本和签名保持原验收状态。源码归档与文件哈希重新校验，不覆盖旧版本历史验收结果。

目前没有公开项目域名／部署权限或 GSC 授权，仍无“已提交／公网可抓取／已收录”的实际结果。资源到位后：

1. 设置 `SITE_URL=https://<正式域名>`、`WEATHER_MODE=live`，构建并公开部署。
2. 用正式地址运行 `qa/seo-check.ts`，确认首页 200／可索引、自指 canonical／hreflang、JSON-LD、sitemap 28 项及 robots。
3. 在 GSC 提交 sitemap，对四语首页及代表城市页做 URL 检查和请求编入索引，分别记录提交、可抓取与收录状态及日期。此步骤须站点所有者权限，不能由本地成功推定完成。
