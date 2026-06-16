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

## 待優化項目 (TODOs)
- 未來可考慮實作粒子顏色漸變 (根據速度或存活時間)。
- 優化手機版效能 (可考慮加入自動偵測 FPS 降低渲染數量的機制)。
