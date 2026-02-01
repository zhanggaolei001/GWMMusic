#!/usr/bin/env bash
set -e

# 默认参数
SERVER_DIR=${1:-server}
WEB_DIR=${2:-web}
LOG_DIR=${3:-logs}

# 检查目录
if [ ! -d "$SERVER_DIR" ]; then
  echo "❌ Server directory not found: $SERVER_DIR"
  exit 1
fi
if [ ! -d "$WEB_DIR" ]; then
  echo "❌ Web directory not found: $WEB_DIR"
  exit 1
fi

# 计算绝对路径
SERVER_ABS=$(realpath "$SERVER_DIR")
WEB_ABS=$(realpath "$WEB_DIR")
LOG_ABS=$(realpath "$LOG_DIR" 2>/dev/null || echo "")
[ -z "$LOG_ABS" ] && mkdir -p "$LOG_DIR" && LOG_ABS=$(realpath "$LOG_DIR")

SERVER_LOG="$LOG_ABS/server-dev.log"
WEB_LOG="$LOG_ABS/web-dev.log"

# 轮转旧日志
[ -f "$SERVER_LOG" ] && rm -f "$SERVER_LOG"
[ -f "$WEB_LOG" ] && rm -f "$WEB_LOG"

# 启动 server
echo "🚀 Starting server dev (logs: $SERVER_LOG)"
(
  cd "$SERVER_ABS"
  npm run dev >>"$SERVER_LOG" 2>&1
) &
SERVER_PID=$!

# 启动 web
echo "🚀 Starting web dev (logs: $WEB_LOG)"
(
  cd "$WEB_ABS"
  npm run dev >>"$WEB_LOG" 2>&1
) &
WEB_PID=$!

# 显示信息
echo "✅ Both processes started."
echo "Server PID: $SERVER_PID | Web PID: $WEB_PID"
echo
echo "📜 Tail logs with:"
echo "  tail -f $SERVER_LOG"
echo "  tail -f $WEB_LOG"
echo
echo "Press Ctrl+C to stop this script. Use 'kill <PID>' to stop individually."

# 兼容 bash 3.2 / sh：轮询等待任一进程退出
while true; do
  if ! ps -p "$SERVER_PID" > /dev/null 2>&1; then
    break
  fi
  if ! ps -p "$WEB_PID" > /dev/null 2>&1; then
    break
  fi
  sleep 1
done

echo "⚠️  One of the processes has exited. Check logs for details."

# 输出日志尾部以便快速定位
echo "\n--- server-dev.log (last 50 lines) ---"
tail -n 50 "$SERVER_LOG" || true
echo "\n--- web-dev.log (last 50 lines) ---"
tail -n 50 "$WEB_LOG" || true

# 提示仍存活进程
if ps -p "$SERVER_PID" > /dev/null 2>&1; then
  echo "\nServer still running: PID $SERVER_PID"
else
  echo "\nServer not running (PID $SERVER_PID)"
fi

if ps -p "$WEB_PID" > /dev/null 2>&1; then
  echo "Web still running: PID $WEB_PID"
else
  echo "Web not running (PID $WEB_PID)"
fi

echo "\nTo stop manually:"
echo "  kill $SERVER_PID"
echo "  kill $WEB_PID"
