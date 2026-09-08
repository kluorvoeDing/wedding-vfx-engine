# CLEANUP_LOG

清理日期：2026-09-09（Asia/Taipei）
範圍：只處理 `/Users/Openclaw/Documents/00_Wedding/99_互動特效試做區/vfx_engine`。

## 已移除

| 項目 | 清理前檔案大小 | 判定理由 |
|---|---:|---|
| `.DS_Store` | 14,340 bytes | Finder 產生的目錄 metadata，未被程式引用；由 `.gitignore` 忽略。 |
| `public/.DS_Store` | 10,244 bytes | 同上。 |
| `public/3D玫瑰花素材/.DS_Store` | 10,244 bytes | 同上；不屬於素材本體。 |
| `public/3D玫瑰花素材/rose_scan_for_valentines_day_2023/.DS_Store` | 8,196 bytes | 同上；不屬於 GLTF、貼圖或授權檔。 |
| `public/papa_meilland_rose/.DS_Store` | 6,148 bytes | 同上；不屬於目前使用的模型。 |

合計移除檔案：5 個；檔案表觀大小：49,172 bytes（約 48 KiB）。清理前 `du -sk .` 為 108,632 KiB，清理後、文件更新前為 108,572 KiB；檔案系統配置差異為 60 KiB，兩者因 block allocation 不同而不完全相等。

## 保留／未清理

- 沒有發現可安全移除的 `node_modules/`、`.next/`、`.cache/`、`coverage/`、Python cache、`dist/`、`build/`、`out/`、`render/` 或 `output/`。
- `.claude/`（本機啟動與權限設定）與 `.vercel/`（Vercel 連結 metadata）不是快取，保留並只放入封存包，不提交 GitHub。
- 所有程式、測試、三組 GLTF/貼圖/授權素材、`logo.png`、`photo.png`、`.git/` 與既有未提交/未推送狀態均未刪除或覆蓋。
- `.git/.DS_Store` 沒有移除，避免把清理範圍擴張到 Git 內部資料。

## 清理後檢查

- `node --test tests/*.mjs`：13 tests passed，0 failed。
- 三組 `scene.gltf`、`vercel.json`、`.claude/launch.json`、`.claude/settings.local.json`、`.vercel/project.json`：均可由 JSON parser 讀取。
- 清理後 Git 工作樹沒有非忽略未追蹤檔；僅 `.claude/` 與 `.vercel/` 仍列為 ignored。
- 沒有程式引用被刪除的 `.DS_Store`；目前 runtime 仍引用 `public/papa_meilland_rose/scene.gltf` 與 `public/logo.png`。
