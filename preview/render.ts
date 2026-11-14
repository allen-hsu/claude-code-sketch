// Runs the mod's own hooks with a stand-in engine and writes every sample card
// as a grid of styled cells (JSON), for paint.py to turn into images.
// usage: bun --jsx-factory=h --jsx-fragment=Fragment --jsx-runtime=classic render.ts ../hooks/register.tsx 110 cards.json

const g = globalThis as any
g.h = (type: any, props: any, ...children: any[]) => ({
  type,
  props: props ?? {},
  children: children.flat(Infinity).filter((c: any) => c !== false && c !== null && c !== undefined && c !== true),
})

type Cell = { ch: string; w: number; fg?: string; bold?: boolean; dim?: boolean; inv?: boolean; ul?: boolean }
type Line = Cell[]
type Block = { lines: Line[]; width: number }

const isWide = (cp: number) =>
  cp >= 0x1100 &&
  (cp <= 0x115f || (cp >= 0x2e80 && cp <= 0xa4cf) || (cp >= 0xac00 && cp <= 0xd7a3) || (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe30 && cp <= 0xfe6f) || (cp >= 0xff00 && cp <= 0xff60) || (cp >= 0x1f300 && cp <= 0x1faff))
const cells = (text: string, style: Partial<Cell>): Line => [...text].map(ch => ({ ch, w: isWide(ch.codePointAt(0)!) ? 2 : 1, ...style }))
const widthOf = (line: Line) => line.reduce((sum, cell) => sum + cell.w, 0)
const blank = (count: number): Line => Array.from({ length: Math.max(0, count) }, () => ({ ch: ' ', w: 1 }))
const pad = (line: Line, width: number): Line => [...line, ...blank(width - widthOf(line))]

// Breaks at the last space that fits, else mid-word, as the terminal wraps.
const wrap = (line: Line, width: number): Line[] => {
  if (width <= 0) return [line]
  const out: Line[] = []
  let rest = line
  while (widthOf(rest) > width) {
    let used = 0
    let cut = 0
    let space = -1
    while (cut < rest.length && used + rest[cut]!.w <= width) {
      if (rest[cut]!.ch === ' ') space = cut
      used += rest[cut]!.w
      cut++
    }
    const at = space > 0 && cut < rest.length ? space : cut
    out.push(rest.slice(0, at))
    rest = rest.slice(at)
    while (rest[0]?.ch === ' ') rest = rest.slice(1)
  }
  out.push(rest)
  return out
}

const truncate = (line: Line, width: number): Line => {
  if (widthOf(line) <= width) return line
  const out: Line = []
  let used = 0
  for (const cell of line) {
    if (used + cell.w > width - 1) break
    out.push(cell)
    used += cell.w
  }
  return [...out, { ...(out[out.length - 1] ?? {}), ch: '…', w: 1 }]
}

const BORDERS: Record<string, string> = { round: '╭╮╰╯─│', single: '┌┐└┘─│', bold: '┏┓┗┛━┃', double: '╔╗╚╝═║' }

const layout = (node: any, avail: number, stretch?: number): Block => {
  const p = node.props
  if (node.type === 'Text') {
    const style = { fg: p.color, bold: p.bold, dim: p.dimColor, inv: p.inverse, ul: p.underline }
    const line = cells(node.children.join(''), style)
    const lines = p.wrap === 'wrap' ? wrap(line, avail) : [truncate(line, Math.max(1, avail))]
    return { lines, width: Math.max(...lines.map(widthOf)) }
  }
  const frame = p.borderStyle ? [...(BORDERS[p.borderStyle] ?? BORDERS.single!)] : undefined
  const border = frame ? 1 : 0
  const padL = (p.paddingLeft ?? p.paddingX ?? 0) + border
  const padR = (p.paddingRight ?? p.paddingX ?? 0) + border
  const outer = typeof p.width === 'number' ? p.width : avail
  const inner = Math.max(0, outer - padL - padR)
  let lines: Line[] = []
  let width = 0
  if (p.flexDirection === 'column') {
    node.children.forEach((child: any, index: number) => {
      const block = layout(child, inner)
      const lead = child?.props?.marginLeft ?? 0
      for (let i = 0; i < (child?.props?.marginTop ?? 0) + (index > 0 ? (p.rowGap ?? 0) : 0); i++) lines.push([])
      lines.push(...block.lines.map(line => [...blank(lead), ...line]))
      width = Math.max(width, block.width + lead)
    })
  } else {
    const gap = p.columnGap ?? 0
    const rows: { block: Block; child: any; avail: number }[][] = [[]]
    let used = 0
    for (const child of node.children) {
      let room = Math.max(1, inner - used - (used > 0 ? gap : 0))
      const lead = child?.props?.marginLeft ?? 0
      // A wrapping row moves a child that does not fit at its own size to a new line.
      if (p.flexWrap === 'wrap' && used > 0 && used + gap + layout(child, inner).width + lead > inner) {
        rows.push([])
        used = 0
        room = inner
      }
      const block = layout(child, room)
      const row = rows[rows.length - 1]!
      row.push({ block: { lines: block.lines.map(line => [...blank(lead), ...line]), width: block.width + lead }, child, avail: room })
      used += block.width + lead + (row.length > 1 ? gap : 0)
    }
    rows.forEach((row, at) => {
      const tall = Math.max(0, ...row.map(one => one.block.lines.length))
      // A bordered box in a row grows to the row's height, as flex stretches it.
      for (const one of row) {
        if (one.child?.props?.borderStyle && one.block.lines.length < tall) {
          const again = layout(one.child, one.avail, tall)
          const lead = one.child.props.marginLeft ?? 0
          one.block = { lines: again.lines.map(line => [...blank(lead), ...line]), width: again.width + lead }
        }
      }
      const total = row.reduce((sum, one) => sum + one.block.width, 0) + gap * Math.max(0, row.length - 1)
      let lead = 0
      let between = gap
      if (p.justifyContent === 'center') lead = Math.max(0, (inner - total) >> 1)
      if (p.justifyContent === 'flex-end') lead = Math.max(0, inner - total)
      if (p.justifyContent === 'space-between' && row.length > 1) between = gap + Math.max(0, Math.floor((inner - total) / (row.length - 1)))
      if (at > 0) for (let i = 0; i < (p.rowGap ?? 0); i++) lines.push([])
      for (let i = 0; i < tall; i++) {
        const line: Line = [...blank(lead)]
        row.forEach((one, index) => {
          if (index > 0) line.push(...blank(between))
          line.push(...pad(one.block.lines[i] ?? [], one.block.width))
        })
        lines.push(line)
      }
      width = Math.max(width, total + lead)
    })
  }
  const box = typeof p.width === 'number' ? p.width - padL - padR : width
  if (frame && stretch !== undefined) while (lines.length < stretch - 2) lines.push([])
  lines = lines.map(line => [...blank(padL - border), ...pad(line, box), ...blank(padR - border)])
  if (frame) {
    const span = box + padL + padR - 2
    const style = { fg: p.borderColor, dim: p.borderDimColor }
    lines = [
      cells(frame[0] + frame[4]!.repeat(span) + frame[1], style),
      ...lines.map(line => [...cells(frame[5]!, style), ...pad(line, span), ...cells(frame[5]!, style)]),
      cells(frame[2] + frame[4]!.repeat(span) + frame[3], style),
    ]
  }
  return { lines, width: typeof p.width === 'number' ? p.width : box + padL + padR }
}

const hooks: { event: string; matcher: any; fn: any }[] = []
const on = (event: string, a: any, b?: any) => {
  hooks.push({ event, matcher: b ? a : undefined, fn: b ?? a })
  return { catch: () => undefined }
}
const mod = await import(process.argv[2]!)
mod.register(on)
const $ = { ui: { resolve: () => ({ Box: 'Box', Text: 'Text' }) } }
const columns = Number(process.argv[3] ?? 110)
const samples: Record<string, any[]> = (await import('./samples.ts')).samples
const render = hooks.find(hook => hook.event === 'ui.render' && hook.matcher?.component === 'ToolUse')!.fn
const out: any[] = []
for (const [name, inputs] of Object.entries(samples)) {
  let index = 0
  for (const input of inputs) {
    const tool = `mcp__sketch__${name.split('#')[0]}`
    const tree = await render($, { props: { tool, input, isRunning: false, tool_use_id: 't' }, viewport: { columns } }, async () => undefined)
    if (!tree) continue
    const block = layout(tree, columns)
    const lines = block.lines.slice(block.lines[0]?.length === 0 ? 1 : 0)
    out.push({
      key: inputs.length === 1 ? name.replace('#', '-') : `${name.replace('#', '-')}-${input.kind ?? input.layout ?? ++index}`,
      tool: name.split('#')[0],
      kind: input.kind ?? input.layout ?? '',
      title: input.title ?? input.question ?? '',
      lines: lines.map(line => line.map(cell => [cell.ch, cell.w, cell.fg ?? '', (cell.bold ? 1 : 0) | (cell.dim ? 2 : 0) | (cell.inv ? 4 : 0) | (cell.ul ? 8 : 0)])),
    })
  }
}
await Bun.write(process.argv[4]!, JSON.stringify(out))
console.log(`${out.length} cards → ${process.argv[4]}`)
