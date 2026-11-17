import { Archive, FileText, Film, Image as ImageIcon, Music, NotebookPen, PackageOpen } from "lucide-react";
import type { FileKind } from "@/lib/site";
import { cn } from "@/lib/utils";

const MAP: Record<FileKind, { Icon: typeof Film; ring: string; bg: string; fg: string }> = {
  video: { Icon: Film, ring: "ring-accent-violet/40", bg: "bg-accent-violet/15", fg: "text-accent-violet" },
  image: { Icon: ImageIcon, ring: "ring-primary/40", bg: "bg-primary/15", fg: "text-primary" },
  audio: { Icon: Music, ring: "ring-accent-teal/40", bg: "bg-accent-teal/15", fg: "text-accent-teal" },
  doc: { Icon: FileText, ring: "ring-accent-gold/40", bg: "bg-accent-gold/15", fg: "text-accent-gold" },
  archive: { Icon: Archive, ring: "ring-muted-foreground/30", bg: "bg-muted", fg: "text-muted-foreground" },
  note: { Icon: NotebookPen, ring: "ring-primary/35", bg: "bg-primary-soft", fg: "text-primary" },
  other: { Icon: PackageOpen, ring: "ring-border", bg: "bg-secondary", fg: "text-secondary-foreground" },
};

export function KindIcon({ kind, className }: { kind: FileKind; className?: string }) {
  const { Icon, bg, fg, ring } = MAP[kind];
  return (
    <span className={cn("grid size-11 shrink-0 place-items-center rounded-xl ring-1", bg, fg, ring, className)}>
      <Icon className="size-5" strokeWidth={1.9} />
    </span>
  );
}

export const KIND_LABEL: Record<FileKind, string> = {
  video: "视频",
  image: "图片",
  audio: "音频",
  doc: "文档",
  archive: "压缩包",
  note: "笔记",
  other: "其他",
};

export function KindBadge({ kind }: { kind: FileKind }) {
  const { bg, fg } = MAP[kind];
  return (
    <span className={cn("rounded-chip px-2 py-0.5 text-[11px] font-medium leading-4 ring-1 ring-inset", bg, fg, MAP[kind].ring)}>
      {KIND_LABEL[kind]}
    </span>
  );
}
