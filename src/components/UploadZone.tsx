import { useRef, useState } from "react";
import { Camera, FilePlus2, FolderUp, NotebookPen, UploadCloud } from "lucide-react";
import { MAX_FILE_BYTES, formatSize } from "@/lib/site";
import { store } from "@/lib/store";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { NoteComposer } from "./NoteComposer";

export function UploadZone() {
  const inputRef = useRef<HTMLInputElement>(null);
  const noteInputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);

  async function handle(list: FileList | null) {
    if (!list?.length) return;
    const files = Array.from(list);
    toast.loading(`开始接收 ${files.length} 个文件…`, { id: "upload" });
    const res = await store.addFiles(files);
    if (res.rejected.length) toast.error(`已跳过：${res.rejected.join("、")}`, { id: "upload" });
    else toast.success(`${res.ok} 个文件已进入传输队列`, { id: "upload" });
  }

  return (
    <section className="reveal-up">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          void handle(e.dataTransfer.files);
        }}
        className={cn(
          "glass-panel relative overflow-hidden rounded-card p-4 transition-all duration-300 sm:p-6",
          drag && "ring-2 ring-primary",
        )}
      >
        <div
          className={cn(
            "pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300",
            drag && "opacity-100 bokeh-layer",
          )}
        />
        <div className="relative flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left lg:flex-col lg:text-center">
          <span
            className={cn(
              "sticker grid size-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-primary-soft to-primary/25 text-primary transition-transform duration-300",
              drag && "float-drift scale-110",
            )}
          >
            <UploadCloud className="size-7" strokeWidth={1.8} />
          </span>
          <div className="w-full min-w-0 flex-1">
            <p className="font-display text-base font-semibold">把文件丢进次元架</p>
            <p className="mx-auto mt-1 max-w-[34ch] text-xs leading-5 text-muted-foreground sm:text-[13px]">
              支持视频、照片、文档、音频、压缩包与笔记 · 单文件上限 {formatSize(MAX_FILE_BYTES)}
            </p>
          </div>
          <div className="flex w-full flex-wrap items-center justify-center gap-2 sm:w-auto sm:justify-end lg:w-full lg:justify-center">
            <button
              type="button"
              onClick={() => noteInputRef.current?.click()}
              className="glass-chip inline-flex items-center gap-1.5 rounded-chip px-3.5 py-2 text-[13px] font-medium transition-transform hover:scale-[1.03] active:scale-95 lg:hidden"
            >
              <Camera className="size-4" /> 相册
            </button>
            <button
              type="button"
              onClick={() => setNoteOpen(true)}
              className="glass-chip inline-flex items-center gap-1.5 rounded-chip px-3.5 py-2 text-[13px] font-medium transition-transform hover:scale-[1.03] active:scale-95"
            >
              <NotebookPen className="size-4" /> 新建笔记
            </button>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-chip bg-gradient-to-r from-primary to-accent-violet px-4 py-2 text-[13px] font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-transform hover:scale-[1.03] active:scale-95"
            >
              <FolderUp className="size-4" /> 选择文件
            </button>
          </div>
        </div>

        <input ref={inputRef} type="file" multiple hidden onChange={(e) => { void handle(e.target.files); e.target.value = ""; }} />
        <input
          ref={noteInputRef}
          type="file"
          multiple
          hidden
          accept="image/*,video/*"
          capture="environment"
          onChange={(e) => { void handle(e.target.files); e.target.value = ""; }}
        />
        <p className="relative mt-3 hidden items-center gap-1.5 text-[11px] text-muted-foreground sm:flex">
          <FilePlus2 className="size-3.5" /> 也可以直接把文件拖到这块区域
        </p>
      </div>

      <NoteComposer open={noteOpen} onClose={() => setNoteOpen(false)} />
    </section>
  );
}
