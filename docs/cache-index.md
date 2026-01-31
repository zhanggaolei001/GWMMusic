# 缓存索引（SQLite/SQL.js）

为提升大体量缓存下的性能，后端维护一个轻量级索引文件：`cache/_index.db`。

- 实现基于 `sql.js`（WASM 版 SQLite），无需本地原生编译，跨平台稳定。
- 优先使用索引完成列表查询与容量回收；当索引不可用时，自动回退到文件系统扫描。
- 修复 LRU 回收失真问题：回收阶段不再“读取并刷新访问时间”。

## 何时使用重建

- 从旧版本迁移（历史缓存已存在但未写入索引）。
- 发生意外（移动/删除文件、断电等）导致索引与实际不一致。

## 重建索引

```bash
cd server
npm run index:rebuild
```

脚本会：

- 删除并重建 `cache/_index.db`；
- 扫描 `cache/<tag>/`，同时兼容两种存储结构：
  - 新结构：`<tag>/<artist>/<title (id)>/metadata.json`，并由 `<tag>/<id>.index.json` 索引到该目录；
  - 旧结构：`<tag>/<id>.json` + `<tag>/<id>.bin`；
- 自动跳过缺失音频的条目；
- 输出插入/跳过统计信息。

## 运行时行为

- 读取缓存（命中）会更新 `lastAccessedAt`，并同步到索引中。
- 保存缓存时，会写入文件系统与索引；容量回收通过索引的“最久未访问”顺序执行。

## 故障排查

- 若 `npm run index:rebuild` 报类型错误，先执行 `cd server && npm install`。
- 若索引无法读写，后端会自动回退到旧的文件系统扫描逻辑，不影响基础功能。

