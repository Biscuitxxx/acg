import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Eye, LayoutGrid, List, Pencil, Search, SortDesc, Trash2, X } from "lucide-react";
import { CATEGORIES, SORT_OPTIONS, formatSize, formatTime, type FileMeta, type SortKey } from "@/lib/site";
import { store, useFiles, usePrefs } from "@/lib/store";
import { Overlay } from "./Overlay";
import { KindBadge, KindIcon } from "./KindIcon";
import { cn } from "@/lib/utils";

interface MenuState {
  file: FileMeta;
  x: number;
  y: number;
}

export function FileList({ onPreview, onRename }: { onPreview: (f: FileMeta) => void; onRename: (f: FileMeta) => void }) {
  const { all, visible, filter } = useFiles();
  const [menu, setMenu] = useState<MenuState | null>(null);
  const holdRef = useRef<number | null>(null);
  const movedRef = useRef(false);

  /* ---------- 长按手势：仅用 pointer 序列，普通点击仍走 onClick ---------- */
  const startHold = useCallback((e: React.PointerEvent, file: FileMeta) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    movedRef.current = false;
    const sx = e.clientX;
    const sy = e.clientY;
    const cancel = () => {
      if (holdRef.current) window.clearTimeout(holdRef.current);
      holdRef.current = null;
    };
    const move = (ev: PointerEvent) => {
      if (Math.abs(ev.clientX - sx) > 10 || Math.abs(ev.clientY - sy) > 10) {
        movedRef.current = true;
        cancel();
      }
    };
    const up = () => {
      cancel();
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      document.removeEventListener("pointercancel", up);
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
    document.addEventListener("pointercancel", up);
    holdRef.current = window.setTimeout(() => {
      holdRef.current = null;
      if (!movedRef.current) {
        if (navigator.vibrate) navigator.vibrate(12);
        setMenu({ file, x: sx, y: sy });
      }
    }, 480);
  }, []);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [menu]);

  const { view } = usePrefs();
  const grid = view === "grid";

  return (
    <section className="reveal-up glass-panel rounded-card p-3 sm:p-4" data-reveal-delay="140">
      {/* 工具条：搜索行与分类行之间留垂直间距，避免窄宽度下贴压 */}
      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-full sm:basis-56">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={filter.q}
            onChange={(e) => store.setFilter({ q: e.target.value })}
            placeholder="按文件名搜索"
            className="w-full rounded-chip border border-input bg-glass-strong py-2 pl-9 pr-8 text-[13px] outline-none transition focus:border-primary focus:ring-2 focus:ring-ring/30"
          />
          {filter.q && (
            <button
              type="button"
              aria-label="清空搜索"
              onClick={() => store.setFilter({ q: "" })}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
        <label className="glass-chip flex items-center gap-1.5 rounded-chip px-2.5 py-1.5 text-[12px]">
          <SortDesc className="size-3.5 text-muted-foreground" />
          <select
            value={filter.sort}
            onChange={(e) => store.setFilter({ sort: e.target.value as SortKey })}
            className="bg-transparent text-[12px] font-medium outline-none [&>option]:text-foreground"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <ViewToggle />
      </div>

      {/* 分类标签 */}
      <div className="-mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {CATEGORIES.map((c) => {
          const count = c.id === "all" ? all.length : all.filter((f) => f.kind === c.id).length;
          const on = filter.kind === c.id;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => store.setFilter({ kind: c.id })}
              className={cn(
                "shrink-0 rounded-chip px-3 py-1.5 text-[12px] font-medium transition-all duration-200 active:scale-95",
                on
                  ? "bg-gradient-to-r from-primary to-accent-violet text-primary-foreground shadow-md shadow-primary/25"
                  : "glass-chip text-muted-foreground hover:text-foreground",
              )}
            >
              {c.label}
              <span className="ml-1 font-mono text-[10px] opacity-75">{count}</span>
            </button>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <EmptyState hasAny={all.length > 0} />
      ) : grid ? (
        <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
          {visible.map((f) => (
            <li key={f.id}>
              <GridCard
                file={f}
                onPointerDown={(e) => startHold(e, f)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setMenu({ file: f, x: e.clientX, y: e.clientY });
                }}
                onOpen={() => onPreview(f)}
              />
            </li>
          ))}
        </ul>
      ) : (
        <ul className="space-y-1.5">
          {visible.map((f) => (
            <li key={f.id}>
              <ListRow
                file={f}
                onPointerDown={(e) => startHold(e, f)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setMenu({ file: f, x: e.clientX, y: e.clientY });
                }}
                onOpen={() => onPreview(f)}
              />
            </li>
          ))}
        </ul>
      )}

      {menu && (
        <LongPressMenu
          state={menu}
          onClose={() => setMenu(null)}
          onAction={(a) => {
            const file = menu.file;
            setMenu(null);
            if (a === "preview") onPreview(file);
            if (a === "download") void downloadFile(file);
            if (a === "rename") onRename(file);
            if (a === "delete") void store.remove(file.id);
          }}
        />
      )}
    </section>
  );
}

/* ---------------- 行 / 卡片 ---------------- */

function Thumb({ file, className }: { file: FileMeta; className?: string }) {
  if (file.thumb) return <img src={file.thumb} alt="" loading="lazy" className={cn("size-full object-cover", className)} />;
  return (
    <span className={cn("grid h-full w-full place-items-center bg-secondary", className)}>
      <KindIcon kind={file.kind} className="size-8 rounded-lg" />
    </span>
  );
}

function ListRow({
  file,
  onPointerDown,
  onContextMenu,
  onOpen,
}: {
  file: FileMeta;
  onPointerDown: (e: React.PointerEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onOpen: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onPointerDown={onPointerDown}
      onContextMenu={onContextMenu}
      onClick={onOpen}
      onKeyDown={(e) => e.key === "Enter" && onOpen()}
      className="no-select group flex cursor-pointer touch-manipulation items-center gap-3 rounded-xl border border-transparent px-2 py-2 transition-colors duration-200 hover:border-[var(--surface-line)] hover:bg-glass active:bg-muted/50"
    >
      <span className="size-12 shrink-0 overflow-hidden rounded-xl ring-1 ring-[var(--surface-line)]">
        <Thumb file={file} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] font-medium leading-5">{file.displayName}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
          <KindBadge kind={file.kind} />
          <span className="font-mono">{formatSize(file.size)}</span>
          <span>{formatTime(file.createdAt)}</span>
          <span className="hidden sm:inline">{file.source}</span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100 max-sm:opacity-100">
        <button
          type="button"
          aria-label="下载"
          onClick={(e) => {
            e.stopPropagation();
            void downloadFile(file);
          }}
          className="grid size-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-primary/12 hover:text-primary active:scale-90"
        >
          <Download className="size-4" />
        </button>
        <button
          type="button"
          aria-label="删除"
          onClick={(e) => {
            e.stopPropagation();
            void store.remove(file.id);
          }}
          className="grid size-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-destructive/12 hover:text-destructive active:scale-90"
        >
          <Trash2 className="size-4" />
        </button>
      </div>
    </div>
  );
}

function GridCard(props: { file: FileMeta } & Omit<Parameters<typeof ListRow>[0], "children">) {
  const { file, ...rest } = props;
  return (
    <div
      role="button"
      tabIndex={0}
      onPointerDown={rest.onPointerDown}
      onContextMenu={rest.onContextMenu}
      onClick={rest.onOpen}
      className="no-select group relative cursor-pointer touch-manipulation overflow-hidden rounded-xl ring-1 ring-[var(--surface-line)] transition-transform duration-200 hover:-translate-y-0.5 active:scale-[0.98]"
    >
      <div className="aspect-square w-full bg-secondary">
        <Thumb file={file} />
      </div>
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/35 to-transparent px-2 pb-1.5 pt-6">
        <p className="truncate text-[12px] font-medium leading-4 text-white">{file.displayName}</p>
        <p className="mt-0.5 font-mono text-[10px] text-white/70">
          {formatSize(file.size)} · {formatTime(file.createdAt)}
        </p>
      </div>
    </div>
  );
}

/* ---------------- 长按操作菜单 ---------------- */

function LongPressMenu({
  state,
  onClose,
  onAction,
}: {
  state: MenuState;
  onClose: () => void;
  onAction: (a: "preview" | "download" | "rename" | "delete") => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: state.x, top: state.y });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({
      left: Math.min(Math.max(8, state.x), window.innerWidth - r.width - 8),
      top: Math.min(Math.max(8, state.y), window.innerHeight - r.height - 8),
    });
  }, [state]);

  const items: { id: "preview" | "download" | "rename" | "delete"; label: string; Icon: typeof Eye; danger?: boolean }[] = [
    { id: "preview", label: "预览", Icon: Eye },
    { id: "download", label: "下载", Icon: Download },
    { id: "rename", label: "重命名", Icon: Pencil },
    { id: "delete", label: "删除（不可恢复）", Icon: Trash2, danger: true },
  ];

  return (
    <Overlay>
      <div className="fixed inset-0 z-[100]" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }}>
      <div
        ref={ref}
        style={{ left: pos.left, top: pos.top }}
        onClick={(e) => e.stopPropagation()}
        className="pop-in glass-panel absolute w-48 overflow-hidden rounded-2xl p-1.5"
      >
        <p className="truncate px-2.5 py-1.5 text-[11px] text-muted-foreground">{state.file.displayName}</p>
        {items.map(({ id, label, Icon, danger }) => (
          <button
            key={id}
            type="button"
            onClick={() => onAction(id)}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] font-medium transition active:scale-[0.98]",
              danger ? "text-destructive hover:bg-destructive/10" : "hover:bg-muted/60",
            )}
          >
            <Icon className="size-4" /> {label}
          </button>
        ))}
      </div>
    </div>
    </Overlay>
  );
}

/* ---------------- 空态 / 视图切换 / 下载 ---------------- */

function EmptyState({ hasAny }: { hasAny: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      <span className="sticker float-drift grid size-16 place-items-center rounded-3xl bg-gradient-to-br from-primary-soft to-accent-teal/20 text-2xl">
        {hasAny ? "🔍" : "🗂️"}
      </span>
      <p className="mt-1 font-display text-[15px] font-semibold">{hasAny ? "这里空空如也" : "文件列表还是空的"}</p>
      <p className="max-w-xs text-[12px] leading-5 text-muted-foreground">
        {hasAny ? "换个关键词或分类看看，也可以清除筛选条件。" : "把手机里的照片、视频、文档拖到上方区域，就能传到这里。"}
      </p>
      {hasAny && (
        <button
          type="button"
          onClick={() => store.setFilter({ kind: "all", q: "" })}
          className="glass-chip mt-1 rounded-chip px-3.5 py-1.5 text-[12px] font-medium transition active:scale-95"
        >
          清除筛选条件
        </button>
      )}
    </div>
  );
}

function ViewToggle() {
  const { view } = usePrefs();
  return (
    <div className="glass-chip flex items-center rounded-chip p-0.5">
      <button
        type="button"
        aria-label="列表视图"
        onClick={() => store.setPrefs({ view: "list" })}
        className={cn("grid size-7 place-items-center rounded-full transition", view === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
      >
        <List className="size-3.5" />
      </button>
      <button
        type="button"
        aria-label="网格视图"
        onClick={() => store.setPrefs({ view: "grid" })}
        className={cn("grid size-7 place-items-center rounded-full transition", view === "grid" ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
      >
        <LayoutGrid className="size-3.5" />
      </button>
    </div>
  );
}

export async function downloadFile(file: FileMeta) {
  // 直接交给浏览器从服务端拉，文件不进 JS 内存，GB 级也不会卡
  const url = store.downloadUrl(file.id);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.kind === "note" ? `${file.displayName}.md` : file.displayName;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
