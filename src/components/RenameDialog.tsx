import { useEffect, useState } from "react";
import type { FileMeta } from "@/lib/site";
import { store } from "@/lib/store";
import { toast } from "sonner";
import { Overlay } from "./Overlay";

export function RenameDialog({ file, onClose }: { file: FileMeta | null; onClose: () => void }) {
  const [name, setName] = useState("");

  useEffect(() => {
    if (file) setName(file.displayName);
  }, [file]);

  if (!file) return null;

  function submit() {
    const v = name.trim();
    if (!v) {
      toast.error("名称不能为空");
      return;
    }
    store.rename(file!.id, v);
    toast.success("已重命名");
    onClose();
  }

  return (
    <Overlay>
      <div className="fixed inset-0 z-[110] grid place-items-center p-4" role="dialog" aria-modal="true">
        <button type="button" aria-label="取消" onClick={onClose} className="absolute inset-0 bg-[var(--scrim)] backdrop-blur-sm" />
        <div className="pop-in glass-panel relative w-full max-w-sm rounded-card p-4">
          <p className="font-display text-[15px] font-semibold">重命名</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">只改展示名，真实扩展名 .{file.ext || "—"} 保持不变</p>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            maxLength={80}
            className="mt-3 w-full rounded-xl border border-input bg-glass-strong px-3 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-ring/30"
          />
          <div className="mt-3.5 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="glass-chip rounded-chip px-4 py-2 text-[13px] font-medium transition active:scale-95">
              取消
            </button>
            <button
              type="button"
              onClick={submit}
              className="rounded-chip bg-gradient-to-r from-primary to-accent-violet px-4 py-2 text-[13px] font-semibold text-primary-foreground shadow-md shadow-primary/25 transition active:scale-95"
            >
              保存
            </button>
          </div>
        </div>
      </div>
    </Overlay>
  );
}
