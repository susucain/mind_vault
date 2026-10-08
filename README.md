# Mind Vault

Mind Vault 是一个面向个人的可引用知识库与 AI Agent。用户可以上传书籍、课程、简历、项目文档和面试资料，通过自然语言进行检索、总结、追问和模拟训练，并查看回答对应的原文引用。

## 主要能力

- 文档上传、解析、分块和异步索引
- 关键词检索、向量检索和混合检索
- 基于个人资料的 RAG 问答与引用定位
- 知识图谱构建与关系检索
- 面试题生成、模拟面试和复盘
- Web、微信小程序和 API 服务

## 项目结构

```text
mind-vault/
├── mind_vault_api/       # NestJS API、文档处理 Worker
├── mind_vault_web/       # React + Vite Web 客户端
├── mind_vault_miniapp/   # 微信小程序客户端
└── docs/                 # 产品、技术方案和部署文档
```

## 技术栈

- Web：React、TypeScript、Vite、React Router、TanStack Query、Tailwind CSS
- API：NestJS、TypeScript、TypeORM
- 数据与基础设施：PostgreSQL、MongoDB、Elasticsearch、Neo4j、RabbitMQ、RustFS
- AI：LangChain、LangGraph、Embedding、RAG

## 环境要求

- Node.js `>=22.12`
- pnpm `10.33.0`
- Docker Desktop 或兼容 Docker Compose 的环境
- 文档解析支持 PDF、DOCX、XLSX、PPTX、TXT、MD、CSV 和 JSON；DOC、XLS、PPT 等旧版 Office 文件需要先转换为现代格式

## 快速开始

### 1. 启动依赖服务

```bash
cd mind_vault_api
docker compose up -d
```

### 2. 启动 API

复制并配置 `mind_vault_api/.env`，填写数据库、对象存储、模型和第三方服务配置，然后执行：

```bash
cd mind_vault_api
pnpm install
pnpm run start:dev
```

完整 API 默认使用 `http://localhost:3000`，接口前缀为 `/v1`。

只验证认证和健康检查接口时，可以使用不依赖本地数据库的 standalone 模式：

```bash
cd mind_vault_api
pnpm install
pnpm run start:standalone
```

文档解析 Worker 单独启动：

```bash
cd mind_vault_api
pnpm run start:worker
```

### 3. 启动 Web

```bash
cd mind_vault_web
pnpm install
cp .env.example .env.local
pnpm dev
```

Web 开发服务器默认由 Vite 提供。需要连接其他 API 地址时，修改 `mind_vault_web/.env.local` 中的 `VITE_API_TARGET`。

### 4. 启动微信小程序

```bash
cd mind_vault_miniapp
pnpm install
pnpm typecheck
```

使用微信开发者工具打开 `mind_vault_miniapp` 目录，并执行“工具 -> 构建 npm”。本地联调地址在 `mind_vault_miniapp/config/env.ts` 中配置。

## 常用命令

### Web

```bash
pnpm dev
pnpm typecheck
pnpm test --run
pnpm build
pnpm lint
```

### API

```bash
pnpm run start:dev
pnpm run build
pnpm run test
pnpm run test:cov
```

### Miniapp

```bash
pnpm typecheck
pnpm format:check
```

## 文档

- [产品需求](docs/product-requirements.md)
- [技术方案](docs/technical-solution.md)
- [业务代码与数据链路梳理](docs/业务代码梳理.md)
- [阿里云与 GitHub Actions 部署](docs/aliyun-github-actions-deployment.md)

## 开发说明

项目仍处于开发阶段，默认配置主要用于本地开发。请不要将 `.env`、访问密钥、模型 API Key 或生产环境配置提交到仓库。生产环境部署前请替换 Docker Compose 中的默认账号和密码，并为 API、文件上传和 SSE 配置 HTTPS。

## License

暂未发布正式开源许可证。
