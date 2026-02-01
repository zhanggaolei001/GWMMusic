# GWM NetEase 音乐服务

基于自带改造版本的 `netease-cloud-music-api-alger` 搭建本地化音乐 API 与 Web 控制台：

- `server/` 提供搜索、歌单、歌词、缓存、下载等 REST 接口，自动从网易云音乐抓取音频并按标签缓存到本地。
- `web/` 是 React + Vite 构建的浏览器端，可以搜索、播放、下载并查看缓存状态。
- `server/music_api/` 存放修改后的网易云 API 源码，通过 `file:` 依赖被后端直接引用。

> ⚠️ **合法性说明**：仅供个人在已拥有网易云 VIP 权限的前提下自用，严禁用于任何商业或侵权用途。请勿传播缓存的音频文件。

---

## 目录结构

```
GWM/
├── README.md
├── server/                     # Node.js + Express 音乐 API 服务
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts            # 程序入口，注册 API 与静态资源
│       ├── routes/musicRoutes.ts
│       ├── services/audioCache.ts
│       ├── services/neteaseClient.ts
│       └── utils/config.ts
├── web/                        # React 前端（Vite）
│   ├── package.json
│   ├── vite.config.ts
│   └── src/
│       ├── App.tsx
│       ├── main.tsx
│       ├── lib/api.ts
│       └── styles.css
├── lx-source.js               # 洛雪自定义音源脚本（REST 接口）
└── server/music_api/
    ├── package.json（已移除 husky prepare 脚本）
### music_api 目录

- music_api 已合并到本仓库并放置于 `server/music_api/`，不再使用 git submodule。
- 首次安装依赖：
  - `cd server/music_api && npm install`

## Docs

- Cache Index: docs/cache-index.md
- Metadata Naming & Enrichment: docs/metadata-naming.md

---

## 环境准备

1. **安装依赖**（首次执行）
   ```bash
   cd server
   npm install

   cd ../web
   npm install
   ```

2. **配置网易云 Cookie**
   - 推荐写入环境变量（PowerShell 示例）：
     ```bash
     setx NETEASE_COOKIE "MUSIC_U=xxx; __csrf=xxx; ..."
     ```
   - 或在 Web 页面右上角粘贴 Cookie；服务端会把该 Cookie 带到网易接口请求头中。

3. **可选环境变量（server）**

   | 变量名 | 默认值 | 说明 |
   |--------|--------|------|
   | `PORT` | 4000 | 服务端监听端口 |
   | `HOST` | 0.0.0.0 | 监听地址 |
   | `NETEASE_COOKIE` | 空 | 网易云登录 Cookie（获取 VIP 音源） |
   | `NETEASE_REAL_IP` | 101.42.0.1 | 指定国内 IP，必要时可覆盖 |
   | `NETEASE_PROXY` | 空 | 若需通过代理访问，填写 `http://host:port` 或 `https://host:port` |
   | `NETEASE_TIMEOUT_MS` | 15000 | 请求网易接口的超时时间（毫秒） |
   | `CACHE_DIR` | 项目根目录 `cache/` | 音频缓存目录 |
   | `CACHE_TTL_HOURS` | 24 | 缓存有效期（小时），0 表示永久 |
   | `CACHE_MAX_SIZE_MB` | 2048 | 缓存最大占用（MB），0 表示不限制 |

---

## 启动方式

### 开发模式

在两个终端中分别运行：

```bash
# 启动后端
cd server
npm run dev

# 启动前端（Vite 会代理 /api）
cd ../web
npm run dev
```

然后访问 `http://localhost:5173` 使用 Web 控制台。

### 生产 / 单体部署

1. 构建前端：
   ```bash
   cd web
   npm run build
   ```
   生成的 `web/dist` 会被服务端自动作为静态资源托管。

2. 构建并启动服务端：
   ```bash
   cd ../server
   npm run build
   npm start
   ```
   默认监听 `http://0.0.0.0:4000`，直接在浏览器访问即可。

---

## Docker 部署

- `docker compose build` 会从 [server/Dockerfile](server/Dockerfile) 和 [web/Dockerfile](web/Dockerfile) 构建镜像，后端直接运行 `node dist/index.js`，前端用 `nginx` 托管 `dist/` 内容；`web` 镜像会把 `${VITE_API_BASE:-http://localhost:4000}` 传给 Vite，在构建阶段就把 API 基址固定下来。
- `docker compose up -d` 会把服务端绑定到 `SERVER_PORT`（默认 4000）、前端绑定到 `WEB_PORT`（默认 5173），并挂载 `cache` 卷到容器里的 `/cache`。
- 在项目根目录创建 `.env`，写入 `NETEASE_COOKIE`、`NETEASE_PROXY`、`CACHE_MAX_SIZE_MB`、`CACHE_TTL_HOURS`、`SERVER_PORT`、`WEB_PORT` 等值；`server/src/utils/config.ts` 会读这些变量控制缓存、代理与 Cookie。 Compose 也允许在运行命令前通过 `export` 或 `docker compose --env-file` 传入自定义环境变量。
- 前端镜像接受 `VITE_API_BASE` 变量（默认 `http://localhost:4000`），根据实际部署调整成后端容器的主机名或 IP，确保界面请求到正确的 API。


## 后端 API 摘要

| 方法 | 路径 | 描述 |
|------|------|------|
| `GET /api/health` | 查看服务状态与缓存目录 |
| `GET /api/search?q=关键词` | 搜索歌曲（可选 `limit`、`type`、`offset`） |
| `GET /api/songs/:id` | 获取歌曲详情 |
| `GET /api/songs/:id/lyrics` | 获取歌词 |
| `GET /api/songs/:id/cover` | 获取封面图片（用于洛雪 pic） |
| `GET /api/songs/:id/stream?tag=xxx&br=999000` | 串流并缓存音频（默认 inline 播放） |
| `GET /api/songs/:id/download?...` | 串流并缓存音频后以附件下载 |
| `GET /api/playlists/:id` | 获取歌单详情 |
| `GET /api/playlists/:id/tracks` | 获取歌单全部歌曲（支持 `limit`） |
| `GET /api/cache` | 查看已缓存的音频记录 |

- 缓存按标签（tag）分类，前端默认使用 `favorites`，可自定义。
- 首次播放/下载会从网易云获取音频并写入缓存，后续命中则直接本地读取。
- 若设置缓存上限，会以最久未访问策略自动清理。

---

## 洛雪音源（lx-source.js）

本仓库根目录提供 `lx-source.js`，用于洛雪音乐的自定义音源脚本。它会调用本服务的 REST 接口：

- `musicUrl` -> `/api/songs/:id/stream?br=...`
- `lyric` -> `/api/songs/:id/lyrics`
- `pic` -> `/api/songs/:id/cover`

使用步骤：

1. 在洛雪音乐「设置 -> 自定义源」导入脚本 `lx-source.js`。
2. 打开脚本，将 `API_BASE` 修改为你的服务端地址（默认 `http://127.0.0.1:4000/api`）。
3. 选择 `GWM REST` 源，即可获取播放、歌词与封面。

---

### 缓存文件组织

- 缓存目录结构：`cache/<标签>/<歌手>/<歌曲 title (id)>/`，目录内包含音频、`lyrics.lrc`、`cover.*` 与 `metadata.json`。
- `metadata.json` 记录来源、位深、码率、时长等信息，并由 `music-metadata` 自动解析写入。
- `lyrics.lrc` 为同步歌词，未找到歌词时不会生成文件。
- `cover.*` 取网易云专辑封面（默认为 `jpg`，若接口返回其他类型则按 MIME 自动选择扩展名）。
- 若没有历史缓存，新文件会按上述结构建立；旧版缓存仍可兼容使用，重新下载后会升级为新结构。

---## 前端特性

- 搜索并即时播放歌曲（`<audio>` 播放器）。
- 一键缓存/下载（调用 download 接口）。
- 自定义标签与码率，适配不同场景。
- 输入歌单 ID 获取曲目列表并播放/缓存。
- 缓存概览展示条目数量、大小与最后访问时间。
- 右上角可临时粘贴 VIP Cookie，无需重启服务端。

---

## 故障排查建议

- **搜索卡住**：通常是网易接口超时或被屏蔽，可尝试设置 `NETEASE_PROXY`、`NETEASE_REAL_IP` 或提升 `NETEASE_TIMEOUT_MS`。
- **音频抓取失败**：确认 Cookie 仍然有效，并检查是否具备对应音源的播放权限。
- **缓存未命中**：检查 tag 是否一致，或缓存是否被 TTL/容量限制清理。

---

## 后续拓展

- 接入账户登录接口，自动刷新 Cookie。
- 为缓存记录增加删除、重命名等管理功能。
- 增强播放器（歌词同步、播放队列等）。
- 将缓存目录映射至 NAS / 云存储，实现多设备共享。

如需扩展 API，请在 `server/src/routes/musicRoutes.ts` 增加路由或在 `services/` 目录实现新逻辑。前端可以在 `web/src` 中拆分组件继续迭代。欢迎明天回来验收成果！



