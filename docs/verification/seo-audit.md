# SEO 全面巡检、修复与取舍

执行日期：2026-11-17，Asia/Shanghai。对应 [规格](../specs/2026-11-17-seo-audit.md) 与 [任务](../tasks/seo-audit.md)。本轮以当前工作区为集成基线，保留其他工具链修改，不提交或回退。完整原始输出保留于本机 `qa/evidence/`，并随更新后的源码／证据 ZIP 提供；Git 保留本摘要。

## 结论与检查范围

本机可执行的检查已覆盖：四语首页与城市页、普通浏览器／Googlebot／Twitterbot 原始 HTML、客户端语言与历史导航、canonical／hreflang／JSON-LD、分享图片、favicon、sitemap／robots、HTTP 索引头、参数与重定向、404／坐标／demo、天气失败与恢复、公开地址配置。发现六类问题并修复。HTTP 和现有 CA 验证的 HTTPS 各 84 份正常页面检查通过；demo 56 份检查通过；Node 64/64。

这里的“通过”表示下表范围内的本机实现和实际运行检查通过。没有公开部署、GSC、Google 富结果或站名展示的外部认证，也没有宣称搜索引擎已经收录。

## 发现、修复与依据

| 问题 | 基线观察 | 修复与实现位置 | 验证 |
| --- | --- | --- | --- |
| 分享图及语言不完整 | 首页／城市只有标题、描述和 URL，没有 `og:image`、`og:locale`；Twitter 为无图 summary | `seo.ts` 统一设置 OG locale／三种 alternate locale、图片尺寸／类型／四语 alt 和 Twitter 大图；`app/social-image/route.tsx` 在构建时生成 1200×630 PNG，复用原品牌 Mark | 28 页面×3 UA 检查；实际 PNG、尺寸、MIME、截图查看通过；三种查询重取哈希相同 |
| 根路径协商与缓存维度不足 | `fr-FR,ko;q=0.9` 落到英文，`ko;q=0.2,en;q=0.9` 落到韩文，且缺 `Vary: Accept-Language` | `locale-negotiation.ts` 处理权重、具体语言优先级、q=0、通配、空白和默认；根路径改为 `(home)/route.ts` 返回相对 307、Vary、private/no-store | 单元回归和每个源 6 种实际请求通过。最初 Next 配置中的 Vary 被页面渲染链覆盖，随后改用处理器；该次观察摘录为 `seo-vary-debug-observation.json`，最终记录无失败 |
| 站点地址错误被静默接受 | `new URL(...).origin` 会丢弃配置中的子路径／参数，缺配置时默认为 localhost:3000 | `site-config.ts` 校验 HTTP／HTTPS 根源、拒绝凭据／子路径／参数／片段；生产缺少地址明确失败，开发缺省为项目 3300；`next.config.ts` 在构建／启动时校验 | URL 单元用例和实际 Next 生产启动的缺失／子路径两个错误场景均明确失败；Host 伪造不改变 canonical |
| 空天气城市页仍允许索引 | 受控上游 503、空缓存时，城市响应 200、小时数 0，仍是 `index, follow` | `page-weather.ts` 通过 React cache 让 metadata 和正文共享同次读取，包括失败；城市无可用快照时暂时 noindex，有有效旧数据则保留 index | 最终构建的首次失败、恢复、16 分钟旧快照、超出 3 小时、浏览器重试均通过；每次成功／失败 SSR 上游都是 1 次 |
| demo 的 robots 与 noindex 冲突 | 页面声明 noindex，但 robots 全站 Disallow，爬虫无法读取页面规则 | `app/robots.ts` 的 demo 允许抓取页面以读取 noindex，继续禁抓 API；首页／城市仍 noindex，sitemap 仍为 0 | demo 4 首页＋24 城市×2 UA 全通过，robots 不再全站禁抓，原始页面均 noindex |
| API 缺明确非索引头 | 无效天气 API、GET ask／vitals 没有 X-Robots-Tag | 配置 `/api/:path*` 的 `X-Robots-Tag: noindex, nofollow`；保留 robots 的 API 禁抓，限制无穷参数抓取 | 实际天气错误响应及两个 405 响应均带 noindex 头，API 行为不变 |

修复前的原始巡检记录为 `seo-audit-before.json`，其中 344 条是跨页面／UA 重复出现的检查失败，不是 344 个独立产品问题。无缓存失败另见 `seo-failure-before.json`；demo 原规则见 `seo-demo-before.json`。最终同条件检查分别见 `seo-audit-final.json`、`seo-audit-https.json`，失败项均为空。

过程记录限制：Vary 第一次修复失败时的固定名称 QA 文件被成功复测覆盖，现保留的是本会话当时工具输出的观察摘录，不冒充完整原始日志。巡检脚本现会为失败结果额外保存带时间戳副本。该限制不影响仍保留的修复前完整巡检、故障基线和最终复测结果。

Open Graph 图片是协议的基本字段，locale 格式为 `language_TERRITORY`，见 [Open Graph 协议](https://ogp.me/)。阻止抓取会让 noindex 无法被读取，见 [Google noindex 说明](https://developers.google.com/search/docs/crawling-indexing/block-indexing)。HTTP 200 的空主体可能被识别为软 404，见 [Google 抓取错误说明](https://developers.google.com/search/docs/crawling-indexing/troubleshoot-crawling-errors)。

## 保留且已复核的合理规则

- live 的 4 个语言首页和 24 个城市 URL 均自指 canonical、允许索引。首页有独立介绍和六城入口，canonical 不指向默认首尔。根 `/` 是语言分流地址，不作为额外第 29 页进入 sitemap。
- HTML 和 sitemap 都有四语及 `x-default` 互指；28 个 sitemap URL 唯一、属于规范源，并对应实际 200 页面。没有虚构 `lastModified`，避免把每次请求时间冒充内容修改时间。
- `utm_source` 等跟踪参数不改变正文身份和 canonical；城市页中的其他坐标／名称参数也不替换目录城市。尾斜杠 308 到无斜杠规范路径；无效城市、语言、缺坐标、越界和重复坐标参数均 404／noindex。
- 任意坐标页保持 noindex/nofollow、无 canonical、无位置 JSON-LD，也不进入 sitemap。客户端从城市进入坐标页、浏览器前进／后退时，旧城市的 canonical 和结构化数据正确清理或恢复。
- 正常页面 head 中标题、描述、canonical、robots 均唯一；一个 h1；城市原始 HTML 有 24 个小时和可读正文。所有 UA 都等待 metadata，避免异步天气索引判断使标记落到 body；没有按爬虫提供另一份内容。
- JSON-LD 仅描述真实 WebSite／WebPage／公开城市 Place 与坐标，正确关联 URL／语言／主体，序列化转义 script 边界。没有给未知组织、评分、问答或天气数值编造结构化数据；未添加没有实际入口的 SearchAction 或没有可见对应内容的面包屑标记。
- favicon 的现有 SVG 链接可抓取、方形、全站稳定；传统 `/favicon.ico`、Apple 专用图标不是目前索引的必要条件，没有把它们的缺失当作必须改造应用的理由。依据为 [Google favicon 指引](https://developers.google.com/search/docs/appearance/favicon-in-search)。

## 取舍与实际边界

### 天气失败与 metadata 等待

城市存在但暂时没有任何预报时，保留可交互的 200 页面和搜索／重试，用临时 noindex 避免空预报参与索引；没有把真实城市伪装为不存在的 404。这个选择保留应用恢复路径，代价是该次抓取不能收录，需天气恢复后的再次抓取。网页点击重试能恢复天气；重载后原始 HTML 恢复 index。它不是向搜索引擎承诺故障已完全消失的 503／Retry-After 策略。

首页有独立稳定的服务介绍，天气暂不可用仍允许索引；城市有 3 小时内旧快照时仍有正文，保持 index 和实际采集时间／陈旧标识；超过上限则降级 noindex。15 分钟新鲜期、3 小时旧数据上限未变。

`htmlLimitedBots: /.*/` 关闭 metadata 流式插入，确保普通浏览器、爬虫和分享客户端的 head 一致完整；索引判断等待同一轮天气。`pageWeather` 在 metadata 与正文间共享成功或失败结果，不重复打上游。受控 400 ms 上游、同一 Python 客户端的单次冷请求：修复前 TTFB 506.23 ms／正文完成 506.26 ms，修复后 475.48／475.56 ms，上游均 1 次。这组单次值仅核对等待量级，不能当成性能提升或五轮 A/B。原地图 A/B、Lighthouse 和真实用户性能历史值未重算。

### 分享图片、默认语言与配置

分享图使用固定英文品牌和已有的 24 小时／7 天／四语事实；标题、描述、alt 和 OG locale 四语本地化。共用一个 PNG，不渲染动态天气或用户精确位置，不依赖外部字体，不增加天气／模型请求。三种不同查询重取相同 SHA-256；图片请求前后受控天气和模型计数均为 0。它是分享预览，不是当前城市天气截图。

根路径对支持的语言按权重和具体程度选择；没有可接受的支持语言时回退英文，不返回阻断浏览的 406。显式语言页面不自动切走。重定向 Location 为相对地址，不从不可信 Host 生成公开地址，也适用于既有 HTTPS 反向代理。

站点只支持部署到域名根路径，因此遇到 `SITE_URL=https://host/app` 明确拒绝，而不是假装支持子路径。生产要求显式地址；本地生产构建仍允许 localhost／局域网 HTTP 以便验收，公开发布应填写真实 HTTPS 根域名。`SITE_URL` 优先于 `NEXT_PUBLIC_SITE_URL`，不会从请求 Host 推断。

API 的 noindex 头是抓取防线，不是权限或隐私保护；robots 禁抓时爬虫可能读不到该头，因此不宣称它能清除所有外部已发现的 API URL。公开页面的 noindex 不用 robots 全站禁抓来替代。

## 实际执行、观察与证据

| 命令／操作 | 实际结果 | 本地证据 |
| --- | --- | --- |
| `cd web && npm test` | 64/64；配置、协商、响应头、四语 metadata／JSON-LD、可用性和 sitemap 回归 | `qa/evidence/logs/seo-audit-node.log` |
| `NEXT_DIST_DIR=.next-seo-audit npm run build`，独立生产实例 | 构建通过，修复后 84 页巡检及故障专项通过，再更新默认实例 | `qa/evidence/logs/seo-audit-build.log`、`seo-audit-qa.log` |
| `npm run build`，重启当前服务 | 默认生产构建通过，HTTP 3300／HTTPS 3443 继续可用；证书与私钥保留 | `qa/evidence/logs/seo-audit-build-final.log` |
| `APP_URL=http://127.0.0.1:3300 SITE_URL=http://localhost:3300 QA_AUDIT_RUN=seo-audit-final node qa/seo-audit.ts` | 28 页面×3 UA＝84 个页面结果，无失败；另测 Bingbot 和 5 个 HEAD 响应；URL 变体、6 种根路径协商、API 头、资源、伪造 Host、sitemap 图校验通过 | `qa/evidence/seo-audit-final.json`、同前缀首页／城市 HTML 及 PNG |
| 同脚本使用 HTTPS 源并设置现有 `NODE_EXTRA_CA_CERTS` | 84 个页面结果、证书、HTTPS canonical／图片／结构化数据通过；未关闭 TLS 验证 | `qa/evidence/seo-audit-https.json` 及同前缀 HTML／PNG |
| demo 3324 的 `WEATHER_MODE=demo ... QA_SEO_RUN=seo-audit-demo node qa/seo-check.ts` | 4 首页＋24 城市×2 UA＝56 份 HTML，无索引冲突；sitemap 0，robots 允许读取 noindex | `qa/evidence/seo-audit-demo.json`、`qa/evidence/logs/seo-audit-demo.log` |
| `node qa/seo-config-check.ts` | 实际启动在生产缺地址／含子路径时均明确失败 | `qa/evidence/seo-config-check.json` |
| `APP_URL=http://127.0.0.1:3322 QA_FAILURE_CACHE=<专项隔离目录> node qa/seo-failure.ts` | 最终默认构建的 6 条故障／恢复结果通过，每次 SSR 上游 1 次；实际点击重试、搜索可用，浏览器错误 0 | `qa/evidence/seo-failure-after.json`、`qa/evidence/logs/seo-failure-final.log` |
| `QA_SEO_BROWSER_RUN=seo-audit-browser-final ... node qa/seo-browser.ts` | 7 条实际浏览器结果；四语城市标记、进入坐标页、前进／后退正确，错误 0 | `qa/evidence/seo-audit-browser-final.json` |
| `QA_HOME_BROWSER_RUN=seo-audit-home ... node qa/home-index-browser.ts` | 四语×1440／1024／768／390、菜单／城市入口／恢复／授权定位共 19 条通过，无溢出，错误 0 | `qa/evidence/seo-audit-home-browser.json`、`seo-audit-home-*.png` |
| `APP_URL=http://127.0.0.1:3300 node qa/smoke.ts` | 真实天气、搜索、四语城市 SSR、规则问答及版本冲突通过 | `qa/evidence/logs/seo-audit-smoke.log` |

Playwright 使用本机已安装的 Chromium，运行命令显式设置工作目录中的 `PLAYWRIGHT_BROWSERS_PATH`。授权定位为受控浏览器坐标，不冒充真机 GPS。普通／Googlebot／Twitterbot UA 的原始 HTML 检查不等于已向外部爬虫提交页面。

最终生产服务自本轮重启至固定记录时点，trace 观察到主实例预报上游 1 次、摘要 1 次、地名搜索 1 次，HTTPS 实例未新增上游；大部分检查复用共享缓存。真实模型调用 0。完整事件计数及关键源码 SHA-256 保存在 `qa/evidence/seo-audit-source-network.json`，不是将页面请求数误当上游请求数。

## 交付、运行与外部门禁

交付目录：`/Users/yzin/Documents/Codex/2026-11-16/weather-atlas-24-24-readme-md/outputs/v1.1.1`。更新 `Weather-Atlas-Source-v1.1.1.zip`、证据附件和文档，清单记录新的字节数与 SHA-256。APK／两个 iOS 二进制未改变，继续适用原版本和签名验收。源码包包含当前保留的工具链改动，不用 Git HEAD 代替交付内容；以 ZIP 与清单锁定本次文件。

归档通过 `DELIVERY_DIR=<目录> node qa/package-delivery.ts` 生成，再运行 `node qa/verify-delivery.ts` 校验 CRC、当前环境实际模型密钥排除、普通应用入口及清单哈希；实际结果存于交付目录 `ARTIFACT-VERIFICATION.json`。

上述打包与校验实际通过。外层交付目录同时提供根／移动 README、qa 和 docs，保留 README 中的移动文档链接；源码 ZIP 内同步包含完整文档。核心实现文件与记录的 SHA-256 及归档内容再对照，避免以旧源码包代替本轮修复。

本机 [首页](http://localhost:3300/zh-Hans)、[城市页](http://localhost:3300/ko/weather/seoul-1835848)、[sitemap](http://localhost:3300/sitemap.xml) 保持可访问；同一局域网 HTTPS 为 `https://192.168.5.22:3443`。本轮独立 fixture／QA 实例完成后关闭，未停止其他项目服务。重启命令见主报告和 `qa/LOCAL-HTTPS.md`。

缺少项目公开域名／授权部署目标和 GSC 权限，因此公网可抓取、已提交、已收录、外部 Rich Results／站名／favicon 实际展示均未验证。资源到位后设置正式 `SITE_URL`，构建部署，运行本轮 `qa/seo-audit.ts` 与 `qa/seo-check.ts`，再按 `qa/PUBLIC-ACCEPTANCE.md` 提交 sitemap 并检查四语首页及代表城市；分别记录提交、抓取与收录状态。现有结构化数据只是明确页面与站点实体，不保证 [Google 站名](https://developers.google.com/search/docs/appearance/site-names) 或富结果展示。
