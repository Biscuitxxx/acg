import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Copy, Download, Loader2, Pencil, Trash2, X } from "lucide-react";
import { formatSize, formatTime, type FileMeta } from "@/lib/site";
import { store } from "@/lib/store";
import { toast } from "sonner";
import { KindBadge } from "./KindIcon";
import { downloadFile } from "./FileList";
import { Overlay } from "./Overlay";

type Mode = "image" | "video" | "audio" | "pdf" | "text" | "office" | "fallback";

function modeOf(f: FileMeta): Mode {
  if (f.kind === "note") return "text";
  if (f.kind === "image") return f.ext === "svg" ? "fallback" : "image";
  if (f.kind === "video") return "video";
  if (f.kind === "audio") return "audio";
  if (f.ext === "pdf") return "pdf";
  if (["txt", "md", "csv", "json", "log"].includes(f.ext)) return "text";
  if (["doc", "docx", "xls", "xlsx", "ppt", "pptx", "rtf", "epub"].includes(f.ext)) return "office";
  return "fallback";
}

export function PreviewSheet({
  file,
  onClose,
  onRename,
}: {
  file: FileMeta | null;
  onClose: () => void;
  onRename: (f: FileMeta) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [zoom, setZoom] = useState(1);

  const mode = useMemo(() => (file ? modeOf(file) : "fallback"), [file]);

  useEffect(() => {
    setUrl(null);
    setText(null);
    setFailed(false);
    setZoom(1);
    if (!file) return;
    let dead = false;
    (async () => {
      setLoading(true);
      if (mode === "text") {
        const body = await store.loadText(file.id);
        if (dead) return;
        if (body === null) {
          setFailed(true);
          setLoading(false);
          return;
        }
        setText(body);
      } else {
        // 直接把服务端地址交给浏览器：视频 / PDF 由浏览器自己按 Range 拉取，不必先整份读进内存
        setUrl(store.fileUrl(file.id));
      }
      setLoading(false);
    })();
    return () => {
      dead = true;
    };
  }, [file, mode]);

  useEffect(() => {
    if (!file) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", esc);
      document.body.style.overflow = "";
    };
  }, [file, onClose]);

  if (!file) return null;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${location.origin}${location.pathname}#/file/${file!.id}`);
      toast.success("链接已复制（同一中转站的人都能打开）");
    } catch {
      toast.error("复制失败，请手动记录文件名");
    }
  }

  return (
    <Overlay>
      <div className="fixed inset-0 z-[100] flex flex-col" role="dialog" aria-modal="true">
      <button type="button" aria-label="关闭预览" onClick={onClose} className="absolute inset-0 bg-[var(--scrim)] backdrop-blur-md" />

      <div className="pop-in relative mx-auto flex h-full w-full max-w-4xl flex-col px-0 sm:h-auto sm:max-h-[92vh] sm:px-4 sm:py-6">
        {/* 头部 */}
        <div className="glass-panel flex items-center gap-2.5 rounded-b-none px-3 py-2.5 sm:rounded-t-card sm:px-4">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13.5px] font-semibold">{file.displayName}</p>
            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
              <KindBadge kind={file.kind} />
              <span className="font-mono">{formatSize(file.size)}</span>
              <span>{formatTime(file.createdAt)}</span>
            </div>
          </div>
          <HeadBtn label="重命名" onClick={() => onRename(file)}>
            <Pencil className="size-4" />
          </HeadBtn>
          <HeadBtn label="复制链接" onClick={() => void copyLink()}>
            <Copy className="size-4" />
          </HeadBtn>
          <HeadBtn label="下载" tone="primary" onClick={() => void downloadFile(file)}>
            <Download className="size-4" />
          </HeadBtn>
          <HeadBtn
            label="删除"
            tone="danger"
            onClick={() => {
              void store.remove(file.id);
              toast.success("已删除");
              onClose();
            }}
          >
            <Trash2 className="size-4" />
          </HeadBtn>
          <HeadBtn label="关闭" onClick={onClose}>
            <X className="size-4" />
          </HeadBtn>
        </div>

        {/* 内容 */}
        <div className="glass-panel relative min-h-0 flex-1 overflow-auto rounded-t-none bg-glass-strong sm:rounded-b-card">
          {loading && (
            <div className="flex h-64 flex-col items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="size-6 animate-spin" />
              <p className="text-[12px]">正在读取文件…</p>
            </div>
          )}

          {!loading && failed && (
            <FallbackNotice title="文件不存在或已被清理" desc="它可能已在其他标签页被删除。" />
          )}

          {!loading && !failed && url && mode === "image" && (
            <div className="flex min-h-[60vh] items-center justify-center overflow-auto p-3" onClick={(e) => e.detail === 2 && setZoom((z) => (z > 1 ? 1 : 2))}>
              <img
                src={url}
                alt={file.displayName}
                style={{ transform: `scale(${zoom})` }}
                className="max-h-[70vh] max-w-full rounded-xl object-contain shadow-2xl transition-transform duration-300"
              />
            </div>
          )}

          {!loading && !failed && url && mode === "video" && (
            <div className="flex items-center justify-center bg-black/85 p-0 sm:p-3">
              <video src={url} controls autoPlay playsInline className="max-h-[70vh] w-full rounded-none sm:rounded-xl" />
            </div>
          )}

          {!loading && !failed && url && mode === "audio" && (
            <div className="flex min-h-[40vh] flex-col items-center justify-center gap-5 p-6">
              <span className="sticker float-drift grid size-24 place-items-center rounded-full bg-gradient-to-br from-accent-teal/30 to-primary/25 text-4xl">🎧</span>
              <audio src={url} controls className="w-full max-w-md" />
            </div>
          )}

          {!loading && !failed && url && mode === "pdf" && (
            <object data={url} type="application/pdf" className="h-[70vh] w-full">
              <div className="p-6">
                <FallbackNotice title="此浏览器无法内嵌 PDF" desc="请下载后使用本地阅读器打开。" />
              </div>
            </object>
          )}

          {!loading && !failed && mode === "text" && (
            <pre className="whitespace-pre-wrap break-words p-4 font-sans text-[13.5px] leading-7 sm:p-6">{text ?? ""}</pre>
          )}

          {!loading && !failed && mode === "office" && (
            <div className="p-6">
              <FallbackNotice
                title={`暂不支持在线渲染 .${file.ext}`}
                desc="Office 类文档请下载后用本地应用打开；笔记与纯文本可直接在线阅读。"
              />
            </div>
          )}

          {!loading && !failed && mode === "fallback" && (
            <div className="p-6">
              <FallbackNotice title="该格式没有可用的在线预览" desc="可以下载到本地，用对应的应用打开。" />
            </div>
          )}
        </div>
      </div>
      </div>
    </Overlay>
  );
}

function HeadBtn({
  children,
  label,
  onClick,
  tone,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  tone?: "primary" | "danger";
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={
        tone === "primary"
          ? "grid size-8 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary transition hover:bg-primary/20 active:scale-90"
          : tone === "danger"
            ? "grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition hover:bg-destructive/12 hover:text-destructive active:scale-90"
            : "grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition hover:bg-muted active:scale-90"
      }
    >
      {children}
    </button>
  );
}

function FallbackNotice({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="flex min-h-52 flex-col items-center justify-center gap-2 text-center">
      <span className="grid size-12 place-items-center rounded-2xl bg-warning/15 text-warning">
        <AlertTriangle className="size-6" />
      </span>
      <p className="mt-1 font-display text-[15px] font-semibold">{title}</p>
      <p className="max-w-sm text-[12px] leading-5 text-muted-foreground">{desc}</p>
    </div>
  );
}
