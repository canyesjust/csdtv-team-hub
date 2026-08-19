export type Player = {
  jersey: string
  name: string
  cls: string
  pos: string
}

/**
 * A roster is bounded and stringly typed on purpose. It comes in from a CSV a
 * coach exported, so nothing about it can be trusted.
 */
export function sanitizePlayers(input: unknown): Player[] {
  if (!Array.isArray(input)) return []
  return input.slice(0, 200).map(raw => {
    const p = (raw || {}) as Record<string, unknown>
    const s = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '')
    return {
      jersey: s(p.jersey, 4),
      name: s(p.name, 80),
      cls: s(p.cls, 40),
      pos: s(p.pos, 40),
    }
  }).filter(p => p.jersey || p.name)
}

/**
 * MaxPreps export columns work as-is, which matters because that is what a
 * coach can produce without being asked to reformat anything.
 *   jersey, firstname, lastname, position1, classyear
 */
export function parseRosterCsv(text: string): Player[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length === 0) return []

  const split = (line: string) => line.split(',').map(c => c.trim().replace(/^"|"$/g, ''))
  const header = split(lines[0]).map(h => h.toLowerCase())
  const hasHeader = header.some(h => /jersey|first|last|number|name/.test(h))
  const idx = (...names: string[]) => {
    for (const n of names) {
      const i = header.indexOf(n)
      if (i >= 0) return i
    }
    return -1
  }

  if (!hasHeader) {
    return sanitizePlayers(lines.map(line => {
      const c = split(line)
      return { jersey: c[0], name: c[1], cls: c[2], pos: c[3] }
    }))
  }

  const iJersey = idx('jersey', 'number', '#')
  const iFirst = idx('firstname', 'first', 'first name')
  const iLast = idx('lastname', 'last', 'last name')
  const iName = idx('name', 'player')
  const iPos = idx('position1', 'position', 'pos')
  const iClass = idx('classyear', 'class', 'grade', 'year')

  return sanitizePlayers(lines.slice(1).map(line => {
    const c = split(line)
    const name = iName >= 0
      ? c[iName]
      : [iFirst >= 0 ? c[iFirst] : '', iLast >= 0 ? c[iLast] : ''].filter(Boolean).join(' ')
    return {
      jersey: iJersey >= 0 ? c[iJersey] : '',
      name,
      cls: iClass >= 0 ? c[iClass] : '',
      pos: iPos >= 0 ? c[iPos] : '',
    }
  }))
}

export const findByJersey = (players: Player[], jersey: string): Player | null =>
  players.find(p => p.jersey === String(jersey)) ?? null
