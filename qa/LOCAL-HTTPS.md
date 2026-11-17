# 本地 HTTPS 与手机浏览器定位

原始证据保管：完整日志、快照和多数截图仅作为本地产物保存；Git 中保留的摘要、精选截图及原始记录位置见 [验收证据索引](../docs/verification/README.md)。

配置日期：2026-11-17（Asia/Shanghai）。本配置独立于原有 3300 服务，不替换其进程或修改正在打包的天气功能。

## 现在使用

- 日常首页：<https://192.168.5.22:3443/zh-Hans>，进入后自动请求当前位置；即使之前手动选过城市也优先定位。
- 固定城市链接如 `/zh-Hans/weather/seoul-1835848` 保持该城市，不自动定位；刷新城市页仍保持选择。
- 手机证书安装页：<http://192.168.5.22:3444/>。手机需与 Mac 连接同一局域网。
- HTTPS 入口监听 `0.0.0.0:3443`，证书安装页监听 `0.0.0.0:3444`；独立生产后端仅监听 `127.0.0.1:3343`。
- 天气模式为 `live`，使用官方 Open-Meteo 端点，共享已有真实天气缓存。问答读取根目录 `.env.ai.local`：配置密钥时使用真实模型，未配置时使用规则模式；启动器保留现有 AI 配置，详见 [本地 AI 配置与验证](LOCAL-AI.md)。v1.1.2 已改为真实 OSM 缓存转发，测试地图关闭；地图内语言控件已移除。

电脑已将本项目根证书加入当前用户的登录钥匙串。`security verify-cert`、系统 `curl` 与 Chromium 默认 TLS 校验均已通过，没有关闭证书检查。

## 手机首次使用

1. 手机打开上面的 HTTP 证书安装页，下载 `weather-atlas-root-ca.cer`。
2. iPhone／iPad：在“设置 → 通用 → VPN 与设备管理”安装已下载的描述文件；随后在“通用 → 关于本机 → 证书信任设置”开启该根证书的完全信任。[Apple 说明](https://support.apple.com/zh-cn/102390)。
3. Android：在系统设置搜索“安装证书”，将下载文件安装为 **CA 证书**。常见路径为“安全与隐私 → 更多安全设置 → 加密与凭据 → 安装证书 → CA 证书”，不同厂商路径可能不同。[mkcert 手机说明](https://github.com/FiloSottile/mkcert#mobile-devices)。
4. 用 Safari 或 Chrome 打开 HTTPS 首页，确认没有证书警告，按自动出现的浏览器定位提示授权。已授权时直接定位；也可从“搜索地点 → 使用我的位置”重试。系统定位服务和浏览器 App 的位置权限也需开启。

安装证书不能代替定位授权。如果此前拒绝了定位，在浏览器的网站权限中将此 HTTPS 站点的位置权限恢复为“询问”或“允许”。内嵌浏览器不作为本次验证环境。

本次没有连接实体手机；无法替用户在手机设置中安装证书、开启完全信任或授予位置权限。因此“手机真机已定位成功”仍需完成以上步骤后实测，不能由电脑的受控浏览器结果替代。

## 启动与停止

当前服务已以独立后台进程运行。运行状态、进程号、地址与日志保存在：

```text
/Users/yzin/Library/Application Support/Weather Atlas/https/runtime.json
/Users/yzin/Library/Application Support/Weather Atlas/https/logs/server.log
```

需要重启时，先依据 `runtime.json` 的 `pid` 停止该进程；它会一并停止自己启动的 3343 后端和 3444 安装页，不影响原有 3300 服务。不要重复启动占用同一端口的实例。

```bash
cd /Users/yzin/code/weather-atlas
npm run dev:https
```

在 `web/` 目录执行同一个 `npm run dev:https` 也可启动。环境变量统一放在根目录 `.env.https.local`，无需手动输入；本机代理地址与开关只保留在该文件中。它被 `.gitignore` 忽略，源码打包也会排除。可提交的 `.env.https.example` 提供可复制的模板，默认直连，代理地址留空。

命令会在启动 Node 前加载配置，使 `NODE_USE_ENV_PROXY=1`、`HTTP_PROXY`、`HTTPS_PROXY` 对 Node 内置网络请求生效；`NO_PROXY` 保证本机后端请求直连。当前机型使用 Node 26，代理只用于访问真实天气上游，HTTPS 服务本身不依赖它。[Node 官方代理配置说明](https://nodejs.org/learn/http/enterprise-network-configuration)。

已清除启动器继承的代理环境变量，仅执行 `npm run dev:https` 实际重启并复测。HTTPS 证书、真实天气、Sydney 搜索、受控定位和证书下载共七项检查通过；新的服务日志记录天气上游 HTTP 200。原有 3300 服务进程保持运行，证明命令确实从配置文件加载代理和端口。

此次仅统一现有 HTTPS 服务的启动方式：后端仍使用已有 `web/.next` 生产构建，没有增加热更新。没有构建时先在 `web/` 执行 `npm ci && npm run build`；修改 Web 源码后需重新构建并重启该入口。

2026-11-17 对完全相同的官方天气 URL 各请求一次：显式直连发生 TLS 握手超时（约 12.1 秒），经本机代理返回 HTTP 200（约 3.9 秒）。因此本机环境文件保留代理。此结果只反映本次出口情况，不表示 HTTPS 必须依赖代理。网络直连恢复后，可在 `.env.https.local` 将 `NODE_USE_ENV_PROXY=0` 并清空 `HTTP_PROXY`、`HTTPS_PROXY` 后重启。

## 证书、网络变化与移除

证书及私钥放在源码之外：

```text
/Users/yzin/Library/Application Support/Weather Atlas/https/
```

该目录与 `ca/` 权限为 700，服务私钥与根私钥为 600。安装页只提供公开根证书，不提供任何私钥。源码 ZIP 不包含此目录。

本次使用项目独立 CA。系统级 `mkcert -install` 需要管理员密码，改为当前用户钥匙串信任，并通过实际浏览器验证；没有修改系统代理或要求在命令中提供密码。

当前证书包含 `localhost`、`127.0.0.1`、`::1`、`192.168.5.22`。如果 Wi-Fi、网卡或 DHCP 改变 IP，需要重新签发服务证书并重启；沿用原根 CA 时，手机不用重新安装根证书。也可在路由器中给 Mac 保留固定租约。

```bash
CAROOT='/Users/yzin/Library/Application Support/Weather Atlas/https/ca' \
mkcert \
  -cert-file '/Users/yzin/Library/Application Support/Weather Atlas/https/server.pem' \
  -key-file '/Users/yzin/Library/Application Support/Weather Atlas/https/server-key.pem' \
  localhost 127.0.0.1 ::1 新的局域网IP
```

开发结束后，可在手机的描述文件／用户凭据中移除此根证书；Mac 可在“钥匙串访问 → 登录 → 证书”中按下述 SHA-256 指纹找到并删除本项目根证书。无需删除其他项目的证书。

```text
83:9C:D8:B1:C8:14:82:2D:C6:40:EC:E4:CA:04:D5:5A:33:C4:A1:0E:6F:62:CA:BE:9F:BB:03:1E:75:F4:DB:FD
```

## 已执行的验证与边界

实现入口为 `qa/local-https.ts`，回归入口为 `qa/local-https-check.ts`。执行：

```bash
security verify-cert \
  -c '/Users/yzin/Library/Application Support/Weather Atlas/https/server.pem' \
  -p ssl -s 192.168.5.22
curl --noproxy '*' -I https://192.168.5.22:3443/zh-Hans/weather/seoul-1835848
PLAYWRIGHT_BROWSERS_PATH=/Users/yzin/Documents/Codex/2026-11-16/weather-atlas-24-24-readme-md/work/browsers \
NO_PROXY=localhost,127.0.0.1,192.168.5.22 \
node qa/local-https-check.ts
```

观察结果：证书与主机名校验通过；生产页面 200，canonical 使用 HTTPS 地址；390×844 移动视口中 `window.isSecureContext=true`，定位 API 可用，初始定位权限为 `prompt`；真实 Sydney 全球搜索返回结果；真实悉尼天气为 `source=open-meteo`、`Australia/Sydney`、24 小时及 7 天；授予受控浏览器位置权限后进入台北坐标页，并取得真实台北预报。安装页下载的根证书指纹与本机根证书一致。

真实上游记录包含 `forecast` HTTP 200、约 1722 ms；该次悉尼天气抓取时间为 `2026-11-16T16:26:24.785Z`（北京时间 2026-11-17 00:26:24）。复用缓存时仍保留 `fetchedAt` 和 `stale`，不把缓存读取声称为新增上游请求。

`悉尼` 中文名称在当前真实地理编码服务返回 0 个结果，英文 `Sydney` 有结果。这属于上游名称索引覆盖，本次没有更改全球搜索算法；可先输入 `Sydney`，不要将真实服务的无结果误解为重新进入示例模式。

完整受控结果见 [local-https.json](../docs/verification/README.md#record-9e4b7a0fff05)，截图见 [local-https.png](../docs/verification/README.md#record-0e146c53b3dd)。这些证明 HTTPS、浏览器安全上下文与定位流程联通，不证明实体手机的实际 GPS 精度。
