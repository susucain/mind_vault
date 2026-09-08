# Mind Vault Miniapp

微信小程序原生客户端，使用 TypeScript、WXML、WXSS 和 Vant Weapp。

## 安装

```bash
pnpm install
pnpm typecheck
```

在微信开发者工具中打开 `mind_vault_miniapp` 目录后，执行“工具 -> 构建 npm”，生成 `miniprogram_npm` 以加载 Vant Weapp。

## 本地联调

前端接口地址在 `config/env.ts` 配置：

```text
http://127.0.0.1:3000/v1
```

后端可使用 standalone 模式启动：

```bash
cd ../mind_vault_api
APP_STANDALONE=true pnpm start
```

真机联调时需要改为局域网 HTTPS 地址，并在微信公众平台配置合法域名。开发登录仅用于本地联调，正式版本应切换至微信 `code2Session` 登录。

## 真机与发布检查

开发者工具中的 `urlCheck: false` 仅用于本地开发。真机和体验版必须使用 HTTPS API 地址，并在微信公众平台配置：

- request 合法域名：后端 API 域名
- uploadFile 合法域名：后端 API 域名
- downloadFile 合法域名：原文件预览或下载域名

发布前将 `config/env.ts` 调整为生产 HTTPS 地址，并关闭开发登录：

```ts
export const environment = {
  apiBaseUrl: 'https://api.example.com/v1',
  useDevLogin: false,
  requestTimeout: 15_000,
  streamTimeout: 60_000,
};
```

真机验收清单：

1. 登录失效后跳回登录页。
2. 上传小文件和接近 100MB 的文件，检查进度与失败重试。
3. 弱网下检查加载、错误和重试状态。
4. 问答 SSE 依次收到 `meta`、`token`、`citation`、`done`，且无重复文本。
5. 引用可跳转到原文定位页。
6. 面试训练可以创建会话、提交回答、显示追问与复习项。

后端 SSE 反向代理必须关闭响应缓冲，并保留 `Transfer-Encoding: chunked`。
