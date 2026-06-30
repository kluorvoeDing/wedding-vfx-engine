# VFX Engine (Wedding Special Edition)

基於 Three.js 與 GPGPU (General-Purpose computing on Graphics Processing Units) 技術打造的頂級粒子視覺特效引擎。此版本為 **婚禮專屬特製分支 (feature/wedding-logo-only)**，專為婚禮現場與主持人切換操作設計。

## 核心技術特色
- **百萬級粒子運算**：使用 GPGPU 技術，將百萬顆粒子的物理運算完全卸載至顯卡，實現穩定的 60+ FPS。
- **雙紋理映射 (Dual Texture Mapping)**：同時在 GPU 記憶體中儲存兩組頂點座標 (原始 3D 玫瑰模型與目標 2D LOGO)，實現粒子在不同空間形態間的完美形變 (Morphing)。
- **真實大氣擾動閃爍 (Scintillation)**：背景粒子與自訂星座 (水瓶座、獅子座) 採用基於空間座標亂數種子的 Shader 算法，模擬真實觀星時星星錯開、隨機發出短暫銳利閃爍的視覺體驗。
- **即時全域矩陣縮放 (Global Scale Matrix)**：透過 Vertex Shader 即時運算全域縮放，並結合自轉算法，達成玫瑰緩慢自轉與 LOGO 靜態顯示的平滑切換。

## 操作模式 (Wedding Mode)
為簡化婚禮現場操作，移除了多餘的力場與混亂的特效，僅保留兩種主要互動狀態：
1. **白玫瑰待機狀態**：適合於婚禮空檔時間無限期播放，粒子構成的白玫瑰會緩慢自轉，背景伴隨閃爍的星座與星空。
2. **LOGO 進場狀態**：配合主持人進場 cue 點，一鍵點擊後，所有粒子將自動停止旋轉，並透過 GSAP 平滑變形重組為新人的婚禮 LOGO。

## 如何啟動
本專案為純前端架構 (HTML/CSS/JS)，無需複雜的 Node.js 編譯。
推薦使用 Python 本機伺服器啟動：
`python3 -m http.server 57832`
隨後在瀏覽器開啟對應的網址即可體驗。
