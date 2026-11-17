#!/usr/bin/env node
/**
 * ACG 中转站 · 本地服务端（零依赖，只用 node 内置模块）
 *
 * 为什么要有它：纯前端版本把文件存在浏览器 IndexedDB 里，
 * 手机连过来看到的是手机自己的空库，跨设备永远看不到同一份数据。
 * 有了这个进程，数据落在"跑它的那台机器"的磁盘上，谁访问都能看到同一份。
 *
 * 启动：node server/index.mjs            （默认 8787）
 *      PORT=9000 node server/index.mjs
 *      ACG_DATA=/sdcard/acg node server/index.mjs
 *
 * 数据目录结构（默认 ./data）：
 *   data/index.json      元信息数组
 *   data/files/<id>      文件本体（没有扩展名，靠 index.json 的 ext 还原）
 *   data/files/<id>.part 上传中的分片临时文件
 *
 * 设计取舍：
 * - 分片上传（8MB 一片）而不是整个文件一次 PUT：这样暂停/继续/取消能真的生效，
 *   单次请求内存在压力也小，2GB 文件也不会把浏览器和 node 撑爆。
 * - id 只允许 [A-Za-z0-9-]，从根上避开路径穿越。
 * - 没有登录鉴权：它是给内网个人用的。要暴露到公网请自己加一层反代 + 口令。
 */
import { createServer } from "node:http";
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  truncateSync,
  writeFileSync,
  statfsSync,
} from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { networkInterfaces } from "node:os";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DATA_DIR = resolve(process.env.ACG_DATA || join(ROOT, "data"));
const FILES_DIR = join(DATA_DIR, "files");
const INDEX_PATH = join(DATA_DIR, "index.json");
const DIST_DIR = join(ROOT, "dist");
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "0.0.0.0";

/** 单文件上限：给后端也留一道，和前端 site.ts 的 MAX_FILE_BYTES 对齐即可 */
const MAX_BYTES = Number(process.env.ACG_MAX_BYTES || 2048 * 1024 * 1024);
const ID_RE = /^[A-Za-z0-9-]{6,64}$/;

mkdirSync(FILES_DIR, { recursive: true });

/* ------------------------------ 索引 ------------------------------ */

function loadIndex() {
  try {
    const arr = JSON.parse(readFileSync(INDEX_PATH, "utf8"));
    if (!Array.isArray(arr)) return [];
    return arr.filter((x) => x && typeof x.id === "string" && ID_RE.test(x.id));
  } catch {
    return [];
  }
}

let index = loadIndex();

function saveIndex() {
  writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2), "utf8");
}

/* ------------------------------ 工具 ------------------------------ */

function sendJson(res, code, data) {
  const body = JSON.stringify(data);
  res.writeHead(code, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
  });
  res.end(body);
}

function readJsonBody(req, limit = 1 << 20) {
  return new Promise((resolveBody, rejectBody) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) {
        rejectBody(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      try {
        resolveBody(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {});
      } catch (err) {
        rejectBody(err);
      }
    });
    req.on("error", rejectBody);
  });
}

function diskQuota() {
  try {
    if (typeof statfsSync !== "function") return null;
    const s = statfsSync(DATA_DIR);
    const blockSize = Number(s.bsize) || 0;
    const total = Number(s.blocks) || 0;
    const avail = Number(s.bavail) || 0;
    if (!blockSize || !total) return null;
    return { usage: (total - avail) * blockSize, quota: total * blockSize };
  } catch {
    return null;
  }
}

function filePathOf(id) {
  return join(FILES_DIR, id);
}

/* ------------------------------ 上传 ------------------------------ */

/**
 * POST /api/files/:id/chunk?offset=N
 * body: 该分片的原始字节
 * headers: x-file-name / x-file-mime / x-file-kind / x-file-ext /
 *          x-file-total / x-file-created / x-file-source
 *
 * 幂等：若磁盘上已写的字节多于 offset（上一片只写了半截），先截断回 offset 再追加。
 */
function handleChunk(req, res, id, url) {
  const offset = Number(url.searchParams.get("offset") ?? -1);
  const total = Number(req.headers["x-file-total"] ?? 0);

  if (!ID_RE.test(id)) return sendJson(res, 400, { error: "非法文件 id" });
  if (!Number.isFinite(offset) || offset < 0) return sendJson(res, 400, { error: "offset 不合法" });
  if (!Number.isFinite(total) || total <= 0) return sendJson(res, 400, { error: "缺少 x-file-total" });
  if (total > MAX_BYTES) return sendJson(res, 413, { error: `超过单文件上限 ${MAX_BYTES} 字节` });

  const partPath = `${filePathOf(id)}.part`;

  if (existsSync(partPath)) {
    const current = statSync(partPath).size;
    if (current > offset) {
      try {
        truncateSync(partPath, offset);
      } catch {
        return sendJson(res, 500, { error: "无法回退未完成的分片" });
      }
    } else if (current < offset) {
      return sendJson(res, 409, { error: "分片不连续，请重新开始上传", received: current });
    }
  }

  const ws = createWriteStream(partPath, { flags: "a" });

  const fail = (code, message) => {
    if (res.writableEnded) return;
    sendJson(res, code, { error: message });
  };

  req.on("aborted", () => {
    ws.destroy();
  });

  ws.on("error", () => fail(500, "写入磁盘失败（可能空间不足）"));

  ws.on("finish", () => {
    if (res.writableEnded) return;

    let size = 0;
    try {
      size = statSync(partPath).size;
    } catch {
      return fail(500, "读取暂存文件失败");
    }

    if (size > total) {
      try {
        truncateSync(partPath, total);
        size = total;
      } catch {
        return fail(500, "写入超出预期长度");
      }
    }

    // 还没传完：告诉前端当前进度即可
    if (size < total) return sendJson(res, 200, { done: false, received: size });

    // 传完了：落成正式文件 + 写索引
    try {
      renameSync(partPath, filePathOf(id));
    } catch {
      return fail(500, "落盘失败");
    }

    const name = decodeURIComponent(String(req.headers["x-file-name"] || "未命名文件"));
    const source = decodeURIComponent(String(req.headers["x-file-source"] || "未知来源"));
    const extRaw = String(req.headers["x-file-ext"] || "");
    const meta = {
      id,
      name,
      displayName: name,
      ext: /^[a-z0-9]{1,12}$/i.test(extRaw) ? extRaw.toLowerCase() : "",
      mime: String(req.headers["x-file-mime"] || "application/octet-stream"),
      size,
      kind: String(req.headers["x-file-kind"] || "other"),
      createdAt: Number(req.headers["x-file-created"]) || Date.now(),
      source,
      // 缩略图（前端抽帧后随最后一片一起带上）
      thumb: typeof req.headers["x-file-thumb"] === "string" && req.headers["x-file-thumb"].length > 12
        ? req.headers["x-file-thumb"]
        : undefined,
    };

    index = [meta, ...index.filter((m) => m.id !== id)];
    saveIndex();
    console.log(`[upload] ${meta.name} ${size} bytes -> ${id}`);
    sendJson(res, 200, { done: true, meta });
  });

  req.pipe(ws);
}

/** 取消上传时清掉暂存分片 */
function handleDiscard(_req, res, id) {
  if (!ID_RE.test(id)) return sendJson(res, 400, { error: "非法文件 id" });
  try {
    rmSync(`${filePathOf(id)}.part`, { force: true });
  } catch {
    /* 忽略 */
  }
  sendJson(res, 200, { ok: true });
}

/* ------------------------------ 读取 ------------------------------ */

/** GET /api/files/:id —— 支持 Range，视频/PDF 可以边下边播、拖进度条 */
function handleRead(req, res, id, url) {
  const meta = index.find((m) => m.id === id);
  if (!meta) return sendJson(res, 404, { error: "文件不存在" });

  const download = url.searchParams.get("download") === "1";
  const filenameHeader = () => {
    const safe = meta.displayName.replace(/["\\\r\n]/g, "_");
    return `attachment; filename="${encodeURIComponent(safe)}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
  };

  // 笔记：正文就在索引里，不用碰磁盘
  if (meta.kind === "note") {
    const body = meta.noteBody ?? "";
    const buf = Buffer.from(body, "utf8");
    res.writeHead(200, {
      "content-type": "text/plain; charset=utf-8",
      "content-length": buf.length,
      "cache-control": "no-store",
      ...(download ? { "content-disposition": filenameHeader() } : {}),
    });
    return res.end(buf);
  }

  const path = filePathOf(id);
  if (!existsSync(path)) return sendJson(res, 404, { error: "文件本体缺失" });

  const size = statSync(path).size;
  const type = meta.mime || "application/octet-stream";
  const range = req.headers.range;

  if (range) {
    const match = /bytes=(\d*)-(\d*)/.exec(range);
    if (match) {
      let start = match[1] === "" ? size - Number(match[2]) : Number(match[1]);
      let end = match[1] === "" || match[2] === "" ? size - 1 : Number(match[2]);
      if (!Number.isFinite(start) || start < 0) start = 0;
      if (!Number.isFinite(end) || end >= size) end = size - 1;
      if (start > end) {
        res.writeHead(416, { "content-range": `bytes */${size}` });
        return res.end();
      }
      res.writeHead(206, {
        "content-type": type,
        "content-length": end - start + 1,
        "content-range": `bytes ${start}-${end}/${size}`,
        "accept-ranges": "bytes",
        "cache-control": "public, max-age=3600",
        ...(download ? { "content-disposition": filenameHeader() } : {}),
      });
      return createReadStream(path, { start, end }).pipe(res);
    }
  }

  res.writeHead(200, {
    "content-type": type,
    "content-length": size,
    "accept-ranges": "bytes",
    "cache-control": "public, max-age=3600",
    ...(download ? { "content-disposition": filenameHeader() } : {}),
  });
  createReadStream(path).pipe(res);
}

/* ------------------------------ 笔记 / 重命名 / 删除 ------------------------------ */

async function handleCreateNote(req, res) {
  let body;
  try {
    body = await readJsonBody(req, 4 << 20);
  } catch {
    return sendJson(res, 400, { error: "笔记内容过大或格式错误" });
  }
  const title = String(body.title ?? "").slice(0, 200) || "未命名笔记";
  const text = String(body.body ?? "");
  const id = String(body.id ?? "");
  if (!ID_RE.test(id)) return sendJson(res, 400, { error: "非法笔记 id" });

  const meta = {
    id,
    name: title,
    displayName: title,
    ext: "md",
    mime: "text/markdown",
    size: Buffer.byteLength(text, "utf8"),
    kind: "note",
    createdAt: Number(body.createdAt) || Date.now(),
    source: String(body.source ?? "未知来源").slice(0, 60),
    noteBody: text,
  };
  index = [meta, ...index.filter((m) => m.id !== id)];
  saveIndex();
  sendJson(res, 200, { meta });
}

async function handleUpdateNote(req, res, id) {
  const target = index.find((m) => m.id === id);
  if (!target) return sendJson(res, 404, { error: "笔记不存在" });

  let body;
  try {
    body = await readJsonBody(req, 4 << 20);
  } catch {
    return sendJson(res, 400, { error: "内容过大或格式错误" });
  }

  if (typeof body.title === "string" && body.title.trim()) {
    const title = body.title.slice(0, 200);
    target.name = title;
    target.displayName = title;
  }
  if (typeof body.body === "string") {
    target.noteBody = body.body;
    target.size = Buffer.byteLength(body.body, "utf8");
  }
  saveIndex();
  sendJson(res, 200, { meta: target });
}

async function handleRename(req, res, id) {
  const target = index.find((m) => m.id === id);
  if (!target) return sendJson(res, 404, { error: "文件不存在" });
  let body;
  try {
    // 缩略图是 dataURL，几十 KB，上限给到 512KB
    body = await readJsonBody(req, 512 << 10);
  } catch {
    return sendJson(res, 400, { error: "请求格式错误" });
  }
  if (typeof body.thumb === "string" && body.thumb.startsWith("data:image/")) {
    target.thumb = body.thumb.slice(0, 400_000);
  }
  const name = String(body.displayName ?? "").slice(0, 240).trim();
  if (name) target.displayName = name;
  saveIndex();
  sendJson(res, 200, { meta: target });
}

function handleDelete(res, id) {
  if (!ID_RE.test(id)) return sendJson(res, 400, { error: "非法文件 id" });
  try {
    rmSync(filePathOf(id), { force: true });
    rmSync(`${filePathOf(id)}.part`, { force: true });
  } catch {
    /* 忽略 */
  }
  index = index.filter((m) => m.id !== id);
  saveIndex();
  sendJson(res, 200, { ok: true });
}

function handleClearAll(res) {
  for (const m of index) {
    if (m.kind === "note") continue;
    try {
      rmSync(filePathOf(m.id), { force: true });
      rmSync(`${filePathOf(m.id)}.part`, { force: true });
    } catch {
      /* 忽略 */
    }
  }
  index = [];
  saveIndex();
  sendJson(res, 200, { ok: true });
}

/* ------------------------------ 静态托管 ------------------------------ */

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json; charset=utf-8",
};

function serveStatic(req, res, pathname) {
  if (!existsSync(DIST_DIR)) {
    res.writeHead(503, { "content-type": "text/html; charset=utf-8" });
    return res.end(
      "<h1>还没有构建前端</h1><p>先在项目目录执行 <code>pnpm build</code>，再重启本服务。</p>",
    );
  }

  const decoded = decodeURIComponent(pathname);
  const relative = normalize(decoded).replace(/^([/\\])+/, "");
  const target = resolve(DIST_DIR, relative);

  // 防目录穿越：最终路径必须仍在 dist 内
  if (!target.startsWith(DIST_DIR + sep) && target !== DIST_DIR) {
    res.writeHead(403);
    return res.end("forbidden");
  }

  const hit = target !== DIST_DIR && existsSync(target) && statSync(target).isFile() ? target : null;

  if (hit) {
    const type = MIME[extname(hit).toLowerCase()] || "application/octet-stream";
    const immutable = hit.includes(`${sep}assets${sep}`);
    res.writeHead(200, {
      "content-type": type,
      "cache-control": immutable ? "public, max-age=31536000, immutable" : "no-cache",
    });
    return createReadStream(hit).pipe(res);
  }

  // SPA fallback
  const indexPath = join(DIST_DIR, "index.html");
  if (!existsSync(indexPath)) {
    res.writeHead(404);
    return res.end("not found");
  }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" });
  createReadStream(indexPath).pipe(res);
}

/* ------------------------------ 路由 ------------------------------ */

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const pathname = url.pathname;
  const method = req.method ?? "GET";

  try {
    /* ---- API ---- */
    if (pathname === "/api/state" && method === "GET") {
      return sendJson(res, 200, { files: index, quota: diskQuota(), maxBytes: MAX_BYTES });
    }

    if (pathname === "/api/files" && method === "DELETE") {
      return handleClearAll(res);
    }

    const chunkMatch = /^\/api\/files\/([^/]+)\/chunk$/.exec(pathname);
    if (chunkMatch && method === "POST") {
      return handleChunk(req, res, chunkMatch[1], url);
    }

    const discardMatch = /^\/api\/files\/([^/]+)\/discard$/.exec(pathname);
    if (discardMatch && method === "POST") {
      return handleDiscard(req, res, discardMatch[1]);
    }

    const metaMatch = /^\/api\/files\/([^/]+)\/meta$/.exec(pathname);
    if (metaMatch && (method === "PATCH" || method === "POST")) {
      return handleRename(req, res, metaMatch[1]);
    }

    const noteMatch = /^\/api\/notes\/([^/]+)$/.exec(pathname);
    if (noteMatch && (method === "PATCH" || method === "POST")) {
      return handleUpdateNote(req, res, noteMatch[1]);
    }
    if (pathname === "/api/notes" && method === "POST") {
      return handleCreateNote(req, res);
    }

    const fileMatch = /^\/api\/files\/([^/]+)$/.exec(pathname);
    if (fileMatch) {
      if (method === "GET" || method === "HEAD") return handleRead(req, res, fileMatch[1], url);
      if (method === "DELETE") return handleDelete(res, fileMatch[1]);
    }

    if (pathname.startsWith("/api/")) {
      return sendJson(res, 404, { error: "接口不存在" });
    }

    /* ---- 静态 ---- */
    return serveStatic(req, res, pathname);
  } catch (err) {
    console.error("[server] 未捕获异常", err);
    if (!res.writableEnded) sendJson(res, 500, { error: "服务端异常" });
  }
});

/** 列出本机可用的 IPv4 地址；WiFi / 有线网卡排在前面，移动数据和虚拟网卡靠后 */
function lanAddresses() {
  const all = [];
  for (const [name, list] of Object.entries(networkInterfaces())) {
    for (const a of list || []) {
      if ((a.family === "IPv4" || a.family === 4) && !a.internal) {
        all.push({ name, ip: a.address, preferred: /wlan|wl|wi-fi|wifi|以太网|eth|en/i.test(name) });
      }
    }
  }
  return all.sort((x, y) => Number(y.preferred) - Number(x.preferred));
}

server.listen(PORT, HOST, () => {
  const quota = diskQuota();
  const lan = lanAddresses();
  console.log(`[server] ACG 中转站已启动`);
  console.log(`[server]   本机       http://localhost:${PORT}`);
  if (lan.length) {
    for (const a of lan) console.log(`[server]   局域网     http://${a.ip}:${PORT}   (${a.name})`);
  } else {
    console.log(`[server]   局域网     没检测到可用网卡，在终端里执行 ip a 自己看`);
  }
  console.log(`[server] 数据目录 ${DATA_DIR}`);
  console.log(`[server] 前端目录 ${existsSync(DIST_DIR) ? DIST_DIR : `${DIST_DIR}（尚未构建，先跑 pnpm build）`}`);
  if (quota) console.log(`[server] 磁盘 ${(quota.usage / 2 ** 30).toFixed(1)}G 已用 / 共 ${(quota.quota / 2 ** 30).toFixed(1)}G`);
});
