import { type ReactNode, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * 浮层统一挂到 document.body。
 * 原因：首页 <main> 带 isolate（防 glass-panel 的 backdrop-filter 越级），
 * 若浮层留在 main 内部，其 z-index 只在 isolate 上下文里排序，会被 DOM 靠后的
 * 内容卡片绘制在上方。Portal 出去后浮层与 main 成为 body 的直接兄弟，
 * z-[100]/z-[110] 才能稳定压过所有内容。
 */
export function Overlay({ children }: { children: ReactNode }) {
  const [host] = useState(() => (typeof document === "undefined" ? null : document.createElement("div")));

  useLayoutEffect(() => {
    if (!host) return;
    host.setAttribute("data-overlay-root", "");
    document.body.appendChild(host);
    return () => {
      host.remove();
    };
  }, [host]);

  if (!host) return null;
  console.log("[Overlay] 浮层已 Portal 到 body，脱离 main.isolate 上下文");
  return createPortal(children, host);
}
