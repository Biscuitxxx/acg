import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { WallpaperLayer } from "@/components/WallpaperLayer";
import { TopBar } from "@/components/TopBar";
import { UploadZone } from "@/components/UploadZone";
import { TransferQueue } from "@/components/TransferQueue";
import { FileList } from "@/components/FileList";
import { ClearBar } from "@/components/ClearBar";
import { PreviewSheet } from "@/components/PreviewSheet";
import { RenameDialog } from "@/components/RenameDialog";
import { SettingsDrawer } from "@/components/SettingsDrawer";
import { NoteComposer } from "@/components/NoteComposer";
import { applyTheme, store, useFiles } from "@/lib/store";
import type { FileMeta } from "@/lib/site";

export const Route = createFileRoute("/")({
  component: HomePage,
  head: () => ({
    meta: [{ title: "ACG 中转站 · 内网文件传输" }],
  }),
});

function HomePage() {
  const { all } = useFiles();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [preview, setPreview] = useState<FileMeta | null>(null);
  const [rename, setRename] = useState<FileMeta | null>(null);
  const [editNote, setEditNote] = useState<FileMeta | null>(null);

  // 浮层层级：main 用 isolate 锁成独立层叠上下文，glass-panel(backdrop-filter) 无法越级；
  // 浮层统一 z-[100]，确认类对话框 z-[110]，TopBar 保持 z-30。
  useEffect(() => {
    applyTheme();
    void store.refreshQuota();
    console.log("[HomePage] 层叠上下文已隔离", { main: "isolate", overlay: "z-[100]", confirm: "z-[110]" });
  }, []);

  // 预览目标始终跟随最新元信息（重命名后即时反映）
  const previewFile = preview ? (all.find((f) => f.id === preview.id) ?? null) : null;

  return (
    <div className="relative min-h-dvh">
      <WallpaperLayer />

      <TopBar onOpenSettings={() => setSettingsOpen(true)} />

      {/* isolate：把内容区锁成独立层叠上下文，glass-panel 的 backdrop-filter 无法越级盖住浮层 */}
      <main className="mx-auto isolate flex max-w-6xl flex-col gap-3 px-3 pb-2 pt-3 sm:gap-4 sm:px-5 sm:pt-4 lg:flex-row lg:items-start">
        {/* 左栏：上传 + 队列。lg~xl 区间收窄为 360px 给右栏留阅读空间，xl 起放宽到 420px */}
        <div className="flex w-full shrink-0 flex-col gap-3 sm:gap-4 lg:sticky lg:top-24 lg:w-[360px] xl:w-[420px]">
          <UploadZone />
          <TransferQueue />
        </div>

        {/* 右栏：文件架 */}
        <div className="min-w-0 flex-1">
          <FileList
            onPreview={(f) => {
              if (f.kind === "note") setEditNote(f);
              else setPreview(f);
            }}
            onRename={(f) => setRename(f)}
          />
          <ClearBar />
        </div>
      </main>

      <PreviewSheet file={previewFile} onClose={() => setPreview(null)} onRename={(f) => setRename(f)} />
      <RenameDialog file={rename} onClose={() => setRename(null)} />
      <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <NoteComposer open={!!editNote} editing={editNote} onClose={() => setEditNote(null)} />
    </div>
  );
}
