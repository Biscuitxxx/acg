import { useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, Pause, Play, Trash2, X } from "lucide-react";
import { formatEta, formatSize, formatSpeed } from "@/lib/site";
import { store, useTasks } from "@/lib/store";
import { KindIcon } from "./KindIcon";
import { cn } from "@/lib/utils";

export function TransferQueue() {
  const tasks = useTasks();
  const [open, setOpen] = useState(true);

  const active = useMemo(() => tasks.filter((t) => t.status === "uploading" || t.status === "paused" || t.status === "queued"), [tasks]);
  const finished = useMemo(() => tasks.filter((t) => t.status === "done" || t.status === "error"), [tasks]);
  if (!tasks.length) return null;

  const totalLoaded = tasks.reduce((s, t) => s + t.loaded, 0);
  const totalSize = tasks.reduce((s, t) => s + t.size, 0) || 1;
  const overall = Math.min(100, (totalLoaded / totalSize) * 100);

  return (
    <section className="reveal-up glass-panel overflow-hidden rounded-card" data-reveal-delay="80">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 px-4 py-3 text-left transition hover:bg-muted/40"
      >
        <span className="relative grid size-8 place-items-center rounded-xl bg-accent-teal/15 text-accent-teal">
          {active.length ? (
            <svg viewBox="0 0 24 24" className="size-8 -rotate-90">
              <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2.5" />
              <circle
                cx="12"
                cy="12"
                r="9"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeDasharray={56.5}
                strokeDashoffset={56.5 * (1 - overall / 100)}
                className="transition-[stroke-dashoffset] duration-300"
              />
            </svg>
          ) : (
            <CheckCircle2 className="size-4.5" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold">
            {active.length ? `传输中 ${active.length} 项 · ${overall.toFixed(0)}%` : `本轮 ${finished.length} 项已完成`}
          </p>
          <p className="truncate text-[11px] text-muted-foreground">
            {formatSize(totalLoaded)} / {formatSize(totalSize)}
            {active.length > 0 && ` · ${formatSpeed(tasks.reduce((s, t) => s + (t.speed || 0), 0))}`}
          </p>
        </div>
        {finished.length > 0 && active.length === 0 && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              store.clearFinishedTasks();
            }}
            className="glass-chip rounded-chip px-2.5 py-1 text-[11px] text-muted-foreground transition active:scale-95"
          >
            清除记录
          </span>
        )}
        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform duration-300", open && "rotate-180")} />
      </button>

      {open && (
        <ul className="max-h-72 space-y-1 overflow-y-auto border-t border-[var(--surface-line)] px-2 pb-2 pt-1">
          {[...active, ...finished].map((t) => {
            const pct = t.size ? Math.min(100, (t.loaded / t.size) * 100) : 0;
            return (
              <li key={t.id} className="pop-in flex items-center gap-2.5 rounded-xl px-2 py-2 transition hover:bg-muted/40">
                <KindIcon kind={t.kind} className="size-9 rounded-lg" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-[13px] font-medium">{t.name}</p>
                    <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                      {t.status === "done" ? "完成" : t.status === "error" ? "失败" : `${pct.toFixed(0)}%`}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn(
                        "h-full rounded-full transition-[width] duration-200",
                        t.status === "uploading" && "progress-flow",
                        t.status === "paused" && "bg-warning",
                        t.status === "done" && "bg-success",
                        t.status === "error" && "bg-destructive",
                        t.status === "queued" && "bg-muted-foreground/50",
                      )}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="mt-1 truncate text-[11px] text-muted-foreground">
                    {t.status === "uploading" && `${formatSpeed(t.speed)} · 剩余 ${formatEta(t.eta)}`}
                    {t.status === "paused" && `已暂停 · ${formatSize(t.loaded)} / ${formatSize(t.size)}`}
                    {t.status === "done" && `${formatSize(t.size)} · 已存入次元架`}
                    {t.status === "error" && (t.error ?? "传输失败")}
                    {t.status === "queued" && "排队等待中"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {t.status === "uploading" && (
                    <IconBtn label="暂停" onClick={() => store.pauseTask(t.id)}>
                      <Pause className="size-4" />
                    </IconBtn>
                  )}
                  {t.status === "paused" && (
                    <IconBtn label="继续" tone="primary" onClick={() => store.resumeTask(t.id)}>
                      <Play className="size-4" />
                    </IconBtn>
                  )}
                  {(t.status === "uploading" || t.status === "paused") && (
                    <IconBtn label="取消" tone="danger" onClick={() => store.cancelTask(t.id)}>
                      <X className="size-4" />
                    </IconBtn>
                  )}
                  {(t.status === "done" || t.status === "error") && (
                    <IconBtn label="移除记录" onClick={() => store.cancelTask(t.id)}>
                      <Trash2 className="size-4" />
                    </IconBtn>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function IconBtn({
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
      className={cn(
        "grid size-8 place-items-center rounded-lg transition-transform active:scale-90",
        tone === "primary" && "bg-primary/12 text-primary hover:bg-primary/20",
        tone === "danger" && "text-muted-foreground hover:bg-destructive/12 hover:text-destructive",
        !tone && "text-muted-foreground hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}
