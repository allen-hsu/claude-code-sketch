// Made-up inputs, one or more per tool: the cards in docs/images/en are drawn from these.
export const samples: Record<string, any[]> = {
  diagram: [
    {
      title: 'Order architecture',
      nodes: [
        { id: 'web', label: 'Web App', note: 'Next.js', group: 'Clients' },
        { id: 'app', label: 'Mobile App', note: 'React Native', group: 'Clients' },
        { id: 'gw', label: 'API Gateway', note: 'auth, rate limit', group: 'Edge' },
        { id: 'order', label: 'Orders', group: 'Services' },
        { id: 'pay', label: 'Payments', group: 'Services' },
        { id: 'stock', label: 'Inventory', group: 'Services' },
        { id: 'mq', label: 'Event bus', note: 'Kafka', group: 'Data', shape: 'store' },
        { id: 'db', label: 'Postgres', group: 'Data', shape: 'store' },
        { id: 'cache', label: 'Redis', group: 'Data', shape: 'store' },
        { id: 'notify', label: 'Notifications', group: 'Services' },
      ],
      edges: [
        { from: 'web', to: 'gw', label: 'HTTPS' },
        { from: 'app', to: 'gw' },
        { from: 'gw', to: 'order' },
        { from: 'gw', to: 'stock' },
        { from: 'order', to: 'pay', label: 'charge' },
        { from: 'order', to: 'db' },
        { from: 'order', to: 'mq', label: 'events' },
        { from: 'stock', to: 'cache' },
        { from: 'stock', to: 'db' },
        { from: 'mq', to: 'notify' },
        { from: 'pay', to: 'mq' },
        { from: 'gw', to: 'cache', label: 'session' },
        { from: 'notify', to: 'app', label: 'push' },
      ],
      notes: ['An order must roll back when the charge fails'],
    },
  ],
  sequence: [
    {
      title: 'Sign-in flow',
      actors: ['User', 'App', 'Auth service', 'Database'],
      messages: [
        { from: 'User', to: 'App', label: 'enters password' },
        { from: 'App', to: 'Auth service', label: 'POST /login' },
        { from: 'Auth service', to: 'Database', label: 'find user' },
        { from: 'Database', to: 'Auth service', label: 'password hash', isReply: true },
        { from: 'Auth service', to: 'Auth service', label: 'compare' },
        { from: 'Auth service', to: 'App', label: 'JWT', isReply: true },
        { from: 'App', to: 'User', label: 'home screen', isReply: true },
      ],
    },
  ],
  tree: [
    {
      title: 'Q3 goal breakdown',
      root: {
        label: 'Raise retention',
        children: [
          { label: 'Onboarding', note: 'completion 60% → 80%', children: [{ label: 'Shorter sign-up' }, { label: 'First-day tasks' }] },
          { label: 'Reasons to return', children: [{ label: 'Weekly digest email' }, { label: 'Personalised push', note: 'needs the data team' }] },
          { label: 'Churn warning', children: [{ label: 'Churn model' }] },
        ],
      },
    },
  ],
  timeline: [
    {
      title: 'Product roadmap',
      periods: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
      items: [
        { name: 'User interviews', from: 'Jan', to: 'Jan', status: 'done', group: 'Research' },
        { name: 'Prototype tests', from: 'Feb', to: 'Feb', status: 'done', group: 'Research' },
        { name: 'Design system', from: 'Feb', to: 'Mar', status: 'doing', group: 'Design' },
        { name: 'Checkout redesign', from: 'Mar', to: 'May', status: 'doing', group: 'Engineering' },
        { name: 'Recommendations', from: 'Apr', to: 'Jun', status: 'todo', group: 'Engineering' },
        { name: 'Payment migration', from: 'May', to: 'Jun', status: 'risk', group: 'Engineering' },
      ],
      milestones: [{ name: 'Beta', at: 'Apr' }, { name: 'Launch', at: 'Jun' }],
    },
  ],
  board: [
    {
      title: 'This week',
      columns: [
        { name: 'To do', cards: [{ title: 'Fix checkout error message', meta: 'Amy · S' }, { title: 'Interview 5 churned users', meta: 'Ken · M' }] },
        { name: 'In progress', cards: [{ title: 'Design system: buttons', meta: 'Lia · M' }] },
        { name: 'In review', cards: [{ title: 'Push scheduling API', meta: 'Bo · L' }] },
        { name: 'Done', cards: [{ title: 'Faster home page load', meta: 'Amy · M' }, { title: 'Competitor report', meta: 'Ken · S' }] },
      ],
    },
  ],
  quadrant: [
    {
      title: 'Feature priorities',
      xLow: 'low effort', xHigh: 'high effort', yLow: 'low impact', yHigh: 'high impact',
      areas: [{ name: 'Do now' }, { name: 'Big bets' }, { name: 'Fill-ins' }, { name: 'Skip' }],
      items: [
        { name: 'One-tap reorder', x: 0.2, y: 0.85 },
        { name: 'Recommendations', x: 0.8, y: 0.9 },
        { name: 'Dark mode', x: 0.3, y: 0.3 },
        { name: 'Localisation', x: 0.75, y: 0.4 },
        { name: 'Search suggestions', x: 0.4, y: 0.7 },
      ],
    },
    {
      title: 'SWOT',
      areas: [
        { name: 'Strengths', points: ['High repeat purchase', 'Well-liked support'] },
        { name: 'Weaknesses', points: ['Slow app start', 'Small catalogue'] },
        { name: 'Opportunities', points: ['Southeast Asia', 'Subscriptions'] },
        { name: 'Threats', points: ['Subsidised rivals', 'Rising shipping cost'] },
      ],
    },
  ],
  journey: [
    {
      title: 'A first order',
      who: 'Mei, 28, office worker, using the app for the first time',
      moodLabel: 'Mood',
      stages: [
        { name: 'Discover', mood: 4 }, { name: 'Sign up', mood: 2 }, { name: 'Browse', mood: 4 }, { name: 'Checkout', mood: 1 }, { name: 'Delivery', mood: 5 },
      ],
      rows: [
        { name: 'Does', cells: ["Sees a friend's share", 'Fills in 8 fields', 'Browses picks', 'Hunts for the coupon box', 'Parcel arrives next day'] },
        { name: 'Pain', tone: 'bad', cells: ['', 'Too many steps', '', 'Shipping fee shown last', ''] },
        { name: 'Idea', tone: 'good', cells: ['Offer on share page', 'Social sign-in', '', 'Show shipping early', 'Ask for a review'] },
      ],
    },
  ],
  wireframe: [
    {
      title: 'Product page',
      screen: {
        type: 'column',
        children: [
          { kind: 'nav', label: 'Logo | Home | Categories | Cart' },
          {
            type: 'row',
            children: [
              { kind: 'image', label: 'product photo', size: 2, lines: 6 },
              {
                type: 'column', size: 1.5,
                children: [
                  { kind: 'heading', label: 'Product name' },
                  { kind: 'text', lines: 3 },
                  { kind: 'input', label: 'Quantity' },
                  { kind: 'button', label: 'Add to cart' },
                ],
              },
            ],
          },
          { kind: 'list', label: 'Customer reviews', lines: 3 },
        ],
      },
    },
    {
      title: 'Sign-in screen (mobile)',
      device: 'mobile',
      screen: { children: [{ kind: 'heading', label: 'Sign in' }, { kind: 'input', label: 'Email' }, { kind: 'input', label: 'Password' }, { kind: 'button', label: 'Sign in' }] },
    },
  ],
  metrics: [
    {
      title: 'This week',
      tiles: [
        { label: 'Weekly active users', value: '12.4k', delta: '▲ 8% vs last week', tone: 'good', series: [9, 9.5, 10, 10.2, 11, 11.5, 12.4] },
        { label: 'Conversion', value: '3.1%', delta: '▼ 0.4pt', tone: 'bad', series: [3.6, 3.5, 3.5, 3.4, 3.2, 3.3, 3.1] },
        { label: 'Average order', value: '$28.60', delta: 'flat', series: [850, 870, 855, 860, 865, 858, 860] },
        { label: 'NPS', value: '42', delta: '▲ 5', tone: 'good', note: 'n=318' },
      ],
    },
  ],
  chart: [
    { kind: 'bar', title: 'Sign-ups by channel', labels: ['Organic search', 'Social ads', 'Referral', 'Email'], series: [{ name: 'Sign-ups', values: [4200, 3100, 1800, 950] }] },
    { kind: 'column', title: 'Monthly revenue', unit: 'k', labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'], series: [{ name: 'Revenue', values: [120, 135, 128, 160, 172, 190] }] },
    { kind: 'stacked', title: 'Hours by quarter', labels: ['Q1', 'Q2', 'Q3'], series: [{ name: 'Engineering', values: [50, 60, 55] }, { name: 'Design', values: [20, 15, 25] }, { name: 'Research', values: [10, 20, 15] }] },
    { kind: 'line', title: 'Retention curve', unit: '%', labels: ['D0', 'D1', 'D3', 'D7', 'D14', 'D30'], series: [{ name: 'New version', values: [100, 62, 48, 40, 35, 31] }, { name: 'Old version', values: [100, 55, 39, 30, 24, 19] }] },
    { kind: 'scatter', title: 'Time in app vs satisfaction', xLabel: 'minutes per week', yLabel: 'satisfaction', points: Array.from({ length: 40 }, (_, i) => ({ x: 10 + ((i * 37) % 200), y: 2 + ((i * 37) % 200) / 80 + ((i * 13) % 10) / 10 })) },
    { kind: 'heatmap', title: 'Activity by time of day', labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], series: [{ name: 'Morning', values: [3, 4, 4, 5, 4, 2, 1] }, { name: 'Afternoon', values: [5, 6, 6, 7, 6, 4, 3] }, { name: 'Evening', values: [8, 8, 9, 9, 10, 7, 6] }] },
    { kind: 'histogram', title: 'Response time distribution', unit: 'ms', series: [{ name: 'ms', values: Array.from({ length: 200 }, (_, i) => 80 + ((i * 7919) % 97) + ((i * 104729) % 53) + (i % 17 === 0 ? 300 : 0)) }] },
    { kind: 'funnel', title: 'Checkout funnel', labels: ['Viewed product', 'Added to cart', 'Started checkout', 'Paid'], series: [{ name: 'People', values: [10000, 3200, 1500, 900] }] },
    { kind: 'share', title: 'Traffic sources', unit: '%', labels: ['Organic search', 'Social', 'Direct', 'Other'], series: [{ name: 'visits', values: [45, 25, 20, 10] }] },
  ],
  cards: [
    {
      title: 'Research findings',
      cards: [
        { title: 'Shipping fee is the top drop-off', subtitle: '4 of 5 participants raised it', tags: ['checkout', 'high priority'], lines: ['Fee appears at the last step', 'Feels like a trick'], quote: 'I had typed my whole address before it added the fee', tone: 'bad' },
        { title: 'Recommendations land well', subtitle: '3 of 5 praised them unprompted', tags: ['home'], lines: ['Taps recommended items', 'Wants to save them'], quote: 'It seems to know what I want', tone: 'good' },
        { title: 'Persona: Mei', subtitle: '28, office worker', tags: ['core segment'], lines: ['Browses on the commute', 'Cares about free shipping', 'Orders twice a month'] },
      ],
    },
  ],
  layers: [
    {
      title: 'E-commerce platform',
      layers: [
        { name: 'Clients', items: ['Web', 'iOS app', 'Android app', 'Mini program'] },
        { name: 'Edge', items: ['CDN', 'API Gateway', 'WAF'] },
        {
          name: 'Services',
          zones: [
            { name: 'Commerce', items: ['Orders', 'Payments', 'Cart'] },
            { name: 'Catalogue', items: ['Products', 'Inventory', 'Search'] },
            { name: 'Users', items: ['Accounts', 'Notifications'] },
          ],
        },
        { name: 'Data', items: ['Postgres', 'Redis', 'Kafka', 'S3'] },
        { name: 'Platform', items: ['Kubernetes', 'AWS'] },
      ],
      sides: [{ name: 'Security', items: ['OAuth', 'Audit'] }, { name: 'Ops', items: ['Monitoring', 'Logs', 'CI/CD'] }],
    },
  ],
  'diagram#flow': [
    {
      title: 'Refund flow',
      nodes: [
        { id: 's', label: 'Refund request', shape: 'round' },
        { id: 'c', label: 'Within 7 days?', shape: 'decision' },
        { id: 'a', label: 'Auto-approve' },
        { id: 'm', label: 'Manual review' },
        { id: 'ok', label: 'Approved?', shape: 'decision' },
        { id: 'pay', label: 'Payment provider', shape: 'external' },
        { id: 'db', label: 'Refund records', shape: 'store' },
        { id: 'x', label: 'Reject and notify', shape: 'round' },
        { id: 'e', label: 'Done', shape: 'round' },
      ],
      edges: [
        { from: 's', to: 'c' }, { from: 'c', to: 'a', label: 'yes' }, { from: 'c', to: 'm', label: 'no' },
        { from: 'm', to: 'ok' }, { from: 'ok', to: 'a', label: 'yes' }, { from: 'ok', to: 'x', label: 'no' },
        { from: 'a', to: 'pay' }, { from: 'a', to: 'db' }, { from: 'pay', to: 'e' },
      ],
    },
    {
      title: 'Module dependency matrix',
      layout: 'matrix',
      nodes: ['ui', 'api', 'auth', 'orders', 'billing', 'db', 'utils'].map(id => ({ id, label: id })),
      edges: [
        ['ui', 'api'], ['ui', 'utils'], ['api', 'auth'], ['api', 'orders'], ['api', 'billing'], ['auth', 'db'], ['auth', 'utils'],
        ['orders', 'db'], ['orders', 'billing'], ['orders', 'utils'], ['billing', 'db'], ['billing', 'utils'], ['db', 'utils'],
      ].map(([from, to]) => ({ from, to })),
    },
    {
      title: 'Module dependencies',
      nodes: ['ui', 'api', 'auth', 'orders', 'billing', 'db', 'utils'].map(id => ({ id, label: id })),
      edges: [
        ['ui', 'api'], ['ui', 'utils'], ['api', 'auth'], ['api', 'orders'], ['api', 'billing'], ['auth', 'db'], ['auth', 'utils'],
        ['orders', 'db'], ['orders', 'billing'], ['orders', 'utils'], ['billing', 'db'], ['billing', 'utils'], ['db', 'utils'],
      ].map(([from, to]) => ({ from, to })),
    },
  ],
  'tree#mind': [
    {
      title: 'Retention strategy',
      layout: 'mindmap',
      root: {
        label: 'Raise retention',
        children: [
          { label: 'Onboarding', note: '60%→80%', children: [{ label: 'Shorter sign-up' }, { label: 'First-day tasks' }] },
          { label: 'Reasons to return', children: [{ label: 'Weekly digest' }, { label: 'Personalised push' }, { label: 'Member tiers' }] },
          { label: 'Churn warning', children: [{ label: 'Churn model' }] },
        ],
      },
    },
  ],
  'schema#er': [
    {
      title: 'Order data model',
      entities: [
        { name: 'users', fields: [{ name: 'id', type: 'uuid', key: 'pk' }, { name: 'email', type: 'text' }, { name: 'created_at', type: 'timestamp' }] },
        { name: 'orders', fields: [{ name: 'id', type: 'uuid', key: 'pk' }, { name: 'user_id', type: 'uuid', key: 'fk' }, { name: 'status', type: 'enum' }, { name: 'total', type: 'numeric' }] },
        { name: 'order_items', fields: [{ name: 'order_id', type: 'uuid', key: 'fk' }, { name: 'product_id', type: 'uuid', key: 'fk' }, { name: 'quantity', type: 'int' }] },
        { name: 'products', fields: [{ name: 'id', type: 'uuid', key: 'pk' }, { name: 'name', type: 'text' }, { name: 'price', type: 'numeric' }] },
      ],
      relations: [
        { from: 'users', to: 'orders', kind: '1:N' },
        { from: 'orders', to: 'order_items', kind: '1:N' },
        { from: 'products', to: 'order_items', kind: '1:N' },
      ],
    },
  ],
  'schema#class': [
    {
      title: 'Payment classes',
      entities: [
        { name: 'PaymentService', fields: ['charge(order)', 'refund(payment)'] },
        { name: 'PaymentProvider', note: 'interface', fields: ['authorize(amount)', 'capture(id)', 'refund(id)'] },
        { name: 'StripeProvider', fields: ['apiKey', 'webhookSecret'] },
        { name: 'PaypalProvider', fields: ['clientId', 'sandbox'] },
      ],
      relations: [
        { from: 'PaymentService', to: 'PaymentProvider', kind: 'uses' },
        { from: 'PaymentProvider', to: 'StripeProvider', kind: 'implemented by' },
        { from: 'PaymentProvider', to: 'PaypalProvider', kind: 'implemented by' },
      ],
    },
  ],
  swimlane: [
    {
      title: 'Refund process',
      lanes: ['Customer', 'Support', 'Finance', 'Provider'],
      steps: [
        { label: 'Asks for refund', lane: 'Customer' },
        { label: 'Checks order', lane: 'Support' },
        { label: 'Approves', lane: 'Finance' },
        { label: 'Sends money', lane: 'Provider' },
        { label: 'Confirms', lane: 'Support' },
        { label: 'Gets refund', lane: 'Customer' },
      ],
    },
  ],
  pipeline: [
    {
      title: 'Release pipeline',
      stages: [
        { name: 'Build', jobs: [{ label: 'Lint', status: 'done' }, { label: 'Compile', status: 'done' }, { label: 'Unit tests', status: 'done' }] },
        { name: 'Test', jobs: [{ label: 'Integration', status: 'done' }, { label: 'End to end', status: 'doing' }] },
        { name: 'Package', jobs: [{ label: 'Docker image', status: 'todo' }] },
        { name: 'Deploy', jobs: [{ label: 'Staging', status: 'todo' }, { label: 'Production', status: 'todo' }] },
      ],
    },
  ],
  gitgraph: [
    {
      title: 'Release flow',
      branches: [{ name: 'main' }, { name: 'develop' }, { name: 'feature/login', from: 'develop' }],
      events: [
        { branch: 'main', label: 'init', tag: 'v1.0' },
        { branch: 'develop', label: 'setup' },
        { branch: 'feature/login', label: 'form' },
        { branch: 'develop', label: 'fix' },
        { branch: 'feature/login', label: 'oauth' },
        { branch: 'develop', label: 'merge', merge: 'feature/login' },
        { branch: 'main', label: 'release', merge: 'develop', tag: 'v1.1' },
      ],
    },
  ],
  'diagram#zones': [
    {
      title: 'Container view with boundaries',
      layout: 'zones',
      nodes: [
        { id: 'user', label: 'Shopper', shape: 'person', group: 'People' },
        { id: 'web', label: 'Web app', group: 'Front end' },
        { id: 'mobile', label: 'Mobile app', group: 'Front end' },
        { id: 'api', label: 'API', group: 'Back end' },
        { id: 'worker', label: 'Worker', group: 'Back end' },
        { id: 'db', label: 'Postgres', shape: 'store', group: 'Data' },
        { id: 'queue', label: 'Queue', shape: 'store', group: 'Data' },
        { id: 'mail', label: 'Email provider', shape: 'external', group: 'Outside' },
      ],
      edges: [
        { from: 'user', to: 'web' }, { from: 'user', to: 'mobile' }, { from: 'web', to: 'api', label: 'HTTPS' }, { from: 'mobile', to: 'api' },
        { from: 'api', to: 'db' }, { from: 'api', to: 'queue' }, { from: 'queue', to: 'worker', label: 'jobs' }, { from: 'worker', to: 'mail' },
      ],
    },
  ],
  'diagram#state': [
    {
      title: 'Order states',
      nodes: [
        { id: 'new', label: 'Created', shape: 'round' },
        { id: 'paid', label: 'Paid', shape: 'round' },
        { id: 'ship', label: 'Shipped', shape: 'round' },
        { id: 'done', label: 'Delivered', shape: 'round' },
        { id: 'cancel', label: 'Cancelled', shape: 'round' },
        { id: 'refund', label: 'Refunded', shape: 'round' },
      ],
      edges: [
        { from: 'new', to: 'paid', label: 'pay' }, { from: 'new', to: 'cancel', label: 'timeout' }, { from: 'paid', to: 'ship', label: 'pack' },
        { from: 'paid', to: 'cancel', label: 'cancel' }, { from: 'ship', to: 'ship', label: 'tracking' }, { from: 'ship', to: 'done', label: 'receive' },
        { from: 'done', to: 'refund', label: 'return' },
      ],
    },
  ],
  'layers#topology': [
    {
      title: 'Deployment topology',
      layers: [
        { name: 'Edge', items: ['Route 53', 'CloudFront', 'WAF'] },
        {
          name: 'Region',
          zones: [
            { name: 'Zone A', zones: [{ name: 'Public subnet', items: ['ALB', 'NAT'] }, { name: 'Private subnet', items: ['API', 'Worker'] }] },
            { name: 'Zone B', zones: [{ name: 'Public subnet', items: ['ALB', 'NAT'] }, { name: 'Private subnet', items: ['API', 'Worker'] }] },
          ],
        },
        { name: 'Managed', items: ['RDS', 'ElastiCache', 'S3', 'SQS'] },
      ],
    },
  ],
  compare: [
    {
      question: 'Which database?',
      isAsking: false,
      options: [
        { name: 'Postgres', summary: 'Relational, the most complete', pros: ['Mature ecosystem', 'JSON support'], cons: ['Scaling is yours to manage'], effort: 'half a day to set up', isRecommended: true },
        { name: 'SQLite', summary: 'One file, nothing to run', pros: ['Simplest'], cons: ['Limited concurrent writes'], effort: 'minutes' },
        { name: 'MongoDB', summary: 'Document store', pros: ['Flexible schema'], cons: ['Weaker transactions', 'Different query language'], effort: 'about half a day' },
      ],
      verdict: 'Postgres: reports and transactions are coming, so starting on it saves a migration.',
    },
  ],
}
