import { useEffect, useState } from "react";
import { CloudOff, Settings2, Sparkles, Waves } from "lucide-react";
import { APP_NAME, APP_TAGLINE, formatSize } from "@/lib/site";
import { store, useFiles, useQuota } from "@/lib/store";
import { cn } from "@/lib/utils";

export function TopBar({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { all, totalSize } = useFiles();
  const quota = useQuota();
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    void store.refreshQuota();
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    const t = setInterval(() => void store.refreshQuota(), 8000);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
      clearInterval(t);
    };
  }, []);

  const pct = quota.quota > 0 ? Math.min(100, (totalSize / quota.quota) * 100) : 0;

  return (
    <header className="sticky top-0 z-30 px-3 pt-3 sm:px-5 sm:pt-4">
      <div className="glass-panel mx-auto flex max-w-6xl items-center gap-3 rounded-card px-3 py-2.5 sm:px-4">
        <span className="sticker grid size-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-primary to-accent-violet text-primary-foreground">
          <Sparkles className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-[17px] font-semibold leading-5 tracking-wide">{APP_NAME}</h1>
          <p className="mt-0.5 hidden truncate text-xs text-muted-foreground sm:block">{APP_TAGLINE}</p>
        </div>

        {/* 容量仪表 */}
        <div className="hidden w-44 shrink-0 md:block">
          <div className="mb-1 flex items-baseline justify-between text-[11px] text-muted-foreground">
            <span>{all.length} 个文件 · {formatSize(totalSize)}</span>
            <span className="font-mono">{pct > 0 ? `${pct.toFixed(1)}%` : "—"}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary via-accent-violet to-accent-teal transition-[width] duration-500"
              style={{ width: `${Math.max(pct, all.length ? 2 : 0)}%` }}
            />
          </div>
        </div>

        <span
          className={cn(
            "glass-chip hidden items-center gap-1.5 rounded-chip px-2.5 py-1.5 text-[11px] sm:flex",
            online ? "text-success" : "text-destructive",
          )}
          title={online ? "本机存储就绪" : "网络已断开"}
        >
          {online ? <Waves className="size-3.5" /> : <CloudOff className="size-3.5" />}
          {online ? "就绪" : "离线"}
        </span>

        <button
          type="button"
          onClick={onOpenSettings}
          aria-label="打开设置"
          className="glass-chip grid size-10 shrink-0 place-items-center rounded-2xl text-foreground transition-transform duration-200 hover:scale-105 active:scale-95"
        >
          <Settings2 className="size-5" />
        </button>
      </div>

      {/* 手机端紧凑容量条 */}
      <div className="mx-auto mt-1.5 flex max-w-6xl items-center gap-2 px-1 text-[11px] text-muted-foreground md:hidden">
        <span>{all.length} 个文件 · {formatSize(totalSize)}</span>
        <span className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
          <span className="block h-full rounded-full bg-primary/70" style={{ width: `${Math.max(pct, all.length ? 3 : 0)}%` }} />
        </span>
      </div>
    </header>
  );
}
