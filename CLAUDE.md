# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

IOV-CORE：车联网安全测试平台，全栈单体架构。管理测试用例、执行安全检测脚本、追踪需求/TARA/用例的可追溯性链路。

## 开发命令

```bash
nvm use                    # 切换到 Node 22.22.1
npm install                # 安装依赖
npm run dev                # 启动开发服务器（Express + Vite HMR），访问 http://localhost:3000
npm run lint               # TypeScript 类型检查（tsc --noEmit）
npm run test               # vitest 单元测试
npm run test -- backend/services/test-case-quality.test.ts  # 运行单个测试文件
npm run test:e2e           # Playwright E2E 测试（端口 3100，串行执行）
npm run build              # Vite 构建前端到 dist/
```

## 架构

### 后端（Express + SQLite）

入口 `backend/server.ts` 启动 Express 服务器，内嵌 Vite 中间件（开发环境），通过 WebSocket 推送实时执行日志。

- **app/** — Express 应用工厂、WebSocket 广播、API 路由注册。路由依赖通过 `ApiRouteDeps` 类型显式注入。
- **routes/** — REST API 端点，统一挂载在 `/api`。每个路由文件导出 `register*Routes(app, deps)` 函数。
- **services/** — 业务逻辑：报告生成、产物管理、基线数据、TARA 资产同步、可追溯性治理。
- **repositories/** — SQLite 数据访问层。
- **db/** — 数据库初始化与迁移。`initializeDatabase()` 使用 `safeExec` 做增量 DDL（ALTER TABLE 补列），支持 schema_version 和 schema_migrations 双轨迁移。
- **execution/** — 任务执行引擎，核心链路：
  - `ExecutionTaskService` — 任务 CRUD 和状态管理
  - `ExecutionWorkerClient` — 主进程与 worker 子进程的 IPC 通信
  - `execution-worker-process.ts` — 独立 worker 进程入口（fork 方式启动）
  - `ExecutionOrchestrator` — 编排单条任务的执行流程
  - `ExecutionRunner` — 调用具体 executor 运行测试
- **executors/** — 执行器插件体系，`ExecutorAdapterPlugin` 接口定义插件化扩展点。支持 python/shell/scapy/canoe/simulate 等模式。

### 前端（React + Vite + TailwindCSS）

SPA 应用，前端路由通过 `App.tsx` 中的 `view` state 切换（非 react-router）。

- **src/api/** — API 客户端（fetch 封装）、TanStack Query hooks、类型定义。
- **src/app/** — 应用壳：侧边栏、顶栏、全局配置常量。
- **src/modules/** — 按功能模块组织：dashboard、management（用例管理）、running（执行监控）、suites、assets、requirements、tara、reports、defects、task-detail、task-launch。

### 数据库

SQLite（better-sqlite3），文件默认在 `runtime-data/v2x_testing.db`，可通过 `DB_PATH` 环境变量指定。核心表：test_cases、test_runs、execution_tasks、execution_task_items、test_suites、assets、requirements、tara_items，以及多张关联表支撑可追溯性矩阵。历史数据自动归档到 `*_archive` 表。

### 安全测试脚本

`scripts/` 下的 Python 脚本是实际的安全检测逻辑（ADB 检查、APK 签名、SELinux 策略等），由执行引擎通过子进程调用。

## 关键模式

- **依赖注入**：后端路由和服务通过参数传入依赖（db、service 方法），不使用全局单例。
- **增量迁移**：数据库 schema 变更用 `safeExec` 包裹 ALTER TABLE，失败静默跳过（列已存在时）。新增迁移放 `migrations` 数组。
- **worker 子进程**：任务执行在 fork 出的子进程中运行，主进程通过 IPC 消息通信，避免阻塞主线程。
- **实时推送**：执行状态变更通过 WebSocket 广播给所有前端客户端。
- **路径别名**：`@` 映射到项目根目录（vite.config.ts 和 vitest.config.ts 均配置）。

## 环境变量

关键变量见 `.env.example`。`GEMINI_API_KEY` 控制 AI 缺陷分析；`EXECUTION_MODE` 控制执行器模式（python/script/simulate）；`DB_PATH` 指定数据库路径。

## 编码约定

- TypeScript + ESM，2 空格缩进，双引号为主
- 文件名 `kebab-case`，组件 `PascalCase`，函数/变量 `camelCase`
- 前端模块按功能聚合在 `src/modules/<feature>/`
- 注释使用中文
