# VFX Engine (Generative Art Engine)

基於 Three.js 與 GPGPU (General-Purpose computing on Graphics Processing Units) 技術打造的頂級粒子視覺特效引擎。專為現場 VJ、婚禮互動、以及沉浸式體驗設計。

## 核心技術特色
- **百萬級粒子運算**：使用 GPGPU 技術，將百萬顆粒子的物理運算完全卸載至顯卡，實現穩定的 60+ FPS。
- **雙紋理映射 (Dual Texture Mapping)**：同時在 GPU 記憶體中儲存兩組頂點座標 (原始 3D 模型與目標 2D 圖片)，實現粒子在不同空間形態間的完美形變 (Morphing)。
- **粒子增殖算法 (Particle Jitter Upsampling)**：當載入解析度較低的去背圖片 (如 LOGO) 時，系統會自動透過高頻亂數偏移生成額外粒子，確保任何極細微的字體都能以至少 70,000 顆發光粒子呈現飽滿細節。
- **即時全域矩陣縮放 (Global Scale Matrix)**：透過 Vertex Shader 即時運算全域縮放，無需重新遍歷粒子即可滑順改變視覺佔比。
- **聲音驅動 (Audio Reactivity)**：擷取麥克風音訊頻率，即時影響粒子速度與擴散力場。
- **手勢控制 (MediaPipe Hand Tracking)**：支援透過視訊鏡頭捕捉手勢，隔空揮動即可產生亂流干擾粒子流向。

## 視覺力場模式 (Vector Fields)
1. 平靜捲曲 (Curl Noise)
2. 中心爆發 (Reverse Growth)
3. 狂暴龍捲風 (Polar Fluid)
4. 空間碎裂 (Topology Fracture)
5. 螺旋星系 (Spiral Galaxy)
6. 數位流星雨 (Meteor Shower)
7. LOGO 形變 (Logo Morph) - 獨家：先向外極度爆發再逆向收束重組
8. 飛灰消散 (Ash Disintegration) - 獨家：高頻空間亂流撕裂與四面八方消散
9. 螢火蟲群聚 (Firefly Swarm)

## 如何啟動
本專案為純前端架構 (HTML/CSS/JS)，無需複雜的 Node.js 編譯。
推薦使用 VS Code 的 **Live Server** 擴充功能直接開啟 `index.html`，即可在瀏覽器 (預設 http://localhost:5500) 中體驗。
