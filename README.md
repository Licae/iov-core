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
npm run lint
npm run build
```

## 数据存储

- SQLite 数据库文件：`v2x_testing.db`
- 默认由服务启动时自动建表和补齐缺失字段

## 说明

- 后端 API 统一挂载在 `/api`
- 开发环境由 `server.ts` 启动 Express，并内嵌 Vite 中间件
- 生产构建后由 Express 直接托管 `dist/`
