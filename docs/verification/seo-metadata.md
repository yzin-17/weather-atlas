# SEO 元数据与结构化数据补验

日期：2026-11-17，Asia/Shanghai；v1.1.1 的 Web 增量修复，Flutter 代码和原生安装包未变化。

本文件保留首次补齐元数据的记录。用户随后明确要求首页收录，当前首页已允许索引、sitemap 为 28 项；当前策略与新证据见 [首页索引调整](home-indexing.md)，下文的入口 noindex／24 项 sitemap 为此前阶段的选择和实测值。

## 问题与检查遗漏

用户反馈原始 HTML 未见 canonical、结构化数据。实际请求 HTTP 3300 和既有 HTTPS 3443 后发现：

- 固定城市页原有标题、描述、自指 canonical、四语及 `x-default` hreflang，位于原始 HTML 的 `<head>`；例如简中首尔和英文台北均存在。
- 默认语言入口 `/en` 只有标题和 `noindex, follow`，缺少描述、canonical、语言互链及分享元数据。
- JSON-LD 全站未实现。旧 `qa/seo-check.ts` 仅验城市页和基础索引信息，未验语言入口、JSON-LD 或客户端切换后的清理。此前“24 个城市 URL 通过”仅代表旧检查范围，不能说明结构化数据完整。

## 修复位置与取舍

`web/lib/seo.ts` 新增入口元数据、结构化数据图及安全序列化；`StructuredData.tsx` 为服务端原生 `script[type="application/ld+json"]`，由语言入口和城市 `page.tsx` 输出，无需客户端执行 JavaScript。

- 入口和城市都有标题、描述、自指 canonical、四语互指及 `x-default`、Open Graph、Twitter summary。canonical 使用显式 `SITE_URL`，不从请求头推断公开域名。
- 入口提供 WebSite／WebPage；城市另提供 Place／GeoCoordinates，与当前语言、城市名称和公开目录坐标一致，WebPage 的 URL 与 canonical 相同。使用 [WebPage](https://schema.org/WebPage)、[Place](https://schema.org/Place) 标准类型，不虚构专用天气富结果类型，不加入未经核验的评分、组织、图片或天气数值。
- 入口会恢复个人收藏或定位，因此继续 `noindex, follow`；固定城市才承担公开索引。任意坐标页继续 noindex，不输出精确位置 JSON-LD、不继承上一城市 canonical。demo 城市继续 noindex，sitemap 仍只收录 live 的 24 个固定城市 URL。
- 按本机 Next.js `node_modules/next/dist/docs/01-app/02-guides/json-ld.md` 的建议，服务端输出 JSON-LD 并转义 `<`；另转义 Unicode 分隔符，防止字符串提前结束 script。序列化回归验证可还原原值。
- 不改变原有 metadata 流式配置：修复前后普通浏览器及 Googlebot 的实际响应均能在 head 读取关键元数据。没有为 SEO 增加天气请求、模型调用或第三方脚本。

结构化数据有助于描述页面，但不保证搜索引擎展示富结果，参见 [Google 结构化数据说明](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data)。本机验证不等于公网收录或 Google Rich Results 资格认证。

## 命令、结果与证据

| 命令／操作 | 实际结果 | 本地证据 |
| --- | --- | --- |
| `cd web && npm test` | 58/58；新增 3 项覆盖 24 城市／语言元数据与图的关系、入口不冒用默认城市及安全序列化 | `qa/evidence/logs/seo-node-all.log` |
| `NEXT_DIST_DIR=.next-seo-build npm run build`，隔离 3314 生产服务 | 构建与扩展 SEO 通过后再更新当前服务 | `qa/evidence/logs/seo-web-build.log`、`qa/evidence/seo-expanded-qa.json` |
| `npm run build` | 默认生产目录构建通过；仅重启本项目 HTTP／HTTPS，保留原证书、端口和环境配置 | `qa/evidence/logs/seo-web-build-final.log` |
| `APP_URL=http://127.0.0.1:3300 SITE_URL=http://localhost:3300 QA_SEO_RUN=seo-metadata-final node qa/seo-check.ts` | 4 入口＋24 城市，普通浏览器／Googlebot 两种 UA 共 56 份原始 HTML；head、JSON-LD 全通过；sitemap 24、无效城市 404、坐标页 noindex／无结构化位置 | `qa/evidence/seo-metadata-final.json`、`seo-metadata-final-home.html`、`seo-metadata-final-city.html` |
| 同脚本使用 `APP_URL`／`SITE_URL=https://192.168.5.22:3443`，`NODE_EXTRA_CA_CERTS=<现有 rootCA.pem>` | 56 份原始 HTML 全通过，canonical／图中的域名均为该 HTTPS 源；TLS 通过现有 CA 校验 | `qa/evidence/seo-metadata-https-final.json` 及同名前缀 HTML |
| `node qa/seo-browser.ts`（使用已安装的 Playwright 浏览器目录） | 390 宽度实际浏览器：入口、四语客户端导航、进入坐标页时清除旧 canonical／JSON-LD，全通过；页面错误 0 | `qa/evidence/seo-browser-final.json`、`qa/evidence/logs/seo-browser-final.log` |
| `APP_URL=http://127.0.0.1:3300 node qa/smoke.ts` | 原天气、搜索、四语 SSR、问答与版本冲突回归通过 | `qa/evidence/logs/seo-smoke-final.log` |

原始证据仍按项目约定留在本机 `qa/evidence/`，并随源码／证据 ZIP 提供；Git 保留本摘要。现有服务：[简中入口](http://localhost:3300/zh-Hans)、[首尔城市页](http://localhost:3300/zh-Hans/weather/seoul-1835848)。打开“查看网页源代码”，搜索 `rel="canonical"`、`hrefLang` 和 `application/ld+json` 可直接复核。

## 交付与剩余边界

源码和独立证据 ZIP 更新至原 `outputs/v1.1.1` 目录，清单哈希同步更新；APK 与两个 iOS 包保持原已验证产物。HTTP 3300 和 HTTPS 3443 继续可访问，临时 QA 3314 在完成后关闭。

当前无项目公开域名／授权部署目标或 GSC 权限，未提交 Google sitemap，公网可抓取、已收录、Rich Results 外部检测均未验证。资源到位后设置正式 `SITE_URL`、重建部署，执行扩展 `qa/seo-check.ts`，再按 `qa/PUBLIC-ACCEPTANCE.md` 检查和提交；不能用局域网 HTTPS 的通过替代这些状态。
