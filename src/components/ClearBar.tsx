import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, Trash } from "lucide-react";
import { store, useFiles, useTasks } from "@/lib/store";
import { toast } from "sonner";
import { Overlay } from "./Overlay";

/** 一键清空：二次确认 + 处理进度 + 粒子消散反馈 */
export function ClearBar() {
  const { all } = useFiles();
  const tasks = useTasks();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [left, setLeft] = useState(0);
  const [burst, setBurst] = useState(false);

  const activeTasks = tasks.filter((t) => t.status === "uploading" || t.status === "paused");

  useEffect(() => {
    if (!confirmOpen) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && !busy && setConfirmOpen(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [confirmOpen, busy]);

  if (!all.length) return null;

  async function run() {
    setBusy(true);
    setLeft(all.length);
    // 分步删除，让进度可见
    const ids = all.map((f) => f.id);
    for (let i = 0; i < ids.length; i++) {
      await store.remove(ids[i]);
      setLeft(ids.length - i - 1);
    }
    setBurst(true);
    setTimeout(() => setBurst(false), 750);
    setBusy(false);
    setConfirmOpen(false);
    toast.success("次元架已清空");
  }

  return (
    <>
      <div className="flex justify-center pb-6 pt-1">
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          className="glass-chip inline-flex items-center gap-1.5 rounded-chip px-4 py-2 text-[12.5px] font-medium text-muted-foreground transition hover:text-destructive active:scale-95"
        >
          <Trash className="size-4" /> 一键清空（{all.length}）
        </button>
      </div>

      {confirmOpen && (
        <Overlay>
          <div className="fixed inset-0 z-[110] grid place-items-center p-4" role="alertdialog" aria-modal="true">
          <button
            type="button"
            aria-label="取消"
            disabled={busy}
            onClick={() => setConfirmOpen(false)}
            className="absolute inset-0 bg-[var(--scrim)] backdrop-blur-sm"
          />
          <div className="pop-in glass-panel relative w-full max-w-sm overflow-hidden rounded-card p-5 text-center">
            {burst && <span className="burst-ring pointer-events-none absolute left-1/2 top-1/2 size-32 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/30" />}
            <span className="sticker mx-auto grid size-14 place-items-center rounded-2xl bg-destructive/12 text-destructive">
              <AlertTriangle className="size-7" />
            </span>
            <p className="mt-3 font-display text-base font-semibold">清空全部 {all.length} 个文件？</p>
            <p className="mt-1 text-[12px] leading-5 text-muted-foreground">
              所有视频、照片、文档与笔记都会被永久删除，无法恢复。壁纸和主题设置不受影响。
            </p>
            {activeTasks.length > 0 && !busy && (
              <p className="mt-2.5 rounded-xl bg-warning/12 px-3 py-2 text-left text-[11.5px] leading-5 text-warning">
                还有 {activeTasks.length} 个传输中的任务，清空会同时取消它们。
              </p>
            )}
            {busy ? (
              <div className="mt-4">
                <div className="mb-1.5 flex items-baseline justify-between text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <Loader2 className="size-3.5 animate-spin" /> 正在清理…
                  </span>
                  <span className="font-mono">剩余 {left}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="progress-flow h-full rounded-full transition-[width] duration-200"
                    style={{ width: `${((all.length - left) / Math.max(1, all.length)) * 100}%` }}
                  />
                </div>
              </div>
            ) : (
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmOpen(false)}
                  className="glass-chip flex-1 rounded-chip px-4 py-2.5 text-[13px] font-medium transition active:scale-95"
                >
                  再想想
                </button>
                <button
                  type="button"
                  onClick={() => {
                    activeTasks.forEach((t) => store.cancelTask(t.id));
                    void run();
                  }}
                  className="flex-1 rounded-chip bg-destructive px-4 py-2.5 text-[13px] font-semibold text-destructive-foreground shadow-md shadow-destructive/25 transition active:scale-95"
                >
                  确认清空
                </button>
              </div>
            )}
          </div>
        </div>
        </Overlay>
      )}
    </>
  );
}
