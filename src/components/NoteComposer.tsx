import { useEffect, useState } from "react";
import { NotebookPen } from "lucide-react";
import { store } from "@/lib/store";
import { toast } from "sonner";
import type { FileMeta } from "@/lib/site";
import { Overlay } from "./Overlay";

export function NoteComposer({ open, onClose, editing }: { open: boolean; onClose: () => void; editing?: FileMeta | null }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  useEffect(() => {
    if (open) {
      setTitle(editing?.displayName ?? "");
      setBody(editing?.noteBody ?? "");
    }
  }, [open, editing]);

  if (!open) return null;

  async function submit() {
    if (!title.trim() && !body.trim()) {
      toast.error("笔记标题或正文至少写一点内容");
      return;
    }
    if (editing) {
      await store.updateNote(editing.id, { title: title.trim() || "未命名笔记", body });
      toast.success("笔记已更新");
    } else {
      await store.addNote(title.trim(), body);
      toast.success("笔记已放进次元架");
    }
    onClose();
  }

  return (
    <Overlay>
      <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
        <button type="button" aria-label="关闭" onClick={onClose} className="absolute inset-0 bg-[var(--scrim)] backdrop-blur-sm" />
        <div className="glass-panel pop-in relative m-0 w-full max-w-lg rounded-t-card p-4 sm:m-4 sm:rounded-card sm:p-5">
          <div className="mb-3 flex items-center gap-2">
            <span className="sticker grid size-9 place-items-center rounded-xl bg-primary-soft text-primary">
              <NotebookPen className="size-4.5" />
            </span>
            <h2 className="font-display text-base font-semibold">{editing ? "编辑笔记" : "新建笔记"}</h2>
          </div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="给笔记起个名字"
            maxLength={60}
            className="w-full rounded-xl border border-input bg-glass-strong px-3 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-ring/30"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="写点什么…支持换行，之后可以导出为文本文件"
            rows={8}
            className="mt-2.5 w-full resize-y rounded-xl border border-input bg-glass-strong px-3 py-2.5 text-sm leading-6 outline-none transition focus:border-primary focus:ring-2 focus:ring-ring/30"
          />
          <div className="mt-3 flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">{new Blob([body]).size > 1024 ? `${(new Blob([body]).size / 1024).toFixed(1)} KB` : `${new Blob([body]).size} B`}</span>
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="glass-chip rounded-chip px-4 py-2 text-[13px] font-medium transition active:scale-95">
                取消
              </button>
              <button
                type="button"
                onClick={() => void submit()}
                className="rounded-chip bg-gradient-to-r from-primary to-accent-violet px-4 py-2 text-[13px] font-semibold text-primary-foreground shadow-md shadow-primary/25 transition active:scale-95"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      </div>
    </Overlay>
  );
}
