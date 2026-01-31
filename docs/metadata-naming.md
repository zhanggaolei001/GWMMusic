# 元数据命名与富化

当从网易 API 无法直接获取可播放链接时，系统会回退到 B 站抓取音频。为保持命名一致性与可读性，本服务提供以下命名/富化策略：

## 强制使用网易命名（默认开启）

- 环境变量：`FORCE_NETEASE_NAMING`（默认 `true`）
- 行为：若能从网易拿到歌曲基础信息（标题、主艺人），即使最终音频来自 B 站，也会使用网易的标题/艺人来命名缓存目录和文件。
- 目录结构示例：`<tag>/周杰伦/稻香 (755598916)/稻香.mp3`

## MusicBrainz 兜底富化（默认开启）

- 当网易无可用元数据（如某些版权限制）时，可选用 MusicBrainz 公开数据库做兜底：
  - 环境变量：`BILI_MB_FALLBACK=1` 或 `ENABLE_MB_FALLBACK=1`（默认开启）
  - 可自定义 UA：`MB_USER_AGENT="GWMMusic/0.1 (+your-contact)"`
  - 仅用于补全标题/艺人，不影响实际音频来源

## B 站转码与目标格式

- 环境变量：`BILI_TARGET_FORMAT`（`original`/`mp3`/`flac`，默认 `original`）
- 回源 B 站时，若设为 `mp3` 会进行转码并内嵌基础 ID3（标题/艺人/专辑、封面、歌词）。

## 配置归纳

- `FORCE_NETEASE_NAMING`：是否强制使用网易命名（默认 `true`）
- `BILI_MB_FALLBACK` / `ENABLE_MB_FALLBACK`：是否启用 MusicBrainz 兜底（默认 `true`）
- `MB_USER_AGENT`：MusicBrainz 请求头（建议设置为能联系到你的 UA）
- `BILI_TARGET_FORMAT`：B 站音频目标格式（默认 `original`）

## 注意事项

- 若既无法从网易拿到元数据，又未开启 MB 兜底，最终会退回使用 B 站信息（如 UP 主名），命名可能与原曲不一致。
- 富化只影响缓存中的命名与文件标签，不改变音频来源与播放链接。

