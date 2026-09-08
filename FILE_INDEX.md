# FILE_INDEX

盤點日期：2026-09-09（Asia/Taipei）
專案狀態：婚禮已結束，進入封存維護。
權威的封存時大小與 SHA-256 以封存包內 `FILE_MANIFEST` 為準；本文件按用途分類，不取代 manifest。

## 專案入口與重要成果

| 路徑 | 分類 | 用途與狀態 |
|---|---|---|
| `index.html` | 重要入口 | 純前端頁面、import map、file-protocol 提示與 `main.js` 啟動入口。 |
| `main.js` | 執行核心 | Three.js renderer、EffectComposer、Bloom/Afterimage、rAF 迴圈與離線逐幀掛鉤。 |
| `gpgpu.js` | 執行核心 | GLTF/LOGO 載入、兩套常駐 GPGPU 模擬、粒子 shader、診斷與資源釋放。 |
| `io.js` | 執行核心 | 空白鍵/F 快捷鍵、可中斷形變狀態、5 分鐘輪播與 `__vfx` 掛鉤。 |
| `camera.js` | 執行核心 | 自動運鏡、視錐 fitting、滑鼠拖曳與滾輪距離控制。 |
| `morphController.js` | 執行核心 | 無 DOM/GSAP 的臨界阻尼、模擬換手、角度歸一化與等亮度函式。 |
| `public/logo.png` | 重要成果/執行素材 | 目前 LOGO 形變的目標圖。 |
| `public/papa_meilland_rose/` | 重要成果/執行素材 | `io.js` 目前引用的 GLTF 玫瑰、貼圖與授權檔。 |

## 程式、設定與測試

| 路徑 | 分類 | 用途與狀態 |
|---|---|---|
| `particleSettings.js` | 設定 | 密度 1–5、取樣步長與最小粒子數。 |
| `playbackSettings.js` | 設定 | 自動輪播開關與 5 分鐘間隔。 |
| `modes.js` | 保留程式 | 婚禮 LOGO-only mode registry；目前由 `tests/config.test.mjs` 覆蓋，主入口未發現引用。保留，不判定為多餘。 |
| `audio.js` | 保留程式/用途缺口 | 麥克風頻譜分析管線；需要瀏覽器權限，目前主入口未發現引用，是否曾作現場功能未驗證。 |
| `vercel.json` | 部署設定 | 靜態 Vercel 設定，`framework: null`、`outputDirectory: "."`；已納入 GitHub。 |
| `.gitignore` | 維護設定 | 忽略 `node_modules/`、`.DS_Store`、`.env`、`.vercel/`、`.claude/`。 |
| `tests/config.test.mjs` | 測試 | mode、粒子密度與自動輪播設定測試。 |
| `tests/morph.test.mjs` | 測試 | 連按、中途反轉、收斂、模擬換手、自轉與等亮度測試。 |

## 保留的原始與歷史素材

| 路徑 | 分類 | 用途與狀態 |
|---|---|---|
| `public/3D玫瑰花素材/rose/` | 原始素材/歷史候選 | 完整 GLTF、bin、貼圖與 `license.txt`；目前無執行引用，保留來源與恢復選項。 |
| `public/3D玫瑰花素材/rose_scan_for_valentines_day_2023/` | 原始素材/歷史候選 | 完整 GLTF、bin、貼圖與 `license.txt`；目前無執行引用，保留來源與恢復選項。 |
| `public/photo.png` | 保留素材/用途缺口 | 目前程式搜尋未找到引用；其原始用途未由 repo 證實，故保留。 |
| 各模型的 `license.txt` | 授權/恢復必要 | 保存 Sketchfab 來源與授權文字；不得刪除。 |

## 本機隱藏檔與 Git 狀態

| 路徑 | 是否在 GitHub | 封存處理與用途 |
|---|---|---|
| `.git/` | 否（GitHub 有其遠端歷史） | 封存完整本地 Git 狀態、refs、reflog、設定與其他分支；包含本地 `main` 尚未推送的既有提交。 |
| `.claude/launch.json` | 否 | 本機 Python server 啟動設定；封存保留，不是依賴快取。 |
| `.claude/settings.local.json` | 否 | 本機工具權限設定；盤點未見憑證值，封存保留，應視為私有 metadata。 |
| `.vercel/project.json`、`.vercel/README.txt` | 否 | Vercel 專案連結 metadata 與說明；不是登入憑證，但含服務識別資訊，僅封存、不上傳 GitHub。 |
| `.DS_Store` | 否 | 本次已移除 5 個工作樹 Finder metadata；`.git/.DS_Store` 未動。 |

## 外部依賴與服務

- `index.html` 從 `https://unpkg.com/three@0.160.0/` 載入 Three.js 與 addons，從 `https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.4/gsap.min.js` 載入 GSAP。兩者沒有本地 vendor 副本；CDN 失效或版本內容變動時，不能宣稱可離線完整恢復。
- 本機預覽不需要 Node 套件安裝或 build；在根目錄執行 `python3 -m http.server 57832`，再開啟 `http://127.0.0.1:57832/?v=20260819_wedding_v9`。直接以 `file://` 開啟會顯示警告且可能被 CORS 阻擋。
- 單元測試使用 Node 內建 test runner：`node --test tests/*.mjs`。盤點當機器版本為 Node `v24.18.0`、Python `3.14.3`、Git `2.39.5`；這是觀測值，不是 lockfile 保證。
- Vercel 是外部靜態託管服務；盤點時 `https://wedding-vfx-engine.vercel.app/` 回應 HTTP 200。恢復/部署仍需使用者自己的 Vercel 權限與網路，不把 `.vercel` metadata 當成登入資料。
- `audio.js` 若日後接回，需要瀏覽器麥克風授權；本封存未包含任何錄音或音樂檔。

## GitHub 與封存包的邊界

- GitHub 目前分支 `feature/wedding-logo-only` 包含 repo 內已追蹤的程式、測試、授權素材、目前文件與 `vercel.json`。
- `.git/` 的本地 reflog/設定、`.claude/`、`.vercel/` 不在 GitHub；它們會納入本次封存包以利本地恢復，但不應公開散布。
- `ARCHIVE_README.md` 與 `FILE_MANIFEST` 是封存專用報告，會放在封存包內，不提交到 GitHub，也不放回原始專案。
- 盤點未找到獨立 `dist/`、`build/`、`out/`、`render/`、`output/` 或影片檔；因此本專案封存的是可恢復的互動式網站與素材，不是已算出的 MP4 成品。若成品存在於其他位置，本 repo 未提供其位置證據。

## 資料缺口與保存決策

- 沒有 `package.json` 或 lockfile，無法從 repo 精確重建 CDN 以外的前端依賴清單；目前無 `node_modules/`，不自行安裝。
- `photo.png`、`audio.js`、`modes.js` 的歷史用途沒有在目前入口得到證實；它們因可能保存交付或恢復資訊而保留。
- 專案位於 `/Users/Openclaw/Documents/...`，不是 `~/Library/Mobile Documents/com~apple~CloudDocs/...` 路徑；本次只驗證本機檔案可讀，沒有把它當作 iCloud 或其他雲端備份完成的證據。
