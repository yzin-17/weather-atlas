# Next.js 性能优化验收与取舍

日期：2026-11-17（Asia/Shanghai）。范围为 Web 切城与资源准备，保留现有 Flutter 产物、真实 AI 配置、HTTPS 证书及未提交修改。对应 [规格](../specs/2026-11-17-next-performance.md) 与 [任务](../tasks/next-performance.md)。

## 实现与操作

| 位置 | 实现 | 操作与观察 |
| --- | --- | --- |
| `web/components/PreparedLink.tsx`、`web/lib/prefetch-policy.ts` | 使用公开 `Link prefetch={true}` 完整预取动态页面；自动候选为收藏顺序的前两项，进入视野并停留 700 ms 后在空闲时准备；链接注册 8 秒后撤销，60 秒内同 URL 去重，每个标签页最多记住 100 项 | 100 城收藏仅自动准备成都、台北；聚焦伦敦后总数为 3，重复悬停／触摸不增加；窄屏首屏为 0 |
| `OtherCities.tsx`、`HomeIntro.tsx` | 更多收藏与首页目录仅在悬停／聚焦／触摸时预取；定位、导航或弹窗期间暂停其他城市预取 | 首页定位与显式城市深链保持原行为；省流量、2g、隐藏、离线为 0；3g 自动为 0，聚焦后为 1 |
| `web/lib/client-forecast.ts`、`OtherCities.tsx` | 同源、完整、新鲜的本机预报可直接提供摘要，保留真实抓取时间、0° 与天气代码 0；剩余摘要每批最多 20 座 | 台北完整缓存存在时摘要 API 为 0；演示缓存不能污染真实数据；100 收藏的 99 份缺失摘要为 5 批 |
| `WeatherScreen.tsx` | 搜索、地图及问答在操作意图时预热模块，捕获预热错误；地图同时准备 Leaflet，挂载时才建地图、请求瓦片 | 地图聚焦加载 2 个脚本、瓦片仍为 0；打开后 6 次受控瓦片请求；拖动天气 API 增量 0；问答意图不调用模型 |
| `next.config.ts`、`WeatherScreen.tsx` | 完整预取的静态路由缓存由默认 5 分钟缩为 60 秒，动态点击缓存为 0；较新的同源本机快照优先；达到 15 分钟则标旧并刷新；错误回退使用当前快照 | 新版本 99° 受控快照不会被旧 SSR 覆盖；过期、未来时间、坏时间、异源和 3 小时边界有回归；语言切换天气 API 为 0 |

现有 React 请求级 `cache()` 继续合并 metadata／正文读取；跨进程预报缓存仍为 15 分钟新鲜、3 小时旧数据、后台刷新与失败退避。原始 HTML 的可读天气和完整 head 保留。

## 五轮同条件前后数据

通过 `qa/next-performance.ts` 启动独立受控天气上游与生产服务，前后各五轮交替。每轮使用新进程、新磁盘缓存及新浏览器上下文，无其他 QA／构建并行。天气上游固定延迟 600 ms，Chromium 159.0.8154.6，1440×1000，六座目录城市收藏，首尔页可操作后同样停留约 2.6 秒，再点击台北。计时结束同时要求台北名称、8°、Asia/Taipei 和 24 小时全部匹配，不能只看 URL。

| 指标中位数 | 优化前 | 优化后 | 解释 |
| --- | ---: | ---: | --- |
| 点击至台北天气 | 664 ms | 71 ms | 减少约 89%；五轮优化后均命中预取 |
| 首屏 JS 传输 | 161,777 B | 162,787 B | 增加 1,010 B，约 0.62% |
| 首屏 LCP | 716 ms | 708 ms | 接近一个帧内波动，不据此宣称首屏显著提速 |
| 闲时页面预取 | 0 | 2 | 只准备前两座候选 |
| 闲时 RSC 传输 | 0 B | 6,300 B | 两份页面的总量，另于首屏 JS 记账 |
| 点击新增 RSC | 1 | 0 | 点击复用 Next.js 路由缓存 |
| 完整预报上游：点击前→后 | 1→2 | 3→3 | 优化后先取首尔和两候选；总量多一份未必被访问的预报 |
| 摘要上游／真实模型 | 1／0 | 1／0 | 每轮摘要一批；模型完全不参与 |

传输量使用 CDP `encodedDataLength`，包含响应传输开销。以上为本机受控上游实验，不代表公网速度或真实用户 p75；没有模拟带宽或 CPU 降速。预取只能提前承担等待，真正空缓存立即点击仍需等待上游。历史地图 A/B 的 198,824→153,262 B 与 447→800 ms 使用另一构建与实验条件，继续保留，不能与本表直接相减。

修改前构建保留在 `web/.next-perf-before`，最终比较构建在 `web/.next-perf-after`。复现命令：

```bash
cd /Users/yzin/code/weather-atlas
# 两份构建已在本机保留；新检出需要先在修改前、修改后各构建一次。
PLAYWRIGHT_BROWSERS_PATH=/Users/yzin/Documents/Codex/2026-11-16/weather-atlas-24-24-readme-md/work/browsers node qa/next-performance.ts
```

原始轮次、条件和请求计数为 `qa/evidence/next-performance.json`；构建及实验日志为 `qa/evidence/logs/next-perf-*-build.log`、`next-performance-benchmark-isolated.log`。脚本需要空闲的 3330／3331 端口，测试模型密钥置空，退出自动关闭测试服务；默认生产服务不受影响。

## 回归与证据

- `cd web && npm test`：实际 **71/71**，包括 4 项新增策略／快照测试；生产构建成功。
- `node qa/next-performance-check.ts`：独立最终比较构建运行 14 个浏览器场景，其中四宽度×四语共 16 个页面组合。100 城、缓存复用、数据源隔离、地图资源、受控预取失败后导航恢复通过；浏览器错误 0，真实模型调用 0。撤销预取注册后等 9 秒点击仍新增 0 RSC；打开搜索暂停新候选，超过缓存期再静置 62 秒，后台轮询仍为 0。结果在 `qa/evidence/next-performance-browser.json`。
- 同一独立构建的 `qa/seo-audit.ts`：原始 HTML 84 份通过，sitemap 28，见 `next-performance-seo-controlled.json`；`home-index-browser.ts`：四语／四宽度／目录入口与定位共 19 条，见 `next-performance-home-browser.json`；`ask-draft-check.ts`：受控回答 18 条、模型调用 0，见 `ask-draft-check.json`。
- 最终默认生产构建启动后，HTTP 与使用原有 CA 验证的 HTTPS 各检查 84 份 HTML，findings 为 0，sitemap 均为 28。证据分别为 `next-performance-production-seo.json`、`next-performance-production-https-seo.json`。首页定位／失败／迟到 GPS／深链与刷新专项两端各 9 条、页面错误 0，见 `next-performance-production.json`、`next-performance-production-https.json`；这是浏览器受控坐标与权限测试。
- 1440／1024／768／390 截图为 `qa/evidence/next-performance-<宽度>.png`；已查看 1440／390 实际图，内容与控件布局正常，单一问天气入口保留。四语切换没有天气 API 请求，canonical 与 JSON-LD 正确。
- 仅对本轮修改的 JS／JSX 使用 `node_modules/.bin/oxfmt --check`，结果通过，不格式化无关修改。

独立回归构建命令为 `cd web && NEXT_DIST_DIR=.next-perf-after SITE_URL=http://localhost:3300 npm run build`。`qa/next-performance-check.ts` 使用 3332／3333、新缓存和空模型密钥；可用 `QA_PERF_CHECKS=next-performance-browser` 单跑资源／缓存专项。QA 输出前缀区分 SEO、定位与性能，避免互相覆盖。

## 过程中的取舍

1. 不直接给所有收藏打开默认预取。完整动态天气会产生真实服务端计算和上游请求，因此只给前两候选自动预取；手机屏外不取，其余依用户意图。允许多一份可能没有被访问的天气，换取常用城市切换速度。
2. 当前 Next.js 的 `router.prefetch` 默认是自动／部分策略，不能据调用发生便认定完整天气已准备。采用文档明确支持的 `Link prefetch={true}`，不导入内部枚举，也不补自定义 RSC 协议。
3. 首轮所有可见项各自抢预算，回调顺序使候选不稳定：虽然有两次请求，台北多数未命中，点击中位数 664→666 ms。证据保留为 `next-performance-initial-observation.json`。修为收藏顺序的前两项通过可见性检查，复测五轮均命中。前两项在屏外时不会用后面的项填额度，行为更可预测。
4. 完整预取默认可保留五分钟。采用 Next.js 文档中的实验性 `staleTimes` 配置缩为一分钟，并做天气快照年龄检查；升级 Next.js 时必须复测此配置。没有增加定时器轮询路由或天气，没有延长天气 15 分钟／3 小时窗口。
5. 保留 SSR 与 metadata 的共享读取及等待完整 head 的策略，不用静态化实时城市页换取漂亮 TTFB。现有页面使用 SVG 与系统字体，本轮没有引入图片／字体包或额外性能依赖。
6. 模块在悬停／聚焦／触摸时准备，未把 Leaflet 加回首屏。商业瓦片和真实模型均不参与性能测量；已有 AI 密钥与模型配置在正常启动继续读取，但本轮不做付费模型调用。
7. 先前有一轮与浏览器回归同时运行，只作观察保留在 `next-performance-parallel-observation.json`，正式表格采用所有回归和构建结束后的独立五轮。公共 SEO、真实流量、实体手机仍按原报告门禁处理。

## 当前服务与交付

当前 HTTP 为 `http://localhost:3300/zh-Hans`，同网段手机为 `https://192.168.5.22:3443/zh-Hans`；继续使用既有证书安装服务 3444，未改 CA 与私钥。生产进程已换成当前构建，正常启动仍载入 `.env.ai.local`，没有把其内容带入报告或归档。

手动启动 HTTP：`cd /Users/yzin/code/weather-atlas/web && npm start -- --hostname 0.0.0.0 --port 3300`。HTTPS 与手机证书安装见 [本地 HTTPS](../../qa/LOCAL-HTTPS.md)。

本轮只修改 Web 与验收代码，Android／iOS 二进制沿用已验收的 v1.1.1+3；原生包无需为 Web 路由预取重建。最新源码仍交付至 `/Users/yzin/Documents/Codex/2026-11-16/weather-atlas-24-24-readme-md/outputs/v1.1.1/Weather-Atlas-Source-v1.1.1.zip`，交付清单及 CRC／哈希／实际密钥排除校验同目录保存。公开域名、部署、GSC 及真实用户 p75 没有新增验收事实。
