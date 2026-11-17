# 地图入口精简与验收

执行日期：2026-11-17（Asia/Shanghai）。

## 实现与取舍

按截图删除 Web “其他城市”下方的地图选点卡片。地图统一从顶部“搜索地点 → 地图选点”打开；窄屏顶部入口显示搜索图标。保留收藏城市、数据来源与必要署名。

实现位于 `web/components/WeatherScreen.tsx`，同时删除 `web/app/globals.css` 中卡片、等高线装饰及窄屏专用样式。没有留下占位空间。搜索弹窗继续按需加载地图；顶部搜索的意图预热保留，原侧栏地图卡片的预热随入口删除。

八个现有浏览器脚本改用顶部搜索路径。`qa/map-performance.ts` 在搜索窗口打开后开始计时，测量“点击地图按钮 → 可操作／首张瓦片”，首屏 JS 与 LCP 仍在打开搜索前取值。历史 A/B 数据保留原条件，本轮没有重测或推断性能数值。

本轮只修改 Web 与 QA。Flutter 地图及上一轮已验证的 Android／iOS 产物沿用，不重复构建原生安装包，也没有新增模型调用。

## 执行与结果

| 命令或操作 | 观察结果与证据 |
| --- | --- |
| 根目录 `npm run typecheck` | 根目录及 Web 严格类型检查通过；`qa/evidence/map-entry-cleanup-typecheck.log`。 |
| `cd web && NEXT_DIST_DIR=.next-map-entry-cleanup SITE_URL=http://localhost:3300 npm run build` | 生产构建通过；`qa/evidence/map-entry-cleanup-build.log`。 |
| `QA_DIST_DIR=.next-map-entry-cleanup QA_PERF_CHECKS=map-entry-browser,selection-loading-browser node qa/next-performance-check.ts` | 入口检查 16/16、加载流程 18/18，无页面脚本错误；`qa/evidence/map-entry-cleanup-browser.log`、`map-entry-browser.json`、`selection-loading-browser.json`。命令执行时保留本机代理环境，天气使用受控上游，未调用模型。 |
| 四语 × 1440／1024／768／390 浏览器检查 | 侧栏卡片不存在，页面无横向溢出；顶部搜索后可用键盘 Enter 打开地图、关闭地图；打开地图没有触发天气／摘要请求。截图：`qa/evidence/map-entry-cleanup-{宽度}.png`，人工核对桌面与 390px 全页图。 |
| 地图确认与导航 | 沿顶部搜索路径完成四语加载占位、旧天气隔离、连续选城、失败重试；复用既有 18 组专项，不重复执行无关原生和模型验收。 |
| 日常 HTTP／HTTPS | 新构建 `.next-map-entry-cleanup`；实际访问与本机 CA 校验结果见 `qa/evidence/map-entry-cleanup-service.json`。 |

## 首轮失败与验收边界

首轮运行 `map-clean-browser`，在等待拖动后所有真实 OSM 瓦片加载时超出 30 秒；服务日志记录瓦片上游 8 秒超时，未将本次归类为入口修复失败。保留 `qa/evidence/map-entry-cleanup-first-failure.log` 和对应服务日志。

随后新增独立入口专项 `qa/map-entry-browser.ts`，受控中止瓦片请求，只验证侧栏、布局、地图控件及请求预算；没有降低原 `map-clean-browser` 的底图通过条件。产品继续使用真实 OSM，没有配置测试图层。本轮不宣称真实底图全部加载、公开 SEO、真机或性能 A/B 重新验收通过。

## 服务与交付

Web：`http://localhost:3300/zh-Hans`；同一局域网手机：`https://192.168.5.22:3443/zh-Hans`，证书设置见 `qa/LOCAL-HTTPS.md`。

```sh
cd /Users/yzin/code/weather-atlas/web
NEXT_DIST_DIR=.next-map-entry-cleanup npm start -- --hostname 0.0.0.0 --port 3300
# 另一终端启动本地 HTTPS
cd /Users/yzin/code/weather-atlas
NEXT_DIST_DIR=.next-map-entry-cleanup npm run dev:https
```

源码归档目录：`/Users/yzin/Documents/Codex/2026-11-16/weather-atlas-24-24-readme-md/outputs/v1.1.2-map-entry-cleanup`。先导出静态源码快照再归档，保留其他并行修改；ZIP 的 CRC、凭据排除和 SHA-256 检查见目录中的清单与校验文件。上一轮原生产物位于同级 `v1.1.2-selection-loading` 目录。
