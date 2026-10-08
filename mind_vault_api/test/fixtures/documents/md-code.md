# 部署手册

本手册说明本地部署步骤。

## 前置条件

- Docker 24 及以上
- 4 GB 可用内存

## 启动命令

先启动依赖，再启动应用：

```bash
docker compose up -d
docker compose logs -f api
```

## 常见问题

端口冲突时修改 `compose.yaml` 中的端口映射后重启。
