# VFX Engine (Wedding Special Edition)

基於 Three.js 與 GPGPU (General-Purpose computing on Graphics Processing Units) 技術打造的頂級粒子視覺特效引擎。此版本為 **婚禮專屬特製分支 (feature/wedding-logo-only)**，專為婚禮現場與主持人切換操作設計。

## 核心技術特色
- **百萬級粒子運算**：使用 GPGPU 技術，將百萬顆粒子的物理運算完全卸載至顯卡，實現穩定的 60+ FPS。
- **雙紋理映射 (Dual Texture Mapping)**：同時在 GPU 記憶體中儲存兩組頂點座標 (原始 3D 玫瑰模型與目標 2D LOGO)，實現粒子在不同空間形態間的完美形變 (Morphing)。
- **流體轉場 (Fluid Morph)**：形變過程中注入 Curl Noise 流體亂流（僅於轉場中段作用，靜止時完全無擾動），粒子以流動方式在玫瑰與 LOGO 之間往返。
- **常駐雙模擬系統 (Dual Persistent Sims)**：啟動時同時建好「玫瑰待機（低密度）」與「形變表演（高密度）」兩套 GPGPU 模擬，切換僅改變顯示對象——零重建、零上傳、零 shader 編譯。待機時只計算顯示中的那套，GPU 負擔約為同時計算的 1/5.5。
- **無鎖可中斷狀態機 (Interruptible State Machine)**：切換是由臨界阻尼平滑驅動的連續動畫，不使用 promise／忙碌鎖／tween。按鍵只改變目標值，因此連按或轉場中途反轉都必定即時生效，架構上不存在可以卡住按鍵的東西。

## 操作方式 (Wedding Mode)
畫面無任何控制面板，全由鍵盤快捷鍵操作：

| 按鍵 | 功能 |
|------|------|
| `空白鍵` | 玫瑰 ⇄ LOGO 一鍵切換（約 1.2 秒流體轉場，可隨時中途反轉，連按不漏鍵） |
| `F` | 進入 / 離開全螢幕 |

系統預設每 **5 分鐘**自動在玫瑰與 LOGO 之間輪播切換；手動切換後會重新計時 5 分鐘。可在 `playbackSettings.js` 調整開關與間隔。

兩種狀態（參數已鎖定最佳值）：
1. **白玫瑰待機狀態**：適合於婚禮空檔時間無限期播放，純黑背景中僅有粒子構成的白玫瑰緩慢自轉。（scale 1.2 / pointSize 2.0 / 密度 5）
   閒置 5 分鐘會自動切換一次（手動按鍵會重置計時）。
2. **LOGO 進場狀態**：配合主持人進場 cue 點，按下空白鍵後粒子平滑停轉並重組為婚禮 LOGO 靜止呈現。（scale 0.46 / pointSize 0.55 / 密度 1）

## 如何啟動
本專案為純前端架構 (HTML/CSS/JS)，無需複雜的 Node.js 編譯。
推薦使用 Python 本機伺服器啟動：
`python3 -m http.server 57832`
隨後在瀏覽器開啟 `http://127.0.0.1:57832/` 即可體驗。

## 測試
```bash
node --test tests/*.mjs
```

## 離線算出影片（備援方案）
現場若不想依賴瀏覽器即時運算，可先算成 mp4 播放。算圖以固定 dt 逐幀驅動**正式程式碼**（非另寫一套），因此畫面與現場版完全一致，且不受機器效能影響（不會掉幀）。

以 DPR 2（3840×2160）算圖再降到 1080p，等同超取樣抗鋸齒，粒子細節比直接 1080p 算更細緻。

用到的鉤子（平時完全不影響執行）：
- `__vfx.stopLoop()` — 停用即時 rAF 迴圈
- `__vfx.renderFrame(dt, t)` — 以指定 dt 推進並算一幀
- `__vfx.cancelAutoRotate()` — 取消 5 分鐘自動輪播計時器

注意：GSAP 的鏡頭運鏡預設綁在 rAF 真實時間上，離線算圖時必須 `gsap.ticker.sleep()` 並改用 `gsap.updateRoot(影格時間)`，否則運鏡速度會隨算圖快慢而錯亂。

## 現場診斷
瀏覽器 DevTools console 可用 `__vfx` 掛鉤：
- `__vfx.toggleState()` — 鍵盤失效時手動切換
- `__vfx.getDesiredState()` / `__vfx.getActiveSim()` — 目前狀態
- `__vfx.simStats(__vfx.renderer)` — 兩套模擬的可見性與粒子實際座標範圍
