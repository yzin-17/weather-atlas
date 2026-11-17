# 迟到授权后的定位恢复

日期：2026-11-17（Asia/Shanghai），Web 增量。

## 原因与验证边界

旧实现仅调用一次 `getCurrentPosition`。请求若先失败，页面只显示错误，没有监听权限后来变成 granted，因此不会自动再请求。用受控浏览器构造“首次返回 TIMEOUT，稍后允许权限”，旧版停留首页，5 秒等待跳转失败；证据为 `qa/evidence/location-grant-before-browser.json` 与同名前缀日志。

等待用户授权本身不应算入定位的 10 秒获取位置超时，参见 [W3C timeout 说明](https://www.w3.org/TR/geolocation/#timeout-member)。因此不能仅凭截图说“点允许超过十秒就必然失败”；本轮没有取得截图浏览器那次真实的错误码，也不据此断言是 TIMEOUT 或操作系统权限问题。已确认的是失败后的权限恢复缺口。

截图仍为旧的八城列表；检查当日日常服务已经输出深圳及六城推荐。已有标签页不会自动替换正在执行的旧脚本，修复部署后需要刷新该页。

## 实现与取舍

`web/lib/device-location.ts` 管理单次定位及权限恢复，`WeatherScreen.tsx` 接入：

- 不额外给权限弹窗设置十秒倒计时。仍使用浏览器获取位置的 10 秒 timeout、零 maximumAge 与低精度选项。
- 支持 Permissions API 时监听权限变化。首次请求已失败、用户随后允许，则自动重试一次；首次请求仍在正常等待时不重复请求。若允许后原请求才返回错误，仍能执行这一次恢复。
- 自动恢复最多一次。持续拒绝、超时或定位服务不可用不会造成循环请求；恢复仍失败时保留错误与手动选城流程。浏览器没有 Permissions API 或查询拒绝时，直接定位和迟到成功回调仍可用；查询不可用时不能宣称支持权限变化事件。
- 定位成功、手动搜索／选城、切语言、进入地图、关闭操作与组件卸载时移除监听。保留选择序号，迟到位置及迟到授权都不能覆盖用户选择。
- 定位任务的取消移到组件卸载生命周期，天气快照更新的 effect 不再取消尚待用户授权的定位。此项为解耦修复，没有把它宣称为截图已证实的触发条件。
- 不增加天气、模型、持续 GPS 监听或权限轮询；不改变默认深圳、六城推荐、GPS 原坐标及公开 SEO 策略。

八项新单元测试位于 `web/tests/device-location.test.ts`；浏览器新专项 `qa/location-grant-browser.ts`，其注入字段仅在 `qa/browser-types.d.ts` 声明。

## 命令与结果

| 命令／操作 | 结果与证据 |
| --- | --- |
| `cd web && npm test` | 120/120；覆盖允许后恢复、首请求继续等待、一次恢复上限、手选／取消、权限查询延迟及不支持查询；`qa/evidence/location-grant-web-tests.log`。 |
| 根目录 `npm run typecheck`、`npm run typecheck:audit` | 严格检查与类型审计通过；`qa/evidence/location-grant-{typecheck,type-audit}.log`。修改文件格式检查通过。 |
| `cd web && NEXT_DIST_DIR=.next-location-grant SITE_URL=http://localhost:3300 npm run build` | 生产构建通过；`qa/evidence/location-grant-build.log`。 |
| `QA_DIST_DIR=.next-location-grant QA_PERF_CHECKS=location-grant-browser,home-location,home-index-browser,seo-browser node qa/next-performance-check.ts` | 受控天气：6 项授权专项、8 项既有定位、19 项四语四宽度首页、18 项 SEO 浏览器通过。模型调用 0；`qa/evidence/location-grant-controlled-final.log`。固定报告 `location-grant-{browser,home-location,home-browser,seo-browser}.json`。 |
| `APP_URL=https://192.168.5.22:3443 QA_GRANT_RUN=location-grant-https node qa/location-grant-browser.ts` | 当前日常 HTTPS 六项全通过，无页面错误。四语首次定位失败后允许，均重试一次并进入原 GPS 坐标；实际等待 12041ms 后允许仍可用，只有一次定位；失败后已选东京，迟到授权与结果不覆盖。`qa/evidence/location-grant-https-browser.json`。 |

本轮授权专项中的权限状态与坐标均受控注入，以验证 Web 状态处理，不是截图设备真实 GPS／系统权限验收。原有浏览器原生授权场景由 `home-location` 与首页浏览器回归覆盖。

## 回归中遇到的问题

第一次扩展回归在首页语言切换等待超时；第二次加入诊断后仍在元数据等待失败。检查发现旧 `home-index-browser` 权限模拟对象只有 state，缺少标准 PermissionStatus 的事件接口。改为基于 EventTarget 的模拟对象，保留真实权限接口语义，最终全套同条件通过；失败日志分别保留为 `location-grant-first-regression-failure.log`、`location-grant-regression.log`。没有通过放宽时间或生产接口来绕过。

## 服务、源码与产物

当前生产构建为 `.next-location-grant`。Web：`http://localhost:3300/zh-Hans`；手机／当前截图同一地址：`https://192.168.5.22:3443/zh-Hans`。

```sh
cd /Users/yzin/code/weather-atlas/web
NEXT_DIST_DIR=.next-location-grant npm start -- --hostname 0.0.0.0 --port 3300
# 另一终端启动本地 HTTPS
cd /Users/yzin/code/weather-atlas
NEXT_DIST_DIR=.next-location-grant npm run dev:https
```

新源码与报告目录：`/Users/yzin/Documents/Codex/2026-11-16/weather-atlas-24-24-readme-md/outputs/v1.1.2-location-grant`。Web 使用本轮通过的源码；原生部分沿用上轮已验收的 `work/shenzhen-default-source/weather-atlas/mobile`，保留根工作区并行 AI 改动。本轮没有修改原生代码或重复构建，Android／iOS 产物仍位于 `outputs/v1.1.2-shenzhen-default`。ZIP 经过 CRC、实际凭据排除和 SHA-256 校验，清单放在交付目录。
