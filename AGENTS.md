# AGENTS.md (AI 開發日誌)

本檔案記錄了系統核心架構的迭代與 AI 輔助開發之重要決策。

## Codex / GitHub 操作規則

- 本 repo 的遠端為 `https://github.com/kluorvoeDing/wedding-vfx-engine.git`。
- 在 Codex sandbox 內直接執行 `gh auth status` 會讀到 stale/invalid default token，容易誤判為 GitHub 未登入。
- 需要操作 GitHub CLI / GitHub API / `git push` 時，應直接使用授權外部環境（`sandbox_permissions: require_escalated`）。授權外部環境可透過 macOS keyring 取得有效的 `kluorvoeDing` GitHub token。
- 不要用 sandbox 內的 `gh auth status` 作為是否能操作 GitHub 的判斷依據；若要檢查 GitHub 狀態，使用授權外部環境執行。
- 不要輸出或擷取 raw GitHub token；只使用 `gh auth status`、`gh api`、`git push` 等必要命令。

## 核心進化歷程

### 第一階段：GPGPU 框架建立與音訊響應
- **架構設計**：確立使用 GPU Compute 進行百萬粒子運算，解放 CPU 負載。
- **動態力場**：實作了 6 種不同的 Vector Field（Curl Noise, Reverse Growth, Polar Fluid, Topology Fracture, Spiral Galaxy, Meteor Shower）。
- **音訊對接**：成功將 Web Audio API 取得的頻譜數據 (`audioPulse`) 傳入 Shader 中，實現音樂連動。

### 第二階段：雙紋理映射 (Dual Texture Mapping)
- **需求**：用戶需要將 3D 模型 (白玫瑰) 打散並重組成自定義的 LOGO 圖片。
- **技術實現**：在 `initGPGPU` 階段，我們同時載入了 GLTF 的頂點座標 (`dtBasePos`) 與 Image Canvas 的像素座標 (`dtTargetPos`)。
- **動態效果**：在 `velocityShader` 之中加入 Mode 6，使用 `mix()` 函數配合 `uProgress` 在兩個形體之間進行優雅的漸變。

### 第三階段：粒子增殖與高頻亂流
- **問題**：去背 LOGO 的有效像素過少 (約 2,700 顆)，導致形變後字體破圖、無法辨識。
- **技術實現**：
  1. **Particle Jitter Upsampling**：在 GLTF 與 Image 載入階段加入增殖迴圈。計算倍率後，利用 `(Math.random()-0.5)*0.3` 給予微小偏移值，強行將總粒子數推升至 **70,000 顆** 以上。
  2. **高頻解析度保留**：將 `loadLogo()` 函數的解析度上限提高到 2000px，並強制使用 `stepSize = 1` 掃描，確保所有邊緣微小字體都被保留。
  3. **Mode 6 & 7 亂流優化**：在 Mode 6 (Logo Morph) 與 Mode 7 (Ash Disintegration) 的著色器中，導入了向外的爆發力 (`outwardForce`) 與高頻亂流 (`curlNoise`)，讓切換過程充滿毀滅與重生的視覺張力。

### 第四階段：全域矩陣縮放 (Global Scale)
- **問題**：需要一套不消耗額外運算資源的方法，即時控制所有粒子的顯示大小。
- **技術實現**：我們沒有在物理力場中進行座標縮放，而是將 `uGlobalScale` 寫入 `particleMaterial` 的 `vertexShader` 中。在最後渲染至螢幕前，將模型視圖座標乘上該常數：`vec4 scaledPos = vec4(pos.xyz * uGlobalScale, 1.0);`。這達成了完全零延遲、零負載的全域縮放。

### 第五階段：移除不適用效果與視覺聚焦
- **需求**：用戶希望精簡並聚焦視覺特效，移除不符合主題的 3D 素材與效果，並調整結尾禮炮的色調。
- **技術實現**：
  1. **移除不適用效果**：從網頁中移除「萬花筒祝福」、「星圖誓約」、「頭紗絲綢」、「誓言心跳」等 4 種力場模式，專注於保留更流暢的其餘力場。
  2. **模型精簡**：移除品質未達預期的 `rose_scan_for_valentines_day_2023` 素材，僅保留高精細度的白玫瑰 3D 模型。
  3. **配色調整**：將「金粉禮炮」模式的金色調，重新配置為配合婚禮白色主題的「銀白禮炮」(Silver Finale)，並調整粒子色調為銀白色 `(0.9, 0.95, 1.0)`。

### 第六階段：玫瑰粒子調色與混色優化
- **問題**：在大量（數萬顆）粒子重疊時，使用 Additive Blending (疊加混色) 會導致中央強烈過曝而呈純白色，完全喪失 3D 玫瑰模型的陰影與立體花瓣細節。
- **技術實現**：在 GLTF 頂點提取階段，將原本全白 `(1.0, 1.0, 1.0)` 的頂點基礎顏色降低為暗灰色 `(0.3, 0.3, 0.3)`。這樣一來，即使在 Bloom 輝光特效下，多層次疊加後依然能保持優雅的半透明發光感，完美重現 3D 玫瑰的豐富花瓣細節。

### 第七階段：3D 玫瑰自轉與 LOGO 靜態融合
- **問題**：玫瑰需要能在預設直立狀態下繞著其中心軸自轉，但當粒子融合成 LOGO 文字（即 `uProgress` 漸變完成）時，LOGO 文字必須維持靜態，不能旋轉。
- **技術實現**：
  1. 在 `particleMaterial` 的 `vertexShader` 中加入自轉角度參數 `uRotationAngle`。
  2. 在頂點著色器中，以 `float angle = uRotationAngle * (1.0 - uProgress);` 計算當前旋轉弧度。此公式巧妙地讓旋轉力道隨 `uProgress` 從 0.0 到 1.0 的遞增而漸變消退。
  3. 利用該角度對頂點的 X、Z 座標進行旋轉變換（繞 Y 軸自轉）。這樣既實現了玫瑰花立體自轉，又保證了最終融合後的 LOGO 呈現完全靜止的優雅排版。

### 第八階段：三維模型頂點空間變換（Orientation Fix）
- **問題**：GLTF 玫瑰模型載入後在視角中呈橫躺（Horizontal）狀態，而非自然的直立（花朵朝上、莖在下、自轉）狀態。手動添加額外的 X 軸與 Z 軸旋轉皆造成方向混亂。
- **根本原因**：從 Sketchfab 下載的 GLTF 模型在 scene graph 中已將 `Z-up` 轉 `Y-up` 的變換矩陣寫在根節點（如 `Sketchfab_model`）的 `matrixWorld` 中。在遍歷 Mesh 頂點時，已執行 `v.applyMatrix4(child.matrixWorld)`，此時頂點已是直立狀態。原程式碼在其後又手動套用了重複的 X 軸 -90° 與 Z 軸 -90° 旋轉，反而把正確直立的模型「再次放倒」了。
- **技術實現**：
  1. **移除手動旋轉**：移除所有手動頂點旋轉代碼，完全信賴 `applyMatrix4` 與矩陣世界變換。
  2. **診斷驗證**：在頂點提取完成後，利用 `Box3` 計算最終頂點的 bounding box 尺寸（例如 BBox extents — X: 0.18, Y: 0.17, Z: 0.22），並輸出至 Console 進行驗證，確保 Y 軸為正確的立體高度軸。

### 第九階段：快取防護機制（Cache Busting）
- **問題**：由於前端網頁的指令碼變更頻繁，瀏覽器常因強烈快取 (Strong Cache) 而加載舊版 `gpgpu.js` 或 `main.js`，導致開發者與用戶看到錯誤的橫躺效果。
- **技術實現**：在所有 JS、HTML 引入的關聯檔案中（如 `index.html`, `main.js`, `io.js` 等），為檔案載入路徑統一加上手動版號 `?v=YYYYMMDD_vN`（例如 `?v=20260620_v8`），確保每次更新後皆能強制瀏覽器讀取最新代碼。

### 第十階段：婚禮專屬特效分支 (feature/wedding-logo-only)
- **需求**：用戶需要在婚禮現場空檔播放，要求畫面與操作極簡化，移除所有不必要的介面與力場特效，只需保留「白玫瑰自轉」與「LOGO 靜止顯示」兩種狀態，並能讓主持人一鍵無縫切換。
- **技術實現**：
  1. **介面極簡化與 GSAP 自動轉場**：大幅刪減 VJ 控制面板，鎖定最佳參數（如 LOGO 顯示比例預設 15%、玫瑰預設 1.2 等）。透過 GSAP 自動轉場取代手動拉桿，實現一鍵漸變。
  2. **專屬靜態星空與星座圖案**：在背景加入了緩慢漂浮的星辰，並在畫面左側與右側以粒子構成「水瓶座」與「獅子座」的連線星圖。
  3. **真實大氣擾動閃爍 (Scintillation)**：捨棄了單純 Sine wave 的廉價霓虹燈閃爍法，改在 Fragment Shader 中利用粒子空間座標生成亂數種子 (Seed)。這讓主要恆星保持穩定恆亮，而非主要星星則會錯開時間、隨機發出銳利短暫的閃光，完美模擬真實觀星體驗。
  4. **自適應 Bounding Box 擴充**：因星座位置較靠兩側（如 X=-12），在狹窄螢幕上容易被攝影機裁切。系統重新計算並將所有星座座標納入 Bounding Box 的擴張範圍中，讓攝影機的 Frustum Fitting 能正確自動拉遠，確保任何螢幕下都不會裁切到兩側星座。

### 第十一階段：正式上線前穩定化 (Production Hardening, 2026-07-04)
- **需求**：移除星座、移除控制面板改用快捷鍵（空白鍵切換、F 全螢幕）、修正切換故障與轉場迴轉 bug、鎖定新參數（玫瑰 pointSize 2.0 / 密度 5）。
- **切換故障根因與修正**：
  1. **黑屏閃爍**：舊版 `initGPGPU` 開頭即拆除舊粒子再非同步重載 GLTF（0.5~2 秒空窗）。改為「旁路建置 + 原子交換」：新資源全部就緒後才 `disposeCurrent()` 換入，畫面零中斷。
  2. **並發重建孤兒 mesh**：快速連按時兩個非同步重建都會 `scene.add`，前者永久殘留（疊影）。以 `buildCounter` 作廢過期建置，並在 `io.js` 以 `isBusy` 鎖將「重建 + 轉場」全程序列化。
  3. **VRAM 洩漏**：`GPUComputationRenderer` 的 render targets（每次約 16MB）從未釋放，整晚切換會累積至崩潰。`disposeCurrent()` 現在明確 dispose 所有 renderTargets、材質與 DataTextures。
  4. **deltaTime 無上限**：分頁切換/螢幕休眠喚醒後 `lerp` 插值量超過 1 造成閃跳。`main.js` clamp dt ≤ 0.05、`updateIO` clamp 插值量 ≤ 1。
  5. **初始建置密度不一致**：舊版首次載入走 density 1（240k），切換一輪後玫瑰變成 density 4（60k），外觀前後不一致。現在初始建置即採用鎖定的玫瑰參數。
- **轉場迴轉 bug（確認為 bug）**：舊版 `uRotationAngle = time * 0.15`（開頁起無限累積），shader 以 `angle × (1 - uProgress)` 歸零 —— 轉場會把開頁至今的總角度全部倒轉（開頁 10 分鐘 ≈ 14 圈）。改為 CPU 累積角度（隨 uProgress 自然減速），切換前先正規化至 -π~π 並由 GSAP 同步收斂至 0，最多只回轉半圈；同時啟用轉場中段流體亂流（`middleBump` 保證靜止時零擾動），達成流體流動式切換。
- **等亮度密度切換**：密度重建瞬間以 `size × √(fromCount/toCount)` 換算 pointSize，Additive Blending 下亮度不跳動。
- **素材快取**：GLTF 頂點與 LOGO ImageData 首次載入後快取，之後切換零網路請求、重建僅需 CPU 重組。
- **其他**：pixelRatio 上限 2；星點座標池固定（重建不重洗背景星空）；`frustumCulled = false` 回歸；移除 HUD 文字與所有面板 UI；快取版號 `?v=20260704_wedding_v5`；`window.__vfx` 提供現場救援用除錯掛鉤。

## 待優化項目 (TODOs)
- 未來可考慮實作粒子顏色漸變 (根據速度或存活時間)。
- 優化手機版效能 (可考慮加入自動偵測 FPS 降低渲染數量的機制)。
