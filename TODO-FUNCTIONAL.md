# Functional TODO

- 执行前置检查（Preflight）
  - 任务启动前校验连接地址、端口可达、工具可用性。
  - 不满足时直接标记 `BLOCKED` 并给出阻断原因。

- 统一证据输出
  - 每个步骤固定保存 `command / exit_code / stdout / stderr / timestamp / conclusion`。
  - 任务详情默认显示摘要，支持展开查看完整证据。

- 失败分类与重试策略
  - 失败分类统一为 `ENVIRONMENT / PERMISSION / SCRIPT`。
  - 仅允许可重试类型触发“重试”，并显示重试限制原因。

- 脚本适配器插件化（P1）
  - 将执行器沉淀为标准适配器接口（先 `shell/python`）。
  - 后续新增 `scapy/canoe/自研` 时不改主流程。
