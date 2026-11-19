/**
 * 跨组件共享的契约模块：类型、分类协议、品牌文案、预设壁纸。
 * 只放数据，不放 JSX 组件。
 */

export const APP_NAME = "内网传输中转站";
export const APP_TAGLINE = "在你的局域网里互传文件";

/** 单文件大小上限（本地演示版受浏览器存储限制，实际可用量看顶栏的配额仪表） */
export const MAX_FILE_BYTES = 2048 * 1024 * 1024;

export type FileKind = "video" | "image" | "audio" | "doc" | "archive" | "note" | "other";

export type SortKey = "time-desc" | "size-desc" | "name-asc";

export type ViewMode = "list" | "grid";

export interface WallPaperPreset {
  id: string;
  label: string;
  url: string;
  /** 该预设更适合搭配深色前景还是浅色前景 */
  tone: "light" | "dark";
}

export const WALLPAPER_PRESETS: WallPaperPreset[] = [
  {
    id: "yozora",
    label: "夜穹",
    tone: "dark",
    url: "https://g.cdn.meoo.host/r7pfmpeg98ax/ai-images/壁纸-夜空.png?auth_key=db26b5473c7f7ba6b59496e48d9ac4983e93f6ccd016038008becdc74a5fb3a4",
  },
  {
    id: "sakura",
    label: "樱空",
    tone: "light",
    url: "https://g.cdn.meoo.host/r7pfmpeg98ax/ai-images/壁纸-樱空.png?auth_key=a59153804503c2993f755d66150978c7ba53f6a30040a847111708e33f1b380a",
  },
  {
    id: "neon",
    label: "霓虹",
    tone: "dark",
    url: "https://g.cdn.meoo.host/r7pfmpeg98ax/ai-images/壁纸-霓虹.png?auth_key=e3b80a21f7edc9f643c3311cecb13f64a933f35f14082297f33aefc488efd30f",
  },
  {
    id: "abyss",
    label: "深海",
    tone: "dark",
    url: "https://g.cdn.meoo.host/r7pfmpeg98ax/ai-images/壁纸-深海.png?auth_key=7c7d729260b9bf78e9ac6c7d33a57b156af64c97143dc1ad26151f6112c3690d",
  },
  {
    id: "afternoon",
    label: "午后",
    tone: "light",
    url: "https://g.cdn.meoo.host/r7pfmpeg98ax/ai-images/壁纸-午后.png?auth_key=daa2406265568acf7272df21a68b63af24a803ffcbb019a1263e174913709c6d",
  },
  {
    id: "mist",
    label: "雾霞",
    tone: "light",
    url: "https://g.cdn.meoo.host/r7pfmpeg98ax/ai-images/壁纸-雾霞.png?auth_key=1d95e7423bf5496c56113a3b5f6e255bb8442a8804e5c7480d576ba1269674b7",
  },
];

export interface FileMeta {
  id: string;
  name: string;
  /** 展示名，可重命名；真实扩展名仍看 ext */
  displayName: string;
  ext: string;
  mime: string;
  size: number;
  kind: FileKind;
  createdAt: number;
  source: string;
  /** 笔记正文；仅 kind === "note" */
  noteBody?: string;
  /** IndexedDB 中 Blob 的 key；笔记为空 */
  blobKey?: string;
  /** 缩略图 dataURL（图片/视频抽帧） */
  thumb?: string;
}

export type TaskStatus = "queued" | "uploading" | "paused" | "done" | "error" | "canceled";

export interface TransferTask {
  id: string;
  name: string;
  size: number;
  loaded: number;
  status: TaskStatus;
  speed: number;
  eta: number;
  kind: FileKind;
  error?: string;
  fileMetaId?: string;
}

export interface CategoryDef {
  id: FileKind | "all";
  label: string;
}

export const CATEGORIES: CategoryDef[] = [
  { id: "all", label: "全部" },
  { id: "video", label: "视频" },
  { id: "image", label: "图片" },
  { id: "audio", label: "音频" },
  { id: "doc", label: "文档" },
  { id: "archive", label: "压缩包" },
  { id: "note", label: "笔记" },
  { id: "other", label: "其他" },
];

export const SORT_OPTIONS: { id: SortKey; label: string }[] = [
  { id: "time-desc", label: "时间 · 最新优先" },
  { id: "size-desc", label: "大小 · 大的在前" },
  { id: "name-asc", label: "名称 · A→Z" },
];

const EXT_MAP: Record<FileKind, string[]> = {
  video: ["mp4", "mov", "mkv", "webm", "avi", "flv", "m4v", "3gp", "ts"],
  image: ["jpg", "jpeg", "png", "gif", "webp", "bmp", "heic", "avif", "svg"],
  audio: ["mp3", "wav", "ogg", "m4a", "flac", "aac", "opus", "wma"],
  doc: ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "md", "csv", "json", "rtf", "epub"],
  archive: ["zip", "rar", "7z", "tar", "gz", "bz2", "xz"],
  note: [],
  other: [],
};

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(i + 1).toLowerCase() : "";
}

export function detectKind(name: string, mime: string): FileKind {
  const e = extOf(name);
  if (mime.startsWith("video/") || EXT_MAP.video.includes(e)) return "video";
  if (mime.startsWith("image/") || EXT_MAP.image.includes(e)) return "image";
  if (mime.startsWith("audio/") || EXT_MAP.audio.includes(e)) return "audio";
  if (EXT_MAP.archive.includes(e)) return "archive";
  if (EXT_MAP.doc.includes(e) || mime.startsWith("text/")) return "doc";
  return "other";
}

export function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const v = bytes / 1024 ** i;
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

export function formatSpeed(bps: number): string {
  if (!Number.isFinite(bps) || bps <= 0) return "—";
  return `${formatSize(bps)}/s`;
}

export function formatEta(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return "—";
  if (sec < 60) return `${Math.ceil(sec)} 秒`;
  if (sec < 3600) return `${Math.floor(sec / 60)} 分 ${Math.ceil(sec % 60)} 秒`;
  return `${Math.floor(sec / 3600)} 小时 ${Math.floor((sec % 3600) / 60)} 分`;
}

export function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - ts;
  if (diff < 60_000) return "刚刚";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  const pad = (n: number) => String(n).padStart(2, "0");
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (d.toDateString() === now.toDateString()) return `今天 ${hm}`;
  const yest = new Date(now.getTime() - 86_400_000);
  if (d.toDateString() === yest.toDateString()) return `昨天 ${hm}`;
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${hm}`;
}

export function deviceLabel(): string {
  const ua = navigator.userAgent;
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  if (/iPhone|iPad|iPod/i.test(ua)) return "iOS 设备";
  if (/Android/i.test(ua)) return "Android 设备";
  if (/Mac/i.test(ua)) return "macOS 电脑";
  if (/Windows/i.test(ua)) return "Windows 电脑";
  if (/Linux/i.test(ua)) return mobile ? "Linux 手机" : "Linux 电脑";
  return mobile ? "移动设备" : "桌面电脑";
}

export function uid(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
