# AI Agent Coding Instructions for GWM NetEase Music Service

This document provides essential guidance for AI coding agents working on the GWM NetEase Music Service project. Follow these instructions to ensure productivity and alignment with project conventions.

---

## Project Overview

The GWM NetEase Music Service is a local music API and web console built on a modified version of `netease-cloud-music-api-alger`. It consists of:

- **Backend (`server/`)**: A Node.js + Express service providing REST APIs for search, playlists, lyrics, caching, and downloads.
- **Frontend (`web/`)**: A React + Vite web interface for searching, playing, and managing music.
- **Vendor (`vendor/`)**: Modified source code of the NetEase Cloud Music API, directly referenced by the backend.

### Key Features
- Audio caching with metadata, lyrics, and album covers.
- RESTful APIs for music search, streaming, and playlist management.
- Frontend integration for playback, caching, and download management.

---

## Developer Workflows

### Setting Up the Environment
1. Install dependencies:
   ```bash
   cd server && npm install
   cd ../web && npm install
   ```
2. Configure the NetEase Cookie:
   - Set as an environment variable:
     ```bash
     export NETEASE_COOKIE="MUSIC_U=xxx; __csrf=xxx; ..."
     ```
   - Or paste it in the web console (top-right corner).

### Server Environment Files
- `dotenv` loads the `.env` file before the Express app reads configuration ([../server/src/index.ts](../server/src/index.ts)), so create your own secrets file next to the template and never commit it (it is already ignored).
- Copy [../server/.env.example](../server/.env.example) as a starting point, then fill `NETEASE_COOKIE`, optional `NETEASE_PROXY`, and any cache overrides you need.
- `../server/src/utils/config.ts` enumerates the keys you can tune (`CACHE_*` thresholds, `NETEASE_REAL_IP`, `CACHE_DIR`, etc.) and the defaults that the server relies on ([../server/src/utils/config.ts](../server/src/utils/config.ts#L16-L34)).
- After editing the `.env` file, restart `npm run dev` / `npm start` so the new values are loaded.

### Running the Project
- **Development Mode**:
  ```bash
  # Start backend
  cd server && npm run dev

  # Start frontend
  cd ../web && npm run dev
  ```
  Access the web console at `http://localhost:5173`.

- **Production Mode**:
  ```bash
  # Build frontend
  cd web && npm run build

  # Build and start backend
  cd ../server && npm run build && npm start
  ```

### Testing
- Tests are located in `server/test/`.
- Run tests with:
  ```bash
  cd server && npm test
  ```

---

## Codebase Conventions

### Backend (`server/`)
- **Entry Point**: `src/index.ts` initializes the server and registers routes.
- **Routes**: Defined in `src/routes/`, e.g., `musicRoutes.ts`.
- **Services**: Business logic resides in `src/services/`, e.g., `audioCache.ts`.
- **Utilities**: Shared helpers in `src/utils/`.
- **Testing**: End-to-end tests in `test/`.

### Frontend (`web/`)
- **Entry Point**: `src/main.tsx` initializes the React app.
- **API Integration**: Use `src/lib/api.ts` for backend communication.
- **Styling**: Global styles in `src/styles.css`.

### Vendor (`vendor/`)
- Modified NetEase API source code. Avoid direct edits unless necessary.

---

## Integration Points
- **Backend-Frontend Communication**: The frontend proxies `/api` requests to the backend in development mode.
- **Caching**: Audio files are cached in `cache/` with metadata, lyrics, and covers.
- **Environment Variables**: Critical for backend configuration (e.g., `NETEASE_COOKIE`, `CACHE_DIR`).
- **Docker Deployment**: [docker-compose.yml](../docker-compose.yml) wires the new [server/Dockerfile](../server/Dockerfile) and [web/Dockerfile](../web/Dockerfile); override `NETEASE_*`, `CACHE_*`, `SERVER_PORT`, `WEB_PORT`, and `VITE_API_BASE` via the Compose `.env` so each deployment can mount `cache` and share a unique VIP cookie without exposing it in the UI.

---

## Patterns and Practices

### REST API Design
- Follow existing patterns in `src/routes/musicRoutes.ts`.
- Use `services/` for business logic and `utils/` for shared helpers.

### Caching
- Cache structure: `cache/<tag>/<artist>/<title (id)>/`.
- Metadata is stored in `metadata.json`.

### Error Handling
- Return meaningful HTTP status codes.
- Log errors to `logs/` for debugging.

---

## External Dependencies
- **NetEase Cloud Music API**: Modified version in `vendor/`.
- **React + Vite**: Frontend framework.
- **Node.js + Express**: Backend framework.

---

## Examples

### Adding a New API Endpoint
1. Define the route in `src/routes/musicRoutes.ts`:
   ```typescript
   router.get('/api/new-endpoint', (req, res) => {
       res.json({ message: 'New endpoint' });
   });
   ```
2. Implement logic in `src/services/` if needed.
3. Write tests in `test/`.

### Modifying Frontend Behavior
1. Update `src/lib/api.ts` for backend changes.
2. Modify React components in `src/`.
3. Test changes locally.

---

For questions or unclear sections, consult the `README.md` or ask for clarification.

---

## Chrome DevTools MCP 使用经验（快速提示）

以下为在此仓库中使用 chrome-devtools-mcp（本地 headless Chromium + MCP 服务器）时的实战经验，建议在下次调试时参考：

- **先决条件**：Node.js（建议 20.19+ LTS）、npm（或 npx）、已下载的 Chromium（可用 Playwright 安装），以及项目的 dev server 正在运行（默认 `http://127.0.0.1:5173`）。
- **常用启动流程**（我通常在受限环境下成功使用）：
  1. 使用 Playwright 下载 Chromium（若尚未安装）：
     ```bash
     cd web && npx playwright install --with-deps
     ```
  2. 如果在受限/容器环境运行 Chrome，请用 `--no-sandbox` 启动：
     ```bash
     /root/.cache/ms-playwright/chromium-*/chrome-linux64/chrome \
       --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-mcp-profile \
       --no-first-run --no-default-browser-check --disable-gpu --no-sandbox &
     ```
  3. 启动 MCP，指向运行中的 Chrome（或让 MCP 自行启动 Chrome）：
     ```bash
     # 连接到已启动的 Chrome
     npx -y chrome-devtools-mcp@latest --browser-url=http://127.0.0.1:9222 --headless=true --isolated=true > web/chrome-mcp.log 2>&1 &
     ```
  4. 使用 MCP 或 Playwright 进行操作：截图、trace、console 抓取等（示例见下）。

- **快速命令示例**：
  - 截图（Playwright CLI）：
    ```bash
    npx playwright screenshot http://127.0.0.1:5173 web/screenshot.png --full-page
    ```
  - 录制 trace（Playwright node API 或自定义脚本）：在仓库 `web/tools/` 中通常会放 trace 脚本，运行 `node web/tools/record-trace.mjs`。
  - 获取 DevTools WebSocket（用于外部 DevTools 或 MCP 客户端连接）：
    ```bash
    curl http://127.0.0.1:9222/json/version
    # 查找 webSocketDebuggerUrl 字段
    ```

- **常见问题与修复**：
  - apt 仓库错误导致 `npx playwright install --with-deps` 失败：检查并临时禁用有问题的 `/etc/apt/sources.list.d/*.list` 条目，然后重试。
  - MCP 启动后日志只有免责声明：MCP 可能在后台正常运行，检查是否成功连接到 Chrome（curl 127.0.0.1:9222/json/version），或查看 `web/chrome-mcp.log` 以获取更多信息。
  - 容器/沙箱中 Chrome 无法启动：尝试添加 `--no-sandbox`、`--disable-dev-shm-usage` 等 flags，或让 MCP 使用已安装的 Chrome（--browser-url 指向远程调试端口）。

- **安全与清理**：
  - 开启远程调试端口会在本机上暴露浏览器控制接口。仅在受信任的环境下使用，并在调试结束后关闭 Chromium（kill PID）以避免长期暴露。
  - 使用 `--isolated` 或为 MCP/Chrome 指定临时 `--user-data-dir` 可以避免污染默认浏览器资料。

将这段经验保存在本文件中，便于下次启动 MCP 或在 CI/远程容器中调试时快速参考。