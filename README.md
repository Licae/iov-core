# IOV-CORE

全栈单体测试平台，前端基于 React + Vite，后端基于 Express + SQLite，并通过 WebSocket 推送模拟执行日志。

## 环境要求

- Node.js `22.22.1`
- npm `10+`

建议先用 `nvm` 切到项目固定版本：

```bash
nvm use
```

如果本机还没装该版本：

```bash
nvm install 22.22.1
nvm use 22.22.1
```

## 本地启动

1. 安装依赖

```bash
npm install
```

2. 按需创建本地环境变量文件

```bash
cp .env.example .env
```

`GEMINI_API_KEY` 仅在你需要启用 AI 缺陷分析时配置；未配置时，后端会返回规则化兜底分析。

3. 启动开发环境

```bash
npm run dev
```

启动后访问 [http://localhost:3000](http://localhost:3000)。

## 常用命令

```bash
npm run dev
npm run dev:backend
npm run start
npm run lint
npm run build
```

## 数据存储

- SQLite 数据库文件默认位置：`runtime-data/v2x_testing.db`
- 默认由服务启动时自动建表和补齐缺失字段

## 项目结构

```text
backend/
  app/            # Express + Vite 挂载与 API 装配
  db/             # SQLite 初始化、迁移、归档维护
  execution/      # 任务编排、执行链路、worker 客户端
  executors/      # 执行器适配器与插件注册
  repositories/   # 数据访问层
  routes/         # /api 路由
  services/       # 报告、资产产物、基线数据等服务
src/              # React 前端
scripts/          # 安全测试脚本
analysis/         # 用例评估与导入模板
runtime-artifacts/# 执行期产物（默认不入库）
runtime-data/     # 本地 SQLite 数据
```

## 说明

- 后端 API 统一挂载在 `/api`
- 开发环境由 `backend/server.ts` 启动 Express，并内嵌 Vite 中间件
- 任务执行 worker 进程入口：`backend/execution/execution-worker-process.ts`
- 数据库路径可由 `DB_PATH` 指定，默认 `runtime-data/v2x_testing.db`
- 运行产物默认写入 `runtime-artifacts/`
