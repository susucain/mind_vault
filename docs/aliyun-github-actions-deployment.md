# Mind Vault 阿里云部署方案

## 1. 目标

采用方案 A：

- 使用现有阿里云 ECS 承载应用和基础设施。
- 使用 GitHub Actions 构建后端 Docker 镜像。
- 将镜像推送到阿里云容器镜像服务 ACR。
- 通过 SSH 使用 `deploy` 账号触发 ECS 部署。
- 使用阿里云 OSS 替代 RustFS，保存原始文档、PDF 图片和附件。
- PostgreSQL、MongoDB、RabbitMQ、Elasticsearch、Neo4j 先部署在 ECS 内部。

目标链路：

```text
GitHub push main
    |
    v
GitHub Actions
    |-- 安装依赖
    |-- 执行测试
    |-- 构建 mind_vault_api 镜像
    |-- 推送到 ACR
    `-- SSH 到 ECS 执行部署脚本
              |
              v
          ECS Docker Compose
          |-- API
          |-- Worker
          |-- PostgreSQL + pgvector
          |-- MongoDB
          |-- RabbitMQ
          |-- Elasticsearch + IK
          `-- Neo4j

阿里云 OSS
    `-- 原始文档、PDF 图片、附件
```

## 2. 当前项目边界

后端代码位于：

```text
mind_vault_api/
```

小程序代码位于：

```text
mind_vault_miniapp/
```

后端当前依赖的基础设施可以参考：

- [后端 Docker Compose](../mind_vault_api/docker-compose.yml)
- [NestJS 根模块](../mind_vault_api/src/app.module.ts)
- [环境变量配置](../mind_vault_api/src/config/configuration.ts)
- [S3/RustFS 存储服务](../mind_vault_api/src/storage/rustfs.service.ts)

当前 `docker-compose.yml` 更偏向开发环境，不应直接作为生产编排文件。生产环境需要移除管理界面、关闭不必要的公网端口，并替换默认密码。

## 3. 资源建议

当前 ECS 为 2 核、约 2 GB 内存，并且已经运行其他项目。完整运行 Mind Vault 时，建议：

- 最低：4 核 8 GB。
- 如果继续和当前其他业务共用：建议 8 核 16 GB。
- 系统盘建议至少 80 GB。
- PostgreSQL、MongoDB、RabbitMQ、Elasticsearch、Neo4j 使用独立 Docker Volume。
- 对 Elasticsearch、Neo4j、MySQL 和应用容器设置内存限制。

当前 ECS 上已经存在多个 Docker 项目，因此 Mind Vault 必须使用独立的 Compose 项目名、目录和网络，不能覆盖现有项目。

## 4. 需要手工完成的阿里云操作

### 4.1 创建 ACR 实例

进入 [阿里云容器镜像服务 ACR](https://cr.console.aliyun.com/)。

建议：

- 地域选择与 ECS 相同，例如杭州。
- 个人项目可以先使用个人版或基础版。
- 创建一个独立实例，例如 `mind-vault`。
- GitHub Actions 推送镜像时，需要允许公网访问 ACR；ECS 拉取镜像优先使用同地域内网地址。

ACR 登录地址通常类似：

```text
crpi-xxxxx.cn-hangzhou.personal.cr.aliyuncs.com
```

实际地址以 ACR 控制台显示为准，不要手动猜测。

### 4.2 创建命名空间和镜像仓库

例如：

```text
命名空间：mind-vault
镜像仓库：mind-vault-api
仓库类型：私有
```

最终镜像地址类似：

```text
crpi-xxxxx.cn-hangzhou.personal.cr.aliyuncs.com/mind-vault/mind-vault-api
```

API 和 Worker 使用同一个镜像，通过不同的启动命令运行。

### 4.3 创建 ACR 凭据

不要使用阿里云主账号 AccessKey。

建议创建两个独立的 RAM/ACR 凭据：

| 用途 | 权限 |
|---|---|
| GitHub Actions | 登录 ACR、推送后端镜像 |
| ECS | 登录 ACR、拉取后端镜像 |

ECS 凭据只需要拉取权限。仓库正式使用后，应将权限限制到 `mind-vault/mind-vault-api`。

### 4.4 创建 OSS Bucket

进入 [OSS 控制台](https://oss.console.aliyun.com/)。

建议：

```text
Bucket：mind-vault-prod
地域：与 ECS 相同
权限：私有
存储类型：标准存储
```

为 OSS 创建独立 RAM 用户或 AccessKey，只授予该 Bucket 的读写权限。

项目已经使用 AWS S3 兼容接口，迁移到 OSS 时主要切换 Endpoint 和凭据，不需要重写存储层。生产环境应使用同地域内网 Endpoint，减少流量费用。

### 4.5 配置域名和 HTTPS

建议为后端准备独立域名，例如：

```text
api.example.com
```

操作步骤：

1. 在阿里云 DNS 添加 A 记录，指向 ECS 公网 IP。
2. 在 ECS 安全组放行 `80` 和 `443`。
3. 由 Nginx 对外提供 HTTPS。
4. API 容器只绑定 ECS 本机或 Docker 内部网络。
5. 数据库和中间件不开放公网端口。

生产环境不应对公网开放：

```text
5432  PostgreSQL
27017 MongoDB
5672  RabbitMQ
15672 RabbitMQ Management
9200  Elasticsearch
5601  Kibana
7474  Neo4j HTTP
7687  Neo4j Bolt
```

## 5. GitHub 仓库配置

当前仓库没有 `.github/workflows` 目录，需要新增：

```text
.github/workflows/backend-deploy.yml
mind_vault_api/Dockerfile
mind_vault_api/deploy/compose.prod.yml
mind_vault_api/deploy/deploy.sh
```

建议目录结构：

```text
mind-vault/
|-- .github/
|   `-- workflows/
|       |-- backend-deploy.yml
|       `-- miniapp-build.yml       # 后续需要时再增加
|-- mind_vault_api/
|   |-- Dockerfile
|   |-- docker-compose.yml          # 本地开发
|   |-- deploy/
|   |   |-- compose.prod.yml
|   |   `-- nginx.conf
|   `-- src/
`-- mind_vault_miniapp/
```

### 5.1 GitHub Actions Secrets

在仓库的 `Settings -> Secrets and variables -> Actions` 中配置：

```text
ACR_REGISTRY
ACR_NAMESPACE
ACR_REPOSITORY
ACR_USERNAME
ACR_PASSWORD

ECS_HOST
ECS_PORT
ECS_DEPLOY_USER
ECS_DEPLOY_SSH_KEY
ECS_KNOWN_HOSTS
```

示例：

```text
ACR_REGISTRY=crpi-xxxxx.cn-hangzhou.personal.cr.aliyuncs.com
ACR_NAMESPACE=mind-vault
ACR_REPOSITORY=mind-vault-api
ECS_HOST=47.99.244.154
ECS_PORT=22
ECS_DEPLOY_USER=deploy
```

`ECS_DEPLOY_SSH_KEY` 使用现有 GitHub Actions 私钥的完整内容：

```text
~/store/aliyun/github-actions/story-sell-deploy
```

该私钥不能提交到仓库。

本地生成 `ECS_KNOWN_HOSTS`：

```bash
ssh-keyscan -H 47.99.244.154
```

不要在 GitHub Actions 中使用 `StrictHostKeyChecking=no` 作为长期方案。

## 6. 单仓库对 GitHub Actions 的影响

前后端在同一个 Git 仓库不会造成问题，但 Workflow 必须明确路径。

后端 Workflow 只监听：

```yaml
paths:
  - "mind_vault_api/**"
  - ".github/workflows/backend-deploy.yml"
```

小程序后续可以单独监听：

```yaml
paths:
  - "mind_vault_miniapp/**"
  - ".github/workflows/miniapp-build.yml"
```

后端命令必须在 `mind_vault_api` 目录执行：

```yaml
defaults:
  run:
    working-directory: mind_vault_api
```

Docker 构建上下文也必须指定为：

```yaml
context: ./mind_vault_api
file: ./mind_vault_api/Dockerfile
```

后端和小程序建议使用两个独立 Workflow：

```text
backend-deploy.yml
    GitHub Actions -> ACR -> ECS

miniapp-build.yml
    GitHub Actions -> 小程序构建或微信 CI
```

小程序不需要进入 ACR，也不需要部署到 ECS。

## 7. GitHub Actions 部署流程

推荐在 `push main` 时触发，并提供 `workflow_dispatch` 手动触发入口。

执行顺序：

1. Checkout 整个仓库。
2. 安装 Node.js 和 pnpm。
3. 进入 `mind_vault_api`。
4. 执行 `pnpm install --frozen-lockfile`。
5. 执行单元测试。
6. 构建 Docker 镜像。
7. 推送提交 SHA 标签和 `main` 标签到 ACR。
8. SSH 登录 ECS 的 `deploy` 用户。
9. 传入本次提交 SHA。
10. ECS 拉取指定 SHA 镜像。
11. 更新生产环境的 `IMAGE_TAG`。
12. 执行 `docker compose up -d`。
13. 检查 `/v1/health`。

镜像必须使用不可变 SHA 标签，例如：

```text
sha-eb55ed5ee0830bddb6f9222309f0d34384dc20c3
```

`main` 标签只作为方便查看和人工操作的别名，正式部署和回滚都使用 SHA 标签。

## 8. ECS 初始化

以下步骤只需要 root 执行一次。

### 8.1 安装 Docker、Compose 和 Nginx

```bash
apt-get update
apt-get install -y docker.io docker-compose-plugin nginx curl

systemctl enable --now docker
systemctl enable --now nginx

docker --version
docker compose version
```

如果系统已经安装这些软件，只需要检查版本，不要重复安装。

### 8.2 授予 deploy 用户 Docker 权限

```bash
usermod -aG docker deploy
```

重新登录 `deploy` 用户后确认：

```bash
docker ps
```

后续 GitHub Actions 只使用 `deploy`，不使用 root。

### 8.3 创建部署目录

```bash
mkdir -p /opt/mind-vault/backup
mkdir -p /opt/mind-vault/volumes

chown -R deploy:deploy /opt/mind-vault
```

建议目录：

```text
/opt/mind-vault/
|-- compose.prod.yml
|-- .env
|-- deploy.sh
|-- backup/
`-- volumes/
    |-- postgres/
    |-- mongodb/
    |-- rabbitmq/
    |-- elasticsearch/
    `-- neo4j/
```

## 9. 生产环境变量

生产 `.env` 只保存在 ECS，不提交 GitHub。

示例：

```env
IMAGE_TAG=sha-xxxxxxxx

ACR_REGISTRY=crpi-xxxxx.cn-hangzhou.personal.cr.aliyuncs.com
ACR_NAMESPACE=mind-vault
ACR_REPOSITORY=mind-vault-api

POSTGRES_USER=mind_vault
POSTGRES_PASSWORD=随机强密码
POSTGRES_DB=knowledge_hub

MONGO_URI=mongodb://mind_vault:随机强密码@mongodb:27017/knowledge_hub?authSource=admin
RABBITMQ_URL=amqp://mind_vault:随机强密码@rabbitmq:5672
ELASTICSEARCH_NODE=http://elasticsearch:9200

NEO4J_URI=bolt://neo4j:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=随机强密码

JWT_SECRET=随机长字符串

NODE_ENV=production
PORT=3000

STORAGE_ENABLED=true
S3_ENDPOINT=https://oss-cn-hangzhou-internal.aliyuncs.com
S3_REGION=cn-hangzhou
S3_BUCKET=mind-vault-prod
S3_ACCESS_KEY=OSS专用RAM密钥
S3_SECRET_KEY=OSS专用RAM密钥
```

除此之外，还需要根据实际模型服务补充：

```env
FAST_MODEL=...
REASONING_MODEL=...
EMBEDDING_MODEL=...
OPENAI_API_KEY=...
OPENAI_BASE_URL=...
LANGFUSE_ENABLED=false
```

实际 OSS 内网 Endpoint 和模型服务变量以阿里云控制台及项目代码为准。

项目中出现的默认数据库密码、RabbitMQ 默认账号和 Neo4j 默认密码只允许用于本地开发，生产环境必须全部替换。

## 10. 生产 Compose 原则

生产 Compose 建议只保留：

```text
api
worker
postgres
mongodb
rabbitmq
elasticsearch
neo4j
```

移除：

```text
pgadmin
mongo-express
kibana
rustfs
```

API 和 Worker 使用相同的 ACR 镜像：

```text
API：
node dist/main

Worker：
node dist/worker
```

生产配置必须满足：

- 所有服务使用 `restart: unless-stopped`。
- 数据库和中间件只加入 Docker 内部网络。
- 不映射数据库、中间件端口到公网。
- 使用独立 Volume 保存数据。
- API 通过 Nginx 对外暴露。
- 为关键容器配置健康检查。
- 为 Elasticsearch、Neo4j、API、Worker 设置资源上限。
- 不在生产环境构建 Elasticsearch 镜像，镜像应在构建阶段完成。

## 11. ECS 部署脚本

服务器上的 `/opt/mind-vault/deploy.sh` 负责：

1. 接收镜像 SHA。
2. 更新 `.env` 中的 `IMAGE_TAG`。
3. 登录 ACR。
4. 拉取 API 和 Worker 镜像。
5. 启动或更新 Compose 服务。
6. 检查健康接口。
7. 清理无用镜像。

建议接口：

```bash
/opt/mind-vault/deploy.sh sha-<commit-sha>
```

部署脚本不要将生产密码打印到标准输出。ACR 登录凭据应保存在服务器受保护的环境变量或 root-only 文件中，GitHub Actions 只传递镜像标签。

## 12. 数据库迁移和备份

项目配置了：

```text
migrationsRun: true
```

包含数据库迁移的版本发布前，需要先备份 PostgreSQL：

```bash
docker exec mind_vault_postgres \
  pg_dump -U mind_vault knowledge_hub \
  > /opt/mind-vault/backup/knowledge_hub-$(date +%F-%H%M%S).sql
```

生产环境至少需要：

- PostgreSQL 每日备份。
- MongoDB 每日备份。
- 重要卷定期复制到 OSS。
- 备份文件保留周期。
- 定期验证备份可恢复。

数据库迁移应保持向前兼容，避免在一个版本中同时删除旧字段和发布依赖新字段的代码。

## 13. 回滚

由于每次镜像都使用提交 SHA，回滚只需要重新部署上一个稳定版本：

```bash
cd /opt/mind-vault
./deploy.sh sha-<previous-stable-commit>
```

检查：

```bash
docker compose ps
docker compose logs --tail=200 api
docker compose logs --tail=200 worker
curl http://127.0.0.1:3000/v1/health
```

需要注意：应用镜像可以回滚，但数据库迁移不一定能自动回滚。因此包含数据库结构变化的发布必须先备份，并单独设计迁移回退策略。

## 14. 发布验证

第一次正式部署至少验证：

- `GET /v1/health`
- 开发登录或正式认证流程
- 创建数据集
- 上传文档
- 文档解析任务是否进入 RabbitMQ
- Worker 是否正常消费任务
- Elasticsearch 是否完成索引
- Neo4j 图谱任务是否完成
- 文档检索是否返回结果
- 聊天 SSE 是否正常
- OSS 上传和读取是否正常
- API 重启后数据是否仍然存在
- ECS 重启后所有容器是否自动恢复

## 15. 实施顺序

1. 升级 ECS。
2. 创建 ACR 实例、命名空间和私有镜像仓库。
3. 创建 ACR 推送和拉取凭据。
4. 创建 OSS Bucket 和专用 RAM 凭据。
5. 配置域名、DNS、HTTPS 和安全组。
6. 在 ECS 安装 Docker、Compose、Nginx。
7. 配置 `deploy` 用户的 Docker 权限。
8. 创建 `/opt/mind-vault` 目录和生产 `.env`。
9. 增加后端 Dockerfile。
10. 增加生产 Compose 文件。
11. 增加 GitHub Actions Workflow。
12. 手动运行一次 Workflow。
13. 验证 API、Worker、数据库、搜索、图谱和 OSS。
14. 再开启 `push main` 自动部署。

第一阶段不建议同时引入 RDS、云 MongoDB、云 Elasticsearch 和云消息队列。先使用 ECS + OSS 的组合，可以控制成本并减少迁移变量；等运行数据明确后，再针对单个瓶颈迁移到托管服务。
