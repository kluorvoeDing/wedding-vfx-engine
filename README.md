# VFX Engine (Wedding Special Edition)

基於 Three.js 與 GPGPU (General-Purpose computing on Graphics Processing Units) 技術打造的頂級粒子視覺特效引擎。此版本為 **婚禮專屬特製分支 (feature/wedding-logo-only)**，專為婚禮現場與主持人切換操作設計。

## 核心技術特色
- **百萬級粒子運算**：使用 GPGPU 技術，將百萬顆粒子的物理運算完全卸載至顯卡，實現穩定的 60+ FPS。
- **雙紋理映射 (Dual Texture Mapping)**：同時在 GPU 記憶體中儲存兩組頂點座標 (原始 3D 玫瑰模型與目標 2D LOGO)，實現粒子在不同空間形態間的完美形變 (Morphing)。
- **流體轉場 (Fluid Morph)**：形變過程中注入 Curl Noise 流體亂流（僅於轉場中段作用，靜止時完全無擾動），粒子以流動方式在玫瑰與 LOGO 之間往返。
- **常駐雙模擬系統 (Dual Persistent Sims)**：啟動時同時建好「玫瑰待機（低密度）」與「形變表演（高密度）」兩套 GPGPU 模擬並持續同步運行，切換僅改變顯示對象——零重建、零上傳、零 shader 編譯，按下即動（實測按鍵到可見動靜 ~50ms）。

## 操作方式 (Wedding Mode)
畫面無任何控制面板，全由鍵盤快捷鍵操作：

| 按鍵 | 功能 |
|------|------|
| `空白鍵` | 玫瑰 ⇄ LOGO 一鍵切換（2 秒流體轉場，轉場期間按鍵自動忽略） |
| `F` | 進入 / 離開全螢幕 |

兩種狀態（參數已鎖定最佳值）：
1. **白玫瑰待機狀態**：適合於婚禮空檔時間無限期播放，純黑背景中僅有粒子構成的白玫瑰緩慢自轉。（scale 1.2 / pointSize 2.0 / 密度 5）
2. **LOGO 進場狀態**：配合主持人進場 cue 點，按下空白鍵後粒子平滑停轉並重組為婚禮 LOGO 靜止呈現。（scale 0.46 / pointSize 0.55 / 密度 1）

## 如何啟動
本專案為純前端架構 (HTML/CSS/JS)，無需複雜的 Node.js 編譯。
推薦使用 Python 本機伺服器啟動：
`python3 -m http.server 57832`
隨後在瀏覽器開啟 `http://127.0.0.1:57832/` 即可體驗。

## 測試
`node --test tests/config.test.mjs`
