import { useEffect, useRef } from "react";
import { Check, Flower2, ImagePlus, Moon, Sparkles, Sun, Trash2, X } from "lucide-react";
import { WALLPAPER_PRESETS } from "@/lib/site";
import { store, usePrefs } from "@/lib/store";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Overlay } from "./Overlay";

export function SettingsDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const prefs = usePrefs();
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open, onClose]);

  if (!open) return null;

  async function pickWallpaper(f: File | undefined) {
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      toast.error("请选择图片文件");
      return;
    }
    if (f.size > 6 * 1024 * 1024) {
      toast.error("壁纸请控制在 6MB 以内");
      return;
    }
    // 压缩后再存，避免 localStorage 超限
    const url = URL.createObjectURL(f);
    try {
      const img = new Image();
      await new Promise<void>((res, rej) => {
        img.onload = () => res();
        img.onerror = () => rej(new Error("decode"));
        img.src = url;
      });
      const canvas = document.createElement("canvas");
      const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("canvas");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.78);
      store.setPrefs({ customWallpaper: dataUrl });
      toast.success("自定义壁纸已生效");
    } catch {
      toast.error("壁纸读取失败，换一张试试");
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  return (
    <Overlay>
      <div className="fixed inset-0 z-[100] flex justify-end" role="dialog" aria-modal="true">
      <button type="button" aria-label="关闭设置" onClick={onClose} className="absolute inset-0 bg-[var(--scrim)] backdrop-blur-sm" />
      <aside className="glass-panel relative h-full w-full max-w-md overflow-y-auto rounded-l-card sm:max-w-sm">
        <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-[var(--surface-line)] bg-glass-strong px-4 py-3 backdrop-blur-xl">
          <Sparkles className="size-4.5 text-primary" />
          <h2 className="flex-1 font-display text-[15px] font-semibold">个性化设置</h2>
          <button type="button" aria-label="关闭" onClick={onClose} className="grid size-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-muted active:scale-90">
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-6 p-4">
          {/* 壁纸 */}
          <section>
            <SectionTitle>次元壁纸</SectionTitle>
            <div className="grid grid-cols-3 gap-2">
              {WALLPAPER_PRESETS.map((p) => {
                const on = !prefs.customWallpaper && prefs.wallpaperId === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => store.setPrefs({ wallpaperId: p.id, customWallpaper: null })}
                    className={cn(
                      "group relative aspect-[3/4] overflow-hidden rounded-xl ring-2 transition-all duration-200 active:scale-95",
                      on ? "ring-primary shadow-lg shadow-primary/25" : "ring-transparent hover:ring-border",
                    )}
                  >
                    <img src={p.url} alt={p.label} loading="lazy" className="size-full object-cover transition-transform duration-500 group-hover:scale-110" />
                    <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent pb-1 pt-4 text-[11px] font-medium text-white">
                      {p.label}
                    </span>
                    {on && (
                      <span className="absolute right-1.5 top-1.5 grid size-5 place-items-center rounded-full bg-primary text-primary-foreground">
                        <Check className="size-3" strokeWidth={3} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="mt-2.5 flex gap-2">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="glass-chip inline-flex flex-1 items-center justify-center gap-1.5 rounded-chip px-3 py-2 text-[12.5px] font-medium transition active:scale-95"
              >
                <ImagePlus className="size-4" /> 上传自定义壁纸
              </button>
              {prefs.customWallpaper && (
                <button
                  type="button"
                  onClick={() => store.setPrefs({ customWallpaper: null })}
                  className="glass-chip inline-flex items-center justify-center gap-1.5 rounded-chip px-3 py-2 text-[12.5px] text-destructive transition active:scale-95"
                >
                  <Trash2 className="size-4" /> 移除
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { void pickWallpaper(e.target.files?.[0]); e.target.value = ""; }} />
            </div>
          </section>

          {/* 壁纸调节 */}
          <section>
            <SectionTitle>壁纸观感</SectionTitle>
            <Slider label="遮罩强度" value={prefs.dim} min={0} max={80} onChange={(v) => store.setPrefs({ dim: v })} suffix="%" />
            <Slider label="背景模糊" value={prefs.blur} min={0} max={24} onChange={(v) => store.setPrefs({ blur: v })} suffix="px" />
            <Slider label="背景亮度" value={prefs.bright} min={60} max={120} onChange={(v) => store.setPrefs({ bright: v })} suffix="%" />
            <ToggleRow
              label="飘落花瓣动效"
              hint="尊重系统「减弱动效」偏好"
              on={prefs.petal}
              onClick={() => store.setPrefs({ petal: !prefs.petal })}
            />
          </section>

          {/* 主题 */}
          <section>
            <SectionTitle>界面主题</SectionTitle>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { id: "light", label: "雾霞浅色", Icon: Sun },
                  { id: "dark", label: "夜空深色", Icon: Moon },
                ] as const
              ).map(({ id, label, Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => store.setPrefs({ theme: id })}
                  className={cn(
                    "flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all duration-200 active:scale-95",
                    prefs.theme === id
                      ? "bg-gradient-to-r from-primary to-accent-violet text-primary-foreground shadow-md shadow-primary/25"
                      : "glass-chip hover:text-foreground",
                  )}
                >
                  <Icon className="size-4" /> {label}
                </button>
              ))}
            </div>
          </section>

          <p className="rounded-xl bg-muted/60 p-3 text-[11px] leading-5 text-muted-foreground">
            当前为本地演示版：文件与壁纸保存在这台设备的浏览器里，刷新不丢，但换设备看不到。开通云服务后即可登录同步、跨设备存取。
          </p>
        </div>
      </aside>
    </div>
    </Overlay>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2.5 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground"><Flower2 className="size-3.5 text-primary" />{children}</h3>;
}

function Slider({
  label,
  value,
  min,
  max,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="mb-3 block">
      <span className="mb-1 flex items-baseline justify-between text-[12.5px]">
        {label}
        <span className="font-mono text-[11px] text-muted-foreground">{value}{suffix}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted"
      />
    </label>
  );
}

function ToggleRow({ label, hint, on, onClick }: { label: string; hint?: string; on: boolean; onClick: () => void }) {
  return (
    <div className="flex items-center justify-between py-1">
      <div>
        <p className="text-[12.5px] font-medium">{label}</p>
        {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={onClick}
        className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200", on ? "bg-primary" : "bg-muted")}
      >
        <span
          className="absolute top-0.5 left-0 size-5 rounded-full bg-white shadow transition-transform duration-200"
          style={{ transform: on ? "translateX(22px)" : "translateX(2px)" }}
        />
      </button>
    </div>
  );
}
