# 默认城市 SEO 补漏与复测

日期：2026-11-17（Asia/Shanghai）。本轮修改 Web 路由、公开目录与验收工具，保留已有并行修改。

## 实际原因与检查遗漏

用户提供的地址为 `/zh-Hans/explore?lat=22.5455&lon=114.0683&name=深圳&country=中国&id=1795565`。修复前直接请求日常 HTTPS：200、标题仅为 Weather Atlas、`noindex, nofollow`，无 canonical／JSON-LD；同机深圳固定路由为 404。因此本次反馈属实，不能以首尔等页面已有 SEO 回答所有城市都已覆盖。

`web/lib/catalog.ts` 原来只有六座公开城市。深圳与香港另放在默认列表和地名目录中，`placeURL` 却只查公开目录，因此默认城市点击后进入坐标页。此前 SEO 验收遍历六城 × 四语，默认列表验收还明确等待 `/explore`，两类检查没有交叉核对，遗漏了两座默认城市的公开页面。

## 修复与过程取舍

- 将深圳、香港纳入统一公开目录。默认列表顺序仍为首尔、深圳、香港，四语名称及天气坐标沿用已有数据。固定城市页面、SSR、元数据、JSON-LD、首页城市导航与 sitemap 复用同一目录，现为八城 × 四语，加四语首页，共 36 个 sitemap URL。
- 新增 `publicCityForPlace`：只有城市 ID 与目录坐标同时吻合（误差小于 0.00001 度）且不是 GPS／地图点，才使用公开城市路由。避免只凭 URL 中的 ID 把其他坐标天气改成目录中心点。
- `web/app/[locale]/explore/page.tsx` 在读取天气前识别旧命名城市链接，使用 Next.js `permanentRedirect` 返回 308。旧收藏／分享链接仍可用，不额外查询旧点天气。客户端 `placeURL` 直接生成公开地址。
- GPS、地图点、目录外地点与坐标不匹配的链接保持 `/explore`、原坐标及 noindex。本轮没有将任意坐标或无限搜索参数开放索引，也不把反查出的城市名当作改变天气坐标的依据。
- canonical／描述／hreflang 位于原始 HTML 的 `<head>`；JSON-LD 的原生 script 位于正文中，查看源代码搜索 `application/ld+json` 可找到，无需执行客户端脚本。沿用现有 WebSite／WebPage／Place 结构，没有添加天气富结果或虚构组织信息。
- 旧 QA 中固定的六个首页入口／28 个 sitemap 断言改为按公开目录计算，并新增“所有默认城市都有公开页面、元数据与 sitemap”的跨模块回归。保留两城旧链接四语 308、坐标 ID 冲突与 GPS／选点分支检查。

实现位置：`web/lib/catalog.ts`、`web/app/[locale]/explore/page.tsx`、`web/tests/seo.test.ts`；验收工具：`qa/seo-{audit,check,browser}.ts`、`qa/default-cities.ts`、`qa/home-index-browser.ts`。

## 执行、结果与证据

| 命令／操作 | 结果与证据 |
| --- | --- |
| `cd web && npm test` | 111/111，新增默认城市公开链接与 ID／坐标隔离回归；`qa/evidence/default-city-seo-tests.log`。 |
| 根目录 `npm run typecheck`、`npm run typecheck:audit` | 严格检查通过，类型审计仍为既有两处已说明的适配；`qa/evidence/default-city-seo-{typecheck,type-audit}.log`。 |
| `cd web && NEXT_DIST_DIR=.next-default-city-seo SITE_URL=http://localhost:3300 npm run build` | 生产构建通过；`qa/evidence/default-city-seo-build.log`。 |
| `QA_DIST_DIR=.next-default-city-seo QA_PERF_CHECKS=seo-audit,seo-browser,default-cities node qa/next-performance-check.ts` | 受控天气：108 份 HTML、36 个唯一 sitemap URL、无 SEO 问题；SEO 浏览器 18 项、默认城市 10 项通过。`qa/evidence/default-city-seo-controlled.log`。运行时沿用本机代理，不调用模型。 |
| `APP_URL=https://192.168.5.22:3443 SITE_URL=https://192.168.5.22:3443 QA_AUDIT_RUN=default-city-seo-https NODE_EXTRA_CA_CERTS=<现有 rootCA.pem> node qa/seo-audit.ts` | 日常真实服务与受信任 TLS：108 份 HTML 全通过，含 32 个城市与四个首页、三种 UA；36 项 sitemap；原始报告 `qa/evidence/default-city-seo-https.json`，日志 `default-city-seo-https-audit.log`。 |
| 相同 HTTPS／CA 环境，`QA_SEO_BROWSER_RUN=default-city-seo-https-browser node qa/seo-browser.ts` | 18 项通过：深圳／香港旧链接四语跳转、GPS／选点仍 noindex、深圳默认列表客户端跳转更新元数据、坐标页清理和前进／后退恢复。证据 `qa/evidence/default-city-seo-https-browser.json`。 |
| 相同 HTTPS／CA 环境，`QA_HOME_BROWSER_RUN=default-city-seo-home node qa/home-index-browser.ts` | 1440／1024／768／390 × 四语首页、语言菜单、八个城市链接无溢出；当前位置优先与授权流程通过。`qa/evidence/default-city-seo-home-browser.json`。 |
| 直接访问用户提供的完整旧 HTTPS 地址 | 308 → `/zh-Hans/weather/shenzhen-1795565` → 200。最终原始 HTML：深圳标题、index/follow、自指 HTTPS canonical、五个语言互链（含 x-default）及 WebSite／WebPage／Place JSON-LD；证据 `qa/evidence/default-city-seo-user-link.json` 和 `default-city-seo-shenzhen.html`。 |

首次首页浏览器运行报 `8 !== 6`，为旧验收对城市链接数量写死；更新为目录长度后使用同一条件通过，失败日志保留在 `qa/evidence/default-city-seo-home-first-failure.log`。没有据此修改产品布局或减少入口。

## 服务、交付与剩余边界

日常服务已使用 `.next-default-city-seo`。Web：`http://localhost:3300/zh-Hans`；用户原地址和 `https://192.168.5.22:3443/zh-Hans/weather/shenzhen-1795565` 均可访问。启动方式：

```sh
cd /Users/yzin/code/weather-atlas/web
NEXT_DIST_DIR=.next-default-city-seo npm start -- --hostname 0.0.0.0 --port 3300
# 另一终端启动局域网 HTTPS
cd /Users/yzin/code/weather-atlas
NEXT_DIST_DIR=.next-default-city-seo npm run dev:https
```

源码与校验目录：`/Users/yzin/Documents/Codex/2026-11-16/weather-atlas-24-24-readme-md/outputs/v1.1.2-default-city-seo`。从静态源码快照归档，校验 CRC、SHA-256 与实际模型凭据排除；原生代码未修改，安装包沿用 `v1.1.2-selection-loading`。本轮未重跑性能 A/B 或原生验收，未调用真实模型。

当前 HTTPS 地址是局域网地址。公网部署、正式域名、GSC 与真实搜索收录状态沿用总报告中的资源缺口，不能用本机 metadata 完整或 index 标记证明搜索引擎已收录。
