export type Stone = 'B' | 'W'
export type Cell = Stone | null
export type Board = Cell[][]
export type Pos = { x: number; y: number }

export const KOMI = 6.5

/** Small boards use a smaller komi so that the game stays balanced. */
export const komiFor = (size: number) => (size >= 9 ? KOMI : 0.5)

export const opponent = (s: Stone): Stone => (s === 'B' ? 'W' : 'B')

export const emptyBoard = (size: number): Board =>
  Array.from({ length: size }, () => Array<Cell>(size).fill(null))

const neighbors = (b: Board, { x, y }: Pos): Pos[] =>
  [
    { x: x - 1, y },
    { x: x + 1, y },
    { x, y: y - 1 },
    { x, y: y + 1 },
  ].filter((p) => p.x >= 0 && p.y >= 0 && p.x < b.length && p.y < b.length)

export type Group = { stones: Pos[]; liberties: Pos[] }

export function getGroup(b: Board, start: Pos): Group {
  const color = b[start.y][start.x]
  const seen = new Set<string>([`${start.x},${start.y}`])
  const libs = new Map<string, Pos>()
  const stones: Pos[] = []
  const stack = [start]
  while (stack.length) {
    const p = stack.pop()!
    stones.push(p)
    for (const n of neighbors(b, p)) {
      const k = `${n.x},${n.y}`
      const c = b[n.y][n.x]
      if (c === null) libs.set(k, n)
      else if (c === color && !seen.has(k)) {
        seen.add(k)
        stack.push(n)
      }
    }
  }
  return { stones, liberties: [...libs.values()] }
}

export const boardKey = (b: Board) => b.map((r) => r.map((c) => c ?? '.').join('')).join('/')

export type MoveResult =
  | { ok: true; board: Board; captured: Pos[]; selfAtari: boolean; atari: Pos[] }
  | { ok: false; reason: 'occupied' | 'suicide' | 'ko' | 'out' }

/**
 * Play a move. `previousKey` is the board key before the opponent's last move
 * (used for the simple ko rule: a move may not recreate the previous position).
 */
export function playMove(b: Board, pos: Pos, color: Stone, previousKey?: string): MoveResult {
  if (pos.x < 0 || pos.y < 0 || pos.x >= b.length || pos.y >= b.length) return { ok: false, reason: 'out' }
  if (b[pos.y][pos.x] !== null) return { ok: false, reason: 'occupied' }
  const next = b.map((r) => [...r])
  next[pos.y][pos.x] = color
  const captured: Pos[] = []
  for (const n of neighbors(next, pos)) {
    if (next[n.y][n.x] === opponent(color)) {
      const g = getGroup(next, n)
      if (g.liberties.length === 0) {
        for (const s of g.stones) {
          if (next[s.y][s.x] !== null) {
            next[s.y][s.x] = null
            captured.push(s)
          }
        }
      }
    }
  }
  const mine = getGroup(next, pos)
  if (mine.liberties.length === 0) return { ok: false, reason: 'suicide' }
  if (previousKey !== undefined && boardKey(next) === previousKey) return { ok: false, reason: 'ko' }
  const atari: Pos[] = []
  const seenG = new Set<string>()
  for (const n of neighbors(next, pos)) {
    if (next[n.y][n.x] === opponent(color) && !seenG.has(`${n.x},${n.y}`)) {
      const g = getGroup(next, n)
      g.stones.forEach((s) => seenG.add(`${s.x},${s.y}`))
      if (g.liberties.length === 1) atari.push(n)
    }
  }
  return { ok: true, board: next, captured, selfAtari: mine.liberties.length === 1, atari }
}

export type Score = {
  blackTerritory: number
  whiteTerritory: number
  blackCaptured: number
  whiteCaptured: number
  black: number
  white: number
  territory: Cell[][] // owner of each empty point
}

/**
 * Japanese scoring: territory + prisoners (stones captured, plus dead stones
 * removed at the end). Stones on the board do not count. White gets komi.
 * `dead` lists dead stones which are treated as removed and become prisoners.
 */
export function scoreJapanese(b: Board, captures: { B: number; W: number }, dead: Pos[] = [], komi: number = KOMI): Score {
  const size = b.length
  const work = b.map((r) => [...r])
  let deadB = 0
  let deadW = 0
  for (const d of dead) {
    if (work[d.y][d.x] === 'B') deadB++
    if (work[d.y][d.x] === 'W') deadW++
    work[d.y][d.x] = null
  }
  const territory: Cell[][] = Array.from({ length: size }, () => Array<Cell>(size).fill(null))
  const seen = new Set<string>()
  let bt = 0
  let wt = 0
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      if (work[y][x] !== null || seen.has(`${x},${y}`)) continue
      const region: Pos[] = []
      const borders = new Set<Stone>()
      const stack = [{ x, y }]
      seen.add(`${x},${y}`)
      while (stack.length) {
        const p = stack.pop()!
        region.push(p)
        for (const n of neighbors(work, p)) {
          const c = work[n.y][n.x]
          if (c) borders.add(c)
          else if (!seen.has(`${n.x},${n.y}`)) {
            seen.add(`${n.x},${n.y}`)
            stack.push(n)
          }
        }
      }
      if (borders.size === 1) {
        const owner = [...borders][0]
        for (const p of region) territory[p.y][p.x] = owner
        if (owner === 'B') bt += region.length
        else wt += region.length
      }
    }
  // captures.B = white stones captured by black
  const blackCaptured = captures.B + deadW
  const whiteCaptured = captures.W + deadB
  return {
    blackTerritory: bt,
    whiteTerritory: wt,
    blackCaptured,
    whiteCaptured,
    black: bt + blackCaptured,
    white: wt + whiteCaptured + komi,
    territory,
  }
}

/** Very simple CPU: prefers captures, saving own stones in atari, then random sane moves. */
export function chooseCpuMove(b: Board, color: Stone, previousKey?: string, difficulty: 'easy' | 'normal' = 'normal'): Pos | null {
  const size = b.length
  const moves: { pos: Pos; score: number }[] = []
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const r = playMove(b, { x, y }, color, previousKey)
      if (!r.ok) continue
      if (difficulty === 'easy') {
        // Beginner mode deliberately plays randomly so the CPU does not punish
        // every mistake. Rules such as suicide and ko still apply.
        moves.push({ pos: { x, y }, score: Math.random() })
        continue
      }
      const g = getGroup(r.board, { x, y })
      // don't fill own eyes: all neighbours are own stones and the group stays big
      const ns = neighbors(b, { x, y })
      if (ns.every((n) => b[n.y][n.x] === color)) continue
      let score = Math.random()
      score += r.captured.length * 10
      score += r.atari.length * 2
      if (r.selfAtari) score -= 8
      score += Math.min(g.liberties.length, 4) * 0.3
      const edge = Math.min(x, y, size - 1 - x, size - 1 - y)
      score += edge === 0 ? -1 : edge === 1 ? 0.5 : 1
      moves.push({ pos: { x, y }, score })
    }
  if (!moves.length) return null
  moves.sort((a, c) => c.score - a.score)
  if (moves[0].score < 0) return null
  return moves[0].pos
}
