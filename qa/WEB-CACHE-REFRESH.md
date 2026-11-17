# Web 缓存刷新验收与取舍

日期：2026-11-17。范围：Web 后台更新缓存被视作刷新失败、未等待新快照的问题。沿用上一轮 Flutter 和天气 API 的修复，不重新构建移动端。

## 原因与实现

`stale=true` 有两种来源：SSR 立即返回旧快照并开始后台更新，以及等待上游失败后回退旧快照。此前 `WeatherScreen.reload` 和 AI 的预报刷新未传 `fresh=1`，会拿到前一种响应并结束等待，当前屏可能一直停留在旧快照及重试提示。Web 原有四语文本是“缓存预报 · 重试”；不能据此断言用户当时看到的具体请求确实失败。

- `web/components/WeatherScreen.tsx`：浏览器刷新等待共享更新；等待期间显示四语“正在更新缓存预报”，保留天气。明确请求失败，或等待后仍因上游故障回退旧快照，才显示“刷新失败，正在显示缓存预报”。成功清除提示。更新中禁用重复点击。
- 同一组件：SSR 缓存和仅有本地快照均尝试一次恢复。此前有本地快照、但 SSR 无天气时，因为要求 `initial` 存在而不发恢复请求；现已补齐。保留原有取消请求和城市隔离逻辑。
- `web/components/AskDialog.tsx`：版本过期后的当前城市、指定城市和双城刷新均带 `fresh=1`，再使用相应版本重试。
- `web/lib/ui-text.ts`：简中、繁中、英文、韩文分别提供更新中与失败文案。旧快照仍显示原获取时间。

## 验证与证据

| 命令／操作 | 实际结果 | 证据 |
| --- | --- | --- |
| `cd web && npm test` | 125 项通过，0 失败；含实际天气 API 缓存老化与新鲜缓存复用回归 | `qa/evidence/web-cache-refresh-unit.log` |
| 根目录 `npx tsc --noEmit`；`cd web && npm run typecheck` | 均通过 | `web-cache-refresh-types-final.log`、`web-cache-refresh-web-types.log` |
| `cd web && NEXT_DIST_DIR=.next-web-cache-refresh npm run build` | 生产构建通过 | `web-cache-refresh-build.log` |
| 根目录 `node qa/web-cache-refresh-browser.ts` | 21 项通过，浏览器异常 0 | `web-cache-refresh-browser.json`、`web-cache-refresh-browser.log` |
| 根目录 `node qa/web-cache-refresh-live.ts` | 已更新 HTTP／HTTPS 各四语，共 8 项通过；真实 Open-Meteo、非旧快照，切语言期间浏览器天气请求 0 | `web-cache-refresh-live.json`、`web-cache-refresh-live.log` |
| 使用本机根 CA 请求 HTTPS `robots.txt` | 校验证书与主机 IP 后返回 200 | `web-cache-refresh-tls.json` |

表内简写日志均位于 `qa/evidence/`。受控脚本自动启动独立生产实例和天气供方、创建临时缓存，结束后关闭实例并删除临时缓存，不改日常天气缓存。默认端口为 3338／3398，可用 `QA_REFRESH_PORT`／`QA_REFRESH_FIXTURE_PORT` 改端口；使用构建目录 `.next-web-cache-refresh`，也可通过 `NEXT_DIST_DIR` 指定已完成的生产构建。

受控覆盖：

1. 四种语言 × 1440、1024、768、390 宽度，共 16 项。缓存老化 16 分钟，上游延迟 1700 毫秒；原始 HTML 包含旧快照且无失败文案，浏览器显示更新中，收到新快照后消除提示。每项浏览器天气请求 1 次、天气上游请求 1 次，SSR 与浏览器合并更新，保留 24 小时预报且无页面横向溢出。SSR 天气读取耗时中位数 0.845 毫秒、最大 7.36 毫秒；这是受控环境中读取旧缓存的耗时，不是公网 TTFB。
2. 四语、390 宽度，共 4 项。上游真实返回 503，旧快照仍可读，显示失败与原获取时间；恢复供方并在独立测试缓存解除故障冷却后，手动重试成功。每项失败与恢复合计两次浏览器天气请求、两次上游请求。
3. 390 宽度，SSR 无天气、本地有有效快照，浏览器请求模拟断网；自动尝试恢复，失败后保留本地预报，恢复网络后手动重试成功。

截图：`web-cache-refresh-updating.png`、`web-cache-refresh-recovered.png`、`web-cache-refresh-live.png`。本轮没有发起模型调用；真实服务验证复用现有 `.env.ai.local`，未修改或提交密钥。headless Chromium 的本地证书信任绕过单独记录，TLS 由上表根 CA 请求独立验证；本轮未扩大为手机浏览器权限验收。

## 过程取舍

1. 保留 SSR 的后台更新，首个 HTML 仍可读；只有浏览器需要确认刷新结果时等待，不将全部页面改为阻塞上游。15 分钟新鲜期、3 小时回退上限、30 秒失败冷却和跨进程锁保持原值。`fresh=1` 复用有效缓存，不表示每次强制绕过缓存。
2. 浏览器等待会增加一次确认请求，并在过期时等待上游；已有共享锁会合并 SSR 和浏览器的工作。以一次恢复请求结束流程，不增加轮询或无限自动重试。明确失败继续提供手动重试；故障冷却期内重试可以继续返回旧数据。
3. 不把 `stale` 一律显示为失败，也不隐藏实际错误。SSR 缓存先显示中性状态；显式等待结果失败后显示失败，成功后清除。
4. 首次浏览器脚本用了历史首尔坐标，未命中当前公开城市的缓存，等待响应超时；已改为从当前城市目录读取坐标。保留 `web-cache-refresh-browser-first-failure.log`。新增日常检查脚本曾触发 `APIResponse` 推断错误，补充明确类型后通过；保留 `web-cache-refresh-types-first-failure.log`。均未通过放宽断言或跳过验收解决。
5. 沿用源码中的其他修改，只更换本轮生产构建目录。Flutter 已在前轮通过相同的等待更新协议，本轮没有改变其二进制或重复其验收。

## 运行入口

- Web：<http://localhost:3300/zh-Hans>。
- 同一局域网 HTTPS：<https://192.168.5.22:3443/zh-Hans>；原有证书安装入口 <http://192.168.5.22:3444/> 保留。
- 已更新服务均使用 `web/.next-web-cache-refresh`；运行记录见 `qa/evidence/web-cache-refresh-services.json`，日志为 `web-cache-refresh-http.log`、`web-cache-refresh-https.log`。

HTTP 重启命令，在根目录配置现有代理与共享缓存后执行：

```sh
cd /Users/yzin/code/weather-atlas/web
NEXT_DIST_DIR=.next-web-cache-refresh WEATHER_MODE=live \
WEATHER_CACHE_DIR=/Users/yzin/code/weather-atlas/.weather-cache \
SITE_URL=http://localhost:3300 npm start -- --hostname 0.0.0.0 --port 3300
```

HTTPS 重启命令：

```sh
cd /Users/yzin/code/weather-atlas
NEXT_DIST_DIR=.next-web-cache-refresh npm run dev:https
```

启动脚本继续载入本地 AI 配置；HTTPS 另载入既有 `.env.https.local`。端口已运行时无需重复执行。地址为本机和局域网服务，不是公网部署。
