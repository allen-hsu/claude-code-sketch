# sketch

[English](README.md) | 繁體中文

**讓 Claude Code 用圖回答，不再是一大段文字。**

`sketch` 是一個 Claude Code mod（plugin）。它給 Claude 17 種繪圖工具，外加一條固定的指示：答案有形狀的時候，就把形狀畫出來。架構、流程、路線圖、使用者旅程、線框圖、圖表，都會以卡片的形式直接出現在終端機的對話裡，顏色跟著你的主題走。

![分層架構卡片](docs/images/zh-TW/layers.png)

## 安裝

在 Claude Code 終端機的提示列輸入：

```
/plugin install sketch --marketplace allen-hsu/claude-code-sketch
```

出現詢問時按 `y` 加入 marketplace，再選擇範圍（選 user 範圍，之後每個 session 都會載入）。

從 shell 安裝：

```
claude plugin install sketch --marketplace allen-hsu/claude-code-sketch
```

桌面版無法執行 `/plugin`：點提示框旁的 **+**，選 **Plugins**，用 `allen-hsu/claude-code-sketch` 執行 **Add marketplace**，再 **Add plugin**。

裝好後照平常問就好：「這個服務是怎麼組成的？」「比較這三個方案」「規劃下一季」。要畫哪種卡片由 Claude 決定。

## 有哪些卡片

| 工具 | 畫什麼 | 適合用在 |
| --- | --- | --- |
| `layers` | 一層一層的元件、可巢狀的分區、橫跨各層的面向 | 技術堆疊、平台地圖、部署拓撲 |
| `diagram` | 節點與連線，自動排版 | 架構連線、流程圖、狀態機、邊界（C4）、相依關係 |
| `schema` | 帶欄位的方塊與彼此的關係 | 資料模型（ER）、類別圖與元件圖 |
| `swimlane` | 依角色或系統分道的步驟 | 有交接的流程 |
| `pipeline` | 由左到右的階段，每個階段一欄工作 | CI/CD、ETL、資料流 |
| `gitgraph` | 分支、提交、合併與標籤 | 分支策略、發版流程 |
| `sequence` | 參與者與彼此之間的訊息 | 請求流程、協定、交接 |
| `tree` | 大綱或心智圖 | 目標拆解、網站地圖、分類 |
| `timeline` | 跨時段的長條與里程碑 | 路線圖、甘特圖、讀書計畫 |
| `board` | 一欄一欄的卡片 | 看板、現在／接下來／以後 |
| `quadrant` | 兩個軸上的點，或四個清單 | 優先順序、定位、SWOT |
| `journey` | 階段、情緒曲線、多列筆記 | 使用者旅程、服務藍圖 |
| `wireframe` | 低擬真的畫面草圖 | 網頁與 App 版面 |
| `metrics` | 數字方塊與走勢 | KPI、實驗結果 |
| `chart` | 長條、直條、堆疊、折線、散佈、熱力圖、直方圖、漏斗、佔比 | 任何你手上已有的數字 |
| `cards` | 帶標籤與引言的資訊卡 | 人物誌、研究發現、設計原則 |
| `compare` | 並排的選項，加上選擇對話框 | 在二到四個方案之間做決定 |

以下卡片都是用 [`preview/samples.zh-TW.ts`](preview/samples.zh-TW.ts) 裡的虛構資料畫的。

## 架構與結構

`layers` 呈現系統由什麼組成。`diagram` 呈現它們怎麼連接：從同一個節點出發的線會合併成一束，並使用該節點的顏色；迴圈會以向上的箭頭表示；節點的形狀代表它的角色（判斷、儲存、外部系統）。

![系統連線](docs/images/zh-TW/diagram.png)

| 流程圖 | 相依關係 |
| --- | --- |
| ![含判斷的流程圖](docs/images/zh-TW/diagram-flow-1.png) | ![相依圖](docs/images/zh-TW/diagram-flow-2.png) |

相依關係太密、線畫不清楚時，用 `layout: "matrix"` 改畫成矩陣，並附上統計：

![相依矩陣](docs/images/zh-TW/diagram-flow-matrix.png)

用 `layout: "zones"` 時，每個群組會變成一個有框線的區塊：子系統、網路邊界、C4 容器圖都能畫。`person` 形狀代表使用者或角色。

![分區與邊界](docs/images/zh-TW/diagram-zones.png)

節點連回自己的線會畫成節點裡的迴圈，所以狀態機也是一種連線圖：

![狀態機](docs/images/zh-TW/diagram-state.png)

`layers` 的分區裡可以再放分區，可以用來畫部署拓撲（區域、可用區、子網）：

![部署拓撲](docs/images/zh-TW/layers-topology.png)

`schema` 畫出資料表或類別和它們的欄位，以及彼此的關係：

| 資料模型（ER） | 類別圖 |
| --- | --- |
| ![ER 圖](docs/images/zh-TW/schema-er.png) | ![類別圖](docs/images/zh-TW/schema-class.png) |

`swimlane` 把流程的每一步放在負責者的泳道裡；`pipeline` 把階段由左到右排開；`gitgraph` 呈現分支隨時間的變化：

![泳道圖](docs/images/zh-TW/swimlane.png)

![管線圖](docs/images/zh-TW/pipeline.png)

![分支圖](docs/images/zh-TW/gitgraph.png)

![時序圖](docs/images/zh-TW/sequence.png)

| 大綱 | 心智圖 |
| --- | --- |
| ![樹狀圖](docs/images/zh-TW/tree.png) | ![心智圖](docs/images/zh-TW/tree-mind.png) |

## 產品與規劃

![路線圖](docs/images/zh-TW/timeline.png)

![看板](docs/images/zh-TW/board.png)

![兩軸優先順序](docs/images/zh-TW/quadrant-1.png)

![SWOT](docs/images/zh-TW/quadrant-2.png)

`compare` 畫出選項後，會在卡片下方開一個對話框，用方向鍵選擇；Claude 會照你選的繼續做。

![選項比較](docs/images/zh-TW/compare.png)

## 設計與研究

![使用者旅程](docs/images/zh-TW/journey.png)

![線框圖](docs/images/zh-TW/wireframe-1.png)

![手機線框圖](docs/images/zh-TW/wireframe-2.png)

![研究發現與人物誌](docs/images/zh-TW/cards.png)

## 數字

![指標方塊](docs/images/zh-TW/metrics.png)

![折線圖](docs/images/zh-TW/chart-line.png)

![含趨勢線的散佈圖](docs/images/zh-TW/chart-scatter.png)

![長條圖](docs/images/zh-TW/chart-bar.png)

![直條圖](docs/images/zh-TW/chart-column.png)

![堆疊長條](docs/images/zh-TW/chart-stacked.png)

![直方圖](docs/images/zh-TW/chart-histogram.png)

![漏斗](docs/images/zh-TW/chart-funnel.png)

![熱力圖](docs/images/zh-TW/chart-heatmap.png)

![佔比](docs/images/zh-TW/chart-share.png)

## 運作方式

整個 mod 只有一個 hooks 模組：[`hooks/register.tsx`](hooks/register.tsx)。

- session 開始時註冊 17 個工具。每個工具吃的都是單純的結構化輸入（節點與連線、時段與項目、標籤與數列）。
- 一個 `ui.render` hook 把每次工具呼叫在對話裡的那一列換成卡片，內容直接取自該次呼叫的輸入。mod 不保存任何狀態。
- 一個 `prompt.compose` hook 在系統提示裡加一小段，告訴 Claude 什麼情況用哪種卡片，並把卡片周圍的文字寫短。
- 圖表、指標、時間軸、旅程圖在呼叫進行時會播放約半秒的進場動畫。
- 按 `ctrl+o` 可以看到卡片背後原始的工具呼叫。

需要知道的事：

- 在載入這個 mod 的 session 裡，工具定義和那段提示會跟著每次請求送出，大約多 5 千個 token（這是估計值，不是量測值）。
- 卡片的寬度在繪製當下依終端機寬度決定。低於約 60 欄時，較寬的卡片會顯得擁擠。
- 全形字元（中文、日文、韓文）以兩格寬計算。如果你的終端機把 `●` 這類寬度不明確的符號畫成兩格寬，部分卡片會對不齊。
- 在 Claude Code 2.1.325 的終端機上開發與試用。卡片只用到每個介面都有的 `Box` 和 `Text`，但桌面版與手機版尚未測試。

## 關於這些圖片

這份說明裡的圖片不是視窗截圖，而是由 [`preview/`](preview) 裡的腳本產生的：`render.ts` 用一個替身引擎和它自己的簡易版面配置，執行 mod 真正的 hooks；`paint.py` 再用預設深色主題的顏色把結果畫成圖片。你終端機裡的版面來自 Claude Code 自己的引擎和你的主題，所以間距和顏色可能略有不同。

重新產生圖片（macOS，需要 [Bun](https://bun.sh) 和裝有 Pillow 的 Python）：

```
cd preview
bun --jsx-factory=h --jsx-fragment=Fragment --jsx-runtime=classic render.ts ../hooks/register.tsx 110 cards.json ./samples.zh-TW.ts
python3 paint.py cards.json ../docs/images/zh-TW
```

英文版請改用 `samples.en.ts` 和 `docs/images/en`。

## 開發

```
claude --plugin-dir .        # 從這個資料夾載入 mod 開一個 session
claude plugin validate .     # 檢查 manifest 和 hooks 模組
```

用 `--plugin-dir` 開的 session 裡，修改 `hooks/register.tsx` 會自動重新載入。

## 授權

MIT
