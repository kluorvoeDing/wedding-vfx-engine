# Wedding VFX Engine — 封存版

> 狀態：**婚禮已結束，進入封存維護**（2026-09-09）。
> 目前 Git 分支：`feature/wedding-logo-only`。
> 本文件描述實際保留內容與恢復邊界；不代表外部備份或未驗證的完整離線恢復。

## 專案用途

這是婚禮現場用的 Three.js + GPGPU 粒子視覺效果：白玫瑰粒子待機自轉，按空白鍵後流體形變成婚禮 LOGO；再按一次返回玫瑰。現行版本採常駐雙模擬與可中斷狀態機，畫面沒有控制面板。

目前可操作功能：

- `空白鍵`：玫瑰 ⇄ LOGO，轉場約 1.2 秒，可中途反轉。
- `F`：進入/離開全螢幕。
- 預設每 5 分鐘自動切換一次；手動切換會重新計時，可在 `playbackSettings.js` 調整。
- 玫瑰狀態使用 scale `1.2`、point size `2.0`、density `5`；LOGO 狀態使用 scale `0.46`、point size `0.55`、density `1`。這些值位於 `io.js`。

目前執行入口實際載入：

- 模型：`public/papa_meilland_rose/scene.gltf`。
- LOGO：`public/logo.png`。

## 保留目錄樹

以下是清理後的工作樹重點；`.git/`、`.claude/`、`.vercel/` 等隱藏內容也會在封存包中保留，完整檔案與雜湊以封存包內 `FILE_MANIFEST` 為準。

```text
.
├── AGENTS.md                       # 封存維護規則與歷史開發決策
├── README.md                       # 本文件：入口、恢復與限制
├── FILE_INDEX.md                   # 按用途的保留檔案索引
├── CLEANUP_LOG.md                  # 本次清理清單與清理前後大小
├── .gitignore
├── .claude/                        # ignored；本機啟動/權限設定，封存保留
│   ├── launch.json
│   └── settings.local.json
├── .vercel/                        # ignored；部署連結 metadata，封存保留
│   ├── project.json
│   └── README.txt
├── index.html                      # Web 入口與 CDN import map
├── main.js                         # renderer、後期處理、主迴圈
├── gpgpu.js                        # GLTF/LOGO 與兩套 GPGPU 粒子模擬
├── io.js                           # 鍵盤狀態機與 __vfx 診斷掛鉤
├── camera.js                       # 自動運鏡與視錐 fitting
├── morphController.js              # 形變純函式核心
├── playbackSettings.js             # 自動輪播設定
├── particleSettings.js             # 粒子密度設定
├── modes.js                        # 婚禮 mode registry（主入口未引用）
├── audio.js                        # 麥克風頻譜管線（目前未接入入口）
├── vercel.json                     # 靜態託管設定
├── public/
│   ├── logo.png                    # 重要成果：目前 LOGO 目標
│   ├── photo.png                   # 保留素材；用途未由 repo 證實
│   ├── papa_meilland_rose/         # 目前執行使用的模型、貼圖、license
│   └── 3D玫瑰花素材/
│       ├── rose/                   # 保留原始/歷史模型與 license
│       └── rose_scan_for_valentines_day_2023/  # 保留原始/歷史模型與 license
└── tests/
    ├── config.test.mjs
    └── morph.test.mjs
```

`public/3D玫瑰花素材/` 下的兩組模型沒有被刪除；它們目前沒有執行引用，但保留其 bin、貼圖與授權檔以避免破壞來源與日後恢復選項。盤點沒有找到獨立的 MP4、影片 render、`dist/`、`build/`、`out/` 或 `output/` 成品。

## 環境、依賴與啟動

這是無 bundler 的純前端專案，repo 沒有 `package.json`、lockfile 或 `node_modules/`。瀏覽器依賴直接記錄於 `index.html`：

- Three.js `0.160.0` 與 addons：`https://unpkg.com/three@0.160.0/`。
- GSAP `3.12.4`：`https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.4/gsap.min.js`。
- 需要支援 ES modules、WebGL/GPGPU 的瀏覽器與可存取上述 CDN 的網路。

在專案根目錄啟動本機 HTTP server：

```bash
python3 -m http.server 57832
```

再開啟：

```text
http://127.0.0.1:57832/?v=20260819_wedding_v9
```

不要直接以 `file://` 開啟；頁面會顯示警告，ES modules/GLTF 也可能受 CORS 限制。若要測試純函式邏輯：

```bash
node --test tests/*.mjs
```

本次盤點使用的觀測版本為 Node `v24.18.0`、Python `3.14.3`、Git `2.39.5`；它們不是由 lockfile 固定的需求版本。盤點時 13 個測試全部通過。

## 恢復與驗證

1. 解開封存包後，先確認 `FILE_MANIFEST` 的路徑、SHA-256、符號連結與權限，再以該專案目錄作為 HTTP server 根目錄。
2. 確認 `public/papa_meilland_rose/scene.gltf` 的 `scene.bin`、textures 與 `license.txt` 都在；確認 `public/logo.png` 可讀。
3. 執行 `node --test tests/*.mjs`。
4. 執行 `python3 -m http.server 57832`，用瀏覽器載入入口；確認畫面、WebGL、GLTF、LOGO 與鍵盤切換。
5. 若需現場診斷，在 DevTools console 使用 `__vfx.getDesiredState()`、`__vfx.getActiveSim()`、`__vfx.simStats(__vfx.renderer)`。離線算圖掛鉤為 `__vfx.stopLoop()`、`__vfx.renderFrame(dt, t)`、`__vfx.cancelAutoRotate()`；本次沒有重新算圖驗證。

只通過 Node 測試不等於 GPU、瀏覽器、CDN 或 Vercel 恢復已完整驗證；本次封存驗證限制見封存包內 `ARCHIVE_README.md`。

## 外部素材、服務與限制

- 本地 `public/` 已包含目前模型、兩組保留模型、貼圖、LOGO、`photo.png` 與授權檔；執行時模型與 LOGO 不需另從 Sketchfab 下載。
- Three.js/GSAP 仍依賴外部 CDN，未 vendor 進封存；CDN 內容或可用性變化時，需要人工調整 import map 或補入相容副本。本次不安裝、不升級、不改寫 CDN 版本。
- Vercel 的靜態設定 `vercel.json` 在 GitHub；`.vercel/` 的本機連結 metadata 只在封存包，不含登入憑證，不可取代 Vercel 權限。盤點時 `https://wedding-vfx-engine.vercel.app/` 回應 HTTP 200，日後狀態仍需另行確認。
- `audio.js` 的麥克風功能需要使用者明確授權，目前未發現主入口引用；本封存沒有音訊檔。
- 專案位於本機 `/Users/Openclaw/Documents/...`，不在 iCloud Drive 目錄；本地可讀不代表行動硬碟或雲端副本已完成。

## GitHub 與封存包

GitHub repo：<https://github.com/kluorvoeDing/wedding-vfx-engine>

目前分支：`feature/wedding-logo-only`

收尾後目前 HEAD：`a6a78d34982098da0af4e4ed1f242e200bf2f7d7`，與同名 `origin` 分支一致；本次文件收尾已提交並推送。

GitHub 會保存已追蹤的程式、測試、文件、授權素材、PNG 與 `vercel.json`。`.git/`、`.claude/`、`.vercel/` 不在 GitHub；本次封存包會保存它們及本地 Git 狀態。封存專用的 `ARCHIVE_README.md` 與 `FILE_MANIFEST` 只放在封存包，不提交 GitHub；封存包本身也不會提交。

Git 歷史中另有本地 `main` 比 `origin/main` 超前 1 個既有提交；本次不切換、不合併、不替它推送。遠端保留，沒有建立 PR 或自動部署操作。

## 維護界線

後續維護預設「先保存，再判斷」：不因檔名相似、檔案較舊、檔案較大或目前未被引用就刪除。不得自動升級依賴、重構、重新渲染、重新部署、修改/刪除 GitHub 遠端、刪除 Vercel/雲端資料，或刪除本機原始專案。任何清理與恢復都應先更新索引、保留證據並做可回讀驗證。
