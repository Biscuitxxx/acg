# 项目技术上下文

## Dependencies
- `sonner`：全局 toast（Toaster 挂在 `src/routes/__root.tsx`，业务组件直接 `import { toast } from "sonner"`，不要在页面内重复挂 Toaster）
- `lucide-react`：图标；无额外 UI 依赖，控件全部自绘 + Tailwind utility

## Architecture
- 数据流：`src/lib/site.ts`（类型/分类/格式化契约，唯一共享契约模块）→ `src/lib/idb.ts`（IndexedDB 存文件 Blob）→ `src/lib/store.ts`（元信息 + Prefs 持久化到 localStorage、上传任务控制器、`useFiles/useTasks/usePrefs/useQuota` hooks）。组件一律通过 store 的 hooks 订阅，不各自持有状态。
- 上传实现：`store.ingest()` 按 1MB 分片写入 IndexedDB，进度/速度/ETA 来自真实字节量；暂停/继续/取消由 `controllers` Map 持有的闭包回调驱动，因此队列控制必须走 `store.pauseTask/resumeTask/cancelTask`，不能只改 task 状态字段。
- 首页 `src/routes/index.tsx` 只做装配与弹层归属（preview/rename/note/settings），业务逻辑全在组件与 store 内。
- 主题：不用 next-themes 的 theme 切换，改由 `Prefs.theme` + `applyTheme()` 直接给 `<html>` 加 `.dark`，与壁纸偏好共用同一份 localStorage 记录。

## What Didn't Work
- ❌ `@plugin 'tw-animate-css'` 写在 `src/styles.css` → 构建报 `Failed to resolve entry for package "tw-animate-css"`（该包在本环境无可解析入口）→ 已移除，动效全部用 styles.css 内自定义 keyframes。
- ❌ 在 `ingest()` 里用 `let state: "run"|"pause"|"stop"` 并在循环中比较 → TS2367 控制流收窄把循环内类型压成字面量 → 改为对象持有 `const st = { s: ... }`。
- ❌ 为读取视图偏好在 FileList 内自建轮询 hook → 与 store 订阅重复且多余 → 直接用 `usePrefs().view`。

## Lessons
- 云服务未开通（`meoo-cli cloud init` 弹窗被取消），当前是本地演示版：文件仅存于本机浏览器 IndexedDB，换设备不可见。接云端时需替换 `src/lib/idb.ts` + `store.ts` 的持久层，UI 层无需改动。
- 长按菜单使用 pointer 序列（480ms + 10px 位移阈值），普通点击仍走 `onClick`；列表项需带 `no-select` + `touch-manipulation`，否则移动端长按会弹出系统选择菜单。
- 预览大文件时 Blob URL 必须在 effect cleanup 里 `revokeObjectURL`，切页/换文件不释放会累积内存。
