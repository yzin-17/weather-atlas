# 首页默认定位当前位置

日期：2026-11-17，Asia/Shanghai。本轮按用户最新要求调整 Web 四语首页的进入策略；Flutter 启动偏好和原生二进制未变。

## 当前行为与取舍

- 进入 `/zh-Hans`、`/zh-Hant`、`/en`、`/ko` 后，浏览器水合即调用定位。即使之前存了手动城市，也先请求当前位置；再次点品牌首页会重新定位。原先的 `wa.mode=manual` 提前恢复旧城市分支已移除，不删除收藏或历史选择。
- 第一次由浏览器请求授权；已授权时直接获取。移除 Permissions API 的前置依赖，避免不支持该接口的浏览器无法继续。应用不能越过浏览器／系统的权限拒绝。
- 定位使用 `maximumAge: 0` 请求新位置，沿用 `enableHighAccuracy: false` 和 10 秒超时。相比原来的 10 分钟位置缓存，优先反映当前所在地点，代价是获取可能更慢；没有扩大精度或增加后台定位。
- 拒绝、超时、不可用、不支持、非安全来源时，保留明确提示与手动搜索，不再自动跳到旧城市。用户本次手选仍优先于迟到的位置回调。
- 显式城市／坐标链接及刷新继续尊重 URL，不自动定位；首页和城市深链的含义不同。当前语言不因浏览器偏好被切走。
- 服务端无法获得设备位置，首页仍输出稳定的介绍和默认城市预报以支持原始 HTML 与 SEO；不会用 IP 猜测用户城市。浏览器收到位置后进入原坐标天气页，异步反查名称，坐标页仍 noindex。首页 canonical、四语互链、28 项 sitemap 保持原策略。

实现为 `web/components/WeatherScreen.tsx` 的首页 effect 与共用定位选项。定位正在进行时使用现有四语提示；城市选择的异步令牌继续防止覆盖。`qa/local-https.ts` 的证书安装页入口和 `qa/LOCAL-HTTPS.md` 已改为语言首页，让手机日常入口也自动请求定位。现有证书、AI 配置、天气缓存和其他工作区修改均保留。

定位 API 的安全来源、授权与 `maximumAge` 语义依据 [MDN 文档](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation/getCurrentPosition)。手机使用已信任的 HTTPS 首页；普通局域网 HTTP 的手动搜索可用，但不能提供浏览器安全定位。

## 实际验证

| 命令／操作 | 观察结果 | 本地原始记录 |
| --- | --- | --- |
| `cd web && npm test` | 本次实际 67/67；包含工作区原有回归，定位策略另以真实浏览器验证 | `qa/evidence/logs/home-location-node.log` |
| `NEXT_DIST_DIR=.next-home-location npm run build`，独立 3326 | 生产构建通过；定位专项 9 场景通过后再更新当前服务 | `qa/evidence/logs/home-location-build.log`、`home-location-qa.log`；`qa/evidence/home-location-qa.json` |
| 默认 `npm run build` 并重启项目 HTTP／HTTPS | 构建通过；沿用正常启动器和 `.env.ai.local`，保留已恢复模型配置；本轮没有发送真实模型问题 | `qa/evidence/logs/home-location-build-final.log` |
| `APP_URL=http://127.0.0.1:3300 QA_INSECURE_ORIGIN=http://192.168.5.22:3300 QA_LOCATION_RUN=home-location-final node qa/home-location.ts` | 9 场景、页面错误 0：原生浏览器授权位置胜过旧 London，再次首页调用两次；首次请求／无 Permissions API；拒绝／不可用／超时／无 API 后手选；真实非安全 LAN HTTP 提示；迟到结果不覆盖台北；城市深链和刷新定位调用为 0 | `qa/evidence/home-location-final.json`、`qa/evidence/logs/home-location-final.log` |
| 同脚本使用 `APP_URL=https://192.168.5.22:3443`、`QA_LOCATION_RUN=home-location-https` | 同样 9 场景通过，错误 0；实际浏览器默认 TLS 校验通过，未忽略证书错误 | `qa/evidence/home-location-https.json`、相应日志 |
| `QA_HOME_BROWSER_RUN=home-location-layout ... node qa/home-index-browser.ts` | 四语×1440／1024／768／390、菜单、GPS 胜过旧手选、授权定位共 19 条通过；无横向溢出 | `qa/evidence/home-location-layout-browser.json`、`home-location-layout-*.png` |
| `QA_AUDIT_RUN=home-location-seo ... node qa/seo-audit.ts` | 当前生产服务 28 页面×3 UA 共 84 条检查，无失败，sitemap 仍 28；额外 URL／索引头／HEAD／Bingbot 等检查通过 | `qa/evidence/home-location-seo.json`、相应 HTML／日志 |

浏览器脚本使用工作目录中已安装的 Playwright Chromium，需要设置对应 `PLAYWRIGHT_BROWSERS_PATH`。位置来自浏览器坐标覆盖和受控回调；首次授权部分验证应用发起请求与处理回调，不宣称已经点击真实系统弹窗或完成实体 GPS。真实 LAN HTTP 则实际检查 `isSecureContext=false` 和恢复搜索。

初轮脚本在初始空白 opaque 文档中播种 `localStorage`，产生测试注入错误；已增加保护并复测。产品原来的存储读写已容错，未将它归因为产品定位失败。原失败输出留在 `qa/evidence/logs/home-location-harness-before-storage-guard.log`。

## 日常入口与交付

- 本机首页：`http://localhost:3300/zh-Hans`。
- 手机 HTTPS 首页：`https://192.168.5.22:3443/zh-Hans`；证书安装入口 `http://192.168.5.22:3444/`。
- 固定首尔链接仍显示首尔，例如 `/zh-Hans/weather/seoul-1835848`。要重新定位，进入语言首页或使用“使用我的位置”。

源码与证据归档更新到原 `outputs/v1.1.1`，并检查完整性、哈希与当前本机凭据排除；原生安装包内容未变。临时 3326 在完成后关闭，3300／3443 保持可访问。此前“首页恢复上次手动城市”的记录是旧策略，已被本次当前位置优先策略取代；城市页刷新保留选择的约定继续有效。
