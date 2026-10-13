import test from 'node:test'
import assert from 'node:assert/strict'
import { SHOT, SHOT_CHECKS, QUIZ, MY_QUIZ, quizRate, quality, guess, guessStreak, bestStreak, photoTitle, stumped, badges, TRIPS, HABITS, confidence, habitBand, habitPush, habitWhy, pushText, level, callAt, notice, update, minus, share, canShare, xp, streak, monthProgress, petStage, gearOwned } from '../src/logic.mjs'

const trip = id => TRIPS.find(t => t.id === id)

test('叫車機率分三段，每個行程都有一則通知', () => {
  assert.equal(level(0.82).key, 'call')
  assert.equal(level(0.6).key, 'call')
  assert.equal(level(0.45).key, 'maybe')
  assert.equal(level(0.06).key, 'transit')
  for (const t of TRIPS) assert.ok(notice(t).body.length > 0)
  assert.equal(notice(trip('trip-1013-client')).body, '13:25 叫車')
  assert.equal(notice(trip('trip-1013-dinner')).body, '22:00 回程叫車')
  assert.equal(notice(trip('trip-1013-standup')).body, '大眾運輸 32 分')
  assert.equal(notice(trip('trip-1013-standup')).at, null)
})

test('閉屏通知問要不要叫車', () => {
  assert.deepEqual(pushText(trip('trip-1013-client')), { title: '您 14:00 有「客戶簡報」，需要叫車嗎？', body: '13:25 叫車剛好趕上' })
})

test('叫車時間＝行程開始－提早到－車程－等車', () => {
  assert.equal(callAt(trip('trip-1013-client')), '13:25')
  assert.equal(callAt(trip('trip-1014-interview')), '08:45')
})

test('回饋會修正這個人的叫車機率', () => {
  assert.equal(Math.round(update(0.82, 'skip') * 100), 75)
  assert.equal(Math.round(update(0.82, 'book') * 100), 84)
})

test('時間往前推可以跨午夜', () => {
  assert.equal(minus('09:30', 45), '08:45')
  assert.equal(minus('00:10', 20), '23:50')
  assert.equal(minus('22:00', -10), '22:10')
})

test('只有行程中能投稿，一趟車只算一張', () => {
  const ride = { id: 'r1', status: 'riding' }
  assert.equal(canShare(null), false)
  assert.deepEqual(share({}, { id: 'r0', status: 'done' }, SHOT), {})
  let sh = share({}, ride, SHOT)
  sh = share(sh, ride, { place: '別的地方', district: '大安' })
  assert.equal(Object.keys(sh).length, 1)
  assert.equal(sh.r1.place, SHOT.place)
  assert.equal(xp(['d1', 'd1'], sh), 1 + 3)
  assert.equal(xp(['d1'], { r1: { ...sh.r1, asked: true } }, { a: { ok: true }, b: { ok: false } }), 1 + 3 + 5 + 3)
})

test('AI 選題：亮度、線索、去識別、定位四項', () => {
  assert.deepEqual(SHOT_CHECKS.map(c => c.key), ['light', 'clue', 'privacy', 'gps'])
})

test('每天一題只能猜一次；猜錯或沒猜連對就歸零', () => {
  let g = guess({}, QUIZ, '仰德大道')
  g = guess(g, QUIZ, QUIZ.answer)
  assert.deepEqual(g[QUIZ.day], { pick: '仰德大道', ok: false })
  const days = d => `2026-10-${String(d).padStart(2, '0')}`
  const h = Object.fromEntries(Array.from({ length: 13 }, (_, i) => [days(i + 1), { ok: i + 1 !== 7 }]))
  assert.equal(guessStreak(h, '2026-10-13'), 6)
  assert.equal(guessStreak(h, '2026-10-14'), 6)   // 今天還沒猜，不算斷
  assert.equal(guessStreak(guess(h, QUIZ, QUIZ.answer), '2026-10-14'), 7)
  assert.equal(guessStreak(guess(h, QUIZ, '至善路'), '2026-10-14'), 0)
  assert.equal(guessStreak({ ...h, [days(15)]: { ok: true } }, '2026-10-15'), 1)   // 10/14 沒猜就斷
  assert.equal(bestStreak(h), 6)
  assert.equal(bestStreak(guess(h, QUIZ, QUIZ.answer)), 7)
})

test('好題看答對率與每個選項的選擇率', () => {
  assert.deepEqual(quality(QUIZ), { rate: 0.34, good: true, flags: [] })
  assert.equal(quality(MY_QUIZ).good, true)
  const q = (picks, answer = 'A') => ({ answer, options: picks.map((pick, i) => ({ name: 'ABCD'[i], pick })) })
  assert.match(quality(q([0.85, 0.1, 0.03, 0.02])).flags.join(), /太好猜/)
  assert.match(quality(q([0.1, 0.3, 0.3, 0.3])).flags.join(), /太難/)
  assert.match(quality(q([0.4, 0.35, 0.22, 0.03])).flags.join(), /「D」幾乎沒人選/)
  assert.match(quality(q([0.22, 0.5, 0.18, 0.1])).flags.join(), /「B」比答案多一倍人選/)
})

test('拍照的人的封號與成就', () => {
  assert.equal(photoTitle(quizRate(MY_QUIZ)).name, '迷霧製造者')
  assert.equal(photoTitle(0.35).name, '城市謎語人')
  assert.equal(photoTitle(0.6).name, '街角導遊')
  assert.equal(stumped(1284, 295), 989)
  assert.deepEqual(badges({ best: 7, asked: 1, stumped: 989 }), ['streak3', 'streak7', 'asked'])
  assert.deepEqual(badges({ best: 0, asked: 0, stumped: 0 }), [])
})

test('連續天數斷一天就重算', () => {
  assert.equal(streak(['2026-10-11', '2026-10-12', '2026-10-13'], '2026-10-13'), 3)
  assert.equal(streak(['2026-10-10', '2026-10-12', '2026-10-13'], '2026-10-13'), 2)
  assert.equal(streak(['2026-09-30', '2026-10-01'], '2026-10-01'), 2)
})

test('乘車金看當月作答天數，重複日期不重算', () => {
  const days = Array.from({ length: 20 }, (_, i) => `2026-10-${String(i + 1).padStart(2, '0')}`)
  assert.equal(monthProgress(days, '2026-10').earned, true)
  assert.equal(monthProgress([...days.slice(0, 5), '2026-10-01'], '2026-10').n, 5)
  assert.equal(monthProgress(days, '2026-11').n, 0)
})

test('小黃依經驗值升級', () => {
  assert.deepEqual(petStage(0), { xp: 0, level: 1, name: '見習小黃', min: 0, next: { name: '上路小黃', left: 60 } })
  assert.equal(petStage(65).name, '上路小黃')
  assert.equal(petStage(65).next.left, 135)
  assert.equal(petStage(240).next, null)
})

test('配件只有搭車才拿得到，重複搭不會重複給', () => {
  assert.deepEqual(gearOwned([]), [])
  assert.deepEqual(gearOwned(['remind-1014', 'ride-quiz']), [])
  assert.deepEqual(gearOwned(['trip-1013-client', 'habit-thu-tpe-2026-10-15']), ['raincoat', 'bowtie'])
})

test('固定行程：越規律信心越高，分三段處理', () => {
  const [thu, fri, sat] = HABITS.map(confidence)
  assert.ok(thu > fri && fri > sat)
  assert.equal(Math.round(thu * 100), 86)
  assert.equal(habitBand(thu).key, 'push')
  assert.equal(habitBand(fri).key, 'app')
  assert.equal(habitBand(sat).key, 'quiet')
  assert.equal(habitBand(0.7).key, 'push')
  assert.equal(habitBand(0.4).key, 'app')
})

test('固定行程：前一晚的推播與依據都是固定句型', () => {
  assert.deepEqual(habitPush(HABITS[0]), { title: '明天週四 07:40 照常去台北車站嗎？', body: '過去 4 個週四有 4 次這時間叫車' })
  assert.deepEqual(habitWhy(HABITS[0]), ['4 週裡 4 週都搭', '時間差 6 分內', '上週也有搭'])
  assert.equal(Math.round(update(confidence(HABITS[0]), 'skip') * 100), 78)
})
