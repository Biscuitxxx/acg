import { useMemo } from "react";
import { WALLPAPER_PRESETS } from "@/lib/site";
import { usePrefs } from "@/lib/store";

/** 全站背景：预设 / 自定义壁纸 + 亮度、模糊、遮罩调节 + 飘落花瓣 */
export function WallpaperLayer() {
  const prefs = usePrefs();
  const url = prefs.customWallpaper ?? WALLPAPER_PRESETS.find((p) => p.id === prefs.wallpaperId)?.url ?? null;

  const petals = useMemo(() => {
    if (!prefs.petal) return [];
    return Array.from({ length: 12 }, (_, i) => ({
      left: `${(i * 8.6 + ((i * 37) % 11)) % 100}%`,
      size: 7 + ((i * 13) % 9),
      dur: 13 + ((i * 7) % 11),
      delay: -((i * 3.3) % 18),
      drift: `${((i % 5) - 2) * 4}vw`,
    }));
  }, [prefs.petal]);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div
        className="absolute inset-0 scale-105 bg-cover bg-center transition-[filter,background-image] duration-500"
        style={{
          backgroundImage: url ? `url("${url}")` : undefined,
          filter: `blur(${prefs.blur}px) brightness(${prefs.bright}%)`,
        }}
      />
      {/* 无壁纸时的兜底渐变 */}
      {!url && <div className="bokeh-layer absolute inset-0 opacity-90" />}
      <div
        className="absolute inset-0 transition-opacity duration-500"
        style={{
          background:
            prefs.theme === "dark"
              ? `linear-gradient(180deg, oklch(0.17 0.05 288 / ${prefs.dim / 100}), oklch(0.2 0.05 288 / ${Math.min(0.92, prefs.dim / 100 + 0.25)}))`
              : `linear-gradient(180deg, oklch(0.99 0.01 340 / ${prefs.dim / 100}), oklch(0.95 0.03 335 / ${Math.min(0.9, prefs.dim / 100 + 0.2)}))`,
        }}
      />
      {petals.map((p, i) => (
        <span
          key={i}
          className="petal"
          style={{
            left: p.left,
            width: p.size,
            height: p.size * 0.82,
            animationDuration: `${p.dur}s`,
            animationDelay: `${p.delay}s`,
            ["--drift-x" as string]: p.drift,
          }}
        />
      ))}
    </div>
  );
}
