# Mind Vault 阿里云部署方案

## 1. 目标

采用方案 A：

- 使用现有阿里云 ECS 承载应用和基础设施。
- 使用 GitHub Actions 构建后端 Docker 镜像。
- 将 API/Worker 镜像和带 IK 插件的 Elasticsearch 镜像推送到阿里云容器镜像服务 ACR。
- 通过 SSH 使用 `deploy` 账号触发 ECS 部署。
- 使用阿里云 OSS 替代 RustFS，保存原始文档、PDF 图片和附件。
- 构建 `mind_vault_web` React/Vite 前端，并复用现有 Nginx 的
  `/mind-vault/` 子路径提供静态文件。
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

访问地址：

```text
https://现有域名/mind-vault/
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

Web 前端代码位于：

```text
mind_vault_web/
```

后端当前依赖的基础设施可以参考：

- [后端 Docker Compose](../mind_vault_api/docker-compose.yml)
- [NestJS 根模块](../mind_vault_api/src/app.module.ts)
- [环境变量配置](../mind_vault_api/src/config/configuration.ts)
- [S3/RustFS 存储服务](../mind_vault_api/src/storage/rustfs.service.ts)

当前 `docker-compose.yml` 更偏向开发环境，不应直接作为生产编排文件。生产环境需要移除管理界面、关闭不必要的公网端口，并替换默认密码。

生产 Dockerfile、生产 Compose 文件和 GitHub Actions Workflow 已放在仓库中，首次部署前仍需按本文完成 ACR、ECS 环境变量和 GitHub Secrets 配置。

### 2.1 文档格式与 LibreOffice 说明

为控制 ECS 镜像体积和运行时资源，生产 API 镜像不再安装 LibreOffice，也不再调用
`soffice` 做格式转换。服务端当前支持：

```text
PDF、DOCX、XLSX、PPTX、TXT、MD、CSV、JSON
```

旧版 Office 格式 `.doc`、`.xls`、`.ppt` 不再接受上传。需要导入这类文件时，
请先在本地转换为 `.docx`、`.xlsx` 或 `.pptx` 后再上传。`/mind-vault/v1/documents/supported-formats`
接口会返回生产环境实际支持的扩展名，Web 和小程序会据此显示上传限制。

移除 LibreOffice 的影响：

- Docker 镜像不再包含 LibreOffice，镜像体积和构建/拉取时间会下降。
- API/Worker 常驻内存不会再承担 LibreOffice 进程的额外开销。
- 旧版 Office 转换能力被移除；现代 Office 格式仍由 Node.js 解析器处理。

## 3. 资源建议

当前 ECS 已升级为 4 核、8 GB 内存、80 GB 系统盘，并且继续运行其他项目。
对于 1 到 2 个低并发用户，这个配置可以先承载完整 Mind Vault：

- 当前可用起步配置：4 核 8 GB、80 GB 系统盘。
- 如果文档、索引或并发明显增长，再升级到 8 核 16 GB。
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

由于项目的 [Elasticsearch Dockerfile](../mind_vault_api/elasticsearch/Dockerfile) 内置 IK 中文分词，生产部署还需要第二个镜像仓库：

```text
镜像仓库：mind-vault-elasticsearch
```

API/Worker 镜像和 Elasticsearch 镜像都应使用提交 SHA 标签。不能只发布 API 镜像后让生产 Compose 继续使用 `build: ./elasticsearch`，否则 ECS 部署时仍然依赖本地源码和构建环境。

### 4.3 配置 ACR 登录状态

不要使用阿里云主账号 AccessKey。

GitHub Actions 使用仓库 Secrets 中的 ACR 推送凭据。ECS 不需要保存第二份
凭据；当前部署直接复用 `deploy` 用户已有的 Docker 登录状态。

首次配置或凭证变更时，以 `deploy` 用户在 ECS 上执行：

```bash
docker login crpi-xxxxx.cn-hangzhou.personal.cr.aliyuncs.com
```

Docker 凭证保存在：

```text
/home/deploy/.docker/config.json
```

GitHub Actions 通过 SSH 使用同一个 `deploy` 用户执行
`docker compose pull` 时，Docker 会自动读取该登录状态。部署脚本不会读取或写入
`ACR_USERNAME`、`ACR_PASSWORD`，也不需要在 `/opt/mind-vault` 保存 `acr.env`。

建议该登录凭证仅有两个生产镜像仓库的拉取权限。凭证失效、密码重置或更换
部署用户后，需要重新以 `deploy` 用户执行 `docker login`。

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

仓库中的部署文件位于：

```text
.github/workflows/backend-deploy.yml
mind_vault_web/ 由 Workflow 构建 dist/ 后发布到 ECS Nginx 静态目录
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
ACR_API_REPOSITORY
ACR_ES_REPOSITORY
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
ACR_API_REPOSITORY=mind-vault-api
ACR_ES_REPOSITORY=mind-vault-elasticsearch
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

前后端在同一个 Git 仓库不会造成问题，但 Workflow 必须明确路径。当前仓库实际上包含 API、Web 和小程序三个应用。

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

Web Workflow 应监听：

```yaml
paths:
  - "mind_vault_web/**"
  - ".github/workflows/web-deploy.yml"
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

后端、Web 和小程序建议使用独立 Workflow：

```text
backend-deploy.yml
    GitHub Actions -> ACR(api/es) -> ECS

web-deploy.yml
    GitHub Actions -> 构建 dist -> ECS Nginx

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
5. 执行后端单元测试和构建。
6. 构建 API/Worker 镜像。
7. 构建带 IK 的 Elasticsearch 镜像。
8. 将两个镜像推送为提交 SHA 标签。
9. SSH 登录 ECS 的 `deploy` 用户。
10. 传入 API 和 ES 的镜像 SHA。
11. ECS 拉取两个指定 SHA 镜像。
12. 更新生产环境的 `IMAGE_TAG` 和 `ES_IMAGE_TAG`。
13. 执行 `docker compose up -d`。
14. 检查 `/v1/health`。

`mind_vault_web` 应由单独的 Web Workflow 构建。它是 Vite 静态应用，不需要进入 ACR，也不应该作为 Node 服务长期运行；应将 `dist/` 发布到
`/var/www/mind-vault`，由现有 Nginx 的 `/mind-vault/` location 提供服务。
构建时必须设置：

```text
VITE_BASE_PATH=/mind-vault/
VITE_API_BASE_URL=/mind-vault/v1
```

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

Elasticsearch 启动前需要提高宿主机虚拟内存映射上限：

```bash
sysctl -w vm.max_map_count=262144
printf 'vm.max_map_count=262144\n' > /etc/sysctl.d/99-mind-vault.conf
sysctl --system
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
API_REPOSITORY=mind-vault-api
ES_REPOSITORY=mind-vault-elasticsearch

POSTGRES_USER=mind_vault
POSTGRES_PASSWORD=随机强密码
POSTGRES_DB=knowledge_hub

MONGO_URI=mongodb://mind_vault:随机强密码@mongodb:27017/knowledge_hub?authSource=admin
RABBITMQ_URL=amqp://mind_vault:随机强密码@rabbitmq:5672
ELASTICSEARCH_NODE=http://es:9200

NEO4J_URI=bolt://neo4j:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=随机强密码

JWT_SECRET=随机长字符串

NODE_ENV=production
PORT=3000
API_HOST_PORT=13000

STORAGE_ENABLED=true
OSS_ACCESS_KEY_ID=OSS专用RAM密钥
OSS_ACCESS_KEY_SECRET=OSS专用RAM密钥
OSS_REGION=oss-cn-hangzhou
OSS_BUCKET_NAME=mind-vault-prod
STORAGE_ENABLED=true
```

当前工作区的 `.env` 是 Git 忽略文件，GitHub Actions checkout 不会带上它。生产 OSS 配置必须单独写入 ECS 上的 `.env`，不能依赖本地开发环境。

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

生产 Compose 建议包含：

```text
web（也可以由宿主机 Nginx 直接提供 dist）
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
- Web 由 Nginx 提供静态文件。
- API 通过 Nginx 的 `/mind-vault/v1/` 反向代理对外暴露。
- 聊天和文档进度 SSE location 必须关闭代理缓冲。
- 上传接口至少允许 100 MB 请求体。
- 为关键容器配置健康检查。
- 为 Elasticsearch、Neo4j、API、Worker 设置资源上限。
- 不在生产环境构建 Elasticsearch 镜像，镜像应在构建阶段完成。
- 不使用固定的全局网络名 `common-network`。
- 不使用可能与其他项目冲突的固定 `container_name`；使用独立 Compose project name，例如 `mind-vault`。

### 10.1 容器内服务地址

API 和 Worker 在容器内不能使用 `localhost` 访问其他服务，生产 `.env` 必须使用 Compose service name：

```env
POSTGRES_HOST=postgres
MONGO_HOST=mongodb
MONGO_URI=mongodb://<user>:<password>@mongodb:27017/knowledge_hub?authSource=admin
RABBITMQ_URL=amqp://<user>:<password>@rabbitmq:5672
ELASTICSEARCH_NODE=http://es:9200
NEO4J_URI=bolt://neo4j:7687
```

当前 [health.module.ts](../mind_vault_api/src/health/health.module.ts) 已支持从生产环境变量读取 RabbitMQ、Elasticsearch 和 Neo4j 的容器服务地址。

### 10.2 Nginx 必须代理的请求

当前项目不只有聊天 SSE，还包括文档进度 SSE。由于项目挂载在
`/mind-vault/` 下，Nginx 对外路径为：

```text
/mind-vault/v1/conversations/:id/messages/stream
/mind-vault/v1/documents/events
/mind-vault/v1/documents/:id/events
```

这些 location 都需要关闭缓冲：

```nginx
proxy_buffering off;
proxy_cache off;
proxy_request_buffering off;
proxy_read_timeout 310s;
proxy_send_timeout 310s;
gzip off;
```

上传 location 需要至少：

```nginx
client_max_body_size 100m;
proxy_request_buffering off;
proxy_read_timeout 310s;
```

`mind_vault_api/deploy/nginx.prod.conf` 是 Mind Vault 的 location 配置片段，
不是独立的 `server` 配置。由于 ECS 已存在其他项目，应将它 include 到现有
HTTPS server（例如 `www.storysell.cn`）中，不能再启用一个独立的默认 server。

root 一次性配置：

```bash
cp /opt/mind-vault/nginx.prod.conf /etc/nginx/snippets/mind-vault.conf
```

然后在现有 HTTPS `server { ... }` 内加入：

```nginx
include /etc/nginx/snippets/mind-vault.conf;
```

配置完成后验证并重载：

```bash
nginx -t
systemctl reload nginx
```

## 11. ECS 部署脚本

服务器上的 `/opt/mind-vault/deploy.sh` 负责：

1. 接收镜像 SHA。
2. 更新 `.env` 中的 `IMAGE_TAG`。
3. 复用 `deploy` 用户现有的 Docker ACR 登录状态。
4. 拉取 API 和 Worker 镜像。
5. 启动或更新 Compose 服务。
6. 检查健康接口。
7. 清理无用镜像。

建议接口：

```bash
/opt/mind-vault/deploy.sh sha-<commit-sha>
```

部署脚本不要将生产密码打印到标准输出。GitHub Actions 只传递镜像标签；
如果 `deploy` 用户的 Docker 登录状态失效，`docker compose pull` 会失败，
需要以 `deploy` 用户重新执行 `docker login`。

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
curl http://127.0.0.1:13000/v1/health
```

需要注意：应用镜像可以回滚，但数据库迁移不一定能自动回滚。因此包含数据库结构变化的发布必须先备份，并单独设计迁移回退策略。

## 14. 发布验证

第一次正式部署至少验证：

- `GET /mind-vault/v1/health`
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

1. 升级 ECS（当前为 4 核 8 GB、80 GB 系统盘）。
2. 创建 ACR 实例、命名空间和私有镜像仓库。
3. 为 GitHub Actions 配置 ACR 推送凭据；ECS 复用 `deploy` 用户已有的 Docker 登录状态。
4. 创建 OSS Bucket 和专用 RAM 凭据。
5. 配置域名、DNS、HTTPS 和安全组。
6. 在 ECS 安装 Docker、Compose、Nginx。
7. 配置 `deploy` 用户的 Docker 权限。
8. 创建 `/opt/mind-vault` 目录和生产 `.env`。
9. 配置 `vm.max_map_count=262144` 和现有 Nginx 的 `/mind-vault/` location。
10. 提交并推送部署文件。
11. 手动运行一次 Workflow。
12. 验证 API、Worker、数据库、搜索、图谱和 OSS。
13. 再开启 `push main` 自动部署。

第一阶段不建议同时引入 RDS、云 MongoDB、云 Elasticsearch 和云消息队列。先使用 ECS + OSS 的组合，可以控制成本并减少迁移变量；等运行数据明确后，再针对单个瓶颈迁移到托管服务。
