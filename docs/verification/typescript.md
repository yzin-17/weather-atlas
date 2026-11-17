# TypeScript 迁移验收与取舍

验证日期：2026-11-17。本机：macOS 27.2 arm64、Node 26.13.0、Next.js 16.4.6、TypeScript 5.9.3、Chromium 159.0.8154.6。项目目录：`/Users/yzin/code/weather-atlas`。本次承接 v1.1.2 的本地改动，不提交或重置 Git 工作区。

## 变更范围

迁移 145 个自有源码文件：Web 68 个、QA 74 个、工具 3 个；原扩展名分别为 112 个 MJS、22 个 JSX 和 11 个 JS，现使用 TS／TSX。第三方依赖、Flutter 的 Dart、生成文件和历史证据保持各自格式。同步更新导入、动态加载、脚本启动、测试发现、说明文档与 HTTPS 启动入口。

- `web/lib/types.ts`：四语、地点与标签、小时／每日天气、快照与摘要、AI 查询计划、比较上下文、依据及返回值。
- `web/lib/page-types.ts`：异步页面参数。`web/types.d.ts`：样式和网络信息声明。
- `web/components/*.tsx`：组件参数、状态、引用、事件、完整的四语文案键与 Leaflet 对象类型；地点名称加载期间与空天气明确分支。
- `web/lib/*.ts` 和 `web/app/**/route.ts`：服务端参数、缓存泛型、错误收敛、HTTP 结果及外部数据边界；保留原有运行时校验。
- `qa/lib/contracts.ts`、`qa/browser-types.d.ts`：受控验收数据和浏览器注入状态；Playwright 与原生命令使用对应类型。
- 根目录与 `web/tsconfig.json`：`strict`、`verbatimModuleSyntax`、`erasableSyntaxOnly`、`noEmit`；Web 明确关闭 `allowJs`。构建仍执行类型检查。

## 执行与结果

| 命令或操作 | 实际结果 |
| --- | --- |
| 根目录 `npm run typecheck` | 根目录 QA／工具和 Web 两层严格检查通过 |
| `cd web && npm test` | 81／81 通过（包含新增的本机快照类型守卫回归） |
| 根目录 `npm run test:qa` | 18／18 通过，含归档 CRC、密钥排除、入口检查和原生命令恢复 |
| 根目录 `npm run test:format-hook` | 5 种情景通过，真实索引与工作区保留；当前自有 151 个 TS／TSX 另经 Oxfmt 直接检查通过，Next 生成声明单列 |
| `cd web && NEXT_DIST_DIR=.next-typescript SITE_URL=http://localhost:3300 npm run build` | 生产构建通过，包含全部城市页和 API |
| 源码扫描 | 自有源码中没有残留 JS／JSX／MJS，也没有 `@ts-nocheck`、`@ts-ignore` 或显式 `any` |

浏览器回归和交付校验见下表。隔离实例使用受控天气上游、独立临时缓存和空模型凭据，不把受控结果记为实时天气或真实模型验收。

| 浏览器操作 | 观察与证据 |
| --- | --- |
| 隔离实例主流程冒烟 | 天气、搜索、摘要、四语原始 HTML、规则问答、依据与版本冲突通过；`qa/smoke.ts` |
| 定位竞态／深链 | 8 项通过，迟到定位不覆盖手动选择；`qa/evidence/home-location.json` |
| 地名加载状态 | 21 项通过，四语四宽度、失败／超时／旧响应；`qa/evidence/place-loading.json` |
| AI 草稿与连续追问界面 | 18 项通过，受控回答，模型调用 0；`qa/evidence/ask-draft-check.json` |
| 地图天气 | 22 项通过，38 张实际 PNG，页面错误 0；`qa/evidence/weather-map-browser.json` |
| 预加载与缓存 | 14 项通过，100 收藏预算、离线／慢网、失败恢复、较新快照、四宽度四语；`qa/evidence/next-performance-browser.json` |
| 四语首页 | 四语×1440／1024／768／390，菜单与定位通过；`qa/evidence/next-performance-home-browser.json` |
| 地图按需加载 | 首页 Leaflet 脚本／样式／瓦片均 0，打开后 1／1／12；`qa/map-resource-budget.ts` |
| 最终日常服务 | HTTP 与 HTTPS 各检查 84 份 HTML，发现 0，sitemap 28 项；`qa/evidence/typescript-seo-http.json`、`typescript-seo-https.json` |
| 最终生产地图 | 3 项通过，真实天气／瓦片及迟到 GPS；`qa/evidence/weather-map-production.json` |

本次请求预算观察沿用现有 Next.js 优化语义。此前 TTFB、LCP 与地图按需加载 A/B 数值继续作为历史数据保留在相应专项报告；本轮聚焦迁移后的类型、构建与实际流程。旧地图 URL 统计失败保留在 `qa/evidence/typescript-browser-first.log`。

## 过程中的取舍

1. **脚本直接运行。** 采用 Node 原生类型擦除，最低版本由 22／22.12 提升到 22.18；不增加运行时转译器。类型专用导入显式写 `import type`，避免 Node 把接口当成运行时导出。
2. **固定工具链。** 根目录和 Web 都锁定 TypeScript 5.9.3；初次安装取得的 7.0.2 不提供本次迁移使用的编译器 API，改为可与现有 Next 工具链验证的固定版本。两处锁文件保留独立安装方式。
3. **边界仍需校验。** 天气上游、模型计划、反查、坐标、时区、版本和指标的运行时校验继续保留；领域类型不能证明外部 JSON 有效。本机快照的类型守卫同步校验嵌套小时／每日字段，拒绝字段类型错误的缓存，补充零值与缺测回归。缺失降水概率仍为 `null`，不能转换为 0。
4. **缓存类型不改变缓存预算。** 共享存储的读取、锁与加载函数使用泛型；保持 15 分钟新鲜期、3 小时回退上限、跨进程锁及模型总限流。格式化后的大多数代码变化来自扩展名、类型及导入。
5. **测试中的非空假设。** 受控成功场景使用明确类型与非空断言，缺失数据仍会使原断言失败；定位与权限桩允许只构造该场景消费的字段，类型断言限于测试边界。生产组件按实际空值分支处理。
6. **保留历史证据。** 文档中的源码路径和可执行入口更新为 TS，历史测量值、失败记录与原生日志不重新解释为本次结果。纯服务端迁移沿用已验收的 v1.1.2 原生应用，记录为原产物复用。
7. **构建中发现的问题。** 首次生产构建发现 `WebVitals` 的类型导入位于 `use client` 前，已移回指令之后并重建通过；为地图缓存清理的动态文件读取补上已有缓存路径使用的 tracing 忽略标记。
8. **浏览器环境修复。** 首次浏览器回归因 Playwright 1.65.1 所需浏览器未安装而停止；补装 Chromium／Headless Shell 159.0.8154.6 后重新执行，不将首次失败记为产品通过。
9. **验收 URL 随产品同步。** 预加载专项前 12 个场景通过后，地图断言仍只统计旧的直连／测试瓦片 URL，漏掉现有 `/api/map-tiles/`，导致计数为零。已补齐统计与受控拦截规则，保留断言并复测；真实底图的 22 项独立验收另行使用真实 PNG。
10. **源码交付排除生成文件。** ZIP 排除 `next-env.d.ts`、`*.tsbuildinfo`、依赖、构建目录和私有环境文件；已有归档测试同时覆盖新增排除规则。干净环境通过安装和构建重新生成 Next 声明。

## 复现命令

```bash
npm ci
npm --prefix web ci
npm run typecheck
npm run test:qa
npm --prefix web test
cd web
SITE_URL=http://localhost:3300 npm run build
npm start -- --hostname 0.0.0.0 --port 3300
```

独立浏览器回归先在 `web/` 构建 `.next-typescript`，再回到根目录：

```bash
QA_DIST_DIR=.next-typescript QA_PERF_CHECKS=smoke,home-location,place-loading,ask-draft-check,weather-map-browser,next-performance-browser,seo-audit,home-index-browser,map-resource-budget node qa/next-performance-check.ts
```

首次运行浏览器测试前执行 `cd web && npx playwright install chromium`；真实 OSM 瓦片需要当前网络可达上游。测试服务使用 3332／3333，结束后自行关闭，不覆盖日常的 3300／3443 服务。


## 干净环境与交付

从排除依赖、缓存、构建及私有配置的源码 ZIP 解压到独立临时目录，先后执行根目录 `npm ci`、`web/` 下的 `npm ci`、两层严格检查、81 项 Web 测试、18 项工具测试和默认生产构建，全部通过。日志：`qa/evidence/logs/typescript-clean-install-final.log`。临时目录为 `/var/folders/v1/gvgmk4cx1mz59vj63jj8_9m80000gn/T/weather-ts-final-clean-6tvmhp2g/weather-atlas`。

新版交付目录：`/Users/yzin/Documents/Codex/2026-11-16/weather-atlas-24-24-readme-md/outputs/v1.1.2-typescript`。源码文件为 `Weather-Atlas-Source-v1.1.2.zip`；同目录提供原生 APK／iOS 归档、验收证据与 `DELIVERY-MANIFEST.json`。本轮 Flutter 源码与接口保持兼容，原生二进制复用 v1.1.2 已验收的正常入口产物，签名与真机／公网资源缺口继续按原报告单列。

日常服务已切换为 TypeScript 源码的生产构建：

- Web：`http://localhost:3300/zh-Hans`。
- 同局域网手机：`https://192.168.5.22:3443/zh-Hans`，证书安装说明见 `qa/LOCAL-HTTPS.md`。
- 标准启动：`cd web && npm start -- --hostname 0.0.0.0 --port 3300`；HTTPS 启动：根目录 `npm run dev:https`。
- 原构建保留在 `web/.next-before-typescript-20261117`；最终构建来自 `web/.next-typescript`。私有环境和 AI 凭据保留在本机配置中；本轮真实模型调用为 0。

归档完整性、CRC、实际凭据排除与清单 SHA-256 由 `qa/verify-delivery.ts` 检查，结果保存为交付目录中的验收 JSON。


最终 5 个归档均通过 CRC、实际凭据排除和清单 SHA-256 检查；检查记录为交付目录的 `ARTIFACT-VERIFICATION.json`。原生 APK SHA-256 与已验收 v1.1.2 相同，iOS 归档保留各自模拟器／未签名设备产物身份。
