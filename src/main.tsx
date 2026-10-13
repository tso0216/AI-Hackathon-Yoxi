import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  Car, Sun, Camera, CloudRain, Clock, TrainFront, ChevronRight, ChevronLeft, Check, Sparkles,
  Bookmark, MapPin, CalendarDays, RotateCcw, Home, Briefcase, PawPrint, Lock, Ticket, Flashlight, Repeat, Mic, ArrowUp, MessageCircle,
  Puzzle, X, Flame, Trophy, Award, Image as ImageIcon,
} from 'lucide-react'
import { TALK, talkPlan, HABITS, confidence, habitBand, habitPush, update, RIDE, SHOT, SHOT_CHECKS, QUIZ, MY_QUIZ, quizRate, quality, guess, guessStreak, bestStreak, photoTitle, HONOR, stumped, BADGES, badges, XP, GEAR, TRIPS, notice, callAt, pushText, share, canShare, xp, monthProgress, petStage, gearOwned, STAGES } from './logic.mjs'
import { Pup } from './pup'
import './style.css'

type Scn = { key: string; label: string; note: string; date: string; day: string; time: string; tab: Tab; revealed: boolean; view?: View }
type View = 'habits' | 'talk'
type Tab = 'ride' | 'today' | 'share' | 'pet'
type Shares = Record<string, { place: string; district: string; asked?: boolean }>
type Guesses = Record<string, { pick: string; ok: boolean }>
type Fb = 'skip'
type Store = { shares: Shares; guesses: Guesses; days: string[]; saved: string[]; booked: string[]; fb: Record<string, Fb> }

const SCENES: Scn[] = [
  { key: 'morning', label: '出門前', note: '每個行程都說要不要叫車，不用就按一下', date: '10月13日 週二', day: '2026-10-13', time: '07:50', tab: 'today', revealed: false },
  { key: 'trip', label: '行程前', note: '叫車時間前通知，附上判斷依據', date: '10月13日 週二', day: '2026-10-13', time: '13:15', tab: 'today', revealed: false },
  { key: 'talk', label: '一句話預約', note: '跟小黃說要去哪，沒講清楚牠會問，確認就預約', date: '10月13日 週二', day: '2026-10-13', time: '21:40', tab: 'today', revealed: false, view: 'talk' },
  { key: 'share', label: '車上投稿', note: '只有搭 yoxi 時能拍；AI 挑出有線索、沒有明顯地標的照片', date: '10月13日 週二', day: '2026-10-13', time: '21:00', tab: 'share', revealed: false },
  { key: 'guess', label: '每天一題', note: '猜照片在哪拍的，4 選 1；猜對連對 +1，猜錯歸零', date: '10月14日 週三', day: '2026-10-14', time: '08:00', tab: 'today', revealed: false },
  { key: 'habit', label: '固定行程', note: '找出你每週固定的那趟，有把握才前一晚問你', date: '10月14日 週三', day: '2026-10-14', time: '21:30', tab: 'today', revealed: false, view: 'habits' },
  { key: 'honor', label: '榮譽榜', note: '你的照片成了題目：幾人猜、幾人猜對，拿到封號', date: '10月15日 週四', day: '2026-10-15', time: '21:00', tab: 'share', revealed: true },
  { key: 'pet', label: '小黃', note: '經驗值讓牠長大，成就和配件都收在這', date: '10月15日 週四', day: '2026-10-15', time: '21:30', tab: 'pet', revealed: true },
]

const KEY = 'yoxi-yoxi-v3'
// 示意：9/8–9/28 與 10/1–10/12 都陪過小黃
const SEED_DAYS = [
  ...Array.from({ length: 21 }, (_, i) => `2026-09-${String(i + 8).padStart(2, '0')}`),
  ...Array.from({ length: 12 }, (_, i) => `2026-10-${String(i + 1).padStart(2, '0')}`),
]
// 示意：之前 8 趟車各投稿過 1 張照片，其中 1 張出成題目
const SEED_SHARES: Shares = Object.fromEntries([
  ['2026-09-12', '大稻埕碼頭', '大同', true], ['2026-09-19', '華山文創園區', '中正'], ['2026-09-25', '饒河夜市', '松山'],
  ['2026-10-02', '大湖公園', '內湖'], ['2026-10-05', '中山捷運站', '中山'], ['2026-10-07', '大安森林公園', '大安'],
  ['2026-10-09', '芝山岩', '士林'], ['2026-10-11', '北投溫泉博物館', '北投'],
].map(([d, place, district, asked]) => ['ride-' + d, { place: place as string, district: district as string, ...(asked ? { asked: true } : {}) }]))
// 示意：10/1–10/13 每天都猜了一題，10/7 猜錯 → 到 10/13 連對 6 天
const SEED_GUESSES: Guesses = Object.fromEntries(Array.from({ length: 13 }, (_, i) => [`2026-10-${String(i + 1).padStart(2, '0')}`, { pick: '', ok: i + 1 !== 7 }]))
const fresh = (): Store => ({ shares: SEED_SHARES, guesses: SEED_GUESSES, days: SEED_DAYS, saved: ['大稻埕碼頭'], booked: [], fb: {} })
const petXp = (s: Store) => xp(s.days, s.shares, s.guesses)
// 成就用的統計：最長連對、照片出成題目幾次、你的題目難倒幾人
const myCorrect = Math.round(MY_QUIZ.players * quizRate(MY_QUIZ))
const stats = (s: Store) => ({ best: bestStreak(s.guesses), asked: Object.values(s.shares).filter(x => x.asked).length, stumped: s.shares[RIDE.id]?.asked ? stumped(MY_QUIZ.players, myCorrect) : 0 })

function load(): Store {
  try { return { ...fresh(), ...JSON.parse(localStorage.getItem(KEY) || '{}') } } catch { return fresh() }
}

function App() {
  const params = new URLSearchParams(location.search)
  const [scnKey, setScnKey] = useState(params.get('s') || 'morning')
  const scn = SCENES.find(s => s.key === scnKey) || SCENES[0]
  const [tab, setTab] = useState<Tab>(scn.tab)
  const [view, setView] = useState<View | null>(scn.view || null)
  // 固定行程：一開始手機鎖著，前一晚的提醒跳出來；點通知才打開 App
  const [opened, setOpened] = useState(false)
  const [store, setStore] = useState<Store>(load)
  const [sheet, setSheet] = useState<{ title: string; detail: string; id: string } | null>(null)
  const [toast, setToast] = useState('')

  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(store)) } catch {} }, [store])
  // 打開出門卡就算陪小黃一天
  useEffect(() => {
    if (scn.tab !== 'today') return
    setStore(s => s.days.includes(scn.day) ? s : { ...s, days: [...s.days, scn.day] })
  }, [scn.key])
  // 隔天 AI 選題（Demo：你投稿的照片出成題目）
  useEffect(() => {
    if (!scn.revealed) return
    setStore(s => !s.shares[RIDE.id] || s.shares[RIDE.id].asked ? s : { ...s, shares: { ...s.shares, [RIDE.id]: { ...s.shares[RIDE.id], asked: true } } })
  }, [scn.key])
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 2200); return () => clearTimeout(t) }, [toast])

  const go = (s: Scn) => { setScnKey(s.key); setTab(s.tab); setView(s.view || null); setSheet(null); setOpened(false) }
  const book = (id: string, title: string, detail: string) => setSheet({ id, title, detail })
  const confirm = () => {
    if (!sheet) return
    const had = gearOwned(store.booked)
    const got = GEAR.find(g => !had.includes(g.id) && g.ride(sheet.id))
    setStore(s => s.booked.includes(sheet.id) ? s : { ...s, booked: [...s.booked, sheet.id] })
    setToast(got ? `已預約・下車後小黃會拿到${got.name}` : '已預約，司機指派後會通知你')
    setSheet(null)
  }
  const ctx = { scn, store, setStore, book, setToast, setTab, setView }
  // 行程前、固定行程：手機鎖著，yoxi 的通知跳出來
  const locked = (scn.key === 'trip' && tab === 'today' && !view) || (scn.key === 'habit' && view === 'habits' && !opened)
  if (params.get('s') === 'pups') return <Pups />

  return (
    <div className="stage">
      <aside className="panel">
        <div className="panel-brand">天天<b>yo</b>喜</div>
        <p className="panel-sub">一隻小黃陪你出門，不搭車的日子也有事</p>
        <ol className="scenes">
          {SCENES.map((s, i) => (
            <li key={s.key}>
              <button className={s.key === scn.key ? 'on' : ''} onClick={() => go(s)}>
                <span className="n">{i + 1}</span>
                <span className="t"><b>{s.label}</b><small>{s.note}</small></span>
              </button>
            </li>
          ))}
        </ol>
        <button className="reset" onClick={() => { setStore(fresh()); go(SCENES[0]) }}><RotateCcw size={14} /> 重設 Demo</button>
        <p className="panel-foot">所有資料為模擬；叫車機率、等車時間、天氣、行事曆與觀看人數為示意值，不會真的派車。</p>
      </aside>

      <div className="phone">
        <div className={'screen' + (locked ? ' locked' : view !== 'talk' && tab !== 'ride' ? ' glassy' : '')}>
          <StatusBar time={scn.time} />
          {locked ? (scn.key === 'habit' ? <HabitLock c={ctx} open={() => setOpened(true)} /> : <TripLock c={ctx} trip={TRIP('trip-1013-client')} />) : <>
            {view === 'talk' ? <Talk key={scn.key} {...ctx} /> : <>
              <main className="scroll">
                {view === 'habits' ? <Habits {...ctx} /> :
                  tab === 'today' ? <Today {...ctx} /> :
                    tab === 'share' ? <Share {...ctx} /> :
                      tab === 'pet' ? <Pet {...ctx} /> : <Ride {...ctx} />}
              </main>
              <TabBar tab={view ? 'today' : tab} onTab={t => { setTab(t); setView(null) }} />
            </>}
          </>}
          {sheet && (
            <div className="sheet-wrap" onClick={() => setSheet(null)}>
              <div className="sheet" onClick={e => e.stopPropagation()}>
                <div className="grab" />
                <h3>{sheet.title}</h3>
                <p>{sheet.detail}</p>
                <button className="btn primary full" onClick={confirm}>確認預約</button>
                <button className="btn plain full" onClick={() => setSheet(null)}>取消</button>
                <small className="fine">Demo：不會建立真實訂單</small>
              </div>
            </div>
          )}
          {toast && <div className="toast">{toast}</div>}
        </div>
      </div>
    </div>
  )
}

type Ctx = {
  scn: Scn; store: Store; setStore: React.Dispatch<React.SetStateAction<Store>>
  book: (id: string, title: string, detail: string) => void; setToast: (t: string) => void
  setTab: (t: Tab) => void; setView: (v: View | null) => void
}

function StatusBar({ time }: { time: string }) {
  return (
    <div className="status">
      <span>{time}</span>
      <span className="island" />
      <span className="sig"><i /><i /><i /><i /><b /></span>
    </div>
  )
}

function TabBar({ tab, onTab }: { tab: Tab; onTab: (t: Tab) => void }) {
  const items: [Tab, string, React.ReactNode][] = [
    ['ride', '叫車', <Car size={22} />], ['today', '今天', <Sun size={22} />],
    ['share', '猜一猜', <Puzzle size={22} />], ['pet', '小黃', <PawPrint size={22} />],
  ]
  return (
    <nav className="tabbar">
      {items.map(([k, t, ic]) => (
        <button key={k} className={tab === k ? 'on' : ''} onClick={() => onTab(k)}>{ic}<span>{t}</span></button>
      ))}
    </nav>
  )
}

function Header({ date, title, right }: { date: string; title: string; right?: React.ReactNode }) {
  return (
    <header className="g-title s-title">
      <div><small>{date}</small><h1>{title}</h1></div>
      {right}
    </header>
  )
}

// 小黃的一句話：放在今天頁最上面
function PupSays({ c, mood = 'awake', text }: { c: Ctx; mood?: 'awake' | 'happy' | 'sleep'; text: string }) {
  const st = petStage(petXp(c.store))
  return (
    <button className="s-say says tap" data-cap="says" onClick={() => c.setTab('pet')}>
      <span className="pupwrap"><Pup level={st.level} mood={mood} gear={gearOwned(c.store.booked)} size={52} /><i className="lvl" data-cap="lvl">{st.level}</i></span>
      <span className="gl s-bub">{text}</span>
    </button>
  )
}


// ---------- 今天 ----------
function Today(c: Ctx) {
  const { scn } = c
  return (
    <>
      <i className="gblob a" /><i className="gblob b" /><i className="gblob c" />
      <Header date={scn.date} title="今天" />
      {scn.key === 'morning' && <><PupSays c={c} text="今天 3 個行程，1 趟要叫車" /><Agenda {...c} /><TalkBar {...c} /><QuizTeaser {...c} /></>}
      {scn.key === 'guess' && <><GuessSays {...c} /><QuizCard {...c} /><TripHero c={c} trip={TRIP('trip-1014-interview')} /></>}
      {scn.key !== 'morning' && scn.key !== 'trip' && scn.key !== 'guess' && <><GuessSays {...c} />{scn.key === 'habit' && <HabitCard {...c} />}<QuizCard {...c} /></>}
    </>
  )
}

function GuessSays(c: Ctx) {
  const g = c.store.guesses[QUIZ.day]
  const n = guessStreak(c.store.guesses, QUIZ.day)
  return <PupSays c={c} mood={g?.ok ? 'happy' : 'awake'} text={!g ? `今天一題！猜對就連對 ${n + 1} 天` : g.ok ? `猜對了！連對 ${n} 天` : '猜錯了，明天從 1 天重新來'} />
}

// ---------- 出門卡：每個行程都判斷要不要叫車 ----------
type Trip = (typeof TRIPS)[number]
const TRIP = (id: string) => TRIPS.find(t => t.id === id)!

// 今天的行程：仿 Apple 行事曆的列表，每個行程下面加一行小黃的判斷（不顯示地點）
function Agenda(c: Ctx) {
  const today = TRIPS.filter(t => t.day === c.scn.day)
  return (
    <section className="gl g-card cal" data-cap="agenda">
      <div className="cal-head"><b>{c.scn.date.split(' ').reverse().join(' ')}</b><span><CalendarDays size={13} /> 行事曆</span></div>
      {today.map((t, i) => <TripRow key={t.id} c={c} trip={t} cap={['standup', 'client', 'dinner'][i]} />)}
    </section>
  )
}

function TripRow({ c, trip, cap }: { c: Ctx; trip: Trip; cap: string }) {
  const n = notice(trip)
  return (
    <div className="ev" data-cap={cap}>
      <div className="ev-time"><b>{trip.time}</b><span>{trip.end}</span></div>
      <div className={'ev-block ' + trip.cal}>
        <b>{trip.title}</b>
        {n.at && <Feedback c={c} trip={trip} />}
      </div>
    </div>
  )
}

// 回饋：預約／不用；按了「不用」按鈕就收起來（背後修正這個人的叫車機率）
function Feedback({ c, trip, big }: { c: Ctx; trip: Trip; big?: boolean }) {
  const fb = c.store.fb[trip.id]
  const at = notice(trip).at!
  const set = (v: Fb) => c.setStore(s => ({ ...s, fb: { ...s.fb, [trip.id]: v } }))
  if (c.store.booked.includes(trip.id)) return <div className="learned" data-cap="learned"><Check size={14} /> 已預約 {at}</div>
  if (fb) return null
  return (
    <div className={'fb' + (big ? ' big' : '')} data-cap="fb">
      <button className={'g-cta ' + (big ? 'grow' : 'sm')}
        onClick={() => c.book(trip.id, `預約 ${at} 叫車`, `${trip.back ? trip.place + ' → 家' : '目前位置 → ' + trip.place}，車程約 ${trip.ride} 分`)}>預約 {at}</button>
      <button className={'g-ghost' + (big ? '' : ' sm')} onClick={() => set('skip')}>不用</button>
    </div>
  )
}

// 鎖定畫面：yoxi 的通知跳出來，直接在通知上回應（出門卡、固定行程共用）
function LockScreen({ c, title, body, actions, open }: { c: Ctx; title: string; body: string; actions?: [string, () => void][]; open?: () => void }) {
  return (
    <div className="lock">
      <i className="blob a" /><i className="blob b" /><i className="blob c" />
      <Lock size={15} className="lock-ico" />
      <div className="lock-date">{c.scn.date.split(' ').reverse().join(' ')}</div>
      <div className="lock-time">{c.scn.time}</div>
      <div className={'notif glass' + (open ? ' tap' : '')} data-cap="push" onClick={open} role={open ? 'button' : undefined}>
        <span className="notif-icon"><Car size={20} /></span>
        <div className="grow">
          <div className="notif-head"><b>yoxi</b><small>現在</small></div>
          <b>{title}</b>
          <span>{body}</span>
        </div>
      </div>
      {actions && (
        <div className="notif-actions" data-cap="fb">
          {actions.map(([t, f]) => <button key={t} className="glass" onClick={f}>{t}</button>)}
        </div>
      )}
      <div className="lock-foot">
        <span className="glass round"><Flashlight size={20} /></span>
        <span className="glass round"><Camera size={20} /></span>
      </div>
      <i className="home-bar" />
    </div>
  )
}

// 出門卡：叫車時間前問一次
function TripLock({ c, trip }: { c: Ctx; trip: Trip }) {
  const at = callAt(trip)
  const t = pushText(trip)
  const booked = c.store.booked.includes(trip.id)
  const skipped = !!c.store.fb[trip.id]
  return <LockScreen c={c} title={booked ? `已預約 ${at}` : t.title} body={booked ? '司機指派後會通知您' : skipped ? '好，這趟不叫車' : t.body}
    actions={booked || skipped ? undefined : [
      [`預約 ${at}`, () => c.book(trip.id, `預約 ${at} 叫車`, `目前位置 → ${trip.place}，車程約 ${trip.ride} 分`)],
      ['不用', () => c.setStore(s => ({ ...s, fb: { ...s.fb, [trip.id]: 'skip' } }))]]} />
}

// 單一行程：叫車時間＋判斷依據
function TripHero({ c, trip }: { c: Ctx; trip: Trip }) {
  return (
    <section className="gl g-hero hero" data-cap="out">
      <div className="kicker">{trip.time} {trip.title}・{trip.place}</div>
      <div className="bigtime">{callAt(trip)}<span>叫車</span></div>
      <div className="sub">車程 {trip.ride} 分</div>
      <div className="why" data-cap="why">{trip.why.map((t: string) => <span key={t}>{t}</span>)}</div>
      <Feedback c={c} trip={trip} big />
    </section>
  )
}

// ---------- 車窗猜一猜：每天一題 ----------
const pct = (p: number) => `${Math.round(p * 100)}%`

// 出門卡下面：今天的題目猜了沒
function QuizTeaser(c: Ctx) {
  const g = c.store.guesses[c.scn.day]
  const n = guessStreak(c.store.guesses, c.scn.day)
  return (
    <button className="gl g-card row tap" data-cap="quizteaser" onClick={() => c.setTab('share')}>
      <div className="pin"><Puzzle size={20} /></div>
      <div className="grow">
        <small>今天一題・車窗猜一猜</small>
        <b>{!g ? '這是哪裡？還沒猜' : g.ok ? `猜對了，連對 ${n} 天` : '猜錯了，連對歸零'}</b>
        <span className="muted">乘客在車上拍的，4 選 1・猜對經驗 +{XP.correct}</span>
      </div>
      <ChevronRight size={18} className="chev" />
    </button>
  )
}

// 今天的題目：4 選 1，每天只能猜一次；猜完看每個選項的選擇率
function QuizCard(c: Ctx) {
  const q = QUIZ
  const g = c.store.guesses[q.day]
  const n = guessStreak(c.store.guesses, q.day)
  const rate = quizRate(q)
  const saved = c.store.saved.includes(q.ride.to)
  const pick = (name: string) => {
    const before = badges(stats(c.store))
    const next = { ...c.store, guesses: guess(c.store.guesses, q, name) }
    const got = BADGES.find(b => !before.includes(b.id) && badges(stats(next)).includes(b.id))
    c.setStore(next)
    if (got) c.setToast(`解鎖成就：${got.name}`)
  }
  return (
    <section className="gl quiz" data-cap="quiz">
      <div className="photo q-photo"><img src={q.src} alt="今天的題目照片" /><span className="s-tag">今天一題・乘客的車窗外</span></div>
      <div className="pad">
        <div className="q-head" data-cap="q-head"><b>這是哪條路？</b><small>{g ? `${q.players.toLocaleString()} 人猜過・${pct(rate)} 猜對` : '4 選 1・每天只能猜一次'}</small></div>
        <div className="q-opts" data-cap="q-opts">
          {q.options.map(o => {
            const right = o.name === q.answer, me = g?.pick === o.name
            return (
              <button key={o.name} disabled={!!g} className={'q-opt' + (g ? (right ? ' right' : me ? ' wrong' : ' done') : '')} onClick={() => pick(o.name)}>
                {g && <i className="q-bar" style={{ width: pct(o.pick) }} />}
                <span className="q-name">{o.name}</span>
                {g && <b className="q-pct">{pct(o.pick)}</b>}
                {g && right && <Check size={16} strokeWidth={3} className="q-ok" />}
                {g && me && !right && <X size={16} strokeWidth={3} className="q-ok" />}
              </button>
            )
          })}
        </div>
        {g && <>
          <div className={'q-result' + (g.ok ? '' : ' bad')} data-cap="q-result">
            {g.ok ? <><Flame size={16} /> 猜對了！連對 {n} 天・經驗 +{XP.correct}</> : <>猜錯了，連對天數歸零</>}
          </div>
          <div className="row2">
            <button className="g-cta" onClick={() => c.book('ride-quiz', `叫車去${q.ride.to}`, `從你的位置約 ${q.ride.min} 分鐘`)}><Car size={15} /> 叫車去這裡</button>
            <button className="g-ghost" disabled={saved} onClick={() => c.setStore(s => ({ ...s, saved: [...s.saved, q.ride.to] }))}>
              <Bookmark size={15} /> {saved ? '已收藏' : '收藏'}
            </button>
          </div>
        </>}
      </div>
    </section>
  )
}

// ---------- 一句話預約 ----------
// 今天頁行事曆下面的入口：點了打開跟小黃的對話
function TalkBar(c: Ctx) {
  return (
    <button className="gl talkbar tap" data-cap="talkbar" onClick={() => c.setView('talk')}>
      <MessageCircle size={18} /><span className="grow">跟小黃說要去哪…</span><Mic size={18} />
    </button>
  )
}

// 對話：說一句話 → 沒講清楚就問一句 → 確認卡，按了才預約（Demo 的解析結果是固定的）
function Talk(c: Ctx) {
  const [step, setStep] = useState(0)
  const [draft, setDraft] = useState('')
  const [mode, setMode] = useState<'arrive' | 'depart'>('arrive')
  const [pi, setPi] = useState(0)
  const place = TALK.places[pi]
  const end = React.useRef<HTMLDivElement>(null)
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }) }, [step])
  const st = petStage(petXp(c.store))
  const gear = gearOwned(c.store.booked)
  const p = TALK.parsed
  const plan = talkPlan(TALK, mode)
  const id = `talk-1017-${plan.pickup}`
  const booked = c.store.booked.includes(id)
  const send = () => { if (draft) { setDraft(''); setStep(1) } }
  const answer = (i: number) => { setMode(i === 0 ? 'arrive' : 'depart'); setStep(2) }
  const pupMsg = (cap: string, body: React.ReactNode) => (
    <div className="msg pup-msg" data-cap={cap}><Pup level={st.level} mood="happy" gear={gear} size={40} /><div className="bub">{body}</div></div>
  )
  return (
    <>
      <div className="talk-head">
        <button onClick={() => c.setView(null)}><ChevronLeft size={20} />今天</button>
        <b>跟小黃說</b><span />
      </div>
      <main className="scroll chat">
        {pupMsg('talk-hi', '要去哪裡？直接跟我說就好')}
        {step >= 1 && <div className="msg me" data-cap="talk-said"><div className="bub">{TALK.said}</div></div>}
        {step >= 1 && pupMsg('talk-ask', <>{TALK.ask}
          {step === 1 && <div className="quick">{TALK.options.map((o, i) => <button key={o} onClick={() => answer(i)}>{o}</button>)}</div>}</>)}
        {step >= 2 && <div className="msg me"><div className="bub">{TALK.options[mode === 'arrive' ? 0 : 1]}</div></div>}
        {step >= 2 && pupMsg('talk-card', <>
          {mode === 'arrive' ? `幫你排好了，會提早 ${TALK.buffer} 分到：` : '幫你排好了，確認就預約：'}
          <div className="mapcard" data-cap="talk-map">
            <MiniMap place={place} />
            <div className="mapaddr">
              <MapPin size={15} /><span className="grow"><b>{place.name}</b><small>{place.addr}{place.note && `・${place.note}`}</small></span>
              {!booked && <button onClick={() => setPi((pi + 1) % TALK.places.length)}>不是這裡</button>}
            </div>
          </div>
          <div className="ticket">
            <div><small>上車</small><b>{TALK.home.name}<em>{TALK.home.addr}</em></b></div>
            <div><small>上車時間</small><b><em className="pre">{p.date}</em><span className="big">{plan.pickup}</span></b></div>
            <div><small>車程</small><b>約 {TALK.ride} 分・{plan.arrive} 到</b></div>
          </div>
          {booked ? <div className="learned"><Check size={14} /> 已預約 {p.date} {plan.pickup}</div>
            : <div className="fb" data-cap="talk-ok">
              <button className="btn primary sm grow" onClick={() => { c.setStore(s => ({ ...s, booked: [...s.booked, id] })); c.setToast('已預約，司機指派後會通知你') }}>預約 {plan.pickup}</button>
              <button className="btn plain sm" onClick={() => setStep(1)}>改時間</button>
            </div>}
        </>)}
        <div ref={end} />
      </main>
      <div className="composer" data-cap="talk-input">
        {/* Demo：點輸入框就帶入示範句 */}
        <div className="field" data-cap="talk-field" onClick={() => step === 0 && !draft && setDraft(TALK.said)}>
          <span className={'grow' + (draft ? '' : ' ph')}>{draft || '例如：週五晚上 7 點去松山機場'}</span>
          {draft ? <button className="send" aria-label="送出" onClick={send}><ArrowUp size={18} /></button> : <Mic size={20} />}
        </div>
        <i className="home-bar dark" />
      </div>
    </>
  )
}

// 示意地圖：上車點、下車點和路線；正式版用 yoxi 叫車原本的地圖
function MiniMap({ place }: { place: (typeof TALK.places)[number] }) {
  const h = TALK.home
  return (
    <svg className="minimap" viewBox="0 0 300 140" preserveAspectRatio="xMidYMid slice" aria-label={`地圖：${h.name} 到 ${place.name}`}>
      <rect width="300" height="140" fill="#F2F0EA" />
      <path d="M-10 14 C 60 26, 100 2, 160 10 S 260 2, 310 16" stroke="#CFE3F5" strokeWidth="14" fill="none" />
      <rect x="66" y="118" width="64" height="30" rx="6" fill="#D8EBCF" />
      <rect x="168" y="76" width="44" height="26" rx="6" fill="#D8EBCF" />
      <g stroke="#FFFFFF" strokeWidth="7" strokeLinecap="round" fill="none">
        <path d="M0 62 H300 M0 112 H300 M30 34 H300 M58 30 V140 M104 30 V140 M150 30 V140 M230 30 V140 M270 30 V140" />
      </g>
      <path d="M150 30 V140" stroke="#FFE9A6" strokeWidth="8" strokeLinecap="round" />
      <polyline points={place.route.map(p => p.join(',')).join(' ')} fill="none" stroke="#1C1C1E" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" />
      <g className="maplabel">
        <text x={h.x} y={h.y - 14} textAnchor="middle">{h.name}</text>
        <text x={place.x} y={place.y - 34} textAnchor="middle">{place.name}</text>
      </g>
      <circle cx={h.x} cy={h.y} r="9" fill="#1C1C1E" stroke="#fff" strokeWidth="2" />
      <text x={h.x} y={h.y + 3.5} textAnchor="middle" className="pintext light">上</text>
      <path d={`M${place.x} ${place.y} c -3 -6 -11 -10 -11 -17 a 11 11 0 0 1 22 0 c 0 7 -8 11 -11 17 z`} fill="#FFC400" stroke="#1C1C1E" strokeWidth="1.5" />
      <text x={place.x} y={place.y - 13.5} textAnchor="middle" className="pintext">下</text>
      <text x="294" y="134" textAnchor="end" className="mapnote">地圖示意</text>
    </svg>
  )
}

// ---------- 小黃記得你的固定行程 ----------
type Habit = (typeof HABITS)[number]
const tomorrow = '2026-10-15'
const habitId = (h: Habit) => `${h.id}-${tomorrow}`
const bookHabit = (c: Ctx, h: Habit) => c.book(habitId(h), `預約明天 ${h.time} 叫車`, `${h.from} → ${h.to}，車程約 ${h.ride} 分；司機會在 ${h.time} 前到`)
// 按「這週不用」：只跳過這週，信心度用 Beta 分布下修一點（跟出門卡的回饋一樣）
const habitConf = (c: Ctx, h: Habit) => c.store.fb[habitId(h)] ? update(confidence(h), 'skip') : confidence(h)

// 今天頁：有把握的固定行程
function HabitCard(c: Ctx) {
  const h = HABITS[0]
  return (
    <button className="gl g-card row tap" data-cap="habitcard" onClick={() => c.setView('habits')}>
      <div className="pin"><Repeat size={19} /></div>
      <div className="grow">
        <small>固定行程</small>
        <b>明天{h.day} {h.time} 去{h.to}</b>
        <span className="muted">過去 4 個{h.day}都在這時間叫車</span>
      </div>
      <ChevronRight size={18} className="chev" />
    </button>
  )
}

// 鎖屏：前一晚問一次，直接在通知上預約
function HabitLock({ c, open }: { c: Ctx; open: () => void }) {
  const h = HABITS[0]
  const t = habitPush(h)
  const booked = c.store.booked.includes(habitId(h))
  const skipped = !!c.store.fb[habitId(h)]
  return <LockScreen c={c} open={open} title={booked ? `已預約明天 ${h.time}` : t.title} body={booked ? '司機指派後會通知您' : skipped ? '好，這週不用；規律還記著' : t.body}
    actions={booked || skipped ? undefined : [[`預約 ${h.time}`, () => bookHabit(c, h)], ['這週不用', () => c.setStore(s => ({ ...s, fb: { ...s.fb, [habitId(h)]: 'skip' } }))]]} />
}

function Habits(c: Ctx) {
  const st = petStage(petXp(c.store))
  const [h1, ...rest] = HABITS
  return (
    <>
      <i className="gblob a" /><i className="gblob b" /><i className="gblob c" />
      <div className="g-nav"><button className="gl g-back" aria-label="今天" onClick={() => c.setView(null)}><ChevronLeft size={22} /></button></div>
      <header className="g-title">
        <div><h1>固定行程</h1><small>小黃記得你每週的那一趟</small></div>
        <span data-cap="says"><Pup level={st.level} mood="happy" gear={gearOwned(c.store.booked)} size={50} /></span>
      </header>
      <HabitHero c={c} h={h1} />
      <div className="g-label">其他常搭的</div>
      <section className="gl g-list">
        {rest.filter(h => habitBand(habitConf(c, h)).key === 'app').map((h, i) => <HabitLine key={h.id} c={c} h={h} cap={'habit' + (i + 2)} />)}
      </section>
    </>
  )
}

// 有把握的那一趟：大卡片，直接預約
function HabitHero({ c, h }: { c: Ctx; h: Habit }) {
  const id = habitId(h)
  const booked = c.store.booked.includes(id)
  const skipped = !!c.store.fb[id]
  const n = h.weeks.reduce((a, b) => a + b, 0)
  return (
    <section className="gl g-hero" data-cap="habit1">
      <div className="g-row">
        <div className="grow">
          <small className="g-when">每{h.day}・{h.time}</small>
          <b className="g-route">{h.from} → {h.to}</b>
          <div className="g-dots" data-cap="habit1-weeks">
            {h.weeks.map((w, k) => <i key={k} className={w ? 'on' : ''} />)}
            <span>近 4 週搭了 {n} 次</span>
          </div>
        </div>
        <span className="gl g-badge"><Repeat size={22} /></span>
      </div>
      {booked ? <div className="g-done"><Check size={16} /> 已預約明天 {h.time}</div>
        : skipped ? <div className="g-done muted"><Check size={16} /> 好，這週不用，下週再問你</div>
          : <div className="g-actions" data-cap="habit-fb">
            <button className="g-cta" onClick={() => bookHabit(c, h)}>預約明天 {h.time}</button>
            <button className="g-ghost" onClick={() => c.setStore(s => ({ ...s, fb: { ...s.fb, [id]: 'skip' } }))}>這週不用</button>
          </div>}
    </section>
  )
}

function HabitLine({ c, h, cap }: { c: Ctx; h: Habit; cap: string }) {
  const id = habitId(h)
  const booked = c.store.booked.includes(id)
  return (
    <div className="g-line" data-cap={cap}>
      <div className="grow">
        <b>{h.from} → {h.to}</b>
        <small>每{h.day} {h.time} 左右</small>
      </div>
      {booked ? <span className="g-booked"><Check size={14} /> 已預約</span>
        : <button className="g-mini" onClick={() => bookHabit(c, h)}>預約</button>}
    </div>
  )
}

// ---------- 車上隨手拍 ----------
// 照片右下角的小黃相框：存下來、分享出去都帶著小黃
function PupFrame({ c }: { c: Ctx }) {
  const st = petStage(petXp(c.store))
  return <i className="frame"><Pup level={st.level} mood="happy" gear={gearOwned(c.store.booked)} size={58} /></i>
}

// 猜一猜分頁：車上能投稿；平常看你的題目成績和榮譽榜
function Share(c: Ctx) {
  const ride = c.scn.key === 'share' ? RIDE : null
  const st = petStage(petXp(c.store))
  const asked = !!c.store.shares[RIDE.id]?.asked
  if (canShare(ride)) return <Shoot {...c} />
  return (
    <>
      <i className="gblob a" /><i className="gblob b" /><i className="gblob c" />
      <header className="g-title s-title"><div><h1>猜一猜</h1><small>乘客在車上拍，大家每天猜一題</small></div></header>
      {asked ? <MyQuiz {...c} /> : (
        <section className="gl s-locked" data-cap="locked">
          <Pup level={st.level} mood="sleep" size={104} />
          <b>搭 yoxi 時才能拍</b>
          <span>上車後小黃會坐到車窗邊；你拍的窗外，可能變成明天大家猜的題目</span>
          <button className="g-cta" onClick={() => c.setTab('ride')}>叫車</button>
        </section>
      )}
      <Honor {...c} />
      <p className="g-foot">好題才會上榜：答對率 20–70%、每個選項都有人選</p>
    </>
  )
}

// 車上投稿：拍窗外 → 綁定定位 → AI 選題 → 投稿
function Shoot(c: Ctx) {
  const mine = c.store.shares[RIDE.id]
  const [shot, setShot] = useState(!!mine)
  const st = petStage(petXp(c.store))
  const gear = gearOwned(c.store.booked)
  const send = () => c.setStore(s => ({ ...s, shares: share(s.shares, RIDE, SHOT) }))
  return (
    <>
      <i className="gblob a" /><i className="gblob b" /><i className="gblob c" />
      <header className="g-title s-title"><div><h1>猜一猜</h1><small>車上投稿・可能變成明天的題目</small></div></header>
      <section className="gl s-ride" data-cap="ride">
        <i className="s-live" />
        <div className="grow"><small>行程中</small><b>{RIDE.from} → {RIDE.to}</b></div>
        <span className="s-eta"><b>{RIDE.eta}</b>分</span>
      </section>
      <section className="s-say" data-cap="window">
        <Pup level={st.level} mood="happy" gear={gear} size={46} />
        <span className="gl s-bub">{mine ? '投稿了！明天看看難倒幾個人' : shot ? '有線索又不會太好猜，可以投稿了' : '窗外拍一張，可能變成明天的題目！'}</span>
      </section>
      {!shot && (
        <section className="s-shoot" data-cap="pick">
          <button className="s-shutter" aria-label="拍窗外" onClick={() => setShot(true)}><Camera size={30} /></button>
          <b>拍窗外</b>
          <small>一趟車算一張・經驗 +{XP.share}，出成題目再 +{XP.asked}</small>
        </section>
      )}
      {shot && <>
        <section className="s-photo" data-cap="photo" style={{ height: 'auto', aspectRatio: '380 / 270' }}>
          <img src={SHOT.src} alt="要投稿的照片" />
          <span className="s-tag" data-cap="gps"><MapPin size={11} /> {SHOT.district}區・手機＋車輛 GPS</span>
          <PupFrame c={c} />
        </section>
        <section className="gl s-review">
          <div className="s-head"><Sparkles size={14} /> AI 選題通過</div>
          <ul className="s-checks" data-cap="checks">
            {SHOT_CHECKS.map(t => <li key={t.key} data-cap={'chk-' + t.key}><i><Check size={12} strokeWidth={3} /></i>{t.text}</li>)}
          </ul>
          {mine ? <>
            <div className="g-done" data-cap="done"><Check size={16} /><span>已投稿・小黃經驗 +{XP.share}</span></div>
            <small className="s-note">明天可能出成題目・精確位置不公開</small>
          </> : <button className="g-cta s-send" data-cap="send" onClick={send}>投稿</button>}
        </section>
      </>}
      {!shot && <p className="g-foot">乘客拍，司機不用操作・精確位置不公開</p>}
    </>
  )
}

// 你的照片成了題目：幾人猜、幾人猜對、封號；選項的選擇率也是 AI 判斷好題的依據
function MyQuiz(c: Ctx) {
  const q = MY_QUIZ
  const rate = quizRate(q)
  const qa = quality(q)
  return (
    <section className="gl quiz" data-cap="myquiz">
      <div className="photo"><img src={q.src} alt="你投稿的照片" /><span className="s-tag">今天的題目・你拍的</span><PupFrame c={c} /></div>
      <div className="pad">
        <div className="h-stat" data-cap="h-stat"><b>{q.players.toLocaleString()}</b> 人猜，只有 <b>{myCorrect}</b> 人猜對</div>
        <div className="h-title" data-cap="h-title"><Award size={16} /> 封號「{photoTitle(rate).name}」<small>答對率 {pct(rate)}・經驗 +{XP.asked}</small></div>
        <div className="q-opts mini" data-cap="h-opts">
          {q.options.map(o => (
            <div key={o.name} className={'q-opt done' + (o.name === q.answer ? ' right' : '')}>
              <i className="q-bar" style={{ width: pct(o.pick) }} />
              <span className="q-name">{o.name}</span><b className="q-pct">{pct(o.pick)}</b>
            </div>
          ))}
        </div>
        <small className="h-ai" data-cap="h-ai"><Sparkles size={13} /> AI 評估：{qa.good ? '好題' : '要修正'}・答對率在 20–70%，每個選項都有人選</small>
      </div>
    </section>
  )
}

// 榮譽榜：依難倒幾人排名；本週／本月／今年（Demo 顯示本月）
function Honor(c: Ctx) {
  const asked = !!c.store.shares[RIDE.id]?.asked
  return <>
    <div className="g-label">10 月榮譽榜・依難倒人數</div>
    <section className="gl h-board" data-cap="honor">
      <div className="h-seg">{HONOR.periods.map((p, i) => <span key={p} className={i === 1 ? 'on' : ''}>{p}</span>)}</div>
      {HONOR.month.map((r, i) => (
        <div key={r.name} className="g-line h-row">
          <span className={'h-rank r' + (i + 1)}>{i + 1}</span>
          <div className="grow"><b>{r.name}</b><small>{photoTitle(r.correct / r.players).name}・{r.players.toLocaleString()} 人猜</small></div>
          <span className="h-num"><b>{stumped(r.players, r.correct).toLocaleString()}</b><small>難倒</small></span>
        </div>
      ))}
      {asked && (
        <div className="g-line h-row me" data-cap="h-me">
          <span className="h-rank">{HONOR.myRank}</span>
          <div className="grow"><b>你</b><small>{photoTitle(quizRate(MY_QUIZ)).name}・{MY_QUIZ.players.toLocaleString()} 人猜</small></div>
          <span className="h-num"><b>{stumped(MY_QUIZ.players, myCorrect).toLocaleString()}</b><small>難倒</small></span>
        </div>
      )}
    </section>
  </>
}

// ---------- 小黃 ----------
const GEAR_ICON: Record<string, React.ReactNode> = {
  raincoat: <CloudRain size={16} />,
  bowtie: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M12 12 4 7v10Z" /><path d="m12 12 8-5v10Z" /></svg>,
  ticket: <Ticket size={16} />,
}

function Ring({ n, target, size = 54 }: { n: number; target: number; size?: number }) {
  const r = (size - 8) / 2, len = 2 * Math.PI * r
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`}>
        <defs><linearGradient id="ring-acc" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#FFE066" /><stop offset="1" stopColor="#F5B000" /></linearGradient></defs>
        <circle className="track" cx={size / 2} cy={size / 2} r={r} />
        <circle className="bar" cx={size / 2} cy={size / 2} r={r} stroke="url(#ring-acc)" strokeDasharray={`${len * Math.min(1, n / target)} ${len}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <b>{n}<em>/{target}</em></b>
    </div>
  )
}

const BADGE_ICON: Record<string, React.ReactNode> = {
  streak3: <Flame size={18} />, streak7: <Flame size={18} />, streak30: <Flame size={18} />, asked: <ImageIcon size={18} />, stump1k: <Trophy size={18} />,
}

function Pet(c: Ctx) {
  const got = badges(stats(c.store))
  const now = guessStreak(c.store.guesses, c.scn.day)
  const month = monthProgress(c.store.days, '2026-10')
  const st = petStage(petXp(c.store))
  const owned = gearOwned(c.store.booked)
  const pct = st.next ? ((st.xp - st.min) / (st.xp - st.min + st.next.left)) * 100 : 100
  const steps = (STAGES as { name: string }[]).map((s, i) => ({ label: s.name.replace('小黃', ''), state: i + 1 < st.level ? 'done' : i + 1 === st.level ? 'on' : '' }))
  return (
    <>
      <i className="gblob a" /><i className="gblob b" /><i className="gblob c" />
      <header className="g-title s-title"><div><small>2026 年</small><h1>小黃</h1></div></header>
      <section className="gl p-hero" data-cap="pet">
        <i className="p-halo" />
        <Pup level={st.level} mood="happy" gear={owned} size={108} />
        <b>{st.name}</b>
        <span>經驗 {st.xp}{st.next ? `・再 ${st.next.left} 點變成${st.next.name}` : ''}</span>
        <div className="p-ladder">
          {steps.map((s, i) => (
            <React.Fragment key={s.label}>
              {i > 0 && <div className={'ln' + (s.state ? '' : ' half')}><i style={{ width: s.state ? '100%' : `${Math.max(pct, 4)}%` }} /></div>}
              <div className={'st ' + s.state}>
                <span className="dot">{s.state === 'done' ? <Check size={15} /> : s.state === 'on' ? <PawPrint size={15} /> : <Lock size={15} />}</span>{s.label}
              </div>
            </React.Fragment>
          ))}
        </div>
        <div className="p-earn" data-cap="earn"><span>打開出門卡 <b>+{XP.open}</b></span><span>猜對 <b>+{XP.correct}</b></span><span>車上投稿 <b>+{XP.share}</b></span><span>出成題目 <b>+{XP.asked}</b></span></div>
      </section>
      <div className="p-two">
        <section className="gl p-card" data-cap="reward">
          <small>每月</small>
          <div className="p-month">
            <Ring n={month.n} target={month.target} />
            <div><b>NT$30<br />乘車金</b><span>{month.earned ? '這個月拿到了' : `再 ${month.target - month.n} 天`}</span></div>
          </div>
        </section>
        <section className="gl p-card" data-cap="gear">
          <small>配件</small>
          <span className="p-cnt">{owned.length}<em>/{GEAR.length}</em></span>
          <div className="p-gear">
            {GEAR.map(g => <i key={g.id} className={owned.includes(g.id) ? 'on' : ''} title={owned.includes(g.id) ? g.name : g.how}>{GEAR_ICON[g.id]}</i>)}
          </div>
        </section>
      </div>
      <section className="gl p-map" data-cap="badges">
        <div className="p-map-hd"><b><Trophy size={15} /> 成就 {got.length} / {BADGES.length}</b><span>現在連對 {now} 天・猜錯歸零</span></div>
        <div className="p-badges">
          {BADGES.map(b => <div key={b.id} className={got.includes(b.id) ? 'on' : ''}><i>{got.includes(b.id) ? BADGE_ICON[b.id] : <Lock size={16} />}</i><span>{b.name}</span></div>)}
        </div>
      </section>
      {c.store.saved.length > 0 && <>
        <div className="g-label">想去的地方</div>
        <section className="gl g-list">
          {c.store.saved.map(p => (
            <div key={p} className="g-line"><MapPin size={16} /><b className="grow">{p}</b><button className="g-mini" onClick={() => c.book('ride-' + p, `叫車去${p}`, '從你的位置出發')}>叫車</button></div>
          ))}
        </section>
      </>}
      <p className="g-foot">小黃不會餓、不會死；猜錯只會讓連對歸零<br />12 月整理成小黃的城市年報</p>
    </>
  )
}

// 簡報用：三個階段並排
function Pups() {
  return (
    <div className="pups">
      {[1, 2, 3].map(l => <div key={l} data-cap={'pup' + l}><Pup level={l} mood={l === 2 ? 'happy' : 'awake'} size={300} /></div>)}
      <div data-cap="pup-raincoat"><Pup level={2} mood="happy" gear={['raincoat']} size={300} /></div>
      <div data-cap="pup-bowtie"><Pup level={2} mood="happy" gear={['bowtie']} size={300} /></div>
      <div data-cap="pup-sleep"><Pup level={2} mood="sleep" size={300} /></div>
    </div>
  )
}

// ---------- 叫車（原本的 yoxi 功能，示意） ----------
function Ride(c: Ctx) {
  return (
    <>
      <header className="large"><div><small>yoxi</small><h1>要去哪裡？</h1></div></header>
      <section className="card list">
        <button className="place tap" onClick={() => c.book('ride-home', '叫車回家', '松山區民生社區')}><Home size={16} /><span className="grow">家</span><ChevronRight size={16} className="chev" /></button>
        <button className="place tap" onClick={() => c.book('ride-work', '叫車去公司', '內湖科技園區')}><Briefcase size={16} /><span className="grow">公司</span><ChevronRight size={16} className="chev" /></button>
      </section>
      <p className="fine center">原本的叫車功能，Demo 中只做示意</p>
    </>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
