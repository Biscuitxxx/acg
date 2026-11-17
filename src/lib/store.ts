import { useSyncExternalStore } from "react";
import type { FileKind, FileMeta, SortKey, TransferTask, ViewMode } from "./site";
import { MAX_FILE_BYTES, detectKind, uid } from "./site";

const PREF_KEY = "acg.prefs.v1";

/**
 * 持久层分工：
 * - 文件本体与文件列表 → 服务端（server/index.mjs），落在那台机器的磁盘上，
 *   所以同一局域网里手机、电脑打开同一个地址，看到的是同一份数据；
 * - 界面偏好（壁纸 / 主题 / 视图 / 花瓣）→ 仍然留在本机 localStorage，
 *   每台设备可以有各自的观感，不需要同步。
 */
const API = "";

export interface Prefs {
  wallpaperId: string;
  /** 用户上传的自定义壁纸 dataURL；优先于预设 */
  customWallpaper: string | null;
  dim: number; // 0-80 遮罩强度
  blur: number; // 0-24 模糊
  bright: number; // 60-120 亮度
  theme: "light" | "dark";
  view: ViewMode;
  petal: boolean;
}

const DEFAULT_PREFS: Prefs = {
  wallpaperId: "sakura",
  customWallpaper: null,
  dim: 34,
  blur: 0,
  bright: 100,
  theme: "light",
  view: "list",
  petal: true,
};

/** 对象型：合并默认值；若原值是数组（历史脏数据）直接回退默认 */
function readObject<T extends object>(key: string, fallback: T): T {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? "null");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return fallback;
    return { ...fallback, ...parsed } as T;
  } catch {
    return fallback;
  }
}

/* ------------------------------ 订阅机制 ------------------------------ */

type Listener = () => void;
const listeners = new Set<Listener>();
let snapshotVersion = 0;

function emit() {
  snapshotVersion += 1;
  listeners.forEach((l) => l());
}

function subscribe(l: Listener) {
  listeners.add(l);
  return () => listeners.delete(l);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/* ------------------------------ 状态 ------------------------------ */

let files: FileMeta[] = [];
let prefs: Prefs = readObject<Prefs>(PREF_KEY, DEFAULT_PREFS);
let tasks: TransferTask[] = [];
let quota: { usage: number; quota: number } = { usage: 0, quota: 0 };
let filter: { kind: FileKind | "all"; q: string; sort: SortKey } = { kind: "all", q: "", sort: "time-desc" };

console.info("[store] 界面偏好已读取", { wallpaperId: prefs.wallpaperId, theme: prefs.theme });

/** 文件列表由服务端持有，这里保留空实现，调用点无需改动 */
function persistFiles() {
  /* noop：列表已落到服务端的 data/index.json */
}

function persistPrefs() {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
  } catch {
    /* 私密模式下写不进去就只保留内存态 */
  }
  applyTheme();
}

export function applyTheme() {
  const root = document.documentElement;
  root.classList.toggle("dark", prefs.theme === "dark");
  root.style.colorScheme = prefs.theme;
}

/* ------------------------------ 服务端通信 ------------------------------ */

/** 每片 8MB：太大不利于暂停响应，太小请求次数过多 */
const CHUNK = 8 * 1024 * 1024;

interface StatePayload {
  files?: FileMeta[];
  quota?: { usage: number; quota: number } | null;
}

async function refreshQuota() {
  const state = await fetchState();
  if (state?.quota) {
    quota = state.quota;
    emit();
  }
}

async function fetchState(): Promise<StatePayload | null> {
  try {
    const res = await fetch(`${API}/api/state`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as StatePayload;
  } catch {
    return null;
  }
}

/** 首次加载：把服务端已有的文件拉进内存，失败就先空着（页面不白屏） */
async function loadState() {
  const state = await fetchState();
  if (!state) {
    console.warn("[store] 未能连接服务端 —— 请确认已运行 node server/index.mjs，且 dev 代理正常");
    emit();
    return;
  }
  files = Array.isArray(state.files) ? state.files.filter((f) => f && typeof f.id === "string") : [];
  if (state.quota) quota = state.quota;
  console.info("[store] 服务端文件列表载入完成", { files: files.length });
  emit();
}

void loadState();

/* ------------------------------ 缩略图抽取 ------------------------------ */

async function makeThumb(kind: FileKind, file: File): Promise<string | undefined> {
  try {
    if (kind === "image") {
      if (file.size > 25 * 1024 * 1024) return undefined;
      const url = URL.createObjectURL(file);
      const img = new Image();
      await new Promise<void>((res, rej) => {
        img.onload = () => res();
        img.onerror = () => rej(new Error("decode"));
        img.src = url;
      });
      const canvas = document.createElement("canvas");
      const scale = Math.min(1, 320 / Math.max(img.width, img.height));
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) return undefined;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const out = canvas.toDataURL("image/jpeg", 0.72);
      URL.revokeObjectURL(url);
      return out;
    }
    if (kind === "video") {
      const url = URL.createObjectURL(file);
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.preload = "metadata";
      await new Promise<void>((res, rej) => {
        video.onloadeddata = () => res();
        video.onerror = () => rej(new Error("decode"));
        setTimeout(() => rej(new Error("timeout")), 6000);
        video.src = url;
      });
      const dur = Number.isFinite(video.duration) ? video.duration : 0;
      await new Promise<void>((res) => {
        video.onseeked = () => res();
        try {
          video.currentTime = Math.min(1, dur / 3 || 0.5);
        } catch {
          res();
        }
        setTimeout(res, 2500);
      });
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(video.videoWidth * Math.min(1, 320 / (video.videoWidth || 320))));
      canvas.height = Math.max(1, Math.round(canvas.width * ((video.videoHeight || 9) / (video.videoWidth || 16))));
      const ctx = canvas.getContext("2d");
      const out = ctx ? (ctx.drawImage(video, 0, 0, canvas.width, canvas.height), canvas.toDataURL("image/jpeg", 0.66)) : undefined;
      URL.revokeObjectURL(url);
      return out;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

/* ------------------------------ 上传任务控制 ------------------------------ */

interface Controller {
  pause: () => void;
  resume: () => void;
  cancel: () => void;
}
const controllers = new Map<string, Controller>();

function patchTask(id: string, patch: Partial<TransferTask>) {
  tasks = tasks.map((t) => (t.id === id ? { ...t, ...patch } : t));
  emit();
}

/** 改名 / 回填缩略图这类轻量更新统一走这里 */
async function patchMeta(id: string, patch: { displayName?: string; thumb?: string }): Promise<FileMeta | null> {
  try {
    const res = await fetch(`${API}/api/files/${id}/meta`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { meta?: FileMeta };
    return data.meta ?? null;
  } catch {
    return null;
  }
}

/** 取消 / 失败时清掉服务端残留的 .part */
async function discardUpload(id: string) {
  try {
    await fetch(`${API}/api/files/${id}/discard`, { method: "POST" });
  } catch {
    /* 服务端不可达就忽略；残留分片下次同 id 上传会被截断 */
  }
}

function sendChunk(
  meta: FileMeta,
  blob: Blob,
  offset: number,
  total: number,
  onProgress: (sent: number) => void,
  track: (xhr: XMLHttpRequest) => void,
): Promise<{ ok: boolean; aborted?: boolean; error?: string }> {
  return new Promise((resolveChunk) => {
    const xhr = new XMLHttpRequest();
    track(xhr);
    xhr.open("POST", `${API}/api/files/${meta.id}/chunk?offset=${offset}`);
    // 元信息跟着每一片走，服务端在最后一片收尾时用它生成 index 条目
    xhr.setRequestHeader("x-file-name", encodeURIComponent(meta.name));
    xhr.setRequestHeader("x-file-mime", meta.mime || "application/octet-stream");
    xhr.setRequestHeader("x-file-kind", meta.kind);
    xhr.setRequestHeader("x-file-ext", meta.ext);
    xhr.setRequestHeader("x-file-total", String(total));
    xhr.setRequestHeader("x-file-created", String(meta.createdAt));
    xhr.setRequestHeader("x-file-source", encodeURIComponent(meta.source));
    xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onload = () => {
      let message: string | undefined;
      try {
        message = (JSON.parse(xhr.responseText || "{}") as { error?: string }).error;
      } catch {
        /* 响应不是 JSON（比如代理返回了 HTML），忽略 */
      }
      resolveChunk({ ok: xhr.status >= 200 && xhr.status < 300, error: message });
    };
    xhr.onerror = () => resolveChunk({ ok: false, error: "网络中断，可能是服务端没起来" });
    xhr.onabort = () => resolveChunk({ ok: false, aborted: true });
    xhr.send(blob);
  });
}

/**
 * 分片上传：进度、速度、剩余时间都来自真实发出的字节；
 * 暂停停在分片之间，继续从 offset 接着发（服务端按 offset 追加，天然支持续传）；
 * 取消会 abort 当前请求并让服务端清理暂存。
 */
async function ingest(taskId: string, file: File, meta: FileMeta): Promise<boolean> {
  let offset = 0;
  let loadedBytes = 0;
  let startedAt = performance.now();
  let pausedAccum = 0;

  const st: { s: "run" | "pause" | "stop" } = { s: "run" };
  let activeXhr: XMLHttpRequest | null = null;

  const ctl: Controller = {
    pause: () => {
      if (st.s === "run") {
        st.s = "pause";
        patchTask(taskId, { status: "paused", speed: 0 });
      }
    },
    resume: () => {
      if (st.s === "pause") {
        st.s = "run";
        pausedAccum = performance.now();
        patchTask(taskId, { status: "uploading" });
      }
    },
    cancel: () => {
      st.s = "stop";
      activeXhr?.abort();
    },
  };
  controllers.set(taskId, ctl);

  while (offset < file.size) {
    if (st.s === "stop") {
      controllers.delete(taskId);
      await discardUpload(meta.id);
      patchTask(taskId, { status: "canceled" });
      return false;
    }
    if (st.s === "pause") {
      await sleep(120);
      if (st.s !== "pause" && pausedAccum) {
        startedAt += performance.now() - pausedAccum;
        pausedAccum = 0;
      }
      continue;
    }

    const slice = file.slice(offset, Math.min(offset + CHUNK, file.size));
    const base = loadedBytes;
    const res = await sendChunk(
      meta,
      slice,
      offset,
      file.size,
      (sent) => {
        const nowLoaded = base + sent;
        const elapsed = (performance.now() - startedAt) / 1000;
        const speed = elapsed > 0.3 ? nowLoaded / elapsed : 0;
        patchTask(taskId, {
          loaded: nowLoaded,
          speed,
          eta: speed > 0 ? (file.size - nowLoaded) / speed : 0,
        });
      },
      (xhr) => {
        activeXhr = xhr;
      },
    );

    if (res.aborted) continue; // 取消会在下一轮顶部走 stop 分支

    if (!res.ok) {
      controllers.delete(taskId);
      await discardUpload(meta.id);
      patchTask(taskId, { status: "error", error: res.error ?? "上传失败" });
      return false;
    }

    offset += slice.size;
    loadedBytes += slice.size;
    await sleep(0);
  }

  controllers.delete(taskId);
  patchTask(taskId, { status: "done", loaded: file.size, speed: 0, eta: 0 });
  return true;
}

/* ------------------------------ 对外 API ------------------------------ */

export const store = {
  async addFiles(list: File[]): Promise<{ ok: number; rejected: string[] }> {
    const rejected: string[] = [];
    let ok = 0;
    for (const file of list) {
      if (file.size > MAX_FILE_BYTES) {
        rejected.push(`${file.name}（超出单文件上限）`);
        continue;
      }
      const kind = detectKind(file.name, file.type);
      const id = uid();
      const meta: FileMeta = {
        id,
        name: file.name,
        displayName: file.name,
        ext: file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "",
        mime: file.type || "application/octet-stream",
        size: file.size,
        kind,
        createdAt: Date.now(),
        source: "本机上传",
      };
      const taskId = uid();
      tasks = [{ id: taskId, name: file.name, size: file.size, loaded: 0, status: "uploading", speed: 0, eta: 0, kind, fileMetaId: id }, ...tasks];
      files = [{ ...meta }, ...files];
      emit();
      ok += 1;
      const done = await ingest(taskId, file, meta);
      if (!done) {
        files = files.filter((f) => f.id !== id);
      } else {
        const thumb = await makeThumb(kind, file);
        if (thumb) {
          const updated = await patchMeta(id, { thumb });
          files = files.map((f) => (f.id === id ? { ...f, thumb: updated?.thumb ?? thumb } : f));
        }
        void refreshQuota();
      }
      emit();
    }
    return { ok, rejected };
  },

  pauseTask(id: string) {
    controllers.get(id)?.pause();
  },
  resumeTask(id: string) {
    controllers.get(id)?.resume();
  },
  cancelTask(id: string) {
    controllers.get(id)?.cancel();
    tasks = tasks.filter((t) => t.id !== id);
    emit();
  },
  clearFinishedTasks() {
    tasks = tasks.filter((t) => t.status === "uploading" || t.status === "paused" || t.status === "queued");
    emit();
  },

  async addNote(title: string, body: string): Promise<FileMeta> {
    const id = uid();
    const res = await fetch(`${API}/api/notes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, title: title || "未命名笔记", body, createdAt: Date.now(), source: "本机创建" }),
    });
    if (!res.ok) throw new Error("笔记保存失败");
    const data = (await res.json()) as { meta: FileMeta };
    files = [data.meta, ...files];
    emit();
    return data.meta;
  },

  async updateNote(id: string, patch: { title?: string; body?: string }) {
    try {
      const res = await fetch(`${API}/api/notes/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) return;
      const data = (await res.json()) as { meta?: FileMeta };
      if (data.meta) files = files.map((f) => (f.id === id ? { ...f, ...data.meta } : f));
      emit();
    } catch {
      /* 网络断了就保留本地改动 */
    }
  },

  async remove(id: string) {
    try {
      await fetch(`${API}/api/files/${id}`, { method: "DELETE" });
    } catch {
      /* 忽略 */
    }
    files = files.filter((f) => f.id !== id);
    void refreshQuota();
    emit();
  },

  async clearAll(opts: { alsoCancelTasks?: boolean } = {}) {
    files = [];
    persistFiles();
    emit();
    try {
      await fetch(`${API}/api/files`, { method: "DELETE" });
    } catch {
      /* 忽略 */
    }
    if (opts.alsoCancelTasks) {
      tasks.forEach((t) => controllers.get(t.id)?.cancel());
      controllers.clear();
      tasks = [];
    } else {
      tasks = tasks.filter((t) => t.status === "uploading" || t.status === "paused");
    }
    void refreshQuota();
    emit();
  },

  rename(id: string, name: string) {
    files = files.map((f) => (f.id === id ? { ...f, displayName: name } : f));
    emit();
    void patchMeta(id, { displayName: name });
  },

  setFilter(patch: Partial<typeof filter>) {
    filter = { ...filter, ...patch };
    emit();
  },

  setPrefs(patch: Partial<Prefs>) {
    prefs = { ...prefs, ...patch };
    persistPrefs();
    emit();
  },

  /** 直接把服务端地址给 <img>/<video>/<object>，浏览器会按需 Range 拉取，不占 JavaScript 内存 */
  fileUrl(id: string): string {
    return `${API}/api/files/${id}`;
  },

  downloadUrl(id: string): string {
    return `${API}/api/files/${id}?download=1`;
  },

  async loadBlob(id: string): Promise<Blob | null> {
    try {
      const res = await fetch(`${API}/api/files/${id}`);
      if (!res.ok) return null;
      return await res.blob();
    } catch {
      return null;
    }
  },

  async loadText(id: string): Promise<string | null> {
    try {
      const res = await fetch(`${API}/api/files/${id}`, { cache: "no-store" });
      if (!res.ok) return null;
      return await res.text();
    } catch {
      return null;
    }
  },

  refreshQuota,
};

/* ------------------------------ Hooks ------------------------------ */

function useVersion() {
  return useSyncExternalStore(
    subscribe,
    () => snapshotVersion,
    () => snapshotVersion,
  );
}

export function useFiles() {
  useVersion();
  const visible = files
    .filter((f) => (filter.kind === "all" ? true : f.kind === filter.kind))
    .filter((f) => (filter.q.trim() ? f.displayName.toLowerCase().includes(filter.q.trim().toLowerCase()) : true))
    .sort((a, b) => {
      if (filter.sort === "size-desc") return b.size - a.size;
      if (filter.sort === "name-asc") return a.displayName.localeCompare(b.displayName, "zh-Hans-CN");
      return b.createdAt - a.createdAt;
    });
  return { all: files, visible, filter, totalSize: files.reduce((s, f) => s + f.size, 0) };
}

export function useTasks() {
  useVersion();
  return tasks;
}

export function usePrefs() {
  useVersion();
  return prefs;
}

export function useQuota() {
  useVersion();
  return quota;
}

export function currentWallpaperUrl(p: Prefs): string | null {
  if (p.customWallpaper) return p.customWallpaper;
  return null;
}
