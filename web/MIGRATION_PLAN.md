GWM Music — Frontend Migration & Refactor Plan

目标
- 将大量自定义 UI/样式迁移到成熟的组件库/设计系统，减少手写 CSS 和重复实现，提升一致性和可维护性。
- 保留业务逻辑（api/services/cache/download/stream），只替换 UI 层与通用前端库。
- 分阶段、可回滚地完成迁移，优先做 POC（SearchPage / Player）。

当前问题（观察与总结）
- 大量自定义样式文件（src/styles/*.css）导致维护成本高、视觉一致性难保证。
- 自实现 UI 组件（Navigation, Player, RightPanel, SearchPage）重复实现了许多通用行为（列表、表单、弹窗、按钮、进度条）。
- 自定义样式难以主题化，难以快速适配深色/浅色或统一色彩。
- 部分交互（播放控制、进度、加载）自己实现，复用性和可测试性不足。
- 代码中存在对样式和行为的耦合，阻碍逐步替换。

建议采用的库（可选）
- 组件库：Ant Design (antd) 或 Mantine（推荐 AntD 作为第一选择以获得更完整的组件与中文文档）。
- 数据请求/缓存：@tanstack/react-query（推荐）或 SWR。
- 表单：react-hook-form（若使用 antd，可使用 antd 的 Form 或 react-hook-form）。
- 图标：react-icons 或 @ant-design/icons（若用 antd，使用官方图标）。
- 音频：保留 HTMLAudioElement；可选 howler 仅作为 fallback/工具。

迁移策略（分阶段）
1. 评估与准备
   - 列出 `web/src/components` 与 `web/src/hooks` 中所有自定义 UI/样式的文件。
   - 记录每个组件的依赖（样式、子组件、外部 props、事件）。
2. 依赖安装与基础配置
   - 选择组件库并安装（示例：`npm install antd @ant-design/icons @tanstack/react-query react-icons`）。
   - 配置 Vite（如需 less 或样式按需加载，添加相应插件）。
3. POC（SearchPage/Player）
   - 先迁移 `SearchPage`：使用组件库的 `Input.Search`、`List`/`Table`、`Skeleton` 等替换已有实现；用 `react-query` 管理搜索请求。
   - 或迁移 `Player`：保留 `useAudio`（已经增强），替换 UI（`Slider`、`Button`、`Tooltip`），确保事件与行为不变。
4. 逐步替换
   - 按优先级迁移：SearchPage -> Player -> RightPanel -> Navigation -> SettingsPage -> 其余。
   - 每一步保持小的、可回滚的提交和手动测试。
5. 清理与优化
   - 移除已替换组件对应的 CSS 文件或把其样式迁移为主题变量覆盖。
   - 运行 bundle 分析 (rollup visualizer) 并优化按需加载。

迁移细节与注意事项
- 保留 `useAudio` 的核心：不要用高层音频库替换直接的 `audio` 元素，因后端使用 Range 分片，原生元素更可靠。
- 使用 `react-query` 可以大幅减少手动缓存/加载状态逻辑。
- 若使用 `antd`，建议使用 `ConfigProvider`/主题覆盖颜色，避免大量覆盖 CSS。
- 对于全局样式，建议逐步降级为组件库主题变量 + 最少量自定义样式。

示例安装命令（在 web/ 目录下执行）

# AntD + react-query
npm install antd @ant-design/icons @tanstack/react-query react-icons howler

# Mantine + react-query（备选）
npm install @mantine/core @mantine/hooks @mantine/notifications @tanstack/react-query react-icons howler

交付物
- 本文件 `web/MIGRATION_PLAN.md`（当前）
- 初始 POC 分支（可选）

下一步建议
- 确认使用的组件库（antd 或 mantine）。
- 我可以立刻做 POC（迁移 `SearchPage` 为 antd + react-query），会创建一个分支并提交小的、更改后的文件，便于 review。