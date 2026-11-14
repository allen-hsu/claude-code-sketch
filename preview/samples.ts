// Made-up inputs, one or more per tool: the cards in docs/images are drawn from these.
export const samples: Record<string, any[]> = {
  diagram: [
    {
      title: '示範：電商下單架構',
      nodes: [
        { id: 'web', label: 'Web App', note: 'Next.js', group: '前端' },
        { id: 'app', label: '手機 App', note: 'React Native', group: '前端' },
        { id: 'gw', label: 'API Gateway', note: '驗證、限流', group: '入口' },
        { id: 'order', label: '訂單服務', group: '服務' },
        { id: 'pay', label: '金流服務', group: '服務' },
        { id: 'stock', label: '庫存服務', group: '服務' },
        { id: 'mq', label: '訊息佇列', note: 'Kafka', group: '資料', shape: 'store' },
        { id: 'db', label: 'Postgres', group: '資料', shape: 'store' },
        { id: 'cache', label: 'Redis', group: '資料', shape: 'store' },
        { id: 'notify', label: '通知服務', group: '服務' },
      ],
      edges: [
        { from: 'web', to: 'gw', label: 'HTTPS' },
        { from: 'app', to: 'gw' },
        { from: 'gw', to: 'order' },
        { from: 'gw', to: 'stock' },
        { from: 'order', to: 'pay', label: '扣款' },
        { from: 'order', to: 'db' },
        { from: 'order', to: 'mq', label: '事件' },
        { from: 'stock', to: 'cache' },
        { from: 'stock', to: 'db' },
        { from: 'mq', to: 'notify' },
        { from: 'pay', to: 'mq' },
        { from: 'gw', to: 'cache', label: 'session' },
        { from: 'notify', to: 'app', label: '推播' },
      ],
      notes: ['金流失敗時訂單要能回滾'],
    },
  ],
  sequence: [
    {
      title: '示範：登入流程',
      actors: ['使用者', 'App', 'Auth 服務', '資料庫'],
      messages: [
        { from: '使用者', to: 'App', label: '輸入帳密' },
        { from: 'App', to: 'Auth 服務', label: 'POST /login' },
        { from: 'Auth 服務', to: '資料庫', label: '查使用者' },
        { from: '資料庫', to: 'Auth 服務', label: '雜湊密碼', isReply: true },
        { from: 'Auth 服務', to: 'Auth 服務', label: '比對' },
        { from: 'Auth 服務', to: 'App', label: 'JWT', isReply: true },
        { from: 'App', to: '使用者', label: '進入首頁', isReply: true },
      ],
    },
  ],
  tree: [
    {
      title: '示範：Q3 目標拆解',
      root: {
        label: '提升留存率',
        children: [
          { label: '新手引導', note: '完成率 60% → 80%', children: [{ label: '縮短註冊步驟' }, { label: '首日任務' }] },
          { label: '回訪誘因', children: [{ label: '每週摘要信' }, { label: '推播個人化', note: '需資料組支援' }] },
          { label: '流失預警', children: [{ label: '流失模型' }] },
        ],
      },
    },
  ],
  timeline: [
    {
      title: '示範：產品路線圖',
      periods: ['1月', '2月', '3月', '4月', '5月', '6月'],
      items: [
        { name: '使用者訪談', from: '1月', to: '1月', status: 'done', group: '研究' },
        { name: '原型測試', from: '2月', to: '2月', status: 'done', group: '研究' },
        { name: '設計系統', from: '2月', to: '3月', status: 'doing', group: '設計' },
        { name: '結帳改版', from: '3月', to: '5月', status: 'doing', group: '開發' },
        { name: '推薦引擎', from: '4月', to: '6月', status: 'todo', group: '開發' },
        { name: '金流遷移', from: '5月', to: '6月', status: 'risk', group: '開發' },
      ],
      milestones: [{ name: 'Beta', at: '4月' }, { name: '正式上線', at: '6月' }],
      labels: { done: '完成', doing: '進行中', todo: '未開始', risk: '有風險' },
    },
  ],
  board: [
    {
      title: '示範：本週看板',
      columns: [
        { name: '待辦', cards: [{ title: '修正結帳頁錯誤訊息', meta: 'Amy · S' }, { title: '訪談 5 位流失用戶', meta: 'Ken · M' }] },
        { name: '進行中', cards: [{ title: '設計系統：按鈕元件', meta: 'Lia · M' }] },
        { name: '審查中', cards: [{ title: '推播排程 API', meta: 'Bo · L' }] },
        { name: '完成', cards: [{ title: '首頁載入時間優化', meta: 'Amy · M' }, { title: '競品分析報告', meta: 'Ken · S' }] },
      ],
    },
  ],
  quadrant: [
    {
      title: '示範：功能優先順序',
      xLow: '省力', xHigh: '費力', yLow: '影響小', yHigh: '影響大',
      areas: [{ name: '馬上做' }, { name: '大型專案' }, { name: '有空再做' }, { name: '別做' }],
      items: [
        { name: '一鍵重購', x: 0.2, y: 0.85 },
        { name: '推薦引擎', x: 0.8, y: 0.9 },
        { name: '深色模式', x: 0.3, y: 0.3 },
        { name: '多語系', x: 0.75, y: 0.4 },
        { name: '搜尋建議', x: 0.4, y: 0.7 },
      ],
    },
    {
      title: '示範：SWOT',
      areas: [
        { name: '優勢', points: ['回購率高', '客服口碑好'] },
        { name: '劣勢', points: ['App 載入慢', '品項少'] },
        { name: '機會', points: ['東南亞市場', '訂閱制'] },
        { name: '威脅', points: ['大平台補貼', '物流成本上升'] },
      ],
    },
  ],
  journey: [
    {
      title: '示範：第一次下單的旅程',
      who: '小美，28 歲，上班族，第一次用這個 App',
      moodLabel: '情緒',
      stages: [
        { name: '發現', mood: 4 }, { name: '註冊', mood: 2 }, { name: '瀏覽', mood: 4 }, { name: '結帳', mood: 1 }, { name: '收貨', mood: 5 },
      ],
      rows: [
        { name: '行動', cells: ['看到朋友分享', '填寫 8 個欄位', '逛推薦商品', '找不到優惠碼欄位', '隔天收到包裹'] },
        { name: '痛點', tone: 'bad', cells: ['', '步驟太多', '', '運費到最後才顯示', ''] },
        { name: '機會', tone: 'good', cells: ['分享頁加優惠', '改用社群登入', '', '提前顯示運費', '邀請評價'] },
      ],
    },
  ],
  wireframe: [
    {
      title: '示範：商品頁線框圖',
      screen: {
        type: 'column',
        children: [
          { kind: 'nav', label: 'Logo | 首頁 | 分類 | 購物車' },
          {
            type: 'row',
            children: [
              { kind: 'image', label: '商品圖', size: 2, lines: 6 },
              {
                type: 'column', size: 1.5,
                children: [
                  { kind: 'heading', label: '商品名稱' },
                  { kind: 'text', lines: 3 },
                  { kind: 'input', label: '數量' },
                  { kind: 'button', label: '加入購物車' },
                ],
              },
            ],
          },
          { kind: 'list', label: '顧客評價', lines: 3 },
        ],
      },
    },
    {
      title: '示範：登入頁（手機）',
      device: 'mobile',
      screen: { children: [{ kind: 'heading', label: '登入' }, { kind: 'input', label: 'Email' }, { kind: 'input', label: '密碼' }, { kind: 'button', label: '登入' }] },
    },
  ],
  metrics: [
    {
      title: '示範：本週指標',
      tiles: [
        { label: '週活躍用戶', value: '12.4k', delta: '▲ 8% 比上週', tone: 'good', series: [9, 9.5, 10, 10.2, 11, 11.5, 12.4] },
        { label: '轉換率', value: '3.1%', delta: '▼ 0.4pt', tone: 'bad', series: [3.6, 3.5, 3.5, 3.4, 3.2, 3.3, 3.1] },
        { label: '平均客單價', value: 'NT$ 860', delta: '持平', series: [850, 870, 855, 860, 865, 858, 860] },
        { label: 'NPS', value: '42', delta: '▲ 5', tone: 'good', note: 'n=318' },
      ],
    },
  ],
  chart: [
    { kind: 'bar', title: '示範：各渠道註冊數', labels: ['自然搜尋', '社群廣告', '朋友推薦', 'Email'], series: [{ name: '註冊', values: [4200, 3100, 1800, 950] }] },
    { kind: 'column', title: '示範：每月營收', unit: '萬', labels: ['1月', '2月', '3月', '4月', '5月', '6月'], series: [{ name: '營收', values: [120, 135, 128, 160, 172, 190] }] },
    { kind: 'stacked', title: '示範：各季工時分配', labels: ['Q1', 'Q2', 'Q3'], series: [{ name: '開發', values: [50, 60, 55] }, { name: '設計', values: [20, 15, 25] }, { name: '研究', values: [10, 20, 15] }] },
    { kind: 'line', title: '示範：留存曲線', unit: '%', labels: ['D0', 'D1', 'D3', 'D7', 'D14', 'D30'], series: [{ name: '新版', values: [100, 62, 48, 40, 35, 31] }, { name: '舊版', values: [100, 55, 39, 30, 24, 19] }] },
    { kind: 'scatter', title: '示範：使用時長 vs 滿意度', xLabel: '每週使用分鐘', yLabel: '滿意度', points: Array.from({ length: 40 }, (_, i) => ({ x: 10 + ((i * 37) % 200), y: 2 + ((i * 37) % 200) / 80 + ((i * 13) % 10) / 10 })) },
    { kind: 'heatmap', title: '示範：各時段活躍度', labels: ['一', '二', '三', '四', '五', '六', '日'], series: [{ name: '早上', values: [3, 4, 4, 5, 4, 2, 1] }, { name: '下午', values: [5, 6, 6, 7, 6, 4, 3] }, { name: '晚上', values: [8, 8, 9, 9, 10, 7, 6] }] },
    { kind: 'histogram', title: '示範：回應時間分布', unit: 'ms', series: [{ name: 'ms', values: Array.from({ length: 200 }, (_, i) => 80 + ((i * 7919) % 97) + ((i * 104729) % 53) + (i % 17 === 0 ? 300 : 0)) }] },
    { kind: 'funnel', title: '示範：結帳漏斗', labels: ['瀏覽商品', '加入購物車', '進入結帳', '完成付款'], series: [{ name: '人數', values: [10000, 3200, 1500, 900] }] },
    { kind: 'share', title: '示範：流量來源佔比', labels: ['自然搜尋', '社群', '直接', '其他'], series: [{ name: 'visits', values: [45, 25, 20, 10] }] },
  ],
  cards: [
    {
      title: '示範：研究發現',
      cards: [
        { title: '運費是最大流失點', subtitle: '5 位受訪者中 4 位提到', tags: ['結帳', '高優先'], lines: ['到最後一步才看到運費', '覺得被騙'], quote: '我都填完地址了才跟我說要加 80 塊', tone: 'bad' },
        { title: '推薦很準', subtitle: '5 位中 3 位主動稱讚', tags: ['首頁'], lines: ['會點推薦商品', '希望能收藏'], quote: '它好像知道我要買什麼', tone: 'good' },
        { title: '人物誌：小美', subtitle: '28 歲，上班族', tags: ['主要客群'], lines: ['通勤時逛', '重視免運', '每月下單 2 次'] },
      ],
    },
  ],
  layers: [
    {
      title: '示範：電商平台分層架構',
      layers: [
        { name: '用戶端', items: ['Web', 'iOS App', 'Android App', '小程式'] },
        { name: '接入層', items: ['CDN', 'API Gateway', 'WAF'] },
        {
          name: '服務層',
          zones: [
            { name: '交易', items: ['訂單', '金流', '購物車'] },
            { name: '商品', items: ['商品目錄', '庫存', '搜尋'] },
            { name: '用戶', items: ['會員', '通知'] },
          ],
        },
        { name: '資料層', items: ['Postgres', 'Redis', 'Kafka', 'S3'] },
        { name: '基礎設施', items: ['Kubernetes', 'AWS'] },
      ],
      sides: [{ name: '安全', items: ['OAuth', '稽核'] }, { name: '維運', items: ['監控', '日誌', 'CI/CD'] }],
    },
  ],
  'diagram#flow': [
    {
      title: '示範：退款流程（流程圖形狀）',
      nodes: [
        { id: 's', label: '申請退款', shape: 'round' },
        { id: 'c', label: '7 天內？', shape: 'decision' },
        { id: 'a', label: '自動核准' },
        { id: 'm', label: '人工審核' },
        { id: 'ok', label: '審核通過？', shape: 'decision' },
        { id: 'pay', label: '金流商', shape: 'external' },
        { id: 'db', label: '退款紀錄', shape: 'store' },
        { id: 'x', label: '拒絕並通知', shape: 'round' },
        { id: 'e', label: '完成', shape: 'round' },
      ],
      edges: [
        { from: 's', to: 'c' }, { from: 'c', to: 'a', label: '是' }, { from: 'c', to: 'm', label: '否' },
        { from: 'm', to: 'ok' }, { from: 'ok', to: 'a', label: '是' }, { from: 'ok', to: 'x', label: '否' },
        { from: 'a', to: 'pay' }, { from: 'a', to: 'db' }, { from: 'pay', to: 'e' },
      ],
    },
    {
      title: '示範：模組相依矩陣',
      layout: 'matrix',
      nodes: ['ui', 'api', 'auth', 'orders', 'billing', 'db', 'utils'].map(id => ({ id, label: id })),
      edges: [
        ['ui', 'api'], ['ui', 'utils'], ['api', 'auth'], ['api', 'orders'], ['api', 'billing'], ['auth', 'db'], ['auth', 'utils'],
        ['orders', 'db'], ['orders', 'billing'], ['orders', 'utils'], ['billing', 'db'], ['billing', 'utils'], ['db', 'utils'],
      ].map(([from, to]) => ({ from, to })),
    },
    {
      title: '示範：模組相依圖',
      nodes: ['ui', 'api', 'auth', 'orders', 'billing', 'db', 'utils'].map(id => ({ id, label: id })),
      edges: [
        ['ui', 'api'], ['ui', 'utils'], ['api', 'auth'], ['api', 'orders'], ['api', 'billing'], ['auth', 'db'], ['auth', 'utils'],
        ['orders', 'db'], ['orders', 'billing'], ['orders', 'utils'], ['billing', 'db'], ['billing', 'utils'], ['db', 'utils'],
      ].map(([from, to]) => ({ from, to })),
    },
  ],
  'tree#mind': [
    {
      title: '示範：產品策略心智圖',
      layout: 'mindmap',
      root: {
        label: '提升留存率',
        children: [
          { label: '新手引導', note: '60%→80%', children: [{ label: '縮短註冊步驟' }, { label: '首日任務' }] },
          { label: '回訪誘因', children: [{ label: '每週摘要信' }, { label: '推播個人化' }, { label: '會員等級' }] },
          { label: '流失預警', children: [{ label: '流失模型' }] },
        ],
      },
    },
  ],
  compare: [
    {
      question: '示範：要用哪個資料庫？',
      isAsking: false,
      options: [
        { name: 'Postgres', summary: '關聯式，功能最全', pros: ['生態成熟', '支援 JSON'], cons: ['要自己管擴展'], effort: '設定約半天', isRecommended: true },
        { name: 'SQLite', summary: '單檔，零維運', pros: ['最簡單'], cons: ['多人寫入受限'], effort: '幾分鐘' },
        { name: 'MongoDB', summary: '文件式', pros: ['結構彈性'], cons: ['交易較弱', '查詢語法不同'], effort: '約半天' },
      ],
      verdict: '選 Postgres：之後要報表和交易，一開始就用它最省事。',
    },
  ],
}
