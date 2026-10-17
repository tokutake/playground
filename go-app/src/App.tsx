import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  type Board as BoardT,
  type Pos,
  type Stone,
  boardKey,
  chooseCpuMove,
  emptyBoard,
  getGroup,
  komiFor,
  opponent,
  playMove,
  scoreJapanese,
} from './go'

const SIZES = [
  { size: 5, label: '5 × 5', note: 'はじめの一歩' },
  { size: 7, label: '7 × 7', note: 'ルールになれる' },
  { size: 9, label: '9 × 9', note: '本格入門' },
  { size: 13, label: '13 × 13', note: 'ステップアップ' },
  { size: 19, label: '19 × 19', note: '正式な盤' },
]

const RULES: { title: string; body: string }[] = [
  { title: '1. 目的', body: '黒と白が交互に石を置き、より広い「陣地」を囲った方が勝ちです。黒が先手です。' },
  { title: '2. 石は交点に置く', body: '石は線と線の交わる点に置きます。置いた石は動かせません。' },
  { title: '3. 呼吸点（こきゅうてん）', body: '石の上下左右の空いた点を「呼吸点」と言います。つながった石は一つのグループとして呼吸点を共有します。' },
  { title: '4. 石を取る', body: '相手の石の呼吸点を全部ふさぐと、その石を盤から取れます。残り1つは「アタリ」の合図！' },
  { title: '5. 禁じ手', body: '自分の石が呼吸点ゼロになる場所には置けません（自殺手）。ただし相手の石が取れるなら置けます。' },
  { title: '6. コウ', body: '1目を取り合って同じ形が繰り返される場合、取られた直後にすぐ取り返すことはできません。別の場所に打ってからどうぞ。' },
  { title: '7. パスと終局', body: '打つ所がなければパス。両者が続けてパスすると終局です。' },
  { title: '8. 日本ルールの数え方', body: '「陣地の目の数 ＋ 取った石（アゲハマ）」が得点です。盤上の石は数えません。白は先手の黒に対するハンデとしてコミ（小さい盤は0.5目、9路以上は6.5目）が加算されます。終局時に取られそうな石（死に石）は選んで取り上げます。' },
]

const REASONS: Record<string, string> = {
  occupied: 'そこにはすでに石があります。空いている交点を選んでね。',
  suicide: '自殺手です！置くと自分の石の呼吸点がゼロになるので置けません（相手の石が取れる場合は置けます）。',
  ko: 'コウです！直前に取られた石をすぐ取り返すことはできません。別の場所に打ってからにしましょう。',
}

const name = (s: Stone) => (s === 'B' ? '黒' : '白')

const tutorialBoard = (rows: string[]): BoardT => rows.map((row) =>
  row.split('').map((cell) => cell === 'B' ? 'B' : cell === 'W' ? 'W' : null),
)

const TUTORIAL_STEPS = [
  {
    title: '交点に石を置く',
    text: '線と線が交わる場所をクリックして、黒い石を置いてみましょう。まずは真ん中です。',
    board: tutorialBoard(['.....', '.....', '.....', '.....', '.....']),
    target: { x: 2, y: 2 },
    success: '石を置けました！石は交点に置き、いったん置くと動かしません。',
  },
  {
    title: '石のまわりの空きを見る',
    text: '黒石の上下左右にある空きが「呼吸点」です。黄色の場所に打つと、白石の呼吸点が1つだけになります。',
    board: tutorialBoard(['.....', '.....', '.BWB.', '.....', '.....']),
    target: { x: 2, y: 1 },
    success: '白石の呼吸点は下の1か所だけになりました。この「あと1つで取られる」状態をアタリと呼びます。',
  },
  {
    title: '相手の石を取る',
    text: '白石の最後の空きに黒石を置いてみましょう。黄色の場所をクリックしてください。',
    board: tutorialBoard(['.....', '..B..', '.BWB.', '.....', '.....']),
    target: { x: 2, y: 3 },
    success: '白石が盤から取り除かれました！相手の石のまわりの空きを全部ふさぐと取れます。',
  },
  {
    title: '味方の石をつなぐ',
    text: '2つの黒石の間に置くと、石どうしがつながります。黄色の場所に打ってみましょう。',
    board: tutorialBoard(['.....', '.....', '.B.B.', '.....', '.....']),
    target: { x: 2, y: 2 },
    success: 'できました！つながった石は、まわりの空きを共有して取られにくくなります。',
  },
  {
    title: '危ない味方を助ける',
    text: '真ん中の黒石の上下左右は白石3つと空き1つです。黄色の場所に黒石を足して、味方を助けましょう。',
    board: tutorialBoard(['.....', '..W..', '.WBW.', '.....', '.....']),
    target: { x: 2, y: 3 },
    success: '黒石をつないで、空きを増やせました。自分の石のまわりが狭くなったら、取られる前に助けましょう。',
  },
  {
    title: 'すみから陣地を作る',
    text: 'すみは盤の端が2つあり、囲いやすい場所です。黄色の交点に置いて、すみの空きを囲ってみましょう。',
    board: tutorialBoard(['.B...', 'B....', '.....', '.....', '.....']),
    target: { x: 1, y: 1 },
    success: 'すみの空きを囲めました！相手の石を取ることだけでなく、空いた場所を囲うことも勝つコツです。',
  },
  {
    title: '相手を追いかけすぎない',
    text: '白石の近くばかりに打つ必要はありません。黄色の場所に打って、離れた空きも自分の陣地にしてみましょう。',
    board: tutorialBoard(['B....', '.....', '..W..', '.....', '.....']),
    target: { x: 4, y: 0 },
    success: '白石を追わずに、別の空いた場所にも打てました。盤の広い場所を使って陣地を増やしましょう。',
  },
] as const

const lastTutorialStep = TUTORIAL_STEPS[TUTORIAL_STEPS.length - 1]
const TUTORIAL_COMPLETION_BOARD = (() => {
  const result = playMove(lastTutorialStep.board, lastTutorialStep.target, 'B')
  return result.ok ? result.board : lastTutorialStep.board
})()

type Snapshot = {
  board: BoardT
  turn: Stone
  captures: { B: number; W: number }
  prevKey?: string
  lastMove: Pos | null
  passes: number
  message: string
}

type PlacementHint = { pos: Pos; reason: string }

type Mode = 'cpu' | 'two'
type CpuDifficulty = 'easy' | 'normal'

function BoardView({
  board,
  turn,
  lastMove,
  hintPos,
  disabled,
  dead,
  territory,
  onPlay,
  hoverOk,
}: {
  board: BoardT
  turn: Stone
  lastMove: Pos | null
  hintPos?: Pos | null
  disabled?: boolean
  dead?: Set<string>
  territory?: (Stone | null)[][]
  onPlay: (p: Pos) => void
  hoverOk: (p: Pos) => boolean
}) {
  const n = board.length
  const cell = n <= 9 ? 56 : n <= 13 ? 42 : 32
  const pad = cell
  const W = cell * (n - 1) + pad * 2
  const [hover, setHover] = useState<Pos | null>(null)
  const stars = useMemo(() => {
    const pts: number[] =
      n === 19 ? [3, 9, 15] : n === 13 ? [3, 6, 9] : n === 9 ? [2, 4, 6] : n === 7 ? [3] : n === 5 ? [2] : []
    return pts.flatMap((y) => pts.map((x) => ({ x, y })))
  }, [n])
  const px = (i: number) => pad + i * cell
  const r = cell * 0.46
  const letters = 'ABCDEFGHJKLMNOPQRST'
  return (
    <svg
      viewBox={`0 0 ${W} ${W}`}
      className="w-full max-w-[640px] rounded-xl shadow-2xl select-none"
      role="img"
      aria-label={`${n}路盤`}
      onMouseLeave={() => setHover(null)}
    >
      <defs>
        <linearGradient id="wood" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#e8c47c" />
          <stop offset="0.5" stopColor="#dcb068" />
          <stop offset="1" stopColor="#c99a55" />
        </linearGradient>
        <radialGradient id="blk" cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#666" />
          <stop offset="1" stopColor="#050505" />
        </radialGradient>
        <radialGradient id="wht" cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#fff" />
          <stop offset="1" stopColor="#cfcfc8" />
        </radialGradient>
        <filter id="sh" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="1.5" dy="2.5" stdDeviation="2" floodOpacity="0.45" />
        </filter>
      </defs>
      <rect width={W} height={W} fill="url(#wood)" />
      {Array.from({ length: n }, (_, i) => (
        <g key={i} stroke="#5a3d17" strokeWidth={i === 0 || i === n - 1 ? 2 : 1.1}>
          <line x1={px(0)} x2={px(n - 1)} y1={px(i)} y2={px(i)} />
          <line y1={px(0)} y2={px(n - 1)} x1={px(i)} x2={px(i)} />
        </g>
      ))}
      {stars.map((s) => (
        <circle key={`${s.x}${s.y}`} cx={px(s.x)} cy={px(s.y)} r={cell * 0.09} fill="#5a3d17" />
      ))}
      {n >= 9 &&
        Array.from({ length: n }, (_, i) => (
          <g key={i} fontSize={cell * 0.3} fill="#7a5a2a" textAnchor="middle">
            <text x={px(i)} y={pad * 0.45}>{letters[i]}</text>
            <text x={pad * 0.4} y={px(i) + cell * 0.1}>{n - i}</text>
          </g>
        ))}
      {territory?.map((row, y) =>
        row.map((o, x) =>
          o ? (
            <rect
              key={`t${x}${y}`}
              x={px(x) - cell * 0.15}
              y={px(y) - cell * 0.15}
              width={cell * 0.3}
              height={cell * 0.3}
              fill={o === 'B' ? '#111' : '#fff'}
              stroke="#333"
            />
          ) : null,
        ),
      )}
      {board.map((row, y) =>
        row.map((c, x) =>
          c ? (
            <g key={`s${x}${y}`} opacity={dead?.has(`${x},${y}`) ? 0.35 : 1}>
              <circle cx={px(x)} cy={px(y)} r={r} fill={c === 'B' ? 'url(#blk)' : 'url(#wht)'} filter="url(#sh)" />
              {lastMove?.x === x && lastMove.y === y && (
                <circle cx={px(x)} cy={px(y)} r={r * 0.4} fill="none" stroke="#e11d48" strokeWidth={2.5} />
              )}
            </g>
          ) : null,
        ),
      )}
      {hintPos && board[hintPos.y][hintPos.x] === null && (
        <g pointerEvents="none" aria-label="おすすめの場所">
          <circle cx={px(hintPos.x)} cy={px(hintPos.y)} r={r * 0.9} fill="#facc15" opacity={0.32} />
          <circle
            cx={px(hintPos.x)}
            cy={px(hintPos.y)}
            r={r * 0.78}
            fill="none"
            stroke="#92400e"
            strokeWidth={3}
            strokeDasharray="5 4"
          />
        </g>
      )}
      {!disabled && hover && board[hover.y][hover.x] === null && hoverOk(hover) && (
        <circle cx={px(hover.x)} cy={px(hover.y)} r={r} fill={turn === 'B' ? '#000' : '#fff'} opacity={0.4} />
      )}
      {board.map((row, y) =>
        row.map((_, x) => (
          <rect
            key={`h${x}${y}`}
            x={px(x) - cell / 2}
            y={px(y) - cell / 2}
            width={cell}
            height={cell}
            fill="transparent"
            className="cursor-pointer"
            data-testid={`pt-${x}-${y}`}
            onMouseEnter={() => setHover({ x, y })}
            onClick={() => onPlay({ x, y })}
          />
        )),
      )}
    </svg>
  )
}

export default function App() {
  const [size, setSize] = useState<number | null>(null)
  const [mode, setMode] = useState<Mode>('cpu')
  const [cpuDifficulty, setCpuDifficulty] = useState<CpuDifficulty>('easy')
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const [history, setHistory] = useState<Snapshot[]>([])
  const [dead, setDead] = useState<Set<string>>(new Set())
  const [placementHint, setPlacementHint] = useState<PlacementHint | null>(null)
  const [showRules, setShowRules] = useState(false)
  const [tutorialStep, setTutorialStep] = useState<number | null>(null)
  const [tutorialMessage, setTutorialMessage] = useState('')
  const [tips, setTips] = useState(true)

  const start = (s: number) => {
    setSize(s)
    setHistory([])
    setDead(new Set())
    setPlacementHint(null)
    setSnap({
      board: emptyBoard(s),
      turn: 'B',
      captures: { B: 0, W: 0 },
      lastMove: null,
      passes: 0,
      message: `${s}路盤で対局開始！黒（あなた）から。好きな交点をクリックして石を置いてみましょう。`,
    })
  }

  const finished = !!snap && snap.passes >= 2
  const cpuTurn = mode === 'cpu' && snap?.turn === 'W' && !finished

  const beginTutorial = () => {
    setTutorialStep(0)
    setTutorialMessage('')
  }

  const handleTutorialPlay = (pos: Pos) => {
    if (tutorialStep === null || tutorialStep >= TUTORIAL_STEPS.length) return
    const step = TUTORIAL_STEPS[tutorialStep]
    if (pos.x !== step.target.x || pos.y !== step.target.y) {
      setTutorialMessage('黄色い丸の交点をクリックしてみましょう。')
      return
    }
    setTutorialMessage(step.success)
    setTutorialStep(tutorialStep + 1)
  }

  const commit = useCallback((next: Snapshot) => {
    setSnap((cur) => {
      if (cur) setHistory((h) => [...h, cur])
      return next
    })
  }, [])

  const play = (p: Pos) => {
    if (!snap || finished || cpuTurn) return
    setPlacementHint(null)
    const res = playMove(snap.board, p, snap.turn, snap.prevKey)
    if (!res.ok) {
      setSnap({ ...snap, message: REASONS[res.reason] ?? '' })
      return
    }
    const captures = { ...snap.captures }
    captures[snap.turn] += res.captured.length
    let msg = `${name(snap.turn)}が打ちました。`
    if (res.captured.length) msg = `${res.captured.length}子を取りました！呼吸点がなくなった石は盤から取り上げられ、アゲハマ（得点）になります。`
    else if (res.atari.length) msg = 'アタリ！相手の石の呼吸点が残り1つ。次に取られてしまいます。'
    else if (res.selfAtari) msg = '注意：自分の石が呼吸点1つ（アタリ）になりました。取られるかも…'
    else if (snap.lastMove === null) msg = '最初の一手！石の上下左右の空き（呼吸点）がその石の命です。'
    commit({
      board: res.board,
      turn: opponent(snap.turn),
      captures,
      prevKey: boardKey(snap.board),
      lastMove: p,
      passes: 0,
      message: msg,
    })
  }

  const pass = () => {
    if (!snap || finished || cpuTurn) return
    setPlacementHint(null)
    const passes = snap.passes + 1
    commit({
      ...snap,
      turn: opponent(snap.turn),
      passes,
      prevKey: boardKey(snap.board),
      lastMove: null,
      message:
        passes >= 2
          ? '両者パスで終局です。取られそうな死に石をクリックして選び、結果を確認しましょう。'
          : `${name(snap.turn)}がパスしました。もう片方もパスすると終局です。`,
    })
  }

  useEffect(() => {
    if (!snap || !cpuTurn) return
    const t = setTimeout(() => {
      const mv = chooseCpuMove(snap.board, 'W', snap.prevKey, cpuDifficulty)
      if (!mv) {
        commit({
          ...snap,
          turn: 'B',
          passes: snap.passes + 1,
          prevKey: boardKey(snap.board),
          lastMove: null,
          message: snap.passes + 1 >= 2 ? '両者パスで終局です。死に石をクリックして選び、結果を確認しましょう。' : '白（CPU）はパスしました。',
        })
        return
      }
      const res = playMove(snap.board, mv, 'W', snap.prevKey)
      if (!res.ok) return
      const captures = { ...snap.captures, W: snap.captures.W + res.captured.length }
      commit({
        board: res.board,
        turn: 'B',
        captures,
        prevKey: boardKey(snap.board),
        lastMove: mv,
        passes: 0,
        message: res.captured.length
          ? `白（CPU）があなたの石を${res.captured.length}子取りました。`
          : res.atari.length
            ? '白（CPU）の一手で、あなたの石がアタリになりました！'
            : '白（CPU）が打ちました。あなたの番です。',
      })
    }, 500)
    return () => clearTimeout(t)
  }, [snap, cpuTurn, commit, cpuDifficulty])

  const undo = () => {
    if (!history.length) return
    setPlacementHint(null)
    let steps = 1
    if (mode === 'cpu' && history.length >= 2 && snap?.turn === 'B') steps = 2
    const target = history[history.length - steps]
    setHistory(history.slice(0, history.length - steps))
    setDead(new Set())
    setSnap({ ...target, message: '一手戻しました。' })
  }

  const toggleDead = (p: Pos) => {
    if (!snap) return
    const c = snap.board[p.y][p.x]
    if (!c) return
    const g = getGroup(snap.board, p)
    const keys = g.stones.map((s) => `${s.x},${s.y}`)
    const n = new Set(dead)
    const all = keys.every((k) => n.has(k))
    keys.forEach((k) => (all ? n.delete(k) : n.add(k)))
    setDead(n)
  }

  const requestPlacementHint = () => {
    if (!snap || finished || cpuTurn) return
    const board = snap.board
    const size = board.length
    const candidates: { pos: Pos; result: Extract<ReturnType<typeof playMove>, { ok: true }> }[] = []
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const pos = { x, y }
        const result = playMove(board, pos, snap.turn, snap.prevKey)
        if (result.ok) candidates.push({ pos, result })
      }
    }

    if (!candidates.length) {
      setPlacementHint(null)
      return
    }

    const captures = candidates
      .filter(({ result }) => result.captured.length > 0)
      .sort((a, b) => b.result.captured.length - a.result.captured.length)
    if (captures.length) {
      setPlacementHint({ pos: captures[0].pos, reason: 'ここに打つと相手の石を取れます。黄色の丸を目印にしてみましょう。' })
      return
    }

    const threatened = new Map<string, Pos[]>()
    board.forEach((row, y) => row.forEach((stone, x) => {
      if (stone !== snap.turn) return
      const group = getGroup(board, { x, y })
      if (group.liberties.length === 1) threatened.set(group.stones.map((p) => `${p.x},${p.y}`).sort().join('|'), group.liberties)
    }))
    const defense = candidates.find(({ pos }) =>
      [...threatened.values()].some((liberties) => liberties.some((p) => p.x === pos.x && p.y === pos.y)),
    )
    if (defense) {
      setPlacementHint({ pos: defense.pos, reason: 'アタリになっている味方の石を助けられる場所です。黄色の丸に打つと呼吸点を増やせます。' })
      return
    }

    if (board.every((row) => row.every((stone) => stone === null))) {
      const center = { x: Math.floor(size / 2), y: Math.floor(size / 2) }
      setPlacementHint({ pos: center, reason: '最初は中央付近から始めてみましょう。黄色の丸が最初の一手のおすすめです。' })
      return
    }

    const attack = candidates.find(({ result }) => result.atari.length > 0)
    if (attack) {
      setPlacementHint({ pos: attack.pos, reason: 'ここに打つと相手の石をアタリにできます。相手の呼吸点を見てみましょう。' })
      return
    }

    const center = (size - 1) / 2
    const score = ({ pos, result }: (typeof candidates)[number]) => {
      const edge = Math.min(pos.x, pos.y, size - 1 - pos.x, size - 1 - pos.y)
      const nearCenter = size - Math.abs(pos.x - center) - Math.abs(pos.y - center)
      const adjacentFriends = [
        board[pos.y]?.[pos.x - 1], board[pos.y]?.[pos.x + 1],
        board[pos.y - 1]?.[pos.x], board[pos.y + 1]?.[pos.x],
      ].filter((stone) => stone === snap.turn).length
      return nearCenter * 0.4 + (edge === 0 ? -3 : edge === 1 ? 0.5 : 1) + adjacentFriends * 0.8 - (result.selfAtari ? 20 : 0)
    }
    candidates.sort((a, b) => score(b) - score(a) || a.pos.y - b.pos.y || a.pos.x - b.pos.x)
    const chosen = candidates[0]
    const adjacentFriend = [
      board[chosen.pos.y]?.[chosen.pos.x - 1], board[chosen.pos.y]?.[chosen.pos.x + 1],
      board[chosen.pos.y - 1]?.[chosen.pos.x], board[chosen.pos.y + 1]?.[chosen.pos.x],
    ].some((stone) => stone === snap.turn)
    setPlacementHint({
      pos: chosen.pos,
      reason: adjacentFriend
        ? '味方の石とつながりやすい場所です。石のグループを広げてみましょう。'
        : '中央寄りの空いた場所です。まずは黄色の丸に置いて、陣地を広げる感覚を試してみましょう。',
    })
  }

  const score = useMemo(() => {
    if (!snap || !finished || !size) return null
    const deadPos = [...dead].map((k) => {
      const [x, y] = k.split(',').map(Number)
      return { x, y }
    })
    return scoreJapanese(snap.board, snap.captures, deadPos, komiFor(size))
  }, [snap, finished, dead, size])

  const Rules = (
    <div className="space-y-3">
      {RULES.map((r) => (
        <div key={r.title} className="rounded-lg bg-white/70 p-3">
          <h3 className="font-bold text-stone-800">{r.title}</h3>
          <p className="text-sm text-stone-700">{r.body}</p>
        </div>
      ))}
    </div>
  )

  const shell = 'min-h-screen bg-gradient-to-br from-stone-100 via-amber-50 to-stone-200 text-stone-800'

  if (tutorialStep !== null) {
    const completed = tutorialStep >= TUTORIAL_STEPS.length
    const step = TUTORIAL_STEPS[Math.min(tutorialStep, TUTORIAL_STEPS.length - 1)]
    const board = completed ? TUTORIAL_COMPLETION_BOARD : step.board
    return (
      <main className={shell}>
        <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6 lg:flex-row lg:items-center">
          <div className="flex flex-1 justify-center">
            <BoardView
              board={board}
              turn="B"
              lastMove={null}
              hintPos={completed ? null : step.target}
              disabled={completed}
              onPlay={handleTutorialPlay}
              hoverOk={(pos) => !completed && playMove(board, pos, 'B').ok}
            />
          </div>
          <section className="w-full space-y-4 rounded-2xl bg-white/85 p-5 shadow-lg lg:w-96" aria-live="polite">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-amber-800">{completed ? 'チュートリアル完了' : `いっしょに練習 ${tutorialStep + 1} / ${TUTORIAL_STEPS.length}`}</span>
              <button className="text-sm text-stone-600 underline" onClick={() => setTutorialStep(null)}>閉じる</button>
            </div>
            <h1 className="text-2xl font-bold">{completed ? 'よくできました！' : step.title}</h1>
          <p className="text-stone-700">{completed ? '石を置く場所、相手の石を取る方法、危ない石の守り方、陣地の作り方を体験しました。' : step.text}</p>
            {!completed && <p className="text-sm text-amber-800">黄色い丸の交点をクリックしてください。</p>}
            {tutorialMessage && <p className="rounded-lg bg-green-100 p-3 text-sm text-green-900">{tutorialMessage}</p>}
            {completed ? (
              <button className="w-full rounded-lg bg-amber-700 py-3 font-semibold text-white" onClick={() => setTutorialStep(null)}>対局に戻る</button>
            ) : (
              <p className="text-xs text-stone-500">「呼吸点」は石の上下左右にある空きのことです。「アタリ」は、その空きがあと1つになった状態です。</p>
            )}
          </section>
        </div>
      </main>
    )
  }

  if (!size || !snap) {
    return (
      <main className={shell}>
        <div className="mx-auto max-w-3xl px-5 py-10">
          <h1 className="text-center text-4xl font-bold tracking-widest">囲碁入門</h1>
          <p className="mt-3 text-center text-stone-600">遊びながら覚える、はじめての囲碁。ルールは日本ルールです。</p>
          <button onClick={beginTutorial} className="mt-6 w-full rounded-xl border-2 border-amber-600 bg-amber-100 px-4 py-3 text-lg font-semibold text-amber-950 hover:bg-amber-200">
            🎓 ルールと勝つコツを盤上で体験する
          </button>
          <h2 className="mt-8 mb-3 text-lg font-bold">1. 相手を選ぶ</h2>
          <div className="flex gap-3">
            {([['cpu', '🤖 CPUと対戦（あなたは黒）'], ['two', '👥 ふたりで対戦']] as const).map(([m, l]) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 rounded-xl border-2 px-3 py-3 font-medium transition ${mode === m ? 'border-amber-600 bg-amber-100' : 'border-stone-300 bg-white hover:border-amber-400'}`}
              >
                {l}
              </button>
            ))}
          </div>
          {mode === 'cpu' && (
            <div className="mt-4">
              <h3 className="mb-2 font-semibold">CPUの強さ</h3>
              <div className="grid grid-cols-2 gap-3">
                {([
                  ['easy', '🌱 やさしい', 'ランダムに打つので、ゆっくり練習できます'],
                  ['normal', '🎯 ふつう', '石を取ったり、アタリを狙ったりします'],
                ] as const).map(([level, label, description]) => (
                  <button
                    key={level}
                    onClick={() => setCpuDifficulty(level)}
                    className={`rounded-xl border-2 p-3 text-left transition ${cpuDifficulty === level ? 'border-amber-600 bg-amber-100' : 'border-stone-300 bg-white hover:border-amber-400'}`}
                    aria-pressed={cpuDifficulty === level}
                  >
                    <span className="font-medium">{label}</span>
                    <span className="mt-1 block text-xs text-stone-600">{description}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <h2 className="mt-8 mb-3 text-lg font-bold">2. 盤の大きさを選ぶ（まずは小さい盤がおすすめ）</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {SIZES.map((s) => (
              <button
                key={s.size}
                onClick={() => start(s.size)}
                className="rounded-xl border-2 border-stone-300 bg-white p-4 text-center shadow-sm transition hover:-translate-y-0.5 hover:border-amber-500 hover:shadow-md"
              >
                <div className="text-xl font-bold">{s.label}</div>
                <div className="mt-1 text-xs text-stone-500">{s.note}</div>
              </button>
            ))}
          </div>
          <h2 className="mt-10 mb-3 text-lg font-bold">囲碁のルール（かんたん解説）</h2>
          {Rules}
        </div>
      </main>
    )
  }

  const hoverOk = (p: Pos) => playMove(snap.board, p, snap.turn, snap.prevKey).ok

  return (
    <main className={shell}>
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 lg:flex-row">
        <div className="flex flex-1 justify-center">
          <BoardView
            board={snap.board}
            turn={snap.turn}
            lastMove={snap.lastMove}
            hintPos={placementHint?.pos}
            disabled={finished || cpuTurn}
            dead={dead}
            territory={score?.territory}
            onPlay={finished ? toggleDead : play}
            hoverOk={hoverOk}
          />
        </div>
        <aside className="w-full space-y-4 lg:w-80">
          <div className="rounded-xl bg-white/80 p-4 shadow">
            <div className="flex items-center justify-between">
              <h1 className="text-xl font-bold">囲碁入門 {size}路盤</h1>
              <button className="text-sm text-amber-700 underline" onClick={() => setSize(null)}>
                最初に戻る
              </button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-center">
              {(['B', 'W'] as const).map((c) => (
                <div
                  key={c}
                  className={`rounded-lg border-2 p-2 ${!finished && snap.turn === c ? 'border-amber-500 bg-amber-50' : 'border-transparent bg-stone-100'}`}
                >
                  <div className="font-bold">
                    {c === 'B' ? '●' : '○'} {name(c)}
                    {mode === 'cpu' && c === 'W' ? '(CPU)' : ''}
                  </div>
                  <div className="text-xs text-stone-600">アゲハマ {snap.captures[c]}</div>
                </div>
              ))}
            </div>
            <p className="mt-2 text-center text-sm text-stone-600">
              {finished ? '終局' : cpuTurn ? '白（CPU）が考え中…' : `${name(snap.turn)}の番です`}
            </p>
          </div>

          {tips && (
            <div className="rounded-xl border-l-4 border-amber-500 bg-amber-50 p-4 text-sm shadow" role="status">
              💡 {snap.message}
            </div>
          )}

          {placementHint && (
            <div className="rounded-xl border border-amber-300 bg-amber-100 p-3 text-sm text-amber-950 shadow" role="status">
              <strong>置き場所のヒント</strong>
              <p className="mt-1">黄色の丸がおすすめの交点です。{placementHint.reason}</p>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2">
            <button onClick={pass} disabled={finished || cpuTurn} className="rounded-lg bg-stone-700 py-2 text-white disabled:opacity-40">
              パス
            </button>
            <button onClick={undo} disabled={!history.length || cpuTurn} className="rounded-lg bg-stone-500 py-2 text-white disabled:opacity-40">
              一手戻す
            </button>
            <button onClick={() => start(size)} className="rounded-lg bg-amber-700 py-2 text-white">
              新規対局
            </button>
          </div>
          <button
            onClick={requestPlacementHint}
            disabled={finished || cpuTurn}
            className="w-full rounded-lg border-2 border-amber-500 bg-white py-2 font-semibold text-amber-900 hover:bg-amber-50 disabled:opacity-40"
          >
            💡 置き場所のヒント
          </button>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={tips} onChange={(e) => setTips(e.target.checked)} /> ヒントを表示
          </label>

          {score && (
            <div className="rounded-xl bg-white p-4 shadow" data-testid="result">
              <h2 className="mb-2 font-bold">対局結果（日本ルール）</h2>
              <p className="mb-2 text-xs text-stone-600">死んでいる石をクリックすると取り上げます（もう一度クリックで戻る）。</p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-stone-500">
                    <th></th><th>陣地</th><th>アゲハマ</th><th>コミ</th><th>合計</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td>黒</td><td>{score.blackTerritory}</td><td>{score.blackCaptured}</td><td>-</td><td>{score.black}</td></tr>
                  <tr><td>白</td><td>{score.whiteTerritory}</td><td>{score.whiteCaptured}</td><td>{komiFor(size)}</td><td>{score.white}</td></tr>
                </tbody>
              </table>
              <p className="mt-3 text-center text-lg font-bold">
                {score.black > score.white ? '黒' : '白'}の{Math.abs(score.black - score.white)}目勝ち！
              </p>
            </div>
          )}

          <button className="w-full rounded-lg border border-stone-400 bg-white py-2 text-sm" onClick={() => setShowRules(!showRules)}>
            {showRules ? 'ルールを閉じる' : '📖 ルールを見る'}
          </button>
          <button className="w-full rounded-lg border-2 border-amber-500 bg-amber-50 py-2 text-sm font-semibold text-amber-900" onClick={beginTutorial}>
            🎓 ルールと勝つコツを盤上で体験する
          </button>
          {showRules && Rules}
        </aside>
      </div>
    </main>
  )
}
