// 天天yo喜：Demo 的規則與資料。數字都是示意值，正式版由 yoxi 叫車資料訓練的等車模型提供。

// 從 time 往前推 minutes 分鐘
export function minus(time, minutes) {
  const [h, m] = time.split(':').map(Number)
  const t = (h * 60 + m - minutes + 1440) % 1440
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}

// ---------- 出門卡：行事曆每個行程都判斷要不要叫車 ----------
// p 由叫車機率模型算（ml/train.py：LightGBM，4 月測試 AUC 0.87），ride 由車程模型算，wait 用同區同時段的歷史等車中位數。
// 這裡是示意值。why 是模型判斷依據的前三名，用固定句型寫出來。
export const TRIPS = [
  { id: 'trip-1013-standup', day: '2026-10-13', time: '09:00', end: '10:00', cal: 'work', title: '週會', place: '內湖科技園區', p: 0.06, ride: 18, wait: 4, transit: 32,
    why: ['這個時段去公司從沒叫車', '大眾運輸 32 分', '早上不下雨'] },
  { id: 'trip-1013-client', day: '2026-10-13', time: '14:00', end: '15:30', cal: 'work', title: '客戶簡報', place: '信義區', p: 0.82, ride: 22, wait: 6, transit: 46,
    why: ['平日下午去信義區，8 次叫車 7 次', '13:30 起下雨', '捷運要轉 2 次'] },
  { id: 'trip-1013-dinner', day: '2026-10-13', time: '19:30', end: '22:00', cal: 'home', title: '同學聚餐', place: '大稻埕', p: 0.45, ride: 20, wait: 5, transit: 38, back: '22:00',
    why: ['晚上從餐廳回家，5 次叫車 2 次', '22:00 散會', '雨會下到晚上'] },
  { id: 'trip-1014-interview', day: '2026-10-14', time: '09:30', end: '10:30', cal: 'home', title: '面試', place: '南港軟體園區', p: 0.91, ride: 25, wait: 5, transit: 40, buffer: 15,
    why: ['「面試」大家 9 成叫車', '要提早 15 分到', '大眾運輸 40 分'] },
]

// 叫車機率分三段，各用一個固定句型（不用 LLM）。4 月實測：≥0.6 的格子 79% 真的叫車、0.3–0.6 是 40%、<0.3 是 3%
export const LEVELS = [
  { min: 0.6, key: 'call', label: '叫車' },
  { min: 0.3, key: 'maybe', label: '可叫車' },
  { min: 0, key: 'transit', label: '大眾運輸' },
]

export function level(p) {
  return LEVELS.find(l => p >= l.min) || LEVELS[LEVELS.length - 1]
}

// 叫車時間：行程開始 − 提早到 − 車程 − 等車
export function callAt(trip) {
  return minus(trip.time, (trip.buffer ?? 7) + trip.ride + trip.wait)
}

// 每個行程一則通知；數字都來自模型輸出，句型寫死
export function notice(trip) {
  const lv = level(trip.p)
  if (lv.key === 'call') return { lv, at: callAt(trip), body: `${callAt(trip)} 叫車` }
  if (lv.key === 'maybe') {
    const at = trip.back || callAt(trip)
    return { lv, at, body: `${at} ${trip.back ? '回程' : ''}叫車` }
  }
  return { lv, at: null, body: `大眾運輸 ${trip.transit} 分` }
}

// 閉屏通知：每個要叫車的行程，叫車時間前問一次（固定句型）
export function pushText(trip) {
  return { title: `您 ${trip.time} 有「${trip.title}」，需要叫車嗎？`, body: `${callAt(trip)} 叫車剛好趕上` }
}

// 回饋：每個人的修正用 Beta 分布，模型的 p 當先驗（強度 10 趟）。
// 預約 = 一次「會叫」，不用 = 一次「不叫」
export const PRIOR = 10

export function update(p, fb) {
  const a = p * PRIOR + (fb === 'book' ? 1 : 0)
  const b = (1 - p) * PRIOR + (fb === 'skip' ? 1 : 0)
  return a / (a + b)
}

// ---------- 一句話預約：LLM 只把話轉成欄位，車程用 yoxi 原本的估算往回推 ----------
// Demo 用固定的解析結果示意。正式版：輕量 LLM 抽出欄位 → 地點比對常去地點、再用 yoxi 原本的地點搜尋 → 車程用 yoxi 原本的估算；缺欄位就反問一句。
export const TALK = {
  said: '週六早上要去台大醫院看診，9 點的號',
  ask: '9 點是要 9 點到，還是 9 點出發？',
  options: ['9 點到', '9 點出發'],
  parsed: { date: '10/17（六）', from: '家', to: '台大醫院', time: '09:00', mode: 'arrive' },
  // 地點：先比對常去地點，再用 yoxi 原本的地點搜尋；同名的列出來讓你在地圖上確認。x、y 是示意地圖上的位置
  home: { name: '家', addr: '松山區民生社區', x: 252, y: 34 },
  places: [
    { name: '台大醫院', addr: '中山南路 7 號', note: '你去過 3 次', x: 104, y: 104, route: [[252, 34], [230, 34], [230, 62], [150, 62], [150, 98], [104, 98]] },
    { name: '台大醫院 西址', addr: '常德街 1 號', note: '', x: 58, y: 118, route: [[252, 34], [230, 34], [230, 62], [150, 62], [150, 112], [58, 112]] },
  ],
  ride: 20,
  buffer: 10,
}

// 預約上車時間：抵達時間 − 提早到 − 車程；說「出發」就直接用那個時間。預約單不加等車
export function talkPlan(t, mode) {
  const p = t.parsed
  if (mode === 'depart') return { pickup: p.time, arrive: minus(p.time, -t.ride) }
  return { pickup: minus(p.time, t.buffer + t.ride), arrive: minus(p.time, t.buffer) }
}

// ---------- 小黃記得你的固定行程：從叫車紀錄找規律，有把握才推播預約 ----------
// 規律＝同一條路線（起訖約 500 公尺內）、同一個星期幾、時間差 45 分內，過去 4 週出現 2 週以上。
// 信心度＝下一週會照搭的機率，正式版由 LightGBM 算（ml/train.py；4 月實測說 80% 以上的，78% 真的照搭）。
// 這裡用簡化的邏輯迴歸示意，係數挑成跟模型同方向：出現越多週、時間越穩、最近還有搭、同路線其他天也搭 → 越有把握。
export const HABITS = [
  { id: 'habit-thu-tpe', from: '家', to: '台北車站', dow: 4, day: '週四', time: '07:40', weeks: [1, 1, 1, 1], tstd: 6, since: 0, odDays: 1, ride: 18, wait: 5,
    note: '去新竹駐點，搭高鐵' },
  { id: 'habit-fri-xinyi', from: '信義區', to: '家', dow: 5, day: '週五', time: '22:30', weeks: [1, 0, 1, 1], tstd: 20, since: 0, odDays: 1, ride: 16, wait: 7 },
  { id: 'habit-sat-gym', from: '家', to: '大安運動中心', dow: 6, day: '週六', time: '09:30', weeks: [0, 1, 0, 1], tstd: 35, since: 0, odDays: 1, ride: 14, wait: 4 },
]

export const HABIT_COEF = { b0: -4.4, weeks: 1.6, tstd: -0.03, since: -0.8, odDays: 0.3 }

export function confidence(h) {
  const n = h.weeks.reduce((a, b) => a + b, 0)
  const z = HABIT_COEF.b0 + HABIT_COEF.weeks * n + HABIT_COEF.tstd * h.tstd + HABIT_COEF.since * h.since + HABIT_COEF.odDays * (h.odDays - 1)
  return 1 / (1 + Math.exp(-z))
}

// 三段：≥70% 前一晚推播預約、40–70% 只放在 App、<40% 不提醒（4 月實測照搭率 72%／51%／26%）
export const HABIT_BANDS = [
  { min: 0.7, key: 'push', label: '前一晚問你要不要預約' },
  { min: 0.4, key: 'app', label: '放在 App，不推播' },
  { min: 0, key: 'quiet', label: '還不算規律，不提醒' },
]

export function habitBand(p) {
  return HABIT_BANDS.find(b => p >= b.min) || HABIT_BANDS[HABIT_BANDS.length - 1]
}

// 叫車時間＝習慣時間；推播在前一晚，給你時間決定要不要預約
export function habitPush(h, p = confidence(h)) {
  const n = h.weeks.reduce((a, b) => a + b, 0)
  return { title: `明天${h.day} ${h.time} 照常去${h.to}嗎？`, body: `過去 4 個${h.day}有 ${n} 次這時間叫車` }
}

// 為什麼有把握：用固定句型寫出依據
export function habitWhy(h) {
  const n = h.weeks.reduce((a, b) => a + b, 0)
  return [`4 週裡 ${n} 週都搭`, `時間差 ${h.tstd} 分內`, h.since === 0 ? '上週也有搭' : `${h.since} 週沒搭了`]
}

// ---------- 車窗猜一猜：乘客車上拍 → AI 選題、出選項 → 大家每天猜一題 ----------
// 只有搭 yoxi 的行程中能投稿；照片綁定手機定位與車輛 GPS 一起回傳，地點不靠 AI 猜。一趟車算一張。
export const RIDE = { id: 'ride-1013-night', status: 'riding', from: '四獸山步道口', to: '松山區民生社區', eta: 12 }

// 你在車上拍的照片
export const SHOT = { src: '/shot.jpg', credit: '示意：Unsplash', place: '四獸山步道口', district: '信義' }

// AI 選題：全部通過才可能變成題目
export const SHOT_CHECKS = [
  { key: 'light', text: '亮度正常，不是全黑全白' },
  { key: 'clue', text: '有線索：建築、山稜、天際線' },
  { key: 'privacy', text: '人臉、車牌已自動模糊' },
  { key: 'gps', text: `定位：手機＋車輛 GPS・${SHOT.district}區` },
]

// 只有行程中才能投稿
export function canShare(ride) {
  return !!ride && ride.status === 'riding'
}

// 一趟車只算一張；沒在車上或已投稿就原樣回傳
export function share(shares, ride, photo) {
  if (!canShare(ride) || shares[ride.id]) return shares
  return { ...shares, [ride.id]: { place: photo.place, district: photo.district } }
}

// 每天全站同一題、每人只能猜一次。選項由 AI 出：同類型、看起來像的地點（這題都是看得到盆地夕陽、車開得到的山路），
// 不用全球地圖點位置，避免「猜台北市中心」就能拿高分。pick 是每個選項被選的比例（示意）
export const QUIZ = {
  id: 'quiz-2026-10-14', day: '2026-10-14', src: '/quiz.jpg', credit: '示意：Unsplash',
  by: '小安', players: 8312, answer: '碧山路',
  options: [
    { name: '仰德大道', district: '士林', pick: 0.29 },
    { name: '碧山路', district: '內湖', pick: 0.34 },
    { name: '指南路・貓空', district: '文山', pick: 0.22 },
    { name: '至善路', district: '士林', pick: 0.15 },
  ],
  ride: { to: '碧山巖', min: 24 },
}

// 你昨晚投稿的照片成了今天的題目（Demo 固定入選）
export const MY_QUIZ = {
  id: 'quiz-2026-10-15', src: '/shot.jpg', players: 1284, answer: '四獸山',
  options: [
    { name: '象山', pick: 0.41 },
    { name: '四獸山', pick: 0.23 },
    { name: '劍潭山', pick: 0.21 },
    { name: '碧山巖', pick: 0.15 },
  ],
}

export function quizRate(q) {
  return q.options.find(o => o.name === q.answer).pick
}

// 題目好不好看答對率與每個選項的選擇率；不好的題目回頭修正選照片、出選項的模型
export const GOOD = { min: 0.2, max: 0.7, deadOption: 0.08, tooTempting: 2 }

export function quality(q) {
  const rate = quizRate(q)
  const wrong = q.options.filter(o => o.name !== q.answer)
  const flags = []
  if (rate > GOOD.max) flags.push('太好猜：線索太明顯，修正選照片')
  if (rate < GOOD.min) flags.push('太難：線索不夠，修正選照片')
  for (const o of wrong) if (o.pick < GOOD.deadOption) flags.push(`「${o.name}」幾乎沒人選：太好排除，修正出選項`)
  for (const o of wrong) if (o.pick > rate * GOOD.tooTempting) flags.push(`「${o.name}」比答案多一倍人選：可能有爭議，人工確認`)
  return { rate, good: flags.length === 0, flags }
}

// 作答：每天一次。guesses 以日期為 key
export function guess(guesses, q, name) {
  if (guesses[q.day]) return guesses
  return { ...guesses, [q.day]: { pick: name, ok: name === q.answer } }
}

// 連對天數：從 today 往回數；猜錯或沒猜就歸零（猜錯的懲罰）
export function guessStreak(guesses, today) {
  let n = 0
  const d = new Date(today + 'T00:00:00')
  if (!guesses[local(d)]) d.setDate(d.getDate() - 1)   // 今天還沒猜，不算斷
  while (guesses[local(d)]?.ok) {
    n++
    d.setDate(d.getDate() - 1)
  }
  return n
}

// 最長連對：成就用，達成過就一直留著
export function bestStreak(guesses) {
  let best = 0, n = 0, prev = ''
  for (const day of Object.keys(guesses).sort()) {
    const d = new Date(day + 'T00:00:00')
    d.setDate(d.getDate() - 1)
    n = !guesses[day].ok ? 0 : prev === local(d) ? n + 1 : 1
    best = Math.max(best, n)
    prev = day
  }
  return best
}

// 拍照的人的封號：依你的題目的答對率
export const TITLES = [
  { max: 0.3, name: '迷霧製造者' },
  { max: 0.5, name: '城市謎語人' },
  { max: 1, name: '街角導遊' },
]

export function photoTitle(rate) {
  return TITLES.find(t => rate < t.max) || TITLES[TITLES.length - 1]
}

// 榮譽榜：依「難倒幾人」（猜的人 − 猜對的人）排名，只算好題。可切本週／本月／今年
export const HONOR = {
  periods: ['本週', '本月', '今年'],
  month: [
    { name: '小安', players: 21480, correct: 7520 },
    { name: '阿哲', players: 15120, correct: 4840 },
    { name: 'Mia', players: 11960, correct: 3120 },
  ],
  myRank: 14,
}

export function stumped(players, correct) {
  return players - correct
}

// 經驗值：打開出門卡 +1／天、猜對 +3、車上投稿合格 +3、照片出成題目 +5
export const XP = { open: 1, correct: 3, share: 3, asked: 5 }

export function xp(days, shares, guesses = {}) {
  const list = Object.values(shares)
  return new Set(days).size * XP.open + list.length * XP.share + list.filter(s => s.asked).length * XP.asked
    + Object.values(guesses).filter(g => g.ok).length * XP.correct
}

// 連續天數：days 是有打開的日期（YYYY-MM-DD），從 today 往回數
export function streak(days, today) {
  const set = new Set(days)
  let n = 0
  const d = new Date(today + 'T00:00:00')
  while (set.has(local(d))) {
    n++
    d.setDate(d.getDate() - 1)
  }
  return n
}

function local(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// 每月打開滿 20 天，送一張 NT$30 乘車金（只能折抵 yoxi 車資）
export const REWARD = { target: 20, amount: 30 }

export function monthProgress(days, month) {
  const n = new Set(days.filter(d => d.startsWith(month))).size
  return { n, target: REWARD.target, earned: n >= REWARD.target }
}

// 成就：小黃不會餓、不會死，靠成就讓人每天回來。達成過就一直留著
export const BADGES = [
  { id: 'streak3', name: '連對 3 天', need: s => s.best >= 3 },
  { id: 'streak7', name: '連對 7 天', need: s => s.best >= 7 },
  { id: 'streak30', name: '連對 30 天', need: s => s.best >= 30 },
  { id: 'asked', name: '出成題目', need: s => s.asked >= 1 },
  { id: 'stump1k', name: '難倒千人', need: s => s.stumped >= 1000 },
]

export function badges(stats) {
  return BADGES.filter(b => b.need(stats)).map(b => b.id)
}

// ---------- 小黃：串起三個功能的寵物 ----------
// 經驗值來自出門卡（每天打開）與車窗猜一猜（猜對、投稿、出成題目）；配件只有搭車拿得到。小黃不會餓、不會死，猜錯只讓連對歸零。
export const STAGES = [
  { min: 0, name: '見習小黃' },
  { min: 60, name: '上路小黃' },
  { min: 200, name: '老司機小黃' },
]

export function petStage(points) {
  const i = STAGES.findLastIndex(s => points >= s.min)
  const next = STAGES[i + 1]
  return { xp: points, level: i + 1, name: STAGES[i].name, min: STAGES[i].min, next: next ? { name: next.name, left: next.min - points } : null }
}

// 配件只有搭 yoxi 才拿得到；每種只給一次。ride 是完成乘車的條件（Demo 以預約代替完乘）。
export const GEAR = [
  { id: 'raincoat', name: '小雨衣', how: '下雨天搭一趟 yoxi', ride: id => id === 'trip-1013-client' },
  { id: 'bowtie', name: '通勤領結', how: '照固定行程預約一趟', ride: id => id.startsWith('habit-') },
  { id: 'ticket', name: '松山機場登機證', how: '搭 yoxi 到松山機場', ride: id => id === 'ride-airport' },
]

export function gearOwned(booked) {
  return GEAR.filter(g => booked.some(g.ride)).map(g => g.id)
}
