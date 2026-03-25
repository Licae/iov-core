# Repository Guidelines

## Project Structure & Module Organization
This repository is a full-stack monolith for the IOV test platform. Frontend code lives in `src/` and is organized by feature modules such as `src/modules/assets/`, `src/modules/tara/`, and `src/modules/task-detail/`. Shared API client code is in `src/api/`.

Backend code lives in `backend/`: `app/` wires Express and Vite, `routes/` exposes `/api` endpoints, `services/` contains business logic, `repositories/` handles SQLite access, `db/` initializes storage, and `execution/` plus `executors/` manage task orchestration and worker plugins. Python-based security checks live in `scripts/`. Runtime data is stored in `runtime-data/` and generated artifacts in `runtime-artifacts/`.

## Build, Test, and Development Commands
Use Node `22.22.1` and npm `10+`.

- `npm install`: install dependencies.
- `cp .env.example .env`: create local configuration.
- `npm run dev`: start the local server at `http://localhost:3000`.
- `npm run dev:backend`: run only the backend entrypoint with `tsx`.
- `npm run start`: start the production-style backend server.
- `npm run build`: build the Vite frontend into `dist/`.
- `npm run lint`: run `tsc --noEmit` type checks.
- `npm run clean`: remove `dist/`.

## Coding Style & Naming Conventions
Use TypeScript and ESM imports. Follow the existing file style: double quotes are common in backend and hooks, semicolons are enabled, and indentation is 2 spaces. Prefer `kebab-case` for filenames (`task-detail-modal.tsx`), `PascalCase` for React components, and `camelCase` for functions, hooks, and variables. Keep feature-specific UI and hooks together inside `src/modules/<feature>/`.

## Testing Guidelines
There is no dedicated automated test suite yet. Before opening a PR, run `npm run lint`, then smoke test the affected flow with `npm run dev`. If you add backend execution behavior, verify related scripts under `scripts/` and document any required environment variables in `.env.example`.

## Commit & Pull Request Guidelines
Recent history mixes short Chinese and English subjects, for example `Define executor adapter interface` and `更改测试用例执行逻辑`. Keep commits focused and concise; prefer one change per commit and start with the affected area or action.

PRs should include a clear summary, impacted modules, manual verification steps, and screenshots for UI changes. Link related issues or task IDs when available, and call out database, script, or environment variable changes explicitly.

## Security & Configuration Tips
Do not commit live secrets or runtime database files. Use `DB_PATH` to point to a local SQLite file when needed, and treat `runtime-artifacts/` as disposable generated output.
