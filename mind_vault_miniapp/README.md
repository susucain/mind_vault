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
