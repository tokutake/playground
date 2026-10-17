import { describe, expect, it } from 'vitest'
import { emptyBoard, getGroup, playMove, scoreJapanese, boardKey, KOMI } from './go'

const place = (rows: string[]) =>
  rows.map((r) => [...r].map((c) => (c === 'B' ? 'B' : c === 'W' ? 'W' : null)))

describe('go rules', () => {
  it('counts liberties', () => {
    const b = emptyBoard(5)
    b[0][0] = 'B'
    expect(getGroup(b, { x: 0, y: 0 }).liberties).toHaveLength(2)
  })
  it('captures stones', () => {
    const b = place(['.B...', 'BW...', '.....', '.....', '.....'])
    const r = playMove(b, { x: 1, y: 2 }, 'B')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.captured).toHaveLength(0)
    const b2 = place(['.B...', 'BW...', '.B...', '.....', '.....'])
    const r2 = playMove(b2, { x: 2, y: 1 }, 'B')
    expect(r2.ok && r2.captured).toEqual([{ x: 1, y: 1 }])
  })
  it('forbids suicide but allows capturing move', () => {
    const b = place(['.B...', 'B.B..', '.B...', '.....', '.....'])
    const r = playMove(b, { x: 1, y: 1 }, 'W')
    expect(r).toEqual({ ok: false, reason: 'suicide' })
  })
  it('forbids occupied points', () => {
    const b = place(['B....', '.....', '.....', '.....', '.....'])
    expect(playMove(b, { x: 0, y: 0 }, 'W')).toEqual({ ok: false, reason: 'occupied' })
  })
  it('enforces ko', () => {
    const b = place(['.BW..', 'BW.W.', '.BW..', '.....', '.....'])
    const before = boardKey(b)
    const cap = playMove(b, { x: 2, y: 1 }, 'B')
    expect(cap.ok).toBe(true)
    if (!cap.ok) return
    expect(cap.captured).toEqual([{ x: 1, y: 1 }])
    const re = playMove(cap.board, { x: 1, y: 1 }, 'W', before)
    expect(re).toEqual({ ok: false, reason: 'ko' })
  })
  it('scores by Japanese rules', () => {
    const b = place(['..B..', '..B..', '..B..', '..B..', '..B..'])
    const s = scoreJapanese(b, { B: 1, W: 0 })
    expect(s.blackTerritory).toBe(20)
    expect(s.whiteTerritory).toBe(0)
    expect(s.black).toBe(21)
    expect(s.white).toBe(KOMI)
  })
  it('removes dead stones as prisoners', () => {
    const b = place(['..B..', '..B..', '.WB..', '..B..', '..B..'])
    const s = scoreJapanese(b, { B: 0, W: 0 }, [{ x: 1, y: 2 }])
    expect(s.blackCaptured).toBe(1)
    expect(s.blackTerritory).toBe(20)
  })
})
