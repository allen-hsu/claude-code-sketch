import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Picked } from '../types'

// sketch: tools the model calls in place of paragraphs. Each draws one card in
// the transcript, from the call's own input:
//   layers     the block picture of an architecture: bands, zones, side concerns
//   diagram    nodes and arrows laid out in ranks (wiring, flows, dependencies)
//   schema     tables or classes: boxes with fields, and their relations
//   swimlane   a process across lanes of roles or systems
//   pipeline   stages left to right, each a column of jobs
//   gitgraph   branches, commits, merges and tags over time
//   sequence   who calls whom, in order
//   tree       a hierarchy
//   timeline   bars over periods (roadmap, gantt)
//   board      columns of cards (kanban)
//   quadrant   a 2x2: points on two axes, or four lists (SWOT)
//   journey    stages with a mood curve and rows of notes
//   wireframe  a low-fidelity screen
//   metrics    number tiles with a trend
//   chart      bar, column, stacked, line, scatter, heatmap, histogram, funnel, share
//   cards      titled cards (personas, findings)
//   compare    options side by side, then a dialog to pick one
// A card keeps no state: the row is drawn again from the input every time.
// The only thing remembered is how far a card's entrance has played, and that
// is the module's own, gone on a reload, where a card simply draws whole.

const toolOf = (name: string): string => `mcp__sketch__${name}`

type UI = { Box: any; Text: any; Button?: any; Image?: any }
// `scope` names a hover group: everything drawn with one lights up together
// while the pointer rests on any of it (the fullscreen terminal reports it).
// `press` makes the text a button that focuses that node of a diagram.
type Style = { color?: string; bold?: boolean; dim?: boolean; scope?: string; press?: number; heavy?: boolean }
type Seg = Style & { text: string }
type Row = { indent: number; segs: Seg[] }

// Eight theme colors that stay apart from each other in the light and dark themes.
const PALETTE = ['claude', 'suggestion', 'success', 'warning', 'bashBorder', 'planMode', 'autoAccept', 'error']
const tint = (index: number): string => PALETTE[index % PALETTE.length] ?? 'claude'
const TONES: Record<string, string> = { good: 'success', bad: 'error', warn: 'warning', plain: 'text' }

// ---------------------------------------------------------------- input

const record = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}

const items = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])

const words = (value: unknown, max: number): string | undefined => {
  const text = typeof value === 'number' ? String(value) : value
  if (typeof text !== 'string') return undefined
  // The text comes from the model, which may be relaying something it read:
  // control characters and direction overrides never reach the terminal.
  const trimmed = text
    .replace(/\s+/g, ' ')
    .replace(/[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '')
    .trim()
  if (trimmed === '') return undefined

  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed
}

const wordList = (value: unknown, count: number, max: number): string[] =>
  items(value)
    .map(one => words(one, max))
    .filter((one): one is string => one !== undefined)
    .slice(0, count)

const num = (value: unknown): number | undefined => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value !== 'string' || value.trim() === '') return undefined
  const parsed = Number(value.replace(/[,_%$]/g, ''))

  return Number.isFinite(parsed) ? parsed : undefined
}

const numbers = (value: unknown, count: number): number[] =>
  items(value)
    .map(num)
    .filter((one): one is number => one !== undefined)
    .slice(0, count)

const clamp = (value: number, low: number, high: number): number =>
  Math.max(low, Math.min(high, value))

const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback

// ---------------------------------------------------------------- text cells

const isWide = (code: number): boolean =>
  code >= 0x1100 &&
  (code <= 0x115f ||
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe6f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x1f300 && code <= 0x1faff) ||
    (code >= 0x20000 && code <= 0x3fffd))

const cellsOf = (char: string): number => {
  const code = char.codePointAt(0) ?? 0
  if ((code >= 0x300 && code <= 0x36f) || code === 0x200b || code === 0xfe0f) return 0

  return isWide(code) ? 2 : 1
}

const widthOf = (text: string): number => {
  let width = 0
  for (const char of text) width += cellsOf(char)

  return width
}

const clip = (text: string, max: number): string => {
  if (max <= 0) return ''
  if (widthOf(text) <= max) return text
  let out = ''
  let width = 0
  for (const char of text) {
    const cells = cellsOf(char)
    if (width + cells > max - 1) break
    out += char
    width += cells
  }

  return `${out}…`
}

const padEnd = (text: string, width: number): string => {
  const cut = clip(text, width)

  return cut + ' '.repeat(Math.max(0, width - widthOf(cut)))
}

const padStart = (text: string, width: number): string => {
  const cut = clip(text, width)

  return ' '.repeat(Math.max(0, width - widthOf(cut))) + cut
}

const trimNumber = (value: number, digits: number): string => {
  const fixed = value.toFixed(digits)

  return fixed.includes('.') ? fixed.replace(/\.?0+$/, '') : fixed
}

const fmt = (value: number): string => {
  const size = Math.abs(value)
  if (size >= 1e9) return `${trimNumber(value / 1e9, 1)}B`
  if (size >= 1e6) return `${trimNumber(value / 1e6, 1)}M`
  if (size >= 1e4) return `${trimNumber(value / 1e3, 1)}k`

  return trimNumber(value, size >= 100 ? 0 : size >= 10 ? 1 : 2)
}

// ---------------------------------------------------------------- canvas
// A grid of cells for what flex boxes cannot draw: wires that cross and join.
// A wire is a set of directions per cell, so two that meet become a joint.

// `flow` is a focused wire cell's distance from where the wire starts, for
// the pulse that runs along it.
type Cell = Style & { ch: string; mask: number; isRound?: boolean; isHeavy?: boolean; join?: number; flow?: number }
type Canvas = { w: number; h: number; cells: Cell[][] }

const UP = 1
const DOWN = 2
const LEFT = 4
const RIGHT = 8
const JOINTS = [' ', '│', '│', '│', '─', '┘', '┐', '┤', '─', '└', '┌', '├', '─', '┴', '┬', '┼']
// The same joints in heavy strokes, for a focused node's wires.
const HEAVY_JOINTS = [' ', '┃', '┃', '┃', '━', '┛', '┓', '┫', '━', '┗', '┏', '┣', '━', '┻', '┳', '╋']
const SKIP = '\u0000'
const WIRE: Style = { color: 'inactive' }

const makeCanvas = (w: number, h: number): Canvas => ({
  w,
  h,
  cells: Array.from({ length: Math.max(0, h) }, () =>
    Array.from({ length: Math.max(0, w) }, () => ({ ch: '', mask: 0 })),
  ),
})

const cellAt = (canvas: Canvas, x: number, y: number): Cell | undefined =>
  canvas.cells[y]?.[x]

const put = (canvas: Canvas, x: number, y: number, text: string, style: Style = {}): void => {
  let at = x
  for (const char of text) {
    const cells = cellsOf(char)
    if (cells === 0) continue
    const cell = at >= 0 && at + cells <= canvas.w ? cellAt(canvas, at, y) : undefined
    if (cell) {
      cell.ch = char
      cell.mask = 0
      cell.color = style.color
      cell.bold = style.bold
      cell.dim = style.dim
      cell.scope = style.scope
      cell.press = style.press
      const next = cells === 2 ? cellAt(canvas, at + 1, y) : undefined
      if (next) {
        next.ch = SKIP
        next.mask = 0
      }
    }
    at += cells
  }
}

const wire = (canvas: Canvas, x: number, y: number, bits: number, style: Style = WIRE): void => {
  const cell = x >= 0 ? cellAt(canvas, x, y) : undefined
  if (!cell || cell.ch !== '') return
  cell.mask |= bits
  cell.color = style.color
  cell.dim = style.dim
  cell.scope = style.scope
}

const vline = (canvas: Canvas, x: number, y1: number, y2: number, style: Style = WIRE): void => {
  const low = Math.min(y1, y2)
  const high = Math.max(y1, y2)
  for (let y = low; y <= high; y++) {
    wire(canvas, x, y, (y > low ? UP : 0) | (y < high ? DOWN : 0), style)
  }
}

const hline = (canvas: Canvas, y: number, x1: number, x2: number, style: Style = WIRE): void => {
  const low = Math.min(x1, x2)
  const high = Math.max(x1, x2)
  for (let x = low; x <= high; x++) {
    wire(canvas, x, y, (x > low ? LEFT : 0) | (x < high ? RIGHT : 0), style)
  }
}

// Room for a text of `width` cells at x, with an empty cell either side of it
// where the canvas has one.
const isFree = (canvas: Canvas, x: number, y: number, width: number): boolean => {
  if (x < 0 || x + width > canvas.w || y < 0 || y >= canvas.h) return false
  for (let at = x - 1; at <= x + width; at++) {
    const cell = at >= 0 ? cellAt(canvas, at, y) : undefined
    if (cell && (cell.ch !== '' || cell.mask !== 0)) return false
  }

  return true
}

const sameStyle = (a: Style, b: Style): boolean =>
  a.color === b.color && Boolean(a.bold) === Boolean(b.bold) && Boolean(a.dim) === Boolean(b.dim) && a.scope === b.scope && a.press === b.press

// Rows of runs: a row never opens on a space (the indent carries those) and a
// run of spaces rides the run before it, so no text depends on kept padding.
const rowsOf = (canvas: Canvas): Row[] =>
  canvas.cells.map(line => {
    let end = line.length
    while (end > 0 && line[end - 1]?.ch === '' && line[end - 1]?.mask === 0) end--
    const segs: Seg[] = []
    let indent = 0
    for (let x = 0; x < end; x++) {
      const cell = line[x]
      if (!cell || cell.ch === SKIP) continue
      const char =
        cell.ch !== ''
          ? cell.ch
          : cell.isHeavy
            ? (HEAVY_JOINTS[cell.mask] ?? ' ')
            : ((cell.isRound ? ROUNDED[cell.mask] : undefined) ?? JOINTS[cell.mask] ?? ' ')
      const last = segs[segs.length - 1]
      if (char === ' ' && cell.press === undefined) {
        if (last) last.text += ' '
        else indent++
        continue
      }
      const isPulse = flowPhase !== undefined && cell.flow !== undefined && (((cell.flow - flowPhase) % 6) + 6) % 6 < 2
      const style: Style = isPulse ? { ...cell, color: 'text', bold: true, dim: false } : cell
      if (last && sameStyle(last, style)) last.text += char
      else segs.push({ text: char, color: style.color, bold: style.bold, dim: style.dim, scope: style.scope, press: style.press })
    }

    return { indent, segs }
  })

const ROUNDED: Record<number, string> = { 5: '╯', 6: '╮', 9: '╰', 10: '╭' }

// Lays one layer of wires over a canvas in one color and answers how many
// earlier wires it crossed. Where two cross, the later one lies over the
// earlier, in its own color and stroke, so it reads as passing over and no
// wire takes on another's color. Wires drawn last are on top. Cells in `joins`
// belong to the wires running into one node: wires headed for the same node
// merge there, and those cells join that node's hover group (`joinScope`).
const stamp = (
  canvas: Canvas,
  layer: Canvas,
  style: Style,
  joins?: Map<string, number>,
  joinScope?: (join: number) => string,
): number => {
  let crossings = 0
  layer.cells.forEach((line, y) =>
    line.forEach((cell, x) => {
      const under = cellAt(canvas, x, y)
      if (cell.mask === 0 || !under || under.ch !== '') return
      const join = joins?.get(`${x},${y}`)
      const isCrossing =
        ((under.mask & 3) !== 0 && (under.mask & 12) === 0 && (cell.mask & 12) !== 0 && (cell.mask & 3) === 0) ||
        ((under.mask & 12) !== 0 && (under.mask & 3) === 0 && (cell.mask & 3) !== 0 && (cell.mask & 12) === 0)
      if (join !== undefined && under.mask !== 0 && under.join === join) under.mask |= cell.mask
      else {
        if (isCrossing) crossings++
        under.mask = cell.mask
      }
      under.join = join
      under.color = style.color
      under.dim = style.dim
      under.isHeavy = style.heavy
      under.scope = join !== undefined && joinScope ? joinScope(join) : style.scope
      under.isRound = true
    }),
  )

  return crossings
}

// A line through one row per column, as a wire: a level stretch runs flat and
// a change of row turns a corner, so the line is solid at any terminal font.
const trace = (layer: Canvas, rows: (number | undefined)[], upTo: number): void => {
  for (let x = 0; x < Math.min(upTo, rows.length - 1); x++) {
    const here = rows[x]
    const next = rows[x + 1]
    if (here === undefined || next === undefined) continue
    wire(layer, x, here, RIGHT)
    wire(layer, x + 1, here, LEFT)
    if (next !== here) vline(layer, x + 1, here, next)
  }
}

// The row of every column for `count` values spread evenly over `width` columns.
const rowsAcross = (
  values: number[],
  count: number,
  width: number,
  rowOf: (value: number) => number,
): (number | undefined)[] =>
  Array.from({ length: width }, (_, x) => {
    const at = (x / Math.max(1, width - 1)) * Math.max(1, count - 1)
    const before = values[Math.floor(at)]
    const after = values[Math.ceil(at)]
    if (before === undefined || after === undefined) return undefined

    return rowOf(before + (after - before) * (at - Math.floor(at)))
  })

// ---------------------------------------------------------------- elements

// While its group is hovered, a part of a picture turns bright and bold.
// While its group is hovered, a wire turns bright. (A hover can restyle a
// cell, not change its glyph: heavy strokes are for a clicked focus.)
const LIT = { color: 'text', bold: true, dimColor: false }

const styleOf = (style: Style): Record<string, unknown> => ({
  ...(style.color !== undefined && { color: style.color }),
  ...(style.bold === true && { bold: true }),
  ...(style.dim === true && { dimColor: true }),
  ...(style.scope !== undefined && { hover: { scope: style.scope, ...LIT } }),
})

// Hover groups are named per card, so two cards never light each other.
let scopeBase = 'sk'
const scopeOf = (part: string | number): string => `${scopeBase}-${part}`.slice(0, 64)

// The diagram being drawn: which of its nodes is focused, and the handler a
// click on a node's name calls. Set by the render hook for each card.
let focusNode: number | undefined
let pressNode: (node: number) => void = () => undefined
// Where the pulse along focused wires is, while it runs; undefined when still.
let flowPhase: number | undefined

const segOf = (ui: UI, seg: Seg): any => {
  const text = (
    <ui.Text {...styleOf(seg)} wrap="truncate-end">
      {seg.text}
    </ui.Text>
  )
  if (seg.press === undefined) return text
  const node = seg.press
  const press = pressNode

  return (
    <ui.Button key={scopeOf(`p${node}`)} plain onPress={() => press(node)}>
      {text}
    </ui.Button>
  )
}

const rowOf = (ui: UI, row: Row): any =>
  row.segs.length === 0 ? (
    <ui.Text>{' '}</ui.Text>
  ) : (
    <ui.Box flexDirection="row" paddingLeft={row.indent}>
      {row.segs.map(seg => segOf(ui, seg))}
    </ui.Box>
  )

const drawRows = (ui: UI, rows: Row[]): any[] => rows.map(row => rowOf(ui, row))

const legendOf = (ui: UI, names: string[], colors: string[], least = 2): any =>
  names.length >= least && (
    <ui.Box flexDirection="row" flexWrap="wrap" columnGap={2}>
      {names.map((name, index) => (
        <ui.Box flexDirection="row" columnGap={1}>
          <ui.Text color={colors[index] ?? tint(index)}>■</ui.Text>
          <ui.Text dimColor>{name}</ui.Text>
        </ui.Box>
      ))}
    </ui.Box>
  )

const notesOf = (ui: UI, notes: string[]): any[] =>
  notes.map(note => (
    <ui.Box flexDirection="row" columnGap={1}>
      <ui.Text color="warning">!</ui.Text>
      <ui.Text color="warning" wrap="wrap">
        {note}
      </ui.Text>
    </ui.Box>
  ))

// Texts a card had to cut to fit, kept whole: the card ends with a reserved
// line where the one under the pointer shows in full. Reset for each card.
let details: { scope: string; text: string }[] = []

// `text` cut to `width`; when cut, the whole text is kept for that line, shown
// while anything in hover group `scope` (default: one of its own) is hovered.
const fitted = (text: string, width: number, scope?: string): { text: string; scope?: string } => {
  if (widthOf(text) <= width) return { text, scope }
  const group = scope ?? scopeOf(`d${details.length}`)
  if (!details.some(one => one.scope === group)) details.push({ scope: group, text })
  return { text: clip(text, width), scope: group }
}

// The same over two lines, broken at a space where one fits.
const fittedTwo = (text: string, width: number, scope?: string): { lines: [string, string]; scope?: string } => {
  const lines = twoLines(text, width)
  const isWhole = (lines[0] + (lines[1] === '' ? '' : ' ' + lines[1])).replace(/\s+/g, ' ') === text.replace(/\s+/g, ' ')
  if (isWhole) return { lines, scope }
  const group = scope ?? scopeOf(`d${details.length}`)
  if (!details.some(one => one.scope === group)) details.push({ scope: group, text })
  return { lines, scope: group }
}

const frameOf = (ui: UI, title: string, body: any, actions?: any, width?: number): any => (
  <ui.Box flexDirection="column" marginTop={1}>
    {actions === undefined ? (
      <ui.Text bold color="claude">
        {`◆ ${title}`}
      </ui.Text>
    ) : (
      <ui.Box flexDirection="row" justifyContent="space-between" columnGap={2} {...(width !== undefined && { width })}>
        <ui.Box flexShrink={1}>
          <ui.Text bold color="claude" wrap="truncate-end">
            {`◆ ${title}`}
          </ui.Text>
        </ui.Box>
        <ui.Box flexShrink={0}>{actions}</ui.Box>
      </ui.Box>
    )}
    {body}
    {details.length > 0 && (
      <ui.Box position="relative" height={2} flexDirection="row">
        <ui.Text dimColor>⋯</ui.Text>
        {details.map(detail => (
          <ui.Box position="absolute" top={0} left={2} display="none" hover={{ scope: detail.scope, display: 'flex' }}>
            <ui.Text color="text" wrap="wrap">
              {detail.text}
            </ui.Text>
          </ui.Box>
        ))}
      </ui.Box>
    )}
  </ui.Box>
)

// ---------------------------------------------------------------- diagram

const SHAPES = ['box', 'round', 'decision', 'store', 'external', 'person'] as const
type Shape = (typeof SHAPES)[number]
// A line inside a node under its name: a field of a table, a member of a class.
type BodyRow = { mark: string; text: string; aside?: string }
type GraphNode = {
  id: string
  label: string
  note?: string
  group?: string
  shape: Shape
  rows: BodyRow[]
  // Labels of the edges from the node to itself.
  loops: string[]
}
type GraphEdge = { from: number; to: number; label?: string; isReversed: boolean }
type Graph = {
  isNumbered: boolean
  title: string
  layout: 'flow' | 'matrix' | 'zones'
  nodes: GraphNode[]
  edges: GraphEdge[]
  notes: string[]
  dropped: number
}

// A node's frame by shape: top-left, top, top-right, side, bottom-left, bottom,
// bottom-right, then the mark where a wire leaves the bottom and enters the top.
const FRAMES: Record<Shape, string[]> = {
  box: [...'┌─┐│└─┘┬┴'],
  round: [...'╭─╮│╰─╯┬┴'],
  decision: [...'╱─╲│╲─╱┬┴'],
  store: [...'╔═╗║╚═╝╤╧'],
  external: [...'┌┄┐┆└┄┘┬┴'],
  person: [...'╭─╮│╰─╯┬┴'],
}

const readGraph = (input: unknown): Graph | string => {
  const raw = record(input)
  const nodes: GraphNode[] = []
  const index = new Map<string, number>()
  const add = (id: string, label: string, note?: string, group?: string, shape: Shape = 'box'): void => {
    if (index.has(id) || nodes.length >= 28) return
    index.set(id, nodes.length)
    if (!index.has(label)) index.set(label, nodes.length)
    nodes.push({ id, label, note, group, shape, rows: [], loops: [] })
  }
  for (const one of items(raw.nodes)) {
    const node = typeof one === 'string' ? { label: one } : record(one)
    const label = words(node.label ?? node.name ?? node.id, 40)
    if (label === undefined) continue
    add(words(node.id, 40) ?? label, label, words(node.note, 120), words(node.group, 24), pick(node.shape, SHAPES, 'box'))
  }
  // The first version's shape, layers of nodes, still reads: each layer is a group.
  for (const one of items(raw.layers)) {
    const layer = record(one)
    for (const each of items(layer.nodes)) {
      const node = typeof each === 'string' ? { name: each } : record(each)
      const label = words(node.name ?? node.label, 40)
      if (label !== undefined) add(label, label, words(node.note, 40), words(layer.name, 24))
    }
  }
  if (nodes.length === 0) return 'nodes is empty: give at least one node with an id and a label'

  const edges: GraphEdge[] = []
  const seen = new Set<string>()
  let dropped = 0
  for (const one of [...items(raw.edges), ...items(raw.flows)].slice(0, 70)) {
    const edge = record(one)
    const from = index.get(words(edge.from, 40) ?? '')
    const to = index.get(words(edge.to, 40) ?? '')
    if (from !== undefined && from === to) {
      nodes[from]?.loops.push(words(edge.label, 18) ?? '')
      continue
    }
    if (from === undefined || to === undefined || seen.has(`${from}>${to}`)) {
      dropped++
      continue
    }
    seen.add(`${from}>${to}`)
    edges.push({ from, to, label: words(edge.label, 24), isReversed: false })
  }

  return {
    title: words(raw.title, 80) ?? 'Diagram',
    layout: pick(raw.layout, ['flow', 'matrix', 'zones'] as const, 'flow'),
    isNumbered: raw.numbers === true,
    nodes,
    edges,
    notes: wordList(raw.notes, 4, 120),
    dropped,
  }
}

type Slot = { rank: number; node?: number; x: number; w: number; order: number; ups: Slot[]; downs: Slot[] }
// A link is one hop between ranks. Edges bound for the same node share the hops
// through the ranks they skip, so `also` lists the other edges a hop carries.
type Link = { from: Slot; to: Slot; edge: number; also: number[]; isFirst: boolean; isLast: boolean; tx: number; bundle?: Bundle }
// The wires that leave one node downward travel as one: a trunk, a lane, and a
// drop to each target, drawn in the node's color so a line can be followed.
type Bundle = { from: Slot; isReversed: boolean; links: Link[]; sx: number; lane: number; color: string; scope: string; isLit: boolean }

const nodeColors = (graph: Graph): { colors: string[]; groups: { name: string; color: string }[] } => {
  const groups: { name: string; color: string }[] = []
  const colors = graph.nodes.map((node, index) => {
    if (node.group === undefined) return graph.nodes.some(one => one.group !== undefined) ? 'inactive' : tint(index)
    let group = groups.find(one => one.name === node.group)
    if (!group) {
      group = { name: node.group, color: tint(groups.length) }
      groups.push(group)
    }

    return group.color
  })

  return { colors, groups }
}

// Ranks top to bottom by longest path, order within a rank by the average
// place of a node's neighbours, an edge that skips ranks threaded through them.
const layoutGraph = (graph: Graph, room: number) => {
  const { nodes, edges } = graph
  // A loop is broken where it runs against the order the nodes were given in:
  // an edge on a cycle that points from a later node to an earlier one is laid
  // out upside down (and drawn with its arrow pointing up).
  const reach: boolean[][] = nodes.map(() => nodes.map(() => false))
  for (const edge of edges) {
    const row = reach[edge.from]
    if (row) row[edge.to] = true
  }
  for (let via = 0; via < nodes.length; via++) {
    for (let from = 0; from < nodes.length; from++) {
      const row = reach[from]
      if (!row?.[via]) continue
      for (let to = 0; to < nodes.length; to++) {
        if (reach[via]?.[to]) row[to] = true
      }
    }
  }
  for (const edge of edges) {
    edge.isReversed = edge.from > edge.to && reach[edge.to]?.[edge.from] === true
  }
  const topOf = (edge: GraphEdge): number => (edge.isReversed ? edge.to : edge.from)
  const bottomOf = (edge: GraphEdge): number => (edge.isReversed ? edge.from : edge.to)

  // Zoned, each group is a band: nodes are ranked inside their own group and
  // the bands are stacked in the order the groups first appear.
  const isZoned = graph.layout === 'zones'
  const zoneOf = (node: number): string => nodes[node]?.group ?? ''
  const rank = nodes.map(() => 0)
  for (let pass = 0; pass < nodes.length; pass++) {
    let isChanged = false
    for (const edge of edges) {
      if (isZoned && zoneOf(edge.from) !== zoneOf(edge.to)) continue
      const above = rank[topOf(edge)] ?? 0
      if ((rank[bottomOf(edge)] ?? 0) < above + 1) {
        rank[bottomOf(edge)] = above + 1
        isChanged = true
      }
    }
    if (!isChanged) break
  }
  const zones: string[] = []
  if (isZoned) {
    nodes.forEach((_, node) => {
      if (!zones.includes(zoneOf(node))) zones.push(zoneOf(node))
    })
    let offset = 0
    for (const zone of zones) {
      const members = nodes.map((_, node) => node).filter(node => zoneOf(node) === zone)
      const depth = Math.max(...members.map(node => rank[node] ?? 0)) + 1
      for (const node of members) rank[node] = (rank[node] ?? 0) + offset
      offset += depth
    }
    // Between bands an edge simply runs the way the bands are stacked.
    for (const edge of edges) edge.isReversed = (rank[edge.from] ?? 0) > (rank[edge.to] ?? 0)
  }

  const ranks: Slot[][] = []
  const place = (slot: Slot): Slot => {
    const line = ranks[slot.rank] ?? []
    ranks[slot.rank] = line
    slot.order = line.length
    line.push(slot)

    return slot
  }
  const slotOf = nodes.map((_, node) =>
    place({ rank: rank[node] ?? 0, node, x: 0, w: 0, order: 0, ups: [], downs: [] }),
  )
  for (let at = 0; at < ranks.length; at++) ranks[at] = ranks[at] ?? []

  const links: Link[] = []
  const passes = new Map<string, Slot>()
  edges.forEach((edge, index) => {
    const first = slotOf[topOf(edge)]
    const last = slotOf[bottomOf(edge)]
    if (!first || !last) return
    let from = first
    for (let at = first.rank + 1; at <= last.rank; at++) {
      // Each edge keeps its own way through the ranks it skips: lit, its whole
      // path shows, which a way shared with other edges could not.
      const key = `${index}@${at}`
      let to = at === last.rank ? last : passes.get(key)
      if (!to) {
        to = place({ rank: at, x: 0, w: 0, order: 0, ups: [], downs: [] })
        passes.set(key, to)
      }
      const shared = links.find(link => link.from === from && link.to === to)
      if (shared) shared.also.push(index)
      else {
        links.push({ from, to, edge: index, also: [], isFirst: from === first, isLast: to === last, tx: 0 })
        from.downs.push(to)
        to.ups.push(from)
      }
      from = to
    }
  })

  const reorder = (line: Slot[], near: (slot: Slot) => Slot[]): Slot[] => {
    const keyed = line.map((slot, index) => {
      const around = near(slot)

      return {
        slot,
        key: around.length > 0 ? around.reduce((sum, one) => sum + one.order, 0) / around.length : index,
      }
    })
    keyed.sort((a, b) => a.key - b.key)
    keyed.forEach((one, index) => {
      one.slot.order = index
    })

    return keyed.map(one => one.slot)
  }
  for (let sweep = 0; sweep < 4; sweep++) {
    for (let at = 1; at < ranks.length; at++) ranks[at] = reorder(ranks[at] ?? [], slot => slot.ups)
    for (let at = ranks.length - 2; at >= 0; at--) ranks[at] = reorder(ranks[at] ?? [], slot => slot.downs)
  }

  const widest = Math.max(
    ...nodes.map(node =>
      Math.max(
        widthOf(node.label) + (node.shape === 'person' ? 2 : 0),
        node.note ? Math.min(widthOf(node.note), 20) : 0,
        node.loops.length > 0 ? widthOf(node.loops.join(', ')) + 2 : 0,
        ...node.rows.map(row => 2 + widthOf(row.text) + (row.aside ? widthOf(row.aside) + 2 : 0)),
      ),
    ),
  )
  let nodeW = clamp(widest + 4, 10, nodes.some(node => node.rows.length > 0) ? 38 : 26)
  let gap = 4
  const lineWidth = (line: Slot[]): number =>
    line.reduce((sum, slot) => sum + (slot.node === undefined ? 1 : nodeW), 0) + gap * Math.max(0, line.length - 1)
  const span = (): number => Math.max(1, ...ranks.map(lineWidth))
  while (span() > room && (nodeW > 8 || gap > 1)) {
    if (nodeW > 8) nodeW--
    else gap--
  }
  const packed = span()
  for (const line of ranks) {
    let x = (packed - lineWidth(line)) >> 1
    for (const slot of line) {
      slot.w = slot.node === undefined ? 1 : nodeW
      slot.x = x
      x += slot.w + gap
    }
  }

  // Straighten: each slot is pulled under (or over) the middle of what it is
  // wired to, keeping its place in the row; kept only while the picture fits.
  const middle = (slot: Slot): number => slot.x + (slot.w - 1) / 2
  const all = ranks.flat()
  const before = all.map(slot => slot.x)
  const pull = (line: Slot[], near: (slot: Slot) => Slot[]): void => {
    const want = line.map(slot => {
      const around = near(slot)

      return around.length > 0
        ? around.reduce((sum, one) => sum + middle(one), 0) / around.length - (slot.w - 1) / 2
        : slot.x
    })
    const fromLeft: number[] = []
    line.forEach((slot, index) => {
      const prior = line[index - 1]
      fromLeft[index] = Math.max(want[index] ?? 0, prior ? (fromLeft[index - 1] ?? 0) + prior.w + gap : -Infinity)
    })
    const fromRight: number[] = []
    for (let index = line.length - 1; index >= 0; index--) {
      const slot = line[index]
      const after = line[index + 1]
      if (!slot) continue
      fromRight[index] = Math.min(want[index] ?? 0, after ? (fromRight[index + 1] ?? 0) - slot.w - gap : Infinity)
    }
    line.forEach((slot, index) => {
      slot.x = Math.round(((fromLeft[index] ?? 0) + (fromRight[index] ?? 0)) / 2)
    })
  }
  for (let sweep = 0; sweep < 2; sweep++) {
    for (let at = 1; at < ranks.length; at++) pull(ranks[at] ?? [], slot => slot.ups)
    for (let at = ranks.length - 2; at >= 0; at--) pull(ranks[at] ?? [], slot => slot.downs)
  }
  const least = Math.min(...all.map(slot => slot.x))
  all.forEach(slot => {
    slot.x -= least
  })
  let width = Math.max(...all.map(slot => slot.x + slot.w))
  if (width > room) {
    all.forEach((slot, index) => {
      slot.x = before[index] ?? 0
    })
    width = packed
  }
  if (isZoned) {
    all.forEach(slot => {
      slot.x += 2
    })
    width += 4
  }

  const { colors, groups } = nodeColors(graph)
  // Wires are colored by the node they leave, each such node its own color, so
  // wires from nodes of one group can still be told apart.
  // Numbers on nodes and arrows only when asked: a click and its moving
  // pulse say which wire is which better than numbers do.
  const isNumbered = graph.isNumbered
  // With a node focused, its own wires keep their colors and the rest fade.
  const focus = focusNode !== undefined && focusNode < nodes.length ? focusNode : undefined
  const isLit = (edge: GraphEdge): boolean => focus === undefined || edge.from === focus || edge.to === focus
  const isNear = (node: number): boolean =>
    focus === undefined || node === focus || edges.some(edge => (edge.from === focus && edge.to === node) || (edge.to === focus && edge.from === node))
  const numberOf: number[] = []
  all
    .filter(slot => slot.node !== undefined)
    .sort((a, b) => a.rank - b.rank || a.x - b.x)
    .forEach((slot, index) => {
      numberOf[slot.node ?? 0] = index + 1
    })
  const wireColors: string[] = []
  let sources = 0
  nodes.forEach((_, node) => {
    if (edges.some(edge => (edge.isReversed ? edge.to : edge.from) === node)) wireColors[node] = tint(sources++)
  })
  const portOf = (slot: Slot, count: number, index: number): number =>
    slot.node === undefined
      ? slot.x
      : slot.x + 1 + Math.min(slot.w - 3, Math.floor(((index + 0.5) * (slot.w - 2)) / count))
  const bundles: Bundle[] = []
  for (const link of links) {
    const edge = edges[link.edge]
    if (!edge) continue
    // Grouped by source alone, never by focus, so a click changes colors and
    // strokes but moves no wire.
    let bundle = bundles.find(one => one.from === link.from && one.isReversed === edge.isReversed)
    if (!bundle) {
      const isMerged = link.also.length > 0
      const color = isMerged ? 'inactive' : (wireColors[topOf(edge)] ?? 'inactive')
      const scope = scopeOf(isMerged ? bottomOf(edge) : topOf(edge))
      bundle = { from: link.from, isReversed: edge.isReversed, links: [], sx: 0, lane: 0, color, scope, isLit: false }
      bundles.push(bundle)
    }
    bundle.links.push(link)
    bundle.isLit ||= isLit(edge)
    link.bundle = bundle
  }
  for (const slot of all) {
    const leaving = bundles.filter(bundle => bundle.from === slot)
    leaving.forEach((bundle, index) => {
      bundle.sx = portOf(slot, leaving.length, index)
    })
    const arriving = links.filter(link => link.to === slot).sort((a, b) => middle(a.from) - middle(b.from))
    arriving.forEach((link, index) => {
      link.tx = portOf(slot, arriving.length, index)
    })
  }

  // A lane is the row a bundle runs along; two bundles share one only where
  // their spans do not overlap.
  const lanes: number[] = []
  const reachOf = (bundle: Bundle): [number, number] => {
    const xs = [bundle.sx, ...bundle.links.map(link => link.tx)]

    return [Math.min(...xs), Math.max(...xs)]
  }
  for (let at = 0; at < ranks.length - 1; at++) {
    const bent = bundles
      .filter(bundle => bundle.from.rank === at && reachOf(bundle)[0] !== reachOf(bundle)[1])
      .sort((a, b) => reachOf(a)[0] - reachOf(b)[0])
    const ends: number[] = []
    for (const bundle of bent) {
      const [left, right] = reachOf(bundle)
      let lane = ends.findIndex(end => end < left - 1)
      if (lane === -1) lane = ends.length < 8 ? ends.length : ends.indexOf(Math.min(...ends))
      ends[lane] = Math.max(ends[lane] ?? -1, right)
      bundle.lane = lane
    }
    lanes[at] = ends.length
  }

  // A node is as tall as what it holds; plain nodes of one rank share a height.
  const ownTall = (node: GraphNode | undefined): number =>
    3 +
    (node?.note !== undefined ? 1 : 0) +
    (node && node.loops.length > 0 ? 1 : 0) +
    (node && node.rows.length > 0 ? node.rows.length + 1 : 0)
  const plain = ranks.map(line =>
    Math.max(
      3,
      ...line
        .filter(slot => slot.node !== undefined && nodes[slot.node]?.rows.length === 0)
        .map(slot => ownTall(nodes[slot.node ?? -1])),
    ),
  )
  const tallOf = (slot: Slot): number => {
    const node = nodes[slot.node ?? -1]

    return node && node.rows.length > 0 ? ownTall(node) : (plain[slot.rank] ?? 3)
  }
  const heights = ranks.map((line, at) =>
    Math.max(plain[at] ?? 3, ...line.filter(slot => slot.node !== undefined).map(tallOf)),
  )
  const tops: number[] = []
  let height = isZoned ? 1 : 0
  ranks.forEach((_, at) => {
    tops[at] = height
    height += (heights[at] ?? 3) + (at < ranks.length - 1 ? (lanes[at] ?? 0) + 2 : 0)
  })
  if (isZoned) height += 1
  const canvas = makeCanvas(Math.max(width, Math.min(room, width + 20)), height)

  for (const slot of all) {
    const top = tops[slot.rank] ?? 0
    const tall = tallOf(slot)
    if (slot.node === undefined) continue
    const node = nodes[slot.node]
    const frame = slot.node === focus ? [...'┏━┓┃┗━┛┳┻'] : FRAMES[node?.shape ?? 'box']
    const border: Style = {
      color: slot.node === focus ? 'text' : isNear(slot.node) ? colors[slot.node] : 'subtle',
      bold: slot.node === focus,
      scope: scopeOf(slot.node),
    }
    const inner = slot.w - 2
    put(canvas, slot.x, top, `${frame[0]}${(frame[1] ?? '─').repeat(inner)}${frame[2]}`, border)
    if (isNumbered) put(canvas, slot.x + 1, top, String(numberOf[slot.node] ?? ''), { color: wireColors[slot.node] ?? colors[slot.node], bold: true, scope: border.scope })
    for (let y = top + 1; y < top + tall - 1; y++) {
      put(canvas, slot.x, y, frame[3] ?? '│', border)
      put(canvas, slot.x + 1, y, ' '.repeat(inner))
      put(canvas, slot.x + slot.w - 1, y, frame[3] ?? '│', border)
    }
    put(canvas, slot.x, top + tall - 1, `${frame[4]}${(frame[5] ?? '─').repeat(inner)}${frame[6]}`, border)
    const centred = (text: string, y: number, style: Style): void => {
      const cut = clip(text, inner)
      put(canvas, slot.x + 1 + ((inner - widthOf(cut)) >> 1), y, cut, style)
    }
    let line = top + 1
    // The name's whole row inside the frame is one button, padding included,
    // so a click anywhere across the middle of the box focuses the node.
    const fullName = node?.shape === 'person' ? `☺ ${node.label}` : (node?.label ?? '')
    const isCut = widthOf(fullName) > inner || (node?.note !== undefined && widthOf(node.note) > inner)
    if (isCut) fitted(`${node?.label ?? ''}${node?.note === undefined ? '' : ` · ${node.note}`}`, 0, border.scope)
    const name = clip(fullName, inner)
    const before = (inner - widthOf(name)) >> 1
    put(canvas, slot.x + 1, line++, ' '.repeat(before) + name + ' '.repeat(inner - before - widthOf(name)), {
      ...(slot.node === focus && { color: 'claude' }),
      bold: isNear(slot.node),
      dim: !isNear(slot.node),
      scope: border.scope,
      press: slot.node,
    })
    if (node?.note !== undefined) centred(node.note, line++, { dim: true })
    if (node && node.loops.length > 0) centred(`↺ ${node.loops.filter(loop => loop !== '').join(', ')}`.trim(), line++, border)
    if (node && node.rows.length > 0) {
      put(canvas, slot.x, line++, `├${'─'.repeat(inner)}┤`, border)
      for (const row of node.rows) {
        put(canvas, slot.x + 1, line, row.mark, { color: 'warning' })
        put(canvas, slot.x + 3, line, clip(row.text, inner - 3))
        if (row.aside !== undefined && widthOf(row.text) + widthOf(row.aside) + 5 <= inner) {
          put(canvas, slot.x + slot.w - 2 - widthOf(row.aside), line, row.aside, { dim: true })
        }
        line++
      }
    }
  }

  const rowsFor = (at: number): { exit: number; arrow: number } => ({
    exit: (tops[at] ?? 0) + (heights[at] ?? 3),
    arrow: (tops[at + 1] ?? 0) - 1,
  })
  // Longer spans first, so a short hop is drawn over a long haul it meets.
  // With a node focused, its wires go on last: they pass over every other
  // wire in their own color, whole from end to end.
  const drawOrder = [...bundles].sort(
    (a, b) =>
      Number(focus !== undefined && a.isLit) - Number(focus !== undefined && b.isLit) ||
      reachOf(b)[1] - reachOf(b)[0] - (reachOf(a)[1] - reachOf(a)[0]),
  )
  // A wire leaves from under its own node, which may end above the rank's last row.
  const startOf = (bundle: Bundle): number =>
    bundle.from.node === undefined ? rowsFor(bundle.from.rank).exit : (tops[bundle.from.rank] ?? 0) + tallOf(bundle.from)
  const arrivals = (slot: Slot): number => links.filter(link => link.to === slot).length
  const linkLit = (link: Link): boolean => {
    const edge = edges[link.edge]
    return edge !== undefined && isLit(edge)
  }
  // With a node focused, each bundle draws as two passes over the same route:
  // its other links faded, then its focused links, all of those last of all.
  const draws = drawOrder.flatMap(bundle => {
    if (focus === undefined) return [{ bundle, links: bundle.links, isFocused: false }]
    const lit = bundle.links.filter(linkLit)
    const faded = bundle.links.filter(link => !linkLit(link))
    return [
      ...(faded.length > 0 ? [{ bundle, links: faded, isFocused: false }] : []),
      ...(lit.length > 0 ? [{ bundle, links: lit, isFocused: true }] : []),
    ]
  })
  draws.sort((a, b) => Number(a.isFocused) - Number(b.isFocused))
  let crossings = 0
  for (const pass of draws) {
    const { bundle, isFocused } = pass
    const { exit, arrow } = rowsFor(bundle.from.rank)
    const lane = exit + 1 + bundle.lane
    const start = startOf(bundle)
    const layer = makeCanvas(canvas.w, canvas.h)
    const xs = [bundle.sx, ...pass.links.map(link => link.tx)]
    const [left, right] = [Math.min(...xs), Math.max(...xs)]
    const isRouted = reachOf(bundle)[0] !== reachOf(bundle)[1]
    const joins = new Map<string, number>()
    for (const link of pass.links) {
      if (arrivals(link.to) < 2) continue
      const key = link.to.node ?? -1
      for (let y = left === right ? start : lane; y <= arrow; y++) joins.set(`${link.tx},${y}`, key)
      if (left !== right) for (let x = Math.min(link.tx, bundle.sx); x <= Math.max(link.tx, bundle.sx); x++) {
        if (x === link.tx) joins.set(`${x},${lane}`, key)
      }
    }
    // A wire through a rank it skips runs down the slot kept for it.
    for (const link of pass.links) {
      if (link.to.node === undefined) {
        const top = tops[link.to.rank] ?? 0
        vline(layer, link.to.x, top - 1, top + (heights[link.to.rank] ?? 3))
      }
    }
    // The route is the bundle's whatever the pass: a bundle that turns along a
    // lane keeps that lane even for a pass whose own links run straight down.
    if (!isRouted) vline(layer, bundle.sx, start, arrow)
    else {
      vline(layer, bundle.sx, start, lane)
      if (left !== right) hline(layer, lane, left, right)
      for (const link of pass.links) vline(layer, link.tx, lane, arrow)
    }
    wire(layer, bundle.sx, start, UP)
    for (const link of pass.links) wire(layer, link.tx, arrow, DOWN)
    // A wire belongs wholly to the node it leaves, so hovering that node lights
    // it end to end; the wires into a node show whole when it is clicked.
    const color = focus !== undefined && !isFocused ? 'subtle' : bundle.color
    crossings += stamp(canvas, layer, { color, scope: bundle.scope, heavy: isFocused }, joins)
  }
  // Along the focused wires, each cell's distance from where its wire leaves
  // its node, walked through the wires' own joints.
  if (focus !== undefined) {
    const queue: [number, number, number][] = []
    for (const bundle of bundles) {
      if (bundle.isLit && bundle.from.node !== undefined) queue.push([bundle.sx, startOf(bundle), 0])
    }
    const steps: [number, number, number, number][] = [
      [UP, 0, -1, DOWN],
      [DOWN, 0, 1, UP],
      [LEFT, -1, 0, RIGHT],
      [RIGHT, 1, 0, LEFT],
    ]
    while (queue.length > 0) {
      const [x, y, d] = queue.shift() ?? [0, 0, 0]
      const cell = cellAt(canvas, x, y)
      if (!cell || !cell.isHeavy || cell.ch !== '' || (cell.flow !== undefined && cell.flow <= d)) continue
      cell.flow = d
      for (const [bit, dx, dy, back] of steps) {
        const near = cellAt(canvas, x + dx, y + dy)
        // A wire is drawn in pieces, one per rank it crosses; where two meet,
        // the joint may be recorded on one side only.
        if (near?.isHeavy && ((cell.mask & bit) !== 0 || (near.mask & back) !== 0)) queue.push([x + dx, y + dy, d + 1])
      }
    }
  }
  for (const bundle of bundles) {
    const { arrow } = rowsFor(bundle.from.rank)
    const start = startOf(bundle)
    if (bundle.from.node !== undefined) {
      const frame = bundle.from.node === focus ? [...'┏━┓┃┗━┛┳┻'] : FRAMES[nodes[bundle.from.node]?.shape ?? 'box']
      const mark = focus !== undefined && !bundle.isLit ? 'subtle' : bundle.color
      put(canvas, bundle.sx, start - 1, frame[7] ?? '┬', { color: mark, scope: bundle.scope })
      if (bundle.isReversed) put(canvas, bundle.sx, start, '▲', { color: mark, bold: true, scope: bundle.scope })
    }
    for (const link of bundle.links) {
      if (link.to.node === undefined) continue
      if (!bundle.isReversed && link.isLast) {
        const lit = focus === undefined || linkLit(link)
        put(canvas, link.tx, arrow, '▼', { color: lit ? bundle.color : 'subtle', bold: lit, scope: bundle.scope })
      }
      else {
        const frame = link.to.node === focus ? [...'┏━┓┃┗━┛┳┻'] : FRAMES[nodes[link.to.node]?.shape ?? 'box']
        put(canvas, link.tx, arrow + 1, frame[8] ?? '┴', { color: colors[link.to.node] })
      }
    }
  }

  // A zone's frame goes round its nodes. Its name is written first, so the
  // edge labels placed next keep clear of it.
  const frames: { color: string; x0: number; x1: number; y0: number; y1: number }[] = []
  if (isZoned) {
    for (const zone of zones) {
      const members = all.filter(slot => slot.node !== undefined && zoneOf(slot.node) === zone)
      if (zone === '' || members.length === 0) continue
      const color = colors[members[0]?.node ?? 0] ?? 'inactive'
      const first = Math.min(...members.map(slot => slot.rank))
      const last = Math.max(...members.map(slot => slot.rank))
      const frame = {
        color,
        x0: Math.min(...members.map(slot => slot.x)) - 2,
        x1: Math.max(...members.map(slot => slot.x + slot.w)) + 1,
        y0: (tops[first] ?? 0) - 1,
        y1: (tops[last] ?? 0) + (heights[last] ?? 3),
      }
      frames.push(frame)
      put(canvas, frame.x0 + 2, frame.y0, clip(` ${zone} `, frame.x1 - frame.x0 - 3), { color, bold: true })
    }
  }

  const arrivalsOfNode = (node: number): number => edges.filter(edge => (edge.isReversed ? edge.from : edge.to) === node).length
  const labelled = new Set<number>()
  const loose: string[] = []
  for (const link of links) {
    const edge = edges[link.edge]
    const bundle = link.bundle
    if (!bundle || !edge || !(edge.isReversed ? link.isFirst : link.isLast)) continue
    // Into a node many wires reach, one label beside its arrow says who came,
    // by number, with every wire's own label after.
    const target = edge.isReversed ? edge.from : edge.to
    const isShared = !edge.isReversed && arrivalsOfNode(target) > 1
    if (isShared && labelled.has(target)) continue
    labelled.add(target)
    const into = links.filter(one => one.to === link.to && one.isLast).sort((a, b) => a.tx - b.tx)
    const carried = isShared ? into.flatMap(one => [one.edge, ...one.also]) : [link.edge, ...link.also]
    const rightmost = into[into.length - 1]?.tx ?? link.tx
    const named = carried.map(index => edges[index]?.label).filter((label): label is string => label !== undefined)
    const numbers =
      isNumbered && isShared
        ? carried
            .map(index => numberOf[edges[index]?.from ?? 0] ?? 0)
            .join('·')
        : ''
    if (named.length === 0 && numbers === '') continue
    const label = [numbers, [...new Set(named)].join(', ')].filter(part => part !== '').join(' ')
    const text = clip(label, 22)
    const size = widthOf(text)
    const { exit, arrow } = rowsFor(link.from.rank)
    const leftmost = into[0]?.tx ?? link.tx
    const spots: [number, number][] = [
      [(isShared ? rightmost : link.tx) + 2, arrow],
      [(isShared ? leftmost : link.tx) - size - 1, arrow],
      ...(isShared ? [] : ([[bundle.sx + 2, exit], [bundle.sx - size - 1, exit]] as [number, number][])),
    ]
    const spot = spots.find(([x, y]) => isFree(canvas, x, y, size))
    if (spot) put(canvas, spot[0], spot[1], text, { color: !isNear(target) ? 'subtle' : numbers !== '' ? 'text' : bundle.color, dim: numbers === '', scope: isShared ? scopeOf(target) : bundle.scope })
    else loose.push(`${nodes[edge.from]?.label ?? ''} → ${nodes[edge.to]?.label ?? ''}: ${label}`)
  }

  // The frames go on last and only into empty cells, so wires and labels read
  // as lying over them.
  for (const frame of frames) {
    const { color, x0, x1, y0, y1 } = frame
    const edge = (x: number, y: number, char: string): void => {
      const cell = cellAt(canvas, x, y)
      if (cell && cell.ch === '' && cell.mask === 0) put(canvas, x, y, char, { color, dim: true })
    }
    for (let x = x0 + 1; x < x1; x++) {
      edge(x, y0, '┄')
      edge(x, y1, '┄')
    }
    for (let y = y0 + 1; y < y1; y++) {
      edge(x0, y, '┆')
      edge(x1, y, '┆')
    }
    edge(x0, y0, '┌')
    edge(x1, y0, '┐')
    edge(x0, y1, '└')
    edge(x1, y1, '┘')
  }

  return { rows: rowsOf(canvas), groups: isZoned ? [] : groups, loose, isTooWide: width > room, crossings, wireColors, isNumbered, numberOf }
}

// Who depends on whom as a grid: clearer than wires once almost everything
// touches everything.
const drawMatrix = (ui: UI, graph: Graph, room: number): any => {
  const { nodes, edges } = graph
  const { colors } = nodeColors(graph)
  const count = nodes.length
  const widest = Math.max(...nodes.map(node => widthOf(node.label)))
  const labelW = clamp(widest, 4, 22)
  // Columns carry their names while the grid fits; past that, numbers that the
  // rows repeat beside their names.
  const named = clamp(widest, 3, 10)
  const isNamed = labelW + 2 + count * (named + 2) + 5 <= room
  const cell = isNamed ? named + 2 : 3
  const nameAt = isNamed ? 0 : 3
  const left = nameAt + labelW + 2
  const markAt = (index: number): number => left + index * cell + (isNamed ? 0 : 1)
  const canvas = makeCanvas(left + count * cell + 5, count + 2)
  nodes.forEach((node, index) => {
    const look: Style = { color: colors[index], bold: true }
    put(canvas, left + index * cell, 0, isNamed ? clip(node.label, named) : padStart(String(index + 1), 2), look)
    if (!isNamed) put(canvas, 0, index + 1, padStart(String(index + 1), 2), look)
    put(canvas, nameAt, index + 1, clip(node.label, labelW), look)
    nodes.forEach((_, other) => {
      const isWired = edges.some(edge => edge.from === index && edge.to === other)
      put(canvas, markAt(other), index + 1, isWired ? '●' : other === index ? '╲' : '·', isWired ? look : { dim: true })
    })
    put(canvas, left + count * cell, index + 1, `→ ${edges.filter(edge => edge.from === index).length}`, { dim: true })
    put(canvas, markAt(index), count + 1, String(edges.filter(edge => edge.to === index).length), { dim: true })
  })
  put(canvas, nameAt, count + 1, '←', { dim: true })
  const sample = edges[0]

  return [
    ...drawRows(ui, rowsOf(canvas)),
    <ui.Text dimColor wrap="truncate-end">
      {`● ${sample ? `${nodes[sample.from]?.label ?? ''} → ${nodes[sample.to]?.label ?? ''}` : 'row → column'}    → uses    ← used by`}
    </ui.Text>,
  ]
}

const drawDiagram = (ui: UI, graph: Graph, room: number): any => {
  if (graph.layout === 'matrix') return [...drawMatrix(ui, graph, room), ...notesOf(ui, graph.notes)]
  const laid = layoutGraph(graph, room)
  // Past a handful of crossings a reader stops following wires, so every
  // connection is also written out under the picture. Each name there is a
  // button too: a click focuses that node, as a click on its box does.
  const isDense = laid.crossings >= 8
  const press = pressNode
  const listing = isDense
    ? graph.nodes
        .map((node, index) => ({ node, index, to: graph.edges.filter(edge => edge.from === index) }))
        .filter(one => one.to.length > 0)
        .sort((a, b) => (laid.numberOf[a.index] ?? 0) - (laid.numberOf[b.index] ?? 0))
        .map(one => (
          <ui.Box flexDirection="row" columnGap={1}>
            <ui.Button key={scopeOf(`l${one.index}`)} plain onPress={() => press(one.index)}>
              <ui.Text
                bold
                color={focusNode === one.index ? 'claude' : (laid.wireColors[one.index] ?? 'text')}
                hover={{ scope: scopeOf(one.index), ...LIT }}
                wrap="truncate-end"
              >
                {`${focusNode === one.index ? '▶ ' : ''}${laid.isNumbered ? `${laid.numberOf[one.index] ?? ''} ` : ''}${one.node.label}`}
              </ui.Text>
            </ui.Button>
            <ui.Text dimColor>→</ui.Text>
            <ui.Text wrap="wrap">
              {[...one.to]
                .sort((a, b) => (laid.numberOf[a.to] ?? 0) - (laid.numberOf[b.to] ?? 0))
                .map(edge => `${laid.isNumbered ? `${laid.numberOf[edge.to] ?? ''} ` : ''}${graph.nodes[edge.to]?.label ?? ''}${edge.label === undefined ? '' : ` (${edge.label})`}`)
                .join(', ')}
            </ui.Text>
          </ui.Box>
        ))
    : []

  return [
    ...drawRows(ui, laid.rows),
    legendOf(ui, laid.groups.map(group => group.name), laid.groups.map(group => group.color), 1),
    ...(isDense
      ? listing
      : laid.loose.slice(0, 8).map(line => (
          <ui.Text dimColor wrap="truncate-end">
            {line}
          </ui.Text>
        ))),
    ...notesOf(ui, graph.notes),
  ]
}

// ---------------------------------------------------------------- layers
// The block picture of an architecture: bands top to bottom, each holding
// components (plain, or gathered into named zones), with the concerns that cut
// across every band standing beside them.

type Zone = { name: string; items: string[]; zones: Zone[] }
type Band = { name: string; items: string[]; zones: Zone[] }
type Layers = { title: string; bands: Band[]; sides: Zone[]; notes: string[] }

const namesOf = (value: unknown, count: number): string[] =>
  items(value)
    .map(one => words(typeof one === 'object' ? (record(one).name ?? record(one).label) : one, 28))
    .filter((one): one is string => one !== undefined)
    .slice(0, count)

const readLayers = (input: unknown): Layers | string => {
  const raw = record(input)
  const zoneOf = (value: unknown, depth = 0): Zone | undefined => {
    const zone = typeof value === 'string' ? { name: value } : record(value)
    const name = words(zone.name, 24)
    if (name === undefined) return undefined

    return {
      name,
      items: namesOf(zone.items, 10),
      zones:
        depth >= 3
          ? []
          : items(zone.zones)
              .map(one => zoneOf(one, depth + 1))
              .filter((one): one is Zone => one !== undefined)
              .slice(0, 5),
    }
  }
  const bands: Band[] = []
  for (const one of items(raw.layers).slice(0, 8)) {
    const band = record(one)
    const name = words(band.name, 20)
    if (name === undefined) continue
    bands.push({
      name,
      items: namesOf(band.items, 12),
      zones: items(band.zones ?? band.groups)
        .map(one => zoneOf(one))
        .filter((zone): zone is Zone => zone !== undefined)
        .slice(0, 5),
    })
  }
  if (bands.length === 0) return 'layers is empty: each needs a name and items (names) or zones [{ name, items }]'

  return {
    title: words(raw.title, 80) ?? 'Architecture',
    bands,
    sides: items(raw.sides)
      .map(one => zoneOf(one))
      .filter((zone): zone is Zone => zone !== undefined)
      .slice(0, 3),
    notes: wordList(raw.notes, 4, 120),
  }
}

const drawLayers = (ui: UI, layers: Layers, room: number): any => {
  const sideW = layers.sides.length === 0 ? 0 : clamp(Math.max(...layers.sides.flatMap(side => [side.name, ...side.items]).map(widthOf)) + 4, 10, 20)
  const mainW = Math.max(30, room - layers.sides.length * (sideW + 1))
  const labelW = clamp(Math.max(...layers.bands.map(band => widthOf(band.name))), 4, 14) + 1
  const chips = (names: string[], color: string): any => (
    <ui.Box flexDirection="row" flexWrap="wrap" columnGap={1} rowGap={1}>
      {names.map(name => (
        <ui.Text inverse color={color} wrap="truncate-end">
          {` ${name} `}
        </ui.Text>
      ))}
    </ui.Box>
  )

  const zoneBox = (zone: Zone, color: string): any => (
    <ui.Box borderStyle="single" borderColor={color} borderDimColor flexDirection="column" paddingX={1}>
      <ui.Text dimColor bold wrap="truncate-end">
        {zone.name}
      </ui.Text>
      {zone.items.length > 0 && chips(zone.items, color)}
      {zone.zones.length > 0 && (
        <ui.Box flexDirection="row" flexWrap="wrap" columnGap={1}>
          {zone.zones.map(inner => zoneBox(inner, color))}
        </ui.Box>
      )}
    </ui.Box>
  )

  return [
    <ui.Box flexDirection="row" columnGap={1}>
      <ui.Box flexDirection="column" width={mainW}>
        {layers.bands.map((band, index) => {
          const color = tint(index)

          return (
            <ui.Box borderStyle="round" borderColor={color} flexDirection="row" paddingX={1} width={mainW}>
              <ui.Box width={labelW} flexShrink={0}>
                <ui.Text bold color={color} wrap="truncate-end">
                  {band.name}
                </ui.Text>
              </ui.Box>
              <ui.Box flexDirection="column" flexShrink={1} rowGap={band.items.length > 0 && band.zones.length > 0 ? 1 : 0}>
                {band.items.length > 0 && chips(band.items, color)}
                {band.zones.length > 0 && (
                  <ui.Box flexDirection="row" flexWrap="wrap" columnGap={1}>
                    {band.zones.map(zone => zoneBox(zone, color))}
                  </ui.Box>
                )}
              </ui.Box>
            </ui.Box>
          )
        })}
      </ui.Box>
      {layers.sides.map(side => (
        <ui.Box borderStyle="round" borderColor="inactive" flexDirection="column" paddingX={1} width={sideW}>
          <ui.Text bold wrap="truncate-end">
            {side.name}
          </ui.Text>
          {side.items.map(item => (
            <ui.Text dimColor wrap="truncate-end">
              {item}
            </ui.Text>
          ))}
        </ui.Box>
      ))}
    </ui.Box>,
    ...notesOf(ui, layers.notes),
  ]
}

// ---------------------------------------------------------------- schema
// Tables or classes: each a box with its fields under its name, laid out and
// wired like any diagram.

const readSchema = (input: unknown): Graph | string => {
  const raw = record(input)
  const nodes: GraphNode[] = []
  const index = new Map<string, number>()
  for (const one of items(raw.entities).slice(0, 14)) {
    const entity = record(one)
    const name = words(entity.name, 30)
    if (name === undefined || index.has(name)) continue
    index.set(name, nodes.length)
    const rows: BodyRow[] = []
    for (const each of items(entity.fields ?? entity.members).slice(0, 14)) {
      const field = typeof each === 'string' ? { name: each } : record(each)
      const text = words(field.name, 30)
      if (text === undefined) continue
      rows.push({ mark: field.key === 'pk' ? '◆' : field.key === 'fk' ? '◇' : ' ', text, aside: words(field.type, 16) })
    }
    nodes.push({ id: name, label: name, note: words(entity.note, 30), group: words(entity.group, 24), shape: 'box', rows, loops: [] })
  }
  if (nodes.length === 0) return 'entities is empty: each needs a name and fields [{ name, type, key }]'

  const edges: GraphEdge[] = []
  const seen = new Set<string>()
  let dropped = 0
  for (const one of items(raw.relations).slice(0, 40)) {
    const relation = record(one)
    const from = index.get(words(relation.from, 30) ?? '')
    const to = index.get(words(relation.to, 30) ?? '')
    const label = [words(relation.kind, 18), words(relation.label, 16)].filter(Boolean).join(' ') || undefined
    if (from !== undefined && from === to) {
      nodes[from]?.loops.push(label ?? '')
      continue
    }
    if (from === undefined || to === undefined || seen.has(`${from}>${to}`)) {
      dropped++
      continue
    }
    seen.add(`${from}>${to}`)
    edges.push({ from, to, label, isReversed: false })
  }

  return { title: words(raw.title, 80) ?? 'Schema', layout: 'flow', isNumbered: false, nodes, edges, notes: wordList(raw.notes, 4, 120), dropped }
}

// ---------------------------------------------------------------- swimlane
// A process read left to right, each step sitting in the lane of whoever does it.

type Stride = { label: string; lane: number; next: number[] }
type Swimlane = { title: string; lanes: string[]; steps: Stride[] }

const readSwimlane = (input: unknown): Swimlane | string => {
  const raw = record(input)
  const lanes = wordList(raw.lanes, 6, 16)
  const ids: string[] = []
  const drafts: { label: string; lane: number; next?: string[] }[] = []
  for (const one of items(raw.steps).slice(0, 10)) {
    const step = record(one)
    const label = words(step.label, 100)
    const laneName = words(step.lane, 16)
    if (label === undefined || laneName === undefined) continue
    let lane = lanes.indexOf(laneName)
    if (lane === -1) {
      if (lanes.length >= 6) continue
      lane = lanes.push(laneName) - 1
    }
    ids.push(words(step.id, 30) ?? label)
    drafts.push({ label, lane, next: Array.isArray(step.next) ? wordList(step.next, 4, 30) : undefined })
  }
  if (drafts.length < 2) return 'steps needs at least two, each a label and a lane (one of lanes), in the order they happen'

  return {
    title: words(raw.title, 80) ?? 'Process',
    lanes,
    // A step hands over to the one after it unless it names where it goes.
    steps: drafts.map((draft, at) => ({
      label: draft.label,
      lane: draft.lane,
      next: draft.next
        ? draft.next.map(id => ids.indexOf(id)).filter(to => to > at)
        : at < drafts.length - 1
          ? [at + 1]
          : [],
    })),
  }
}

// A label over at most two lines of `width` cells, broken at a space when one fits.
const twoLines = (text: string, width: number): [string, string] => {
  if (widthOf(text) <= width) return [text, '']
  let cut = 0
  let used = 0
  let space = -1
  const chars = [...text]
  while (cut < chars.length && used + cellsOf(chars[cut] ?? '') <= width) {
    if (chars[cut] === ' ') space = cut
    used += cellsOf(chars[cut] ?? '')
    cut++
  }
  const at = space > 0 ? space : cut

  return [chars.slice(0, at).join(''), clip(chars.slice(at).join('').trim(), width)]
}

const drawSwimlane = (ui: UI, swim: Swimlane, room: number): any => {
  const nameW = clamp(Math.max(...swim.lanes.map(widthOf)), 4, 12) + 2
  const cell = clamp(Math.floor((room - nameW) / swim.steps.length), 13, 24)
  const box = cell - 4
  const tall = 6
  const canvas = makeCanvas(nameW + swim.steps.length * cell, swim.lanes.length * tall + 1)
  const leftOf = (at: number): number => nameW + at * cell
  const rowOfLane = (lane: number): number => lane * tall + 2
  swim.lanes.forEach((lane, at) => {
    put(canvas, 0, at * tall, '┄'.repeat(canvas.w), { dim: true })
    put(canvas, 0, rowOfLane(at), clip(lane, nameW - 1), { color: tint(at), bold: true })
  })
  put(canvas, 0, swim.lanes.length * tall, '┄'.repeat(canvas.w), { dim: true })
  swim.steps.forEach((step, at) => {
    const x = leftOf(at)
    const y = rowOfLane(step.lane)
    const border: Style = { color: tint(step.lane) }
    put(canvas, x, y - 1, `╭${'─'.repeat(box - 2)}╮`, border)
    put(canvas, x, y, `│${' '.repeat(box - 2)}│`, border)
    put(canvas, x, y + 1, `│${' '.repeat(box - 2)}│`, border)
    put(canvas, x, y + 2, `╰${'─'.repeat(box - 2)}╯`, border)
    const fit = fittedTwo(step.label, box - 2)
    fit.lines.forEach((line, index) => {
      put(canvas, x + 1 + ((box - 2 - widthOf(line)) >> 1), y + index, line, { bold: true, scope: fit.scope })
    })
  })
  swim.steps.forEach((step, at) => {
    for (const to of step.next) {
      const target = swim.steps[to]
      if (!target) continue
      const layer = makeCanvas(canvas.w, canvas.h)
      const from = rowOfLane(step.lane)
      const into = rowOfLane(target.lane)
      const start = leftOf(at) + box
      const end = leftOf(to) - 2
      if (from === into) hline(layer, from, start, end)
      else {
        hline(layer, from, start, start + 1)
        vline(layer, start + 1, from, into)
        hline(layer, into, start + 1, end)
      }
      stamp(canvas, layer, { color: tint(step.lane) })
      put(canvas, end + 1, into, '▶', { color: tint(step.lane), bold: true })
    }
  })

  return drawRows(ui, rowsOf(canvas))
}

// ---------------------------------------------------------------- pipeline
// Stages left to right, each a column of jobs: CI/CD, ETL, any flow that
// reads as "then".

type Job = { label: string; status?: Status }
type Pipeline = { title: string; stages: { name: string; jobs: Job[] }[]; labels: Record<Status, string> }

const JOB_MARK: Record<Status, string> = { done: '✓', doing: '●', todo: '○', risk: '!' }

const readPipeline = (input: unknown): Pipeline | string => {
  const raw = record(input)
  const stages: Pipeline['stages'] = []
  for (const one of items(raw.stages).slice(0, 7)) {
    const stage = record(one)
    const name = words(stage.name, 20)
    if (name === undefined) continue
    const jobs: Job[] = []
    for (const each of items(stage.jobs ?? stage.steps).slice(0, 6)) {
      const job = typeof each === 'string' ? { label: each } : record(each)
      const label = words(job.label ?? job.name, 120)
      if (label !== undefined) jobs.push({ label, status: STATUSES.includes(job.status as Status) ? (job.status as Status) : undefined })
    }
    if (jobs.length > 0) stages.push({ name, jobs })
  }
  if (stages.length < 2) return 'stages needs at least two, each a name and jobs (labels, or { label, status })'
  const given = record(raw.labels)

  return {
    title: words(raw.title, 80) ?? 'Pipeline',
    stages,
    labels: {
      done: words(given.done, 16) ?? 'done',
      doing: words(given.doing, 16) ?? 'running',
      todo: words(given.todo, 16) ?? 'waiting',
      risk: words(given.risk, 16) ?? 'failed',
    },
  }
}

const drawPipeline = (ui: UI, pipeline: Pipeline, room: number): any => {
  const count = pipeline.stages.length
  const cell = clamp(Math.floor((room + 5) / count), 14, 28)
  const box = cell - 5
  const most = Math.max(...pipeline.stages.map(stage => stage.jobs.length))
  // Boxes take a second line only when some label needs it.
  const textOf = (job: Job): string => (job.status ? `${JOB_MARK[job.status]} ${job.label}` : job.label)
  const inner = pipeline.stages.some(stage => stage.jobs.some(job => widthOf(textOf(job)) > box - 2)) ? 2 : 1
  const canvas = makeCanvas(count * cell, 1 + most * (inner + 2))
  const rowOfJob = (at: number): number => 2 + at * (inner + 2)
  pipeline.stages.forEach((stage, index) => {
    const x = index * cell
    put(canvas, x, 0, clip(stage.name, box), { color: tint(index), bold: true })
    stage.jobs.forEach((job, at) => {
      const y = rowOfJob(at)
      const color = job.status ? STATUS_LOOK[job.status].color : tint(index)
      put(canvas, x, y - 1, `╭${'─'.repeat(box - 2)}╮`, { color })
      for (let row = 0; row < inner; row++) put(canvas, x, y + row, `│${' '.repeat(box - 2)}│`, { color })
      put(canvas, x, y + inner, `╰${'─'.repeat(box - 2)}╯`, { color })
      const fit = inner === 2 ? fittedTwo(textOf(job), box - 2) : { lines: [textOf(job)], scope: undefined }
      fit.lines.forEach((line, index) => {
        put(canvas, x + 1, y + index, line, { color: job.status === 'todo' ? 'inactive' : undefined, bold: job.status !== 'todo', scope: fit.scope })
      })
    })
    const next = pipeline.stages[index + 1]
    if (!next) return
    // Every job of a stage feeds one bus, and the bus feeds every job of the next.
    const layer = makeCanvas(canvas.w, canvas.h)
    const bus = x + box + 2
    stage.jobs.forEach((_, at) => hline(layer, rowOfJob(at), x + box, bus))
    next.jobs.forEach((_, at) => hline(layer, rowOfJob(at), bus, x + cell - 2))
    vline(layer, bus, rowOfJob(0), rowOfJob(Math.max(stage.jobs.length, next.jobs.length) - 1))
    stamp(canvas, layer, WIRE)
    next.jobs.forEach((_, at) => put(canvas, x + cell - 1, rowOfJob(at), '▶', WIRE))
  })
  const used = STATUSES.filter(status => pipeline.stages.some(stage => stage.jobs.some(job => job.status === status)))

  return [
    ...drawRows(ui, rowsOf(canvas)),
    legendOf(ui, used.map(status => `${JOB_MARK[status]} ${pipeline.labels[status]}`), used.map(status => STATUS_LOOK[status].color), 1),
  ]
}

// ---------------------------------------------------------------- gitgraph
// Branches as lanes, time left to right: commits, where a branch forks, where
// it merges back, and the tags along the way.

type GitEvent = { branch: number; label?: string; merge?: number; tag?: string }
type GitGraph = { title: string; branches: { name: string; from: number }[]; events: GitEvent[] }

const readGitGraph = (input: unknown): GitGraph | string => {
  const raw = record(input)
  const branches: GitGraph['branches'] = []
  const laneOf = (value: unknown, from?: unknown): number | undefined => {
    const name = words(value, 20)
    if (name === undefined) return undefined
    const at = branches.findIndex(branch => branch.name === name)
    if (at !== -1) return at
    if (branches.length >= 6) return undefined
    const parent = branches.findIndex(branch => branch.name === words(from, 20))
    branches.push({ name, from: Math.max(0, parent) })

    return branches.length - 1
  }
  for (const one of items(raw.branches)) {
    const branch = typeof one === 'string' ? { name: one } : record(one)
    laneOf(branch.name, branch.from)
  }
  const events: GitEvent[] = []
  for (const one of items(raw.events).slice(0, 24)) {
    const event = record(one)
    const branch = laneOf(event.branch, event.from)
    if (branch === undefined) continue
    events.push({ branch, label: words(event.label, 24), merge: event.merge === undefined ? undefined : laneOf(event.merge), tag: words(event.tag, 12) })
  }
  if (events.length < 2) return 'events needs at least two, in time order: { branch, label, merge (a branch merged in), tag }'

  return { title: words(raw.title, 80) ?? 'Branches', branches, events }
}

const drawGitGraph = (ui: UI, git: GitGraph, room: number): any => {
  const nameW = clamp(Math.max(...git.branches.map(branch => widthOf(branch.name))), 4, 14) + 2
  const cell = clamp(Math.floor((room - nameW) / git.events.length), 4, 12)
  const canvas = makeCanvas(nameW + git.events.length * cell + 14, git.branches.length * 3)
  const colOf = (at: number): number => nameW + at * cell + (cell >> 1)
  const rowOfLane = (lane: number): number => lane * 3 + 1
  git.branches.forEach((branch, lane) => {
    const mine = git.events.map((event, at) => ({ event, at })).filter(one => one.event.branch === lane || one.event.merge === lane)
    const first = lane === 0 ? 0 : (mine[0]?.at ?? 0)
    const last = mine[mine.length - 1]?.at ?? first
    const y = rowOfLane(lane)
    const layer = makeCanvas(canvas.w, canvas.h)
    const fork = colOf(first) - (cell >> 1)
    hline(layer, y, lane === 0 ? colOf(0) : fork, colOf(last))
    if (lane > 0) {
      vline(layer, fork, rowOfLane(branch.from), y)
      wire(layer, fork, rowOfLane(branch.from), LEFT | RIGHT)
    }
    for (const one of mine) {
      if (one.event.merge === lane) vline(layer, colOf(one.at), y, rowOfLane(one.event.branch))
    }
    stamp(canvas, layer, { color: tint(lane) })
    put(canvas, 0, y, clip(branch.name, nameW - 1), { color: tint(lane), bold: true })
  })
  git.events.forEach((event, at) => {
    const x = colOf(at)
    const y = rowOfLane(event.branch)
    put(canvas, x, y, '●', { color: tint(event.branch), bold: true })
    if (event.label !== undefined) {
      const text = clip(event.label, Math.max(4, cell * 2 - 2))
      const left = [x - 1, x + 2 - widthOf(text)].find(spot => isFree(canvas, spot, y - 1, widthOf(text)))
      if (left !== undefined) put(canvas, left, y - 1, text, { dim: true })
    }
    if (event.tag !== undefined && isFree(canvas, x - 1, y + 1, widthOf(event.tag) + 2)) {
      put(canvas, x - 1, y + 1, `◆ ${event.tag}`, { color: 'warning' })
    }
  })

  return drawRows(ui, rowsOf(canvas))
}

// ---------------------------------------------------------------- sequence

type Message = { from: number; to: number; label: string; isReply: boolean }
type Sequence = { title: string; actors: string[]; messages: Message[] }

const readSequence = (input: unknown): Sequence | string => {
  const raw = record(input)
  const actors: string[] = []
  const actorOf = (value: unknown): number | undefined => {
    const name = words(typeof value === 'object' ? record(value).name : value, 24)
    if (name === undefined) return undefined
    const at = actors.indexOf(name)
    if (at !== -1) return at
    if (actors.length >= 7) return undefined
    actors.push(name)

    return actors.length - 1
  }
  items(raw.actors).forEach(actorOf)
  const messages: Message[] = []
  for (const one of items(raw.messages).slice(0, 24)) {
    const message = record(one)
    const from = actorOf(message.from)
    const to = actorOf(message.to)
    if (from === undefined || to === undefined) continue
    messages.push({ from, to, label: words(message.label, 60) ?? '', isReply: message.isReply === true })
  }
  if (actors.length < 2 || messages.length === 0) {
    return 'a sequence needs at least two actors and one message between actors'
  }

  return { title: words(raw.title, 80) ?? 'Sequence', actors, messages }
}

const drawSequence = (ui: UI, sequence: Sequence, room: number): any => {
  const count = sequence.actors.length
  const column = clamp(Math.floor(room / count), 12, 30)
  const xs = sequence.actors.map((_, index) => index * column + (column >> 1))
  const canvas = makeCanvas(count * column, 3 + sequence.messages.length * 2 + 1)
  sequence.actors.forEach((name, index) => {
    const x = xs[index] ?? 0
    const label = clip(name, column - 4)
    const box = widthOf(label) + 2
    const left = x - ((box + 2) >> 1)
    const border: Style = { color: tint(index) }
    put(canvas, left, 0, `╭${'─'.repeat(box)}╮`, border)
    put(canvas, left, 1, '│', border)
    put(canvas, left + 1 + ((box - widthOf(label)) >> 1), 1, label, { bold: true })
    put(canvas, left + box + 1, 1, '│', border)
    put(canvas, left, 2, `╰${'─'.repeat(box)}╯`, border)
    put(canvas, x, 2, '┬', border)
    vline(canvas, x, 3, canvas.h - 1)
  })
  sequence.messages.forEach((message, index) => {
    const y = 3 + index * 2
    const a = xs[message.from] ?? 0
    const b = xs[message.to] ?? 0
    const style: Style = { color: tint(message.from) }
    if (a === b) {
      put(canvas, a + 2, y + 1, clip(`↺ ${message.label}`, column - 3), style)

      return
    }
    const step = b > a ? 1 : -1
    for (let x = a + step; x !== b; x += step) put(canvas, x, y + 1, message.isReply ? '╌' : '─', style)
    put(canvas, b - step, y + 1, step > 0 ? '▶' : '◀', style)
    put(canvas, a, y + 1, step > 0 ? '├' : '┤', WIRE)
    const label = clip(message.label, Math.abs(b - a) - 2)
    const left = Math.min(a, b) + 1 + ((Math.abs(b - a) - 1 - widthOf(label)) >> 1)
    put(canvas, left, y, label, message.isReply ? { dim: true } : {})
  })

  return drawRows(ui, rowsOf(canvas))
}

// ---------------------------------------------------------------- tree

type Branch = { label: string; note?: string; children: Branch[] }
type Tree = { title: string; layout: 'list' | 'mindmap'; root: Branch; count: number }

const readTree = (input: unknown): Tree | string => {
  const raw = record(input)
  let left = 90
  const read = (value: unknown, depth: number): Branch | undefined => {
    const node = typeof value === 'string' ? { label: value } : record(value)
    const label = words(node.label ?? node.name, 60)
    if (label === undefined || left <= 0) return undefined
    left--

    return {
      label,
      note: words(node.note, 60),
      children:
        depth >= 7
          ? []
          : items(node.children)
              .map(child => read(child, depth + 1))
              .filter((child): child is Branch => child !== undefined),
    }
  }
  const root = read(raw.root ?? raw, 0)
  if (!root) return 'root needs a label, and children: a list of the same shape'

  return {
    title: words(raw.title, 80) ?? root.label,
    layout: pick(raw.layout, ['list', 'mindmap'] as const, 'list'),
    root,
    count: 90 - left,
  }
}

type Twig = { node: Branch; depth: number; row: number; branch: number; kids: Twig[] }

// Root at the left, branches spreading right, each main branch in its color.
const drawMind = (ui: UI, tree: Tree, room: number): any => {
  let next = 0
  const lay = (node: Branch, depth: number, branch: number): Twig => {
    const kids = node.children.map((child, index) => lay(child, depth + 1, depth === 0 ? index : branch))
    const first = kids[0]
    const last = kids[kids.length - 1]

    return { node, depth, branch, kids, row: first && last ? (first.row + last.row) >> 1 : next++ }
  }
  const root = lay(tree.root, 0, 0)
  const all: Twig[] = []
  const gather = (twig: Twig): void => {
    all.push(twig)
    twig.kids.forEach(gather)
  }
  gather(root)
  const depths = Math.max(...all.map(twig => twig.depth)) + 1
  for (const cap of [30, 22, 16, 11]) {
    const textOf = (twig: Twig): string =>
      clip(twig.node.note === undefined ? twig.node.label : `${twig.node.label} (${twig.node.note})`, cap)
    const wide = Array.from({ length: depths }, (_, depth) =>
      Math.max(0, ...all.filter(twig => twig.depth === depth).map(twig => widthOf(textOf(twig)))),
    )
    const lefts: number[] = []
    let x = 0
    wide.forEach((size, depth) => {
      lefts[depth] = x
      x += size + 5
    })
    if (x - 5 > room) continue
    const canvas = makeCanvas(x, next)
    for (const twig of all) {
      const left = lefts[twig.depth] ?? 0
      const text = textOf(twig)
      const color = twig.depth === 0 ? 'claude' : tint(twig.branch)
      put(canvas, left, twig.row, text, { color: twig.depth < 2 ? color : undefined, bold: twig.depth < 2 })
      const first = twig.kids[0]
      const last = twig.kids[twig.kids.length - 1]
      if (!first || !last) continue
      const trunk = left + (wide[twig.depth] ?? 0) + 2
      const stem: Style = { color: twig.depth === 0 ? 'inactive' : color }
      hline(canvas, twig.row, left + widthOf(text) + 1, trunk, stem)
      vline(canvas, trunk, first.row, last.row, stem)
      for (const kid of twig.kids) {
        hline(canvas, kid.row, trunk, (lefts[kid.depth] ?? 0) - 2, { color: tint(kid.branch) })
      }
    }

    return drawRows(ui, rowsOf(canvas))
  }

  return undefined
}

const drawTree = (ui: UI, tree: Tree, room: number): any => {
  const mind = tree.layout === 'mindmap' ? drawMind(ui, tree, room) : undefined
  if (mind !== undefined) return mind
  const lines: any[] = []
  const walk = (node: Branch, prefix: string, branch: string, depth: number): void => {
    const lead = prefix + branch
    const indent = lead.length - lead.trimStart().length
    const stem = lead.trimStart()
    lines.push(
      <ui.Box flexDirection="row" paddingLeft={indent} width={room}>
        {stem !== '' && <ui.Text color="inactive">{stem}</ui.Text>}
        <ui.Text bold={depth < 2} {...(depth === 0 && { color: 'claude' })} wrap="truncate-end">
          {node.label}
        </ui.Text>
        {node.note !== undefined && (
          <ui.Box marginLeft={2} flexShrink={1}>
            <ui.Text dimColor wrap="truncate-end">
              {node.note}
            </ui.Text>
          </ui.Box>
        )}
      </ui.Box>,
    )
    node.children.forEach((child, index) => {
      const isLast = index === node.children.length - 1
      walk(child, prefix + (depth === 0 ? '' : branch.startsWith('└') ? '   ' : '│  '), isLast ? '└─ ' : '├─ ', depth + 1)
    })
  }
  walk(tree.root, '', '', 0)

  return lines
}

// ---------------------------------------------------------------- timeline

type Status = 'done' | 'doing' | 'todo' | 'risk'
type Task = { name: string; from: number; to: number; status: Status; group?: string }
type Timeline = {
  title: string
  periods: string[]
  tasks: Task[]
  milestones: { name: string; at: number }[]
  labels: Record<Status, string>
}

const STATUSES: readonly Status[] = ['done', 'doing', 'todo', 'risk']
const STATUS_LOOK: Record<Status, { char: string; color: string }> = {
  done: { char: '█', color: 'success' },
  doing: { char: '▓', color: 'claude' },
  todo: { char: '░', color: 'inactive' },
  risk: { char: '▓', color: 'error' },
}

const readTimeline = (input: unknown): Timeline | string => {
  const raw = record(input)
  const periods = wordList(raw.periods, 18, 16)
  if (periods.length < 2) return 'periods needs at least two labels, in order: Q1, Q2 or Jan, Feb'
  const at = (value: unknown): number | undefined => {
    const name = words(value, 16)
    const index = name === undefined ? -1 : periods.indexOf(name)
    if (index !== -1) return index
    const position = num(value)

    return position === undefined ? undefined : clamp(Math.round(position) - 1, 0, periods.length - 1)
  }
  const tasks: Task[] = []
  for (const one of items(raw.items).slice(0, 24)) {
    const task = record(one)
    const name = words(task.name, 100)
    const from = at(task.from)
    if (name === undefined || from === undefined) continue
    const to = at(task.to) ?? from
    tasks.push({
      name,
      from: Math.min(from, to),
      to: Math.max(from, to),
      status: pick(task.status, STATUSES, 'todo'),
      group: words(task.group, 24),
    })
  }
  if (tasks.length === 0) return 'items is empty: each needs a name and a from that is one of periods'
  const milestones: { name: string; at: number }[] = []
  for (const one of items(raw.milestones).slice(0, 8)) {
    const stone = record(one)
    const name = words(stone.name, 24)
    const where = at(stone.at)
    if (name !== undefined && where !== undefined) milestones.push({ name, at: where })
  }
  const given = record(raw.labels)

  return {
    title: words(raw.title, 80) ?? 'Timeline',
    periods,
    tasks,
    milestones,
    labels: {
      done: words(given.done, 16) ?? 'done',
      doing: words(given.doing, 16) ?? 'doing',
      todo: words(given.todo, 16) ?? 'to do',
      risk: words(given.risk, 16) ?? 'at risk',
    },
  }
}

const drawTimeline = (ui: UI, timeline: Timeline, room: number, played: number): any => {
  const labelW = clamp(Math.max(...timeline.tasks.map(task => widthOf(task.name))), 6, 24)
  const column = clamp(Math.floor((room - labelW - 2) / timeline.periods.length), 3, 14)
  const head = makeCanvas(timeline.periods.length * column, 1)
  timeline.periods.forEach((period, index) => put(head, index * column, 0, clip(period, column - 1), { dim: true }))
  const out: any[] = [<ui.Box paddingLeft={labelW + 1}>{rowOf(ui, rowsOf(head)[0] ?? { indent: 0, segs: [] })}</ui.Box>]
  let group: string | undefined
  for (const task of timeline.tasks) {
    if (task.group !== undefined && task.group !== group) {
      out.push(
        <ui.Text bold color="suggestion">
          {task.group}
        </ui.Text>,
      )
    }
    group = task.group
    const look = STATUS_LOOK[task.status]
    const length = Math.max(1, Math.round(((task.to - task.from + 1) * column - 1) * played))
    out.push(
      <ui.Box flexDirection="row">
        <ui.Box width={labelW + 1} flexShrink={0}>
          {(() => {
            const fit = fitted(task.name, labelW)
            return (
              <ui.Text {...(fit.scope !== undefined && { hover: { scope: fit.scope, ...LIT } })} wrap="truncate-end">
                {fit.text}
              </ui.Text>
            )
          })()}
        </ui.Box>
        <ui.Box paddingLeft={task.from * column}>
          <ui.Text color={look.color}>{look.char.repeat(length)}</ui.Text>
        </ui.Box>
      </ui.Box>,
    )
  }
  if (timeline.milestones.length > 0) {
    const marks = makeCanvas(timeline.periods.length * column + 26, 2)
    const left: string[] = []
    for (const stone of timeline.milestones) {
      const x = stone.at * column + (column >> 1)
      const text = `◆ ${clip(stone.name, 22)}`
      const y = [0, 1].find(row => isFree(marks, x, row, widthOf(text)))
      if (y === undefined) left.push(`◆ ${timeline.periods[stone.at] ?? ''}: ${stone.name}`)
      else put(marks, x, y, text, { color: 'warning' })
    }
    for (const row of rowsOf(marks)) {
      if (row.segs.length > 0) out.push(<ui.Box paddingLeft={labelW + 1}>{rowOf(ui, row)}</ui.Box>)
    }
    for (const line of left) out.push(<ui.Text color="warning">{line}</ui.Text>)
  }
  const used = STATUSES.filter(status => timeline.tasks.some(task => task.status === status))
  out.push(legendOf(ui, used.map(status => timeline.labels[status]), used.map(status => STATUS_LOOK[status].color), 1))

  return out
}

// ---------------------------------------------------------------- board

type Board = { title: string; columns: { name: string; cards: { title: string; meta?: string }[] }[] }

const readBoard = (input: unknown): Board | string => {
  const raw = record(input)
  const columns: Board['columns'] = []
  for (const one of items(raw.columns).slice(0, 6)) {
    const column = record(one)
    const name = words(column.name, 24)
    if (name === undefined) continue
    const cards: { title: string; meta?: string }[] = []
    for (const each of items(column.cards).slice(0, 8)) {
      const card = typeof each === 'string' ? { title: each } : record(each)
      const title = words(card.title ?? card.name, 70)
      if (title !== undefined) cards.push({ title, meta: words(card.meta, 40) })
    }
    columns.push({ name, cards })
  }
  if (columns.length === 0) return 'columns is empty: each needs a name and a list of cards'

  return { title: words(raw.title, 80) ?? 'Board', columns }
}

const drawBoard = (ui: UI, board: Board, room: number): any => {
  const width = clamp(Math.floor(room / board.columns.length) - 1, 16, 36)

  return (
    <ui.Box flexDirection="row" flexWrap="wrap" columnGap={1}>
      {board.columns.map((column, index) => (
        <ui.Box flexDirection="column" width={width}>
          <ui.Text bold color={tint(index)} wrap="truncate-end">
            {`${column.name} · ${column.cards.length}`}
          </ui.Text>
          {column.cards.map(card => (
            <ui.Box borderStyle="round" borderColor={tint(index)} borderDimColor flexDirection="column" paddingX={1} width={width}>
              <ui.Text wrap="wrap">{card.title}</ui.Text>
              {card.meta !== undefined && (
                <ui.Text dimColor wrap="truncate-end">
                  {card.meta}
                </ui.Text>
              )}
            </ui.Box>
          ))}
        </ui.Box>
      ))}
    </ui.Box>
  )
}

// ---------------------------------------------------------------- quadrant

type Quadrant = {
  title: string
  x: [string, string]
  y: [string, string]
  areas: { name?: string; points: string[] }[]
  points: { name: string; x: number; y: number }[]
}

const MARKS = '123456789ABCDEFGHJKLMNPQRSTUVWXYZ'
const AREA_COLORS = ['success', 'suggestion', 'warning', 'error']

const readQuadrant = (input: unknown): Quadrant | string => {
  const raw = record(input)
  const areas = items(raw.areas)
    .slice(0, 4)
    .map(one => {
      const area = typeof one === 'string' ? { name: one } : record(one)

      return { name: words(area.name, 28), points: wordList(area.points, 6, 60) }
    })
  while (areas.length < 4) areas.push({ name: undefined, points: [] })
  const points: Quadrant['points'] = []
  for (const one of items(raw.items).slice(0, MARKS.length)) {
    const point = record(one)
    const name = words(point.name, 40)
    const x = num(point.x)
    const y = num(point.y)
    if (name !== undefined && x !== undefined && y !== undefined) {
      points.push({ name, x: clamp(x, 0, 1), y: clamp(y, 0, 1) })
    }
  }
  if (points.length === 0 && areas.every(area => area.points.length === 0)) {
    return 'give items (each a name with x and y from 0 to 1), or areas with points for four lists'
  }

  return {
    title: words(raw.title, 80) ?? 'Quadrant',
    x: [words(raw.xLow, 24) ?? '', words(raw.xHigh, 24) ?? ''],
    y: [words(raw.yLow, 24) ?? '', words(raw.yHigh, 24) ?? ''],
    areas,
    points,
  }
}

const drawQuadrant = (ui: UI, quadrant: Quadrant, room: number): any => {
  if (quadrant.points.length === 0) {
    const width = clamp(Math.floor(room / 2) - 1, 20, 50)
    const cell = (index: number): any => {
      const area = quadrant.areas[index]
      const color = AREA_COLORS[index] ?? 'text'

      return (
        <ui.Box borderStyle="round" borderColor={color} flexDirection="column" paddingX={1} width={width}>
          <ui.Text bold color={color} wrap="truncate-end">
            {area?.name ?? ' '}
          </ui.Text>
          {(area?.points ?? []).map(point => (
            <ui.Box flexDirection="row" columnGap={1}>
              <ui.Text color={color}>•</ui.Text>
              <ui.Text wrap="wrap">{point}</ui.Text>
            </ui.Box>
          ))}
        </ui.Box>
      )
    }

    return [
      <ui.Box flexDirection="row" columnGap={1}>
        {cell(0)}
        {cell(1)}
      </ui.Box>,
      <ui.Box flexDirection="row" columnGap={1}>
        {cell(2)}
        {cell(3)}
      </ui.Box>,
    ]
  }

  const width = clamp(room - 2, 41, 67) | 1
  const height = 15
  const canvas = makeCanvas(width, height)
  const cx = width >> 1
  const cy = height >> 1
  const corners: [number, number, boolean][] = [
    [1, 0, false],
    [width - 2, 0, true],
    [1, height - 1, false],
    [width - 2, height - 1, true],
  ]
  quadrant.areas.forEach((area, index) => {
    const corner = corners[index]
    if (area.name === undefined || !corner) return
    const text = clip(area.name, cx - 3)
    put(canvas, corner[2] ? corner[0] - widthOf(text) + 1 : corner[0], corner[1], text, { color: AREA_COLORS[index], dim: true })
  })
  hline(canvas, cy, 0, width - 1)
  vline(canvas, cx, 0, height - 1)
  quadrant.points.forEach((point, index) => {
    let x = Math.round(point.x * (width - 1))
    const y = Math.round((1 - point.y) * (height - 1))
    while (x < width - 1 && MARKS.includes(cellAt(canvas, x, y)?.ch || ' ') && cellAt(canvas, x, y)?.bold) x++
    put(canvas, x, y, MARKS[index] ?? '•', { color: tint(index), bold: true })
  })

  return [
    quadrant.y[1] !== '' && <ui.Text dimColor>{`▲ ${quadrant.y[1]}`}</ui.Text>,
    ...drawRows(ui, rowsOf(canvas)),
    quadrant.y[0] !== '' && <ui.Text dimColor>{`▼ ${quadrant.y[0]}`}</ui.Text>,
    <ui.Box flexDirection="row" justifyContent="space-between" width={width}>
      <ui.Text dimColor>{`◀ ${quadrant.x[0]}`}</ui.Text>
      <ui.Text dimColor>{`${quadrant.x[1]} ▶`}</ui.Text>
    </ui.Box>,
    <ui.Box flexDirection="row" flexWrap="wrap" columnGap={3}>
      {quadrant.points.map((point, index) => (
        <ui.Box flexDirection="row" columnGap={1}>
          <ui.Text bold color={tint(index)}>
            {MARKS[index] ?? '•'}
          </ui.Text>
          <ui.Text>{point.name}</ui.Text>
        </ui.Box>
      ))}
    </ui.Box>,
  ]
}

// ---------------------------------------------------------------- journey

type Journey = {
  title: string
  who?: string
  moodLabel: string
  stages: { name: string; mood: number }[]
  rows: { name: string; tone: string; cells: string[] }[]
}

const readJourney = (input: unknown): Journey | string => {
  const raw = record(input)
  const stages: Journey['stages'] = []
  for (const one of items(raw.stages).slice(0, 7)) {
    const stage = typeof one === 'string' ? { name: one } : record(one)
    const name = words(stage.name, 24)
    if (name !== undefined) stages.push({ name, mood: clamp(Math.round(num(stage.mood) ?? 3), 1, 5) })
  }
  if (stages.length < 2) return 'stages needs at least two, each a name and a mood from 1 (worst) to 5 (best)'
  const rows: Journey['rows'] = []
  for (const one of items(raw.rows).slice(0, 5)) {
    const row = record(one)
    const name = words(row.name, 14)
    if (name === undefined) continue
    rows.push({
      name,
      tone: pick(row.tone, ['good', 'bad', 'warn', 'plain'] as const, 'plain'),
      cells: stages.map((_, index) => words(items(row.cells)[index], 80) ?? ''),
    })
  }

  return {
    title: words(raw.title, 80) ?? 'Journey',
    who: words(raw.who, 80),
    moodLabel: words(raw.moodLabel, 12) ?? 'mood',
    stages,
    rows,
  }
}

const moodColor = (mood: number): string => (mood <= 2 ? 'error' : mood === 3 ? 'warning' : 'success')

const drawJourney = (ui: UI, journey: Journey, room: number, played: number): any => {
  const count = journey.stages.length
  const labelW = clamp(Math.max(widthOf(journey.moodLabel), ...journey.rows.map(row => widthOf(row.name))), 4, 12) + 1
  const column = clamp(Math.floor((room - labelW) / count), 10, 28)
  const centers = journey.stages.map((_, index) => index * column + (column >> 1))
  const first = centers[0] ?? 0
  const last = centers[count - 1] ?? 0
  const curve = makeCanvas(count * column, 5)
  const rows = Array.from({ length: count * column }, (_, x) => {
    if (x < first || x > last) return undefined
    const at = (x - first) / column
    const before = journey.stages[Math.floor(at)]?.mood ?? 3
    const after = journey.stages[Math.min(count - 1, Math.floor(at) + 1)]?.mood ?? before

    return Math.round(5 - (before + (after - before) * (at - Math.floor(at))))
  })
  const layer = makeCanvas(count * column, 5)
  trace(layer, rows, Math.round(first + (last - first) * played))
  stamp(curve, layer, { color: 'inactive' })
  journey.stages.forEach((stage, index) => {
    put(curve, centers[index] ?? 0, 5 - stage.mood, '●', { color: moodColor(stage.mood), bold: true })
  })
  const lane = (label: any, cells: any[]): any => (
    <ui.Box flexDirection="row">
      <ui.Box width={labelW} flexShrink={0}>
        {label}
      </ui.Box>
      {cells}
    </ui.Box>
  )

  return [
    journey.who !== undefined && <ui.Text dimColor>{journey.who}</ui.Text>,
    lane(
      <ui.Text>{' '}</ui.Text>,
      journey.stages.map((stage, index) => (
        <ui.Box width={column} flexShrink={0}>
          <ui.Text bold color={tint(index)} wrap="truncate-end">
            {clip(`${index + 1} ${stage.name}`, column - 1)}
          </ui.Text>
        </ui.Box>
      )),
    ),
    ...rowsOf(curve).map((row, index) =>
      lane(index === 2 ? <ui.Text dimColor>{journey.moodLabel}</ui.Text> : <ui.Text>{' '}</ui.Text>, [rowOf(ui, row)]),
    ),
    ...journey.rows.map(row =>
      lane(
        <ui.Text dimColor bold wrap="truncate-end">
          {row.name}
        </ui.Text>,
        row.cells.map(cell => (
          <ui.Box width={column} flexShrink={0} paddingRight={1}>
            <ui.Text {...(row.tone !== 'plain' && { color: TONES[row.tone] })} wrap="wrap">
              {cell === '' ? ' ' : cell}
            </ui.Text>
          </ui.Box>
        )),
      ),
    ),
  ]
}

// ---------------------------------------------------------------- wireframe

type Frame = {
  type: 'row' | 'column' | 'box'
  kind: string
  label?: string
  size: number
  lines: number
  children: Frame[]
}
type Wireframe = { title: string; isNarrow: boolean; screen: Frame; count: number }

const readWireframe = (input: unknown): Wireframe | string => {
  const raw = record(input)
  let left = 48
  const read = (value: unknown, depth: number): Frame | undefined => {
    if (left <= 0 || depth > 6) return undefined
    const node = typeof value === 'string' ? { label: value } : record(value)
    left--
    const children = items(node.children)
      .map(child => read(child, depth + 1))
      .filter((child): child is Frame => child !== undefined)
    const label = words(node.label, 60)

    return {
      type: node.type === 'row' || node.type === 'column' ? node.type : children.length > 0 ? 'column' : 'box',
      kind: words(node.kind, 16) ?? (label === undefined ? 'text' : 'label'),
      label,
      size: clamp(num(node.size) ?? 1, 0.2, 12),
      lines: clamp(Math.round(num(node.lines) ?? 0), 0, 8),
      children,
    }
  }
  const screen = read(raw.screen, 0)
  if (!screen || (screen.children.length === 0 && screen.label === undefined)) {
    return 'screen needs children: nested { type: "row" | "column", children } and boxes { kind, label }'
  }

  return {
    title: words(raw.title, 80) ?? 'Wireframe',
    isNarrow: raw.device === 'mobile',
    screen,
    count: 48 - left,
  }
}

const drawFrame = (ui: UI, frame: Frame, width: number): any => {
  const caption = frame.label !== undefined && frame.children.length > 0 && (
    <ui.Text dimColor wrap="truncate-end">
      {frame.label}
    </ui.Text>
  )
  if (frame.children.length > 0 && frame.type === 'row') {
    const count = frame.children.length
    const free = Math.max(count * 6, width - (count - 1))
    const total = frame.children.reduce((sum, child) => sum + child.size, 0)
    let used = 0

    return (
      <ui.Box flexDirection="column" width={width}>
        {caption}
        <ui.Box flexDirection="row" columnGap={1}>
          {frame.children.map((child, index) => {
            const share = index === count - 1 ? free - used : Math.floor((free * child.size) / total)
            const size = Math.max(6, share)
            used += size

            return drawFrame(ui, child, size)
          })}
        </ui.Box>
      </ui.Box>
    )
  }
  if (frame.children.length > 0) {
    return (
      <ui.Box flexDirection="column" width={width}>
        {caption}
        {frame.children.map(child => drawFrame(ui, child, width))}
      </ui.Box>
    )
  }

  const inner = Math.max(2, width - 4)
  const label = frame.label
  if (frame.kind === 'button') {
    return (
      <ui.Box width={width} justifyContent="center">
        <ui.Text inverse bold wrap="truncate-end">
          {`[ ${clip(label ?? 'OK', Math.max(2, width - 4))} ]`}
        </ui.Text>
      </ui.Box>
    )
  }
  const bars = (count: number, lead: string): any[] =>
    Array.from({ length: count }, (_, index) => (
      <ui.Text dimColor wrap="truncate-end">
        {lead + '━'.repeat(Math.max(2, Math.round((inner - widthOf(lead)) * (index % 2 === 0 ? 1 : 0.6))))}
      </ui.Text>
    ))
  const blank = (count: number): any[] => Array.from({ length: count }, () => <ui.Text>{' '}</ui.Text>)
  let body: any
  if (frame.kind === 'image' || frame.kind === 'video' || frame.kind === 'map' || frame.kind === 'chart') {
    const tall = Math.max(1, frame.lines === 0 ? 3 : frame.lines)
    const above = (tall - 1) >> 1
    body = [
      ...blank(above),
      <ui.Box justifyContent="center">
        <ui.Text dimColor wrap="truncate-end">{`▨ ${label ?? frame.kind}`}</ui.Text>
      </ui.Box>,
      ...blank(tall - 1 - above),
    ]
  } else if (frame.kind === 'heading' || frame.kind === 'title') {
    body = (
      <ui.Text bold wrap="truncate-end">
        {label ?? '━━━━━━'}
      </ui.Text>
    )
  } else if (frame.kind === 'input' || frame.kind === 'search') {
    body = (
      <ui.Text dimColor italic wrap="truncate-end">
        {`${label ?? ''}▏`}
      </ui.Text>
    )
  } else if (frame.kind === 'nav' || frame.kind === 'tabs') {
    const tabs = (label ?? 'Home | …').split(/\s*[|,、]\s*/).filter(tab => tab !== '')
    body = (
      <ui.Box flexDirection="row" columnGap={2}>
        {tabs.map((tab, index) => (
          <ui.Text bold={index === 0} underline={index === 0} dimColor={index !== 0} wrap="truncate-end">
            {tab}
          </ui.Text>
        ))}
      </ui.Box>
    )
  } else if (frame.kind === 'list') {
    body = [
      label !== undefined && (
        <ui.Text bold wrap="truncate-end">
          {label}
        </ui.Text>
      ),
      ...bars(frame.lines === 0 ? 3 : frame.lines, '• '),
    ]
  } else if (frame.kind === 'text') {
    body = [
      label !== undefined && <ui.Text wrap="wrap">{label}</ui.Text>,
      ...bars(frame.lines === 0 ? (label === undefined ? 2 : 0) : frame.lines, ''),
    ]
  } else {
    body = [<ui.Text wrap="wrap">{label ?? ' '}</ui.Text>, ...bars(frame.lines, '')]
  }

  return (
    <ui.Box borderStyle="single" borderColor="inactive" flexDirection="column" paddingX={1} width={width}>
      {body}
    </ui.Box>
  )
}

const drawWireframe = (ui: UI, wireframe: Wireframe, room: number): any => {
  const width = wireframe.isNarrow ? Math.min(room - 4, 40) : Math.min(room - 4, 104)

  return (
    <ui.Box borderStyle="round" borderColor="suggestion" flexDirection="column" paddingX={1} width={width + 4}>
      {drawFrame(ui, wireframe.screen, width)}
    </ui.Box>
  )
}

// ---------------------------------------------------------------- metrics

type Tile = { label: string; value: string; delta?: string; tone: string; series: number[]; note?: string }
type Metrics = { title: string; tiles: Tile[] }

const SPARKS = '▁▂▃▄▅▆▇█'

const sparkOf = (series: number[], width: number, played: number): string => {
  if (series.length < 2) return ''
  const size = Math.min(width, series.length)
  const picked = Array.from({ length: size }, (_, index) =>
    series[Math.round((index * (series.length - 1)) / Math.max(1, size - 1))] ?? 0,
  )
  const low = Math.min(...picked)
  const high = Math.max(...picked)

  return picked
    .slice(0, Math.max(1, Math.ceil(size * played)))
    .map(value => SPARKS[high === low ? 3 : Math.round(((value - low) / (high - low)) * 7)] ?? '▁')
    .join('')
}

const readMetrics = (input: unknown): Metrics | string => {
  const raw = record(input)
  const tiles: Tile[] = []
  for (const one of items(raw.tiles).slice(0, 8)) {
    const tile = record(one)
    const label = words(tile.label, 30)
    const value = words(tile.value, 20)
    if (label === undefined || value === undefined) continue
    tiles.push({
      label,
      value,
      delta: words(tile.delta, 24),
      tone: pick(tile.tone, ['good', 'bad', 'warn', 'plain'] as const, 'plain'),
      series: numbers(tile.series, 120),
      note: words(tile.note, 40),
    })
  }
  if (tiles.length === 0) return 'tiles is empty: each needs a label and a value'

  return { title: words(raw.title, 80) ?? 'Metrics', tiles }
}

const drawMetrics = (ui: UI, metrics: Metrics, room: number, played: number): any => {
  const width = clamp(Math.floor(room / Math.min(metrics.tiles.length, 4)) - 1, 18, 32)

  return (
    <ui.Box flexDirection="row" flexWrap="wrap" columnGap={1}>
      {metrics.tiles.map(tile => {
        const color = TONES[tile.tone] ?? 'text'
        const spark = sparkOf(tile.series, width - 4, played)

        return (
          <ui.Box borderStyle="round" borderColor="inactive" flexDirection="column" paddingX={1} width={width}>
            <ui.Text dimColor wrap="truncate-end">
              {tile.label}
            </ui.Text>
            <ui.Text bold wrap="truncate-end">
              {tile.value}
            </ui.Text>
            {tile.delta !== undefined && (
              <ui.Text color={color} wrap="truncate-end">
                {tile.delta}
              </ui.Text>
            )}
            {spark !== '' && <ui.Text color={tile.tone === 'plain' ? 'suggestion' : color}>{spark}</ui.Text>}
            {tile.note !== undefined && (
              <ui.Text dimColor wrap="truncate-end">
                {tile.note}
              </ui.Text>
            )}
          </ui.Box>
        )
      })}
    </ui.Box>
  )
}

// ---------------------------------------------------------------- chart

const CHART_KINDS = ['bar', 'column', 'stacked', 'line', 'scatter', 'heatmap', 'histogram', 'funnel', 'share'] as const
type ChartKind = (typeof CHART_KINDS)[number]
type Series = { name: string; values: number[] }
type Chart = {
  kind: ChartKind
  title: string
  unit: string
  labels: string[]
  series: Series[]
  points: { x: number; y: number }[]
  xLabel?: string
  yLabel?: string
  bins: number
  edges?: [string, string]
  // 'image': the plot as a picture, where the kind has one (see IMAGE_KINDS).
  style: 'text' | 'image'
}

const EIGHTHS = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉']
const LEVELS = ' ▁▂▃▄▅▆▇█'
const SHADES = '·░▒▓█'

const readChart = (input: unknown): Chart | string => {
  const raw = record(input)
  const kind = pick(raw.kind, CHART_KINDS, 'bar')
  let series: Series[] = []
  for (const one of items(raw.series).slice(0, 12)) {
    const each = record(one)
    const values = numbers(each.values, 400)
    if (values.length > 0) series.push({ name: words(each.name, 24) ?? `#${series.length + 1}`, values })
  }
  const flat = numbers(raw.values, 2000)
  if (series.length === 0 && flat.length > 0) series = [{ name: words(raw.name, 24) ?? '', values: flat }]
  const points: Chart['points'] = []
  for (const one of items(raw.points).slice(0, 600)) {
    const point = record(one)
    const x = num(point.x)
    const y = num(point.y)
    if (x !== undefined && y !== undefined) points.push({ x, y })
  }
  if (kind === 'scatter' ? points.length === 0 : series.length === 0) {
    return kind === 'scatter'
      ? 'a scatter needs points: [{ x, y }]'
      : `a ${kind} chart needs series: [{ name, values: [numbers] }] beside labels`
  }
  let labels = wordList(raw.labels, 60, 24)
  let edges: [string, string] | undefined
  if (kind === 'histogram') {
    const values = series[0]?.values ?? []
    const low = Math.min(...values)
    const high = Math.max(...values)
    const bins = clamp(Math.round(num(raw.bins) ?? Math.sqrt(values.length)), 4, 30)
    const counts = new Array<number>(bins).fill(0)
    for (const value of values) {
      const at = high === low ? 0 : Math.min(bins - 1, Math.floor(((value - low) / (high - low)) * bins))
      counts[at] = (counts[at] ?? 0) + 1
    }
    series = [{ name: series[0]?.name ?? '', values: counts }]
    labels = counts.map(() => '')
    edges = [fmt(low), fmt(high)]
  }

  return {
    kind,
    title: words(raw.title, 80) ?? 'Chart',
    unit: words(raw.unit, 8) ?? '',
    labels,
    series,
    points,
    xLabel: words(raw.xLabel, 30),
    yLabel: words(raw.yLabel, 30),
    bins: 0,
    edges,
    style: pick(raw.style, ['text', 'image'] as const, 'text'),
  }
}

const blocks = (length: number): string => {
  const whole = Math.floor(length)
  const part = Math.round((length - whole) * 8)

  return part === 8 ? '█'.repeat(whole + 1) : '█'.repeat(whole) + (EIGHTHS[part] ?? '')
}

const labelAt = (chart: Chart, index: number): string => chart.labels[index] ?? String(index + 1)

const aside = (ui: UI, text: string): any => (
  <ui.Box marginLeft={1} flexShrink={0}>
    <ui.Text dimColor>{text}</ui.Text>
  </ui.Box>
)

const drawBars = (ui: UI, chart: Chart, room: number, played: number): any => {
  const count = Math.min(30, Math.max(...chart.series.map(series => series.values.length)))
  const labelW = clamp(Math.max(...Array.from({ length: count }, (_, index) => widthOf(labelAt(chart, index)))), 3, 22)
  const width = Math.max(10, room - labelW - 12)
  const isStacked = chart.kind === 'stacked'
  const totals = Array.from({ length: count }, (_, index) =>
    chart.series.reduce((sum, series) => sum + Math.max(0, series.values[index] ?? 0), 0),
  )
  const top = Math.max(
    1e-9,
    ...(isStacked ? totals : chart.series.flatMap(series => series.values.slice(0, count).map(value => Math.max(0, value)))),
  )
  const label = (text: string): any => (
    <ui.Box width={labelW + 1} flexShrink={0}>
      <ui.Text wrap="truncate-end">{text}</ui.Text>
    </ui.Box>
  )
  const out: any[] = []
  for (let index = 0; index < count; index++) {
    if (isStacked) {
      out.push(
        <ui.Box flexDirection="row">
          {label(labelAt(chart, index))}
          {chart.series.map((series, at) => {
            const cells = Math.round((Math.max(0, series.values[index] ?? 0) / top) * width * played)

            return cells > 0 && <ui.Text color={tint(at)}>{'█'.repeat(cells)}</ui.Text>
          })}
          {aside(ui, `${fmt(totals[index] ?? 0)}${chart.unit}`)}
        </ui.Box>,
      )
      continue
    }
    chart.series.forEach((series, at) => {
      const value = series.values[index]
      if (value === undefined) return
      out.push(
        <ui.Box flexDirection="row">
          {label(at === 0 ? labelAt(chart, index) : ' ')}
          <ui.Text color={tint(at)}>{blocks((Math.max(0, value) / top) * width * played) || '▏'}</ui.Text>
          {aside(ui, `${fmt(value)}${chart.unit}`)}
        </ui.Box>,
      )
    })
  }
  out.push(legendOf(ui, chart.series.map(series => series.name), chart.series.map((_, at) => tint(at))))

  return out
}

const AXIS = 8

const axisRows = (ui: UI, rows: Row[], high: string, low: string, mid = ' '): any[] =>
  rows.map((row, index) => {
    const isTick = index === 0 || index === rows.length - 1 || (mid !== ' ' && index === rows.length >> 1)

    return (
      <ui.Box flexDirection="row">
        <ui.Box width={AXIS} flexShrink={0} justifyContent="flex-end">
          <ui.Text dimColor wrap="truncate-end">
            {index === 0 ? high : index === rows.length - 1 ? low : index === rows.length >> 1 ? mid : ' '}
          </ui.Text>
        </ui.Box>
        <ui.Text color="inactive">{isTick ? '┤' : '│'}</ui.Text>
        {rowOf(ui, row)}
      </ui.Box>
    )
  })

const floorOf = (ui: UI, width: number, marks: [number, string][]): any[] => {
  const canvas = makeCanvas(width, 1)
  for (const [x, text] of marks) {
    const cut = clip(text, 16)
    const at = clamp(x - (widthOf(cut) >> 1), 0, Math.max(0, width - widthOf(cut)))
    if (cut !== '' && isFree(canvas, at, 0, widthOf(cut))) put(canvas, at, 0, cut, { dim: true })
  }

  return [
    <ui.Box paddingLeft={AXIS}>
      <ui.Text color="inactive">{`└${'─'.repeat(width)}`}</ui.Text>
    </ui.Box>,
    <ui.Box paddingLeft={AXIS + 1}>{rowOf(ui, rowsOf(canvas)[0] ?? { indent: 0, segs: [] })}</ui.Box>,
  ]
}

const drawColumns = (ui: UI, chart: Chart, room: number, played: number): any => {
  const count = Math.min(chart.kind === 'histogram' ? 30 : 24, Math.max(...chart.series.map(series => series.values.length)))
  const each = chart.series.length
  const plot = Math.max(12, room - AXIS - 2)
  const bar = clamp(Math.floor((Math.floor(plot / count) - 1) / each), 1, 6)
  const group = bar * each + 1
  const tall = 8
  const top = Math.max(
    1e-9,
    ...chart.series.flatMap(series => series.values.slice(0, count).map(value => Math.max(0, value))),
  )
  const canvas = makeCanvas(count * group, tall + 1)
  for (let index = 0; index < count; index++) {
    chart.series.forEach((series, at) => {
      const value = Math.max(0, series.values[index] ?? 0)
      const eighths = Math.round((value / top) * tall * 8 * played)
      for (let row = 0; row < tall; row++) {
        const level = clamp(eighths - row * 8, 0, 8)
        if (level > 0) {
          put(canvas, index * group + at * bar, tall - row, (LEVELS[level] ?? '█').repeat(bar), { color: tint(at) })
        }
      }
      if (each === 1 && bar >= 2 && eighths > 0) {
        const text = clip(fmt(series.values[index] ?? 0), group)
        const y = tall - Math.ceil(eighths / 8)
        if (y >= 0 && widthOf(text) <= group) put(canvas, index * group, y, text, { dim: true })
      }
    })
  }
  const marks: [number, string][] = chart.edges
    ? [
        [0, `${chart.edges[0]}${chart.unit}`],
        [count * group, `${chart.edges[1]}${chart.unit}`],
      ]
    : Array.from({ length: count }, (_, index) => [index * group + (group >> 1), clip(labelAt(chart, index), Math.max(1, group - 1))])

  return [
    ...axisRows(ui, rowsOf(canvas), chart.edges ? fmt(top) : `${fmt(top)}${chart.unit}`, '0'),
    ...floorOf(ui, count * group, marks),
    legendOf(ui, chart.series.map(series => series.name), chart.series.map((_, at) => tint(at))),
  ]
}

const drawPlot = (ui: UI, chart: Chart, room: number, played: number): any => {
  const width = clamp(room - AXIS - 2, 20, 110)
  if (chart.kind === 'scatter') {
    const tall = 12
    const canvas = makeCanvas(width, tall)
    const count = chart.points.length
    const xs = chart.points.map(point => point.x)
    const ys = chart.points.map(point => point.y)
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
    const colOf = (x: number): number => Math.round(((x - x0) / (x1 - x0 || 1)) * (width - 1))
    const rowAt = (y: number): number => Math.round((1 - (y - y0) / (y1 - y0 || 1)) * (tall - 1))
    // The least-squares line through the points, dotted behind them.
    const meanX = xs.reduce((sum, x) => sum + x, 0) / count
    const meanY = ys.reduce((sum, y) => sum + y, 0) / count
    const spreadX = xs.reduce((sum, x) => sum + (x - meanX) ** 2, 0)
    const spreadY = ys.reduce((sum, y) => sum + (y - meanY) ** 2, 0)
    const together = chart.points.reduce((sum, point) => sum + (point.x - meanX) * (point.y - meanY), 0)
    if (count >= 3 && spreadX > 0 && played === 1) {
      for (let col = 0; col < width; col += 2) {
        const row = rowAt(meanY + (together / spreadX) * (x0 + (col / (width - 1)) * (x1 - x0) - meanX))
        if (row >= 0 && row < tall) put(canvas, col, row, '·', { dim: true })
      }
    }
    chart.points.slice(0, Math.ceil(count * played)).forEach(point => {
      const col = colOf(point.x)
      const row = rowAt(point.y)
      const isStacked = cellAt(canvas, col, row)?.ch === '●'
      put(canvas, col, row, '●', { color: isStacked ? 'warning' : 'claude', bold: true })
    })
    const fit = spreadX > 0 && spreadY > 0 ? `  r=${trimNumber(together / Math.sqrt(spreadX * spreadY), 2)}` : ''

    return [
      chart.yLabel !== undefined && <ui.Text dimColor>{`↑ ${chart.yLabel}`}</ui.Text>,
      ...axisRows(ui, rowsOf(canvas), fmt(y1), fmt(y0), fmt((y0 + y1) / 2)),
      ...floorOf(ui, width, [
        [0, fmt(x0)],
        [width, fmt(x1)],
        [width >> 1, chart.xLabel === undefined ? '' : `${chart.xLabel} →`],
      ]),
      <ui.Text dimColor>{`n=${count}${fit}`}</ui.Text>,
    ]
  }

  const tall = 12
  const canvas = makeCanvas(width, tall)
  const all = chart.series.flatMap(series => series.values)
  const low = Math.min(...all)
  const high = Math.max(...all)
  const count = Math.max(...chart.series.map(series => series.values.length))
  const rowAt = (value: number): number => Math.round((1 - (value - low) / (high - low || 1)) * (tall - 1))
  const colOf = (index: number): number => Math.round((index / Math.max(1, count - 1)) * (width - 1))
  const upTo = Math.round((width - 1) * played)
  chart.series.forEach((series, at) => {
    const layer = makeCanvas(width, tall)
    trace(layer, rowsAcross(series.values, count, width, rowAt), upTo)
    stamp(canvas, layer, { color: tint(at) })
  })
  // The measured points sit on the lines; with few of them, so do their values.
  const isMarked = count <= 40
  chart.series.forEach((series, at) =>
    series.values.forEach((value, index) => {
      if (isMarked && colOf(index) <= upTo) put(canvas, colOf(index), rowAt(value), '●', { color: tint(at), bold: true })
    }),
  )
  if (played === 1 && count <= 8 && chart.series.length <= 3) {
    chart.series.forEach((series, at) =>
      series.values.forEach((value, index) => {
        const text = fmt(value)
        const size = widthOf(text)
        const col = colOf(index)
        const row = rowAt(value)
        const spots: [number, number][] = [
          [col - (size >> 1), row - 1],
          [col - (size >> 1), row + 1],
          [col + 2, row],
          [col - size - 1, row],
        ]
        const spot = spots.find(([x, y]) => isFree(canvas, x, y, size))
        if (spot) put(canvas, spot[0], spot[1], text, { color: tint(at) })
      }),
    )
  }
  const marks: [number, string][] =
    count <= 10
      ? Array.from({ length: count }, (_, index) => [colOf(index), labelAt(chart, index)])
      : [
          [0, labelAt(chart, 0)],
          [width, labelAt(chart, count - 1)],
          [width >> 1, labelAt(chart, (count - 1) >> 1)],
        ]

  return [
    ...axisRows(ui, rowsOf(canvas), `${fmt(high)}${chart.unit}`, `${fmt(low)}${chart.unit}`, `${fmt((low + high) / 2)}${chart.unit}`),
    ...floorOf(ui, width, marks),
    legendOf(ui, chart.series.map(series => series.name), chart.series.map((_, at) => tint(at))),
  ]
}

const drawHeat = (ui: UI, chart: Chart, room: number): any => {
  const count = Math.min(40, Math.max(...chart.series.map(series => series.values.length)))
  const labelW = clamp(Math.max(...chart.series.map(series => widthOf(series.name))), 3, 18)
  const cell = clamp(Math.floor((room - labelW - 1) / count), 2, 8)
  const all = chart.series.flatMap(series => series.values.slice(0, count))
  const low = Math.min(...all)
  const high = Math.max(...all)
  const head = makeCanvas(count * cell, 1)
  for (let index = 0; index < count; index++) put(head, index * cell, 0, clip(labelAt(chart, index), cell - 1), { dim: true })

  return [
    <ui.Box paddingLeft={labelW + 1}>{rowOf(ui, rowsOf(head)[0] ?? { indent: 0, segs: [] })}</ui.Box>,
    ...chart.series.map(series => (
      <ui.Box flexDirection="row">
        <ui.Box width={labelW + 1} flexShrink={0}>
          <ui.Text wrap="truncate-end">{series.name}</ui.Text>
        </ui.Box>
        <ui.Text color="claude">
          {Array.from({ length: count }, (_, index) => {
            const value = series.values[index]
            const level = value === undefined ? 0 : Math.round(((value - low) / (high - low || 1)) * 4)

            return (SHADES[level] ?? '·').repeat(cell - 1) + (index === count - 1 ? '' : ' ')
          }).join('')}
        </ui.Text>
      </ui.Box>
    )),
    <ui.Box flexDirection="row" columnGap={1}>
      <ui.Text dimColor>{`${fmt(low)}${chart.unit}`}</ui.Text>
      <ui.Text color="claude">{SHADES}</ui.Text>
      <ui.Text dimColor>{`${fmt(high)}${chart.unit}`}</ui.Text>
    </ui.Box>,
  ]
}

const drawFunnel = (ui: UI, chart: Chart, room: number, played: number): any => {
  const values = (chart.series[0]?.values ?? []).slice(0, 12)
  const labelW = clamp(Math.max(...values.map((_, index) => widthOf(labelAt(chart, index)))), 3, 22)
  const width = clamp(room - labelW - 26, 16, 64)
  const top = Math.max(1e-9, ...values)
  const first = values[0] || top

  return values.map((value, index) => {
    const cells = Math.max(1, Math.round((Math.max(0, value) / top) * width * played))
    return (
      <ui.Box flexDirection="row">
        <ui.Box width={labelW + 1} flexShrink={0}>
          <ui.Text wrap="truncate-end">{labelAt(chart, index)}</ui.Text>
        </ui.Box>
        <ui.Box width={width} flexShrink={0} paddingLeft={(width - cells) >> 1}>
          <ui.Text color={tint(index)}>{'█'.repeat(cells)}</ui.Text>
        </ui.Box>
        {aside(ui, `${fmt(value)}${chart.unit}`)}
        <ui.Box marginLeft={2} flexShrink={0}>
          <ui.Text bold>{`${trimNumber((value / first) * 100, 0)}%`}</ui.Text>
        </ui.Box>
      </ui.Box>
    )
  })
}

const drawShare = (ui: UI, chart: Chart, room: number, played: number): any => {
  const values = (chart.series[0]?.values ?? []).slice(0, 10).map(value => Math.max(0, value))
  const total = values.reduce((sum, value) => sum + value, 0) || 1
  const width = clamp(room - 2, 20, 90)
  const exact = values.map(value => (value / total) * width)
  const cells = exact.map(Math.floor)
  let spare = width - cells.reduce((sum, value) => sum + value, 0)
  exact
    .map((value, index) => ({ index, rest: value - Math.floor(value) }))
    .sort((a, b) => b.rest - a.rest)
    .forEach(one => {
      if (spare-- > 0) cells[one.index] = (cells[one.index] ?? 0) + 1
    })
  const shown = Math.round(width * played)
  let used = 0
  const widest = Math.max(...values.map((_, index) => widthOf(labelAt(chart, index))))

  return [
    <ui.Box flexDirection="row">
      {cells.map((size, index) => {
        const take = clamp(shown - used, 0, size)
        used += size

        return take > 0 && <ui.Text color={tint(index)}>{'█'.repeat(take)}</ui.Text>
      })}
    </ui.Box>,
    ...values.map((value, index) => (
      <ui.Box flexDirection="row" columnGap={1}>
        <ui.Text color={tint(index)}>■</ui.Text>
        <ui.Box width={clamp(widest, 3, 30) + 1} flexShrink={0}>
          <ui.Text wrap="truncate-end">{labelAt(chart, index)}</ui.Text>
        </ui.Box>
        <ui.Text bold>{`${trimNumber((value / total) * 100, 1)}%`}</ui.Text>
        <ui.Text dimColor>{`${fmt(value)}${chart.unit}`}</ui.Text>
      </ui.Box>
    )),
  ]
}

const drawChart = (ui: UI, chart: Chart, room: number, played: number): any => {
  if (chart.style === 'image' && ui.Image !== undefined && IMAGE_KINDS.includes(chart.kind)) return drawImageChart(ui, chart, room, played)
  if (chart.kind === 'bar' || chart.kind === 'stacked') return drawBars(ui, chart, room, played)
  if (chart.kind === 'column' || chart.kind === 'histogram') return drawColumns(ui, chart, room, played)
  if (chart.kind === 'line' || chart.kind === 'scatter') return drawPlot(ui, chart, room, played)
  if (chart.kind === 'heatmap') return drawHeat(ui, chart, room)
  if (chart.kind === 'funnel') return drawFunnel(ui, chart, room, played)

  return drawShare(ui, chart, room, played)
}

// ---------------------------------------------------------------- image charts
// With `style: "image"`, a chart's plot is a real picture: anti-aliased lines,
// translucent areas, round points and soft gridlines, drawn here pixel by
// pixel and shown with the terminal's image protocol (kitty, Ghostty, iTerm2).
// Axis labels and the legend stay text: a picture has no font. Where the
// terminal cannot show pictures, the picture's alt text stands in.

// The theme colors the text cards use, as the default dark theme paints them.
const RGB: Record<string, [number, number, number]> = {
  claude: [215, 119, 87],
  suggestion: [177, 185, 249],
  success: [78, 186, 101],
  warning: [255, 193, 7],
  bashBorder: [253, 93, 177],
  planMode: [72, 150, 140],
  autoAccept: [175, 135, 255],
  error: [255, 107, 128],
  inactive: [153, 153, 153],
}
const rgbOf = (key: string): [number, number, number] => RGB[key] ?? [210, 212, 217]

// Pixels per terminal cell: cells are about twice as tall as wide.
const CELL_W = 8
const CELL_H = 16

type Pixels = { w: number; h: number; data: Uint8Array }

const makePixels = (w: number, h: number): Pixels => ({ w, h, data: new Uint8Array(w * h * 4) })

// Lays `color` at `alpha` (0 to 1) over the pixel, the picture staying
// transparent where nothing is drawn, so the terminal's own background shows.
const blend = (px: Pixels, x: number, y: number, [r, g, b]: [number, number, number], alpha: number): void => {
  if (x < 0 || y < 0 || x >= px.w || y >= px.h || alpha <= 0) return
  const at = (y * px.w + x) * 4
  const below = (px.data[at + 3] ?? 0) / 255
  const out = alpha + below * (1 - alpha)
  if (out <= 0) return
  const mix = (top: number, under: number): number => Math.round((top * alpha + under * below * (1 - alpha)) / out)
  px.data[at] = mix(r, px.data[at] ?? 0)
  px.data[at + 1] = mix(g, px.data[at + 1] ?? 0)
  px.data[at + 2] = mix(b, px.data[at + 2] ?? 0)
  px.data[at + 3] = Math.round(Math.min(1, out) * 255)
}

// A line of `width` pixels with soft edges: each pixel near it is covered by
// how far inside the stroke it lies.
const strokeLine = (px: Pixels, x1: number, y1: number, x2: number, y2: number, width: number, color: [number, number, number], alpha = 1): void => {
  const half = width / 2
  const left = Math.floor(Math.min(x1, x2) - half - 1)
  const right = Math.ceil(Math.max(x1, x2) + half + 1)
  const top = Math.floor(Math.min(y1, y2) - half - 1)
  const bottom = Math.ceil(Math.max(y1, y2) + half + 1)
  const dx = x2 - x1
  const dy = y2 - y1
  const length = dx * dx + dy * dy
  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((x + 0.5 - x1) * dx + (y + 0.5 - y1) * dy) / length))
      const distance = Math.hypot(x + 0.5 - (x1 + t * dx), y + 0.5 - (y1 + t * dy))
      blend(px, x, y, color, alpha * Math.max(0, Math.min(1, half + 0.5 - distance)))
    }
  }
}

const fillCircle = (px: Pixels, cx: number, cy: number, radius: number, color: [number, number, number], alpha = 1): void => {
  for (let y = Math.floor(cy - radius - 1); y <= Math.ceil(cy + radius + 1); y++) {
    for (let x = Math.floor(cx - radius - 1); x <= Math.ceil(cx + radius + 1); x++) {
      const distance = Math.hypot(x + 0.5 - cx, y + 0.5 - cy)
      blend(px, x, y, color, alpha * Math.max(0, Math.min(1, radius + 0.5 - distance)))
    }
  }
}

// A bar with rounded top corners.
const fillBar = (px: Pixels, x1: number, y1: number, x2: number, y2: number, radius: number, color: [number, number, number]): void => {
  for (let y = Math.floor(y1); y < Math.ceil(y2); y++) {
    for (let x = Math.floor(x1); x < Math.ceil(x2); x++) {
      let coverage = 1
      const corner = (cx: number, cy: number): void => {
        const distance = Math.hypot(x + 0.5 - cx, y + 0.5 - cy)
        coverage = Math.min(coverage, Math.max(0, Math.min(1, radius + 0.5 - distance)))
      }
      if (y + 0.5 < y1 + radius && x + 0.5 < x1 + radius) corner(x1 + radius, y1 + radius)
      if (y + 0.5 < y1 + radius && x + 0.5 > x2 - radius) corner(x2 - radius, y1 + radius)
      const edge = Math.min(1, x + 1 - x1, x2 - x, y + 1 - y1)
      blend(px, x, y, color, coverage * Math.max(0, edge))
    }
  }
}

const base64Of = (bytes: Uint8Array): string => {
  const native = (bytes as unknown as { toBase64?: () => string }).toBase64
  if (typeof native === 'function') return native.call(bytes)
  let text = ''
  for (let at = 0; at < bytes.length; at += 0x8000) text += String.fromCharCode(...bytes.subarray(at, at + 0x8000))
  return btoa(text)
}

// Which chart kinds have a picture form.
const IMAGE_KINDS: readonly ChartKind[] = ['line', 'scatter', 'column', 'histogram']

const drawImageChart = (ui: UI, chart: Chart, room: number, played: number): any => {
  const columns = clamp(room - AXIS - 2, 20, 120)
  const rows = chart.kind === 'scatter' ? 12 : 11
  const px = makePixels(columns * CELL_W, rows * CELL_H)
  // Room for a point's radius on every side, so none is cut at an edge.
  const pad = { left: 9, right: 10, top: 10, bottom: 7 }
  const plotW = px.w - pad.left - pad.right
  const plotH = px.h - pad.top - pad.bottom
  const grid = rgbOf('inactive')
  // Soft gridlines at the quarters, a firmer baseline.
  for (let step = 0; step <= 4; step++) {
    const y = Math.round(pad.top + (plotH * step) / 4) + 0.5
    strokeLine(px, pad.left, y, px.w - pad.right, y, 1, grid, step === 4 ? 0.45 : 0.14)
  }

  let high = 0
  let low = 0
  let marks: [number, string][] = []
  const legend: { name: string; color: string }[] = []

  if (chart.kind === 'scatter') {
    const xs = chart.points.map(point => point.x)
    const ys = chart.points.map(point => point.y)
    const [x0, x1] = [Math.min(...xs), Math.max(...xs)]
    ;[low, high] = [Math.min(...ys), Math.max(...ys)]
    const sx = (x: number): number => pad.left + ((x - x0) / (x1 - x0 || 1)) * plotW
    const sy = (y: number): number => pad.top + (1 - (y - low) / (high - low || 1)) * plotH
    // The least-squares line behind the points.
    const count = chart.points.length
    const meanX = xs.reduce((sum, x) => sum + x, 0) / count
    const meanY = ys.reduce((sum, y) => sum + y, 0) / count
    const spreadX = xs.reduce((sum, x) => sum + (x - meanX) ** 2, 0)
    const together = chart.points.reduce((sum, point) => sum + (point.x - meanX) * (point.y - meanY), 0)
    if (count >= 3 && spreadX > 0) {
      const slope = together / spreadX
      strokeLine(px, sx(x0), sy(meanY + slope * (x0 - meanX)), sx(x1), sy(meanY + slope * (x1 - meanX)), 2, rgbOf('suggestion'), 0.45 * played)
    }
    chart.points.slice(0, Math.ceil(count * played)).forEach(point => {
      fillCircle(px, sx(point.x), sy(point.y), 4.5, rgbOf('claude'), 0.85)
    })
    marks = [
      [0, fmt(x0)],
      [columns, fmt(x1)],
      [columns >> 1, chart.xLabel === undefined ? '' : `${chart.xLabel} →`],
    ]
  } else if (chart.kind === 'line') {
    const all = chart.series.flatMap(series => series.values)
    ;[low, high] = [Math.min(...all), Math.max(...all)]
    const count = Math.max(...chart.series.map(series => series.values.length))
    const sx = (index: number): number => pad.left + (index / Math.max(1, count - 1)) * plotW
    const sy = (value: number): number => pad.top + (1 - (value - low) / (high - low || 1)) * plotH
    const reach = (count - 1) * played
    chart.series.forEach((series, at) => {
      const color = rgbOf(tint(at))
      legend.push({ name: series.name, color: tint(at) })
      const shown: [number, number][] = []
      series.values.forEach((value, index) => {
        if (index <= reach) shown.push([sx(index), sy(value)])
        else if (index - 1 < reach) {
          const before = series.values[index - 1] ?? value
          const part = reach - (index - 1)
          shown.push([sx(index - 1 + part), sy(before + (value - before) * part)])
        }
      })
      // A translucent area under the line, fading toward the baseline.
      for (let x = Math.floor(shown[0]?.[0] ?? 0); x <= Math.ceil(shown[shown.length - 1]?.[0] ?? 0); x++) {
        const segment = shown.findIndex((point, index) => index > 0 && point[0] >= x)
        const a = shown[segment - 1]
        const b = shown[segment]
        if (!a || !b) continue
        const yLine = a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0] || 1)
        for (let y = Math.ceil(yLine); y < pad.top + plotH; y++) {
          blend(px, x, y, color, (chart.series.length > 1 ? 0.07 : 0.16) * (1 - (y - yLine) / (pad.top + plotH - yLine + 1)))
        }
      }
      shown.forEach((point, index) => {
        const next = shown[index + 1]
        if (next) strokeLine(px, point[0], point[1], next[0], next[1], 3, color)
      })
      series.values.forEach((value, index) => {
        if (index <= reach) {
          fillCircle(px, sx(index), sy(value), 4.5, color)
          fillCircle(px, sx(index), sy(value), 2, [24, 26, 30])
        }
      })
    })
    marks =
      count <= 10
        ? Array.from({ length: count }, (_, index) => [Math.round(((sx(index) - 0) / px.w) * columns), labelAt(chart, index)])
        : [
            [0, labelAt(chart, 0)],
            [columns, labelAt(chart, count - 1)],
            [columns >> 1, labelAt(chart, (count - 1) >> 1)],
          ]
  } else {
    const count = Math.max(...chart.series.map(series => series.values.length))
    high = Math.max(1e-9, ...chart.series.flatMap(series => series.values))
    low = 0
    const group = plotW / count
    const gap = Math.max(2, group * (chart.kind === 'histogram' ? 0.08 : 0.28))
    const each = (group - gap) / chart.series.length
    chart.series.forEach((series, at) => {
      legend.push({ name: series.name, color: tint(at) })
      series.values.forEach((value, index) => {
        const height = (Math.max(0, value) / high) * plotH * played
        const x1 = pad.left + index * group + gap / 2 + at * each
        fillBar(px, x1, pad.top + plotH - height, x1 + each - 1, pad.top + plotH, Math.min(5, each / 3), rgbOf(tint(at)))
      })
    })
    marks = chart.edges
      ? [
          [0, `${chart.edges[0]}${chart.unit}`],
          [columns, `${chart.edges[1]}${chart.unit}`],
        ]
      : Array.from({ length: count }, (_, index) => [
          Math.round(((pad.left + (index + 0.5) * group) / px.w) * columns),
          clip(labelAt(chart, index), Math.max(1, Math.floor((group / px.w) * columns) - 1)),
        ])
  }

  const unit = chart.edges ? '' : chart.unit
  const tick = (value: number): string => `${fmt(value)}${unit}`
  const axis = Array.from({ length: rows }, (_, row) =>
    row === 0 ? tick(high) : row === rows - 1 ? tick(low) : row === rows >> 1 ? tick((low + high) / 2) : ' ',
  )
  const alt = `${chart.kind} chart: ${chart.title}`

  return [
    chart.kind === 'scatter' && chart.yLabel !== undefined && <ui.Text dimColor>{`↑ ${chart.yLabel}`}</ui.Text>,
    <ui.Box flexDirection="row">
      <ui.Box flexDirection="column" width={AXIS} flexShrink={0}>
        {axis.map(label => (
          <ui.Box justifyContent="flex-end">
            <ui.Text dimColor wrap="truncate-end">
              {label}
            </ui.Text>
          </ui.Box>
        ))}
      </ui.Box>
      <ui.Box marginLeft={1}>
        <ui.Image key={scopeOf('chart')} source={{ rgba: base64Of(px.data), width: px.w, height: px.h }} columns={columns} rows={rows} alt={alt} />
      </ui.Box>
    </ui.Box>,
    ...floorOf(ui, columns, marks).slice(1),
    legendOf(ui, legend.map(one => one.name), legend.map(one => one.color)),
  ]
}


// ---------------------------------------------------------------- chart export
// Every card carries two buttons at its top right: Copy image and Save PNG. For a
// picture chart either one draws the whole chart as SVG, title, ticks, labels
// and legend included (the picture in the terminal has no font, so its text is
// drawn beside it), saves it under ~/Downloads/sketch with a PNG twice its
// size, and Copy puts that PNG on the clipboard. The PNG comes from
// rsvg-convert where it is installed, else from macOS's own sips; the SVG is
// kept either way.

const hexOf = (key: string): string => `#${rgbOf(key).map(part => part.toString(16).padStart(2, '0')).join('')}`
const xml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const FONT = "-apple-system, BlinkMacSystemFont, 'PingFang TC', 'Noto Sans CJK TC', 'Microsoft JhengHei', 'Helvetica Neue', Arial, sans-serif"
const round1 = (value: number): string => (Math.round(value * 10) / 10).toString()

const chartSvg = (chart: Chart): { svg: string; width: number; height: number } => {
  const width = 960
  const legendNames =
    chart.kind === 'scatter' ? [] : chart.series.length > 1 ? chart.series.map(series => series.name) : []
  const height = legendNames.length > 0 ? 470 : 440
  const box = { left: 84, right: width - 36, top: 84, bottom: 360 }
  const plotW = box.right - box.left
  const plotH = box.bottom - box.top
  const parts: string[] = []
  const text = (x: number, y: number, body: string, attrs: string): void => {
    parts.push(`<text x="${round1(x)}" y="${round1(y)}" ${attrs}>${xml(body)}</text>`)
  }
  parts.push(`<rect width="${width}" height="${height}" rx="18" fill="#17191d"/>`)
  text(32, 50, `◆ ${chart.title}`, `font-size="22" font-weight="600" fill="${hexOf('claude')}"`)

  let low = 0
  let high = 0
  const unit = chart.edges ? '' : chart.unit
  const ticks = (): void => {
    for (let step = 0; step <= 4; step++) {
      const y = box.top + (plotH * step) / 4
      const value = high - ((high - low) * step) / 4
      parts.push(
        `<line x1="${box.left}" y1="${round1(y)}" x2="${box.right}" y2="${round1(y)}" stroke="#999999" stroke-opacity="${step === 4 ? 0.5 : 0.16}" stroke-width="1"/>`,
      )
      text(box.left - 12, y + 5, `${fmt(value)}${unit}`, `font-size="14" fill="#8a8d93" text-anchor="end"`)
    }
  }
  const below = (x: number, body: string, anchor = 'middle'): void =>
    text(x, box.bottom + 30, body, `font-size="14" fill="#8a8d93" text-anchor="${anchor}"`)

  if (chart.kind === 'scatter') {
    const xs = chart.points.map(point => point.x)
    const ys = chart.points.map(point => point.y)
    const [x0, x1] = [Math.min(...xs), Math.max(...xs)]
    ;[low, high] = [Math.min(...ys), Math.max(...ys)]
    ticks()
    const sx = (x: number): number => box.left + 10 + ((x - x0) / (x1 - x0 || 1)) * (plotW - 20)
    const sy = (y: number): number => box.top + (1 - (y - low) / (high - low || 1)) * plotH
    const count = chart.points.length
    const meanX = xs.reduce((sum, x) => sum + x, 0) / count
    const meanY = ys.reduce((sum, y) => sum + y, 0) / count
    const spreadX = xs.reduce((sum, x) => sum + (x - meanX) ** 2, 0)
    const together = chart.points.reduce((sum, point) => sum + (point.x - meanX) * (point.y - meanY), 0)
    if (count >= 3 && spreadX > 0) {
      const slope = together / spreadX
      parts.push(
        `<line x1="${round1(sx(x0))}" y1="${round1(sy(meanY + slope * (x0 - meanX)))}" x2="${round1(sx(x1))}" y2="${round1(sy(meanY + slope * (x1 - meanX)))}" stroke="${hexOf('suggestion')}" stroke-opacity="0.55" stroke-width="2" stroke-dasharray="6 6"/>`,
      )
    }
    for (const point of chart.points) {
      parts.push(`<circle cx="${round1(sx(point.x))}" cy="${round1(sy(point.y))}" r="6" fill="${hexOf('claude')}" fill-opacity="0.85"/>`)
    }
    below(box.left, fmt(x0), 'start')
    below(box.right, fmt(x1), 'end')
    if (chart.xLabel !== undefined) below(box.left + plotW / 2, `${chart.xLabel} →`)
    if (chart.yLabel !== undefined) text(box.left, box.top - 16, `↑ ${chart.yLabel}`, `font-size="14" fill="#8a8d93"`)
  } else if (chart.kind === 'line') {
    const all = chart.series.flatMap(series => series.values)
    ;[low, high] = [Math.min(...all), Math.max(...all)]
    ticks()
    const count = Math.max(...chart.series.map(series => series.values.length))
    const sx = (index: number): number => box.left + 12 + (index / Math.max(1, count - 1)) * (plotW - 24)
    const sy = (value: number): number => box.top + (1 - (value - low) / (high - low || 1)) * plotH
    parts.push('<defs>')
    chart.series.forEach((_, at) => {
      parts.push(
        `<linearGradient id="fill${at}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${hexOf(tint(at))}" stop-opacity="${chart.series.length > 1 ? 0.14 : 0.3}"/><stop offset="1" stop-color="${hexOf(tint(at))}" stop-opacity="0"/></linearGradient>`,
      )
    })
    parts.push('</defs>')
    chart.series.forEach((series, at) => {
      const points = series.values.map((value, index) => `${round1(sx(index))},${round1(sy(value))}`)
      const first = series.values.length > 0 ? sx(0) : box.left
      const last = sx(series.values.length - 1)
      parts.push(`<polygon points="${round1(first)},${box.bottom} ${points.join(' ')} ${round1(last)},${box.bottom}" fill="url(#fill${at})"/>`)
      parts.push(`<polyline points="${points.join(' ')}" fill="none" stroke="${hexOf(tint(at))}" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/>`)
      series.values.forEach((value, index) => {
        parts.push(`<circle cx="${round1(sx(index))}" cy="${round1(sy(value))}" r="6" fill="${hexOf(tint(at))}"/>`)
        parts.push(`<circle cx="${round1(sx(index))}" cy="${round1(sy(value))}" r="2.6" fill="#17191d"/>`)
      })
    })
    const every = Math.max(1, Math.ceil(count / 12))
    for (let index = 0; index < count; index += every) below(sx(index), labelAt(chart, index))
  } else {
    const count = Math.max(...chart.series.map(series => series.values.length))
    high = Math.max(1e-9, ...chart.series.flatMap(series => series.values))
    low = 0
    ticks()
    const group = plotW / count
    const gap = Math.max(3, group * (chart.kind === 'histogram' ? 0.08 : 0.3))
    const each = (group - gap) / chart.series.length
    chart.series.forEach((series, at) => {
      series.values.forEach((value, index) => {
        const h = (Math.max(0, value) / high) * plotH
        const x = box.left + index * group + gap / 2 + at * each
        const y = box.bottom - h
        const r = Math.min(6, each / 3, h)
        parts.push(
          `<path d="M${round1(x)},${box.bottom} V${round1(y + r)} Q${round1(x)},${round1(y)} ${round1(x + r)},${round1(y)} H${round1(x + each - 1 - r)} Q${round1(x + each - 1)},${round1(y)} ${round1(x + each - 1)},${round1(y + r)} V${box.bottom} Z" fill="${hexOf(tint(at))}"/>`,
        )
        if (chart.series.length === 1 && count <= 14 && value !== 0) {
          text(x + (each - 1) / 2, y - 8, fmt(value), `font-size="13" fill="#c8cad0" text-anchor="middle"`)
        }
      })
    })
    if (chart.edges) {
      below(box.left, `${chart.edges[0]}${chart.unit}`, 'start')
      below(box.right, `${chart.edges[1]}${chart.unit}`, 'end')
    } else {
      const every = Math.max(1, Math.ceil(count / 14))
      for (let index = 0; index < count; index += every) below(box.left + (index + 0.5) * group, labelAt(chart, index))
    }
  }

  let x = 32
  legendNames.forEach((name, at) => {
    parts.push(`<rect x="${x}" y="${height - 42}" width="14" height="14" rx="3" fill="${hexOf(tint(at))}"/>`)
    text(x + 22, height - 30, name, `font-size="15" fill="#c8cad0"`)
    x += 44 + name.length * 15
  })

  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${FONT}">\n${parts.join('\n')}\n</svg>\n`,
    width,
    height,
  }
}

// Runs a command, answering whether it ran and exited 0; one that cannot start
// (not installed) is a no.
const runs = async ($: any, argv: string[]): Promise<boolean> => {
  try {
    const done = await $.process.run(argv, { timeoutMs: 20_000 })
    return done.exitCode === 0
  } catch {
    return false
  }
}

// Runs a command for what it prints; undefined when it cannot start or fails.
const outputOf = async ($: any, argv: string[]): Promise<string | undefined> => {
  try {
    const done = await $.process.run(argv, { timeoutMs: 20_000 })
    return done.exitCode === 0 ? String(done.stdout ?? '') : undefined
  } catch {
    return undefined
  }
}

// The same picture with its width and height doubled: the viewBox is kept, so
// a converter that draws at the SVG's own size draws it at twice the pixels.
const svgScaled = (svg: string, width: number, height: number): string =>
  svg.replace(
    `width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"`,
    `width="${width * 2}" height="${height * 2}" viewBox="0 0 ${width} ${height}"`,
  )

// Whether a PNG came out at the size asked for: a converter that crops or
// scales on its own is caught here rather than handing over half a picture.
const isSized = async ($: any, pngPath: string, width: number, height: number): Promise<boolean> => {
  const shown = (await outputOf($, ['sips', '-g', 'pixelWidth', '-g', 'pixelHeight', pngPath])) ?? ''
  const w = Number(/pixelWidth:\s*(\d+)/.exec(shown)?.[1])
  const h = Number(/pixelHeight:\s*(\d+)/.exec(shown)?.[1])
  return Math.abs(w - width) <= 2 && Math.abs(h - height) <= 2
}

// SVG to a PNG at twice the size: rsvg-convert where it is installed, and on a
// Mac without it sips, which reads SVG itself (given a copy at twice the size,
// so the text stays sharp). Not Quick Look: its thumbnails shift and crop the
// picture by its shape, and a cut picture is worse than none.
const toPng = async ($: any, svgPath: string, pngPath: string, drawn: { svg: string; width: number; height: number }): Promise<boolean> => {
  for (const bin of ['rsvg-convert', '/opt/homebrew/bin/rsvg-convert', '/usr/local/bin/rsvg-convert', '/usr/bin/rsvg-convert']) {
    if (await runs($, [bin, '-z', '2', '-o', pngPath, svgPath])) return true
  }
  const { svg, width, height } = drawn
  const scaledPath = `${svgPath.slice(0, -4)}.2x.svg`
  try {
    await $.fs.write(scaledPath, svgScaled(svg, width, height))
    if ((await runs($, ['sips', '-s', 'format', 'png', scaledPath, '--out', pngPath])) && (await isSized($, pngPath, width * 2, height * 2))) return true
    await runs($, ['rm', '-f', pngPath])
    return false
  } finally {
    await runs($, ['rm', '-f', scaledPath])
  }
}

// Puts the PNG on the clipboard; undefined when it took, else why not.
const toClipboard = async ($: any, pngPath: string): Promise<string | undefined> => {
  const tries: string[][] = [
    ['osascript', '-e', `set the clipboard to (read (POSIX file "${pngPath}") as «class PNGf»)`],
    ['sh', '-c', 'wl-copy --type image/png < "$1"', 'sh', pngPath],
    ['xclip', '-selection', 'clipboard', '-t', 'image/png', '-i', pngPath],
  ]
  let reason = 'no clipboard tool found'
  for (const argv of tries) {
    try {
      const done = await $.process.run(argv, { timeoutMs: 20_000 })
      if (done.exitCode === 0) return undefined
      // The first tool that ran says why; later ones are usually just absent.
      if (reason === 'no clipboard tool found') reason = `${argv[0]}: ${String(done.stderr ?? '').trim().split('\n')[0] || `exit ${done.exitCode}`}`
    } catch {
      // Not installed here: try the next one.
    }
  }
  return reason
}

// A file name's time part: 20261124-154911.
const stampOf = (date: Date): string => {
  const two = (n: number): string => String(n).padStart(2, '0')
  return `${date.getFullYear()}${two(date.getMonth() + 1)}${two(date.getDate())}-${two(date.getHours())}${two(date.getMinutes())}${two(date.getSeconds())}`
}

const exportSvg = async ($: any, drawn: { svg: string; width: number; height: number }, title: string, isCopy: boolean): Promise<void> => {
  try {
    const home: string = (await $.env.get('HOME')) ?? ''
    const shown = (path: string): string => (home !== '' && path.startsWith(home) ? `~${path.slice(home.length)}` : path)
    // A name a shell or AppleScript string takes as it is: no quotes, slashes or controls.
    const slug =
      title
        .replace(/[\\/:*?"'<>|`$\u0000-\u001f]/g, '')
        .replace(/\s+/g, '-')
        .slice(0, 60) || 'chart'
    const base = `${home}/Downloads/sketch/${slug}-${stampOf(new Date())}`
    await $.fs.write(`${base}.svg`, drawn.svg)
    const hasPng = await toPng($, `${base}.svg`, `${base}.png`, drawn)
    if (!hasPng) {
      $.ui.toast(`${isCopy ? 'Copy failed: no PNG could be made' : 'Saved only the SVG'} (for PNG: brew install librsvg) · ${shown(base)}.svg`, { timeoutMs: 12000 })
      return
    }
    if (!isCopy) {
      $.ui.toast(`Saved ${shown(base)}.png (and .svg)`, { timeoutMs: 6000 })
      return
    }
    const failure = await toClipboard($, `${base}.png`)
    $.ui.toast(
      failure === undefined
        ? `Copied to the clipboard: paste it anywhere · file in ${shown(base)}.png`
        : `Copy failed (${failure.slice(0, 120)}) · the file is saved: ${shown(base)}.png`,
      { timeoutMs: failure === undefined ? 6000 : 12000 },
    )
  } catch (error) {
    $.ui.toast(`Could not save the picture: ${error instanceof Error ? error.message : String(error)}`, { timeoutMs: 8000 })
  }
}

// ---------------------------------------------------------------- card export
// Every card can be copied or saved as a picture. A picture chart is drawn
// again from its numbers (chartSvg); every other card is laid out here as the
// terminal lays it out, cell by cell, and painted as SVG: lines and corners as
// strokes, so they join without seams, and the rest as text.

type PaintCell = { ch: string; w: number; fg?: string; bold?: boolean; dim?: boolean }
type PaintLine = PaintCell[]
type PaintBlock = { lines: PaintLine[]; width: number }

const paintCells = (text: string, style: Omit<PaintCell, 'ch' | 'w'>): PaintLine =>
  [...text].filter(ch => cellsOf(ch) > 0).map(ch => ({ ch, w: cellsOf(ch), ...style }))
const lineWidth = (line: PaintLine): number => line.reduce((sum, cell) => sum + cell.w, 0)
const blankCells = (count: number): PaintLine => Array.from({ length: Math.max(0, count) }, () => ({ ch: ' ', w: 1 }))
const padCells = (line: PaintLine, width: number): PaintLine => [...line, ...blankCells(width - lineWidth(line))]

const wrapCells = (line: PaintLine, width: number): PaintLine[] => {
  if (width <= 0) return [line]
  const out: PaintLine[] = []
  let rest = line
  while (lineWidth(rest) > width) {
    let used = 0
    let cut = 0
    let space = -1
    while (cut < rest.length && used + (rest[cut]?.w ?? 1) <= width) {
      if (rest[cut]?.ch === ' ') space = cut
      used += rest[cut]?.w ?? 1
      cut++
    }
    const at = space > 0 && cut < rest.length ? space : Math.max(1, cut)
    out.push(rest.slice(0, at))
    rest = rest.slice(at)
    while (rest[0]?.ch === ' ') rest = rest.slice(1)
  }
  out.push(rest)
  return out
}

const cutCells = (line: PaintLine, width: number): PaintLine => {
  if (lineWidth(line) <= width) return line
  const out: PaintLine = []
  let used = 0
  for (const cell of line) {
    if (used + cell.w > width - 1) break
    out.push(cell)
    used += cell.w
  }
  return [...out, { ...(out[out.length - 1] ?? {}), ch: '…', w: 1 }]
}

// A Text's runs: its strings in its own style, nested Texts in theirs.
const runsOf = (node: any, inherited: Omit<PaintCell, 'ch' | 'w'>): PaintLine => {
  const props = node?.props ?? {}
  const style = {
    fg: props.color ?? inherited.fg,
    bold: props.bold ?? inherited.bold,
    dim: props.dimColor ?? inherited.dim,
  }
  return (node?.children ?? []).flatMap((child: any) =>
    typeof child === 'string' || typeof child === 'number' ? paintCells(String(child), style) : runsOf(child, style),
  )
}

const FRAME_GLYPHS: Record<string, string> = { round: '╭╮╰╯─│', single: '┌┐└┘─│', bold: '┏┓┗┛━┃', double: '╔╗╚╝═║' }

const layoutTree = (node: any, avail: number, stretch?: number): PaintBlock => {
  if (node === undefined || node === null || node === false || node === true) return { lines: [], width: 0 }
  if (typeof node === 'string' || typeof node === 'number') return layoutTree({ type: 'Text', children: [String(node)] }, avail)
  if (Array.isArray(node)) return layoutTree({ type: 'Box', props: { flexDirection: 'column' }, children: node }, avail)
  const p = node.props ?? {}
  if (p.display === 'none' || p.position === 'absolute') return { lines: [], width: 0 }
  if (node.type === 'Button') return layoutTree({ type: 'Box', props: { flexDirection: 'row' }, children: node.children ?? [p.label ?? ''] }, avail, stretch)
  if (node.type === 'Image') {
    const columns = Number(p.columns ?? 1)
    return { lines: Array.from({ length: Number(p.rows ?? 1) }, () => blankCells(columns)), width: columns }
  }
  if (node.type === 'Text') {
    const line = runsOf(node, {})
    const lines = p.wrap === 'wrap' ? wrapCells(line, avail) : [cutCells(line, Math.max(1, avail))]
    return { lines, width: Math.max(0, ...lines.map(lineWidth)) }
  }
  const children = (node.children ?? []).filter((child: any) => child !== undefined && child !== null && child !== false && child !== true)
  const frame = typeof p.borderStyle === 'string' ? [...(FRAME_GLYPHS[p.borderStyle] ?? FRAME_GLYPHS.single ?? '')] : undefined
  const border = frame ? 1 : 0
  const padL = (p.paddingLeft ?? p.paddingX ?? 0) + border
  const padR = (p.paddingRight ?? p.paddingX ?? 0) + border
  const outer = typeof p.width === 'number' ? p.width : avail
  const inner = Math.max(0, outer - padL - padR)
  let lines: PaintLine[] = []
  let width = 0
  if (p.flexDirection === 'column') {
    children.forEach((child: any, index: number) => {
      const block = layoutTree(child, inner)
      const lead = child?.props?.marginLeft ?? 0
      for (let i = 0; i < (child?.props?.marginTop ?? 0) + (index > 0 ? (p.rowGap ?? 0) : 0); i++) lines.push([])
      lines.push(...block.lines.map(line => [...blankCells(lead), ...line]))
      width = Math.max(width, block.width + lead)
    })
  } else {
    const gap = p.columnGap ?? 0
    const rows: { block: PaintBlock; child: any; room: number }[][] = [[]]
    let used = 0
    for (const child of children) {
      let room = Math.max(1, inner - used - (used > 0 ? gap : 0))
      const lead = child?.props?.marginLeft ?? 0
      if (p.flexWrap === 'wrap' && used > 0 && used + gap + layoutTree(child, inner).width + lead > inner) {
        rows.push([])
        used = 0
        room = inner
      }
      const block = layoutTree(child, room)
      const row = rows[rows.length - 1] ?? []
      row.push({ block: { lines: block.lines.map(line => [...blankCells(lead), ...line]), width: block.width + lead }, child, room })
      used += block.width + lead + (row.length > 1 ? gap : 0)
    }
    rows.forEach((row, at) => {
      const tall = Math.max(0, ...row.map(one => one.block.lines.length))
      for (const one of row) {
        if (one.child?.props?.borderStyle && one.block.lines.length < tall) {
          const again = layoutTree(one.child, one.room, tall)
          const lead = one.child.props.marginLeft ?? 0
          one.block = { lines: again.lines.map(line => [...blankCells(lead), ...line]), width: again.width + lead }
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
        const line: PaintLine = [...blankCells(lead)]
        row.forEach((one, index) => {
          if (index > 0) line.push(...blankCells(between))
          line.push(...padCells(one.block.lines[i] ?? [], one.block.width))
        })
        lines.push(line)
      }
      width = Math.max(width, total + lead)
    })
  }
  const boxed = typeof p.width === 'number' ? p.width - padL - padR : width
  if (frame && stretch !== undefined) while (lines.length < stretch - 2) lines.push([])
  lines = lines.map(line => [...blankCells(padL - border), ...padCells(line, boxed), ...blankCells(padR - border)])
  if (frame) {
    const span = boxed + padL + padR - 2
    const style = { fg: p.borderColor, dim: p.borderDimColor }
    lines = [
      paintCells((frame[0] ?? '') + (frame[4] ?? '').repeat(span) + (frame[1] ?? ''), style),
      ...lines.map(line => [...paintCells(frame[5] ?? '', style), ...padCells(line, span), ...paintCells(frame[5] ?? '', style)]),
      paintCells((frame[2] ?? '') + (frame[4] ?? '').repeat(span) + (frame[3] ?? ''), style),
    ]
  }
  return { lines, width: typeof p.width === 'number' ? p.width : boxed + padL + padR }
}

// --- painting the laid-out cells

const SVG_BG = [23, 25, 29] as const
const PAINT_RGB: Record<string, [number, number, number]> = {
  ...RGB,
  text: [255, 255, 255],
  subtle: [80, 80, 80],
  inverseText: [0, 0, 0],
  permission: [177, 185, 249],
  ide: [71, 130, 200],
}
const cellHex = (cell: PaintCell): string => {
  const base = cell.fg !== undefined ? (PAINT_RGB[cell.fg] ?? [210, 212, 217]) : [210, 212, 217]
  const rgb = cell.dim ? base.map((part, at) => Math.round(part + ((SVG_BG[at] ?? 0) - part) * 0.45)) : base
  return `#${rgb.map(part => part.toString(16).padStart(2, '0')).join('')}`
}

const SVG_CW = 10
const SVG_CH = 20
// A monospace glyph is 0.6 em wide: at this size it fills its 10-pixel cell.
const MONO_SIZE = 16.6
const MONO = "Menlo, 'SF Mono', 'JetBrains Mono', Consolas, 'PingFang TC', 'Noto Sans Mono CJK TC', monospace"

const LIGHT_SIDES: Record<string, string> = { '─': 'LR', '│': 'UD', '┌': 'DR', '┐': 'DL', '└': 'UR', '┘': 'UL', '├': 'UDR', '┤': 'UDL', '┬': 'DLR', '┴': 'ULR', '┼': 'UDLR' }
const HEAVY_SIDES: Record<string, string> = { '━': 'LR', '┃': 'UD', '┏': 'DR', '┓': 'DL', '┗': 'UR', '┛': 'UL', '┣': 'UDR', '┫': 'UDL', '┳': 'DLR', '┻': 'ULR', '╋': 'UDLR' }
const ROUND_CORNERS: Record<string, [number, number]> = { '╭': [1, 1], '╮': [-1, 1], '╰': [1, -1], '╯': [-1, -1] }
const LEFT_EIGHTHS: Record<string, number> = { '▉': 7, '▊': 6, '▋': 5, '▌': 4, '▍': 3, '▎': 2, '▏': 1 }
const LOW_EIGHTHS: Record<string, number> = { '▁': 1, '▂': 2, '▃': 3, '▄': 4, '▅': 5, '▆': 6, '▇': 7 }
const SHADE_ALPHA: Record<string, number> = { '░': 0.28, '▒': 0.5, '▓': 0.75 }

const cardSvg = (title: string, body: any, room: number): { svg: string; width: number; height: number } => {
  const block = layoutTree(body, room)
  const lines = block.lines
  const columns = Math.max(1, block.width, ...lines.map(lineWidth))
  const left = 28
  const top = 64
  const width = left * 2 + columns * SVG_CW
  const height = top + lines.length * SVG_CH + 24
  const strokes = new Map<string, string[]>()
  const stroke = (color: string, weight: number, d: string): void => {
    const key = `${color}|${weight}`
    strokes.set(key, [...(strokes.get(key) ?? []), d])
  }
  const shapes: string[] = []
  const texts: string[] = []
  lines.forEach((line, row) => {
    let col = 0
    let run: { x: number[]; text: string; color: string; bold: boolean } | undefined
    const flush = (): void => {
      if (!run) return
      texts.push(`<text x="${run.x.join(' ')}" y="${round1(top + row * SVG_CH + SVG_CH * 0.74)}" fill="${run.color}"${run.bold ? ' font-weight="700"' : ''}>${xml(run.text)}</text>`)
      run = undefined
    }
    for (const cell of line) {
      const x = left + col * SVG_CW
      const y = top + row * SVG_CH
      const cx = x + SVG_CW / 2
      const cy = y + SVG_CH / 2
      col += cell.w
      const color = cellHex(cell)
      const ch = cell.ch
      const sides = LIGHT_SIDES[ch] ?? HEAVY_SIDES[ch]
      const isShape =
        sides !== undefined ||
        ROUND_CORNERS[ch] !== undefined ||
        '═║╔╗╚╝╤╧┄╌┆╱╲█▼▲▶◀●○◆■•·'.includes(ch) ||
        LEFT_EIGHTHS[ch] !== undefined ||
        LOW_EIGHTHS[ch] !== undefined ||
        SHADE_ALPHA[ch] !== undefined
      if (ch === ' ' || isShape) flush()
      if (ch === ' ') continue
      if (sides !== undefined) {
        const weight = HEAVY_SIDES[ch] !== undefined ? 3.2 : 1.4
        const parts: string[] = []
        if (sides.includes('L')) parts.push(`M${x},${cy}H${cx}`)
        if (sides.includes('R')) parts.push(`M${cx},${cy}H${x + SVG_CW}`)
        if (sides.includes('U')) parts.push(`M${cx},${y}V${cy}`)
        if (sides.includes('D')) parts.push(`M${cx},${cy}V${y + SVG_CH}`)
        stroke(color, weight, parts.join(''))
      } else if (ROUND_CORNERS[ch] !== undefined) {
        const [sx, sy] = ROUND_CORNERS[ch] ?? [1, 1]
        const r = SVG_CW / 2
        const edgeY = sy > 0 ? y + SVG_CH : y
        const edgeX = sx > 0 ? x + SVG_CW : x
        stroke(color, 1.4, `M${cx},${edgeY}V${cy + sy * r}Q${cx},${cy} ${cx + sx * r},${cy}H${edgeX}`)
      } else if ('═╤╧'.includes(ch)) {
        stroke(color, 1.2, `M${x},${cy - 2.5}H${x + SVG_CW}M${x},${cy + 2.5}H${x + SVG_CW}`)
        if (ch === '╤') stroke(color, 1.2, `M${cx},${cy + 2.5}V${y + SVG_CH}`)
        if (ch === '╧') stroke(color, 1.2, `M${cx},${y}V${cy - 2.5}`)
      } else if (ch === '║') {
        stroke(color, 1.2, `M${cx - 2.5},${y}V${y + SVG_CH}M${cx + 2.5},${y}V${y + SVG_CH}`)
      } else if ('╔╗╚╝'.includes(ch)) {
        const sx = '╔╚'.includes(ch) ? 1 : -1
        const sy = '╔╗'.includes(ch) ? 1 : -1
        const toX = sx > 0 ? x + SVG_CW : x
        const toY = sy > 0 ? y + SVG_CH : y
        for (const k of [-2.5, 2.5]) stroke(color, 1.2, `M${toX},${cy + k * sy}H${cx + k * sx}V${toY}`)
      } else if ('┄╌'.includes(ch)) {
        stroke(color, 1.4, `M${x + 1},${cy}h2.5M${x + 4.2},${cy}h2.5M${x + 7.4},${cy}h2`)
      } else if (ch === '┆') {
        stroke(color, 1.4, `M${cx},${y + 2}v4M${cx},${y + 8}v4M${cx},${y + 14}v4`)
      } else if (ch === '╱') {
        stroke(color, 1.4, `M${x},${y + SVG_CH}L${x + SVG_CW},${y}`)
      } else if (ch === '╲') {
        stroke(color, 1.4, `M${x},${y}L${x + SVG_CW},${y + SVG_CH}`)
      } else if (ch === '█') {
        shapes.push(`<rect x="${x}" y="${y}" width="${SVG_CW * cell.w + 0.3}" height="${SVG_CH + 0.3}" fill="${color}"/>`)
      } else if (LEFT_EIGHTHS[ch] !== undefined) {
        shapes.push(`<rect x="${x}" y="${y}" width="${round1((SVG_CW * (LEFT_EIGHTHS[ch] ?? 0)) / 8)}" height="${SVG_CH + 0.3}" fill="${color}"/>`)
      } else if (LOW_EIGHTHS[ch] !== undefined) {
        const h = (SVG_CH * (LOW_EIGHTHS[ch] ?? 0)) / 8
        shapes.push(`<rect x="${x}" y="${round1(y + SVG_CH - h)}" width="${SVG_CW + 0.3}" height="${round1(h)}" fill="${color}"/>`)
      } else if (SHADE_ALPHA[ch] !== undefined) {
        shapes.push(`<rect x="${x}" y="${y}" width="${SVG_CW + 0.3}" height="${SVG_CH + 0.3}" fill="${color}" fill-opacity="${SHADE_ALPHA[ch]}"/>`)
      } else if (ch === '▼') {
        shapes.push(`<path d="M${cx - 5},${cy - 3}H${cx + 5}L${cx},${cy + 5}Z" fill="${color}"/>`)
      } else if (ch === '▲') {
        shapes.push(`<path d="M${cx - 5},${cy + 3}H${cx + 5}L${cx},${cy - 5}Z" fill="${color}"/>`)
      } else if (ch === '▶') {
        shapes.push(`<path d="M${x + 2},${cy - 5}V${cy + 5}L${x + SVG_CW - 1},${cy}Z" fill="${color}"/>`)
      } else if (ch === '◀') {
        shapes.push(`<path d="M${x + SVG_CW - 2},${cy - 5}V${cy + 5}L${x + 1},${cy}Z" fill="${color}"/>`)
      } else if (ch === '●') {
        shapes.push(`<circle cx="${cx}" cy="${cy}" r="4.2" fill="${color}"/>`)
      } else if (ch === '○') {
        shapes.push(`<circle cx="${cx}" cy="${cy}" r="3.8" fill="none" stroke="${color}" stroke-width="1.4"/>`)
      } else if (ch === '◆') {
        shapes.push(`<path d="M${cx},${cy - 5.5}L${cx + 5},${cy}L${cx},${cy + 5.5}L${cx - 5},${cy}Z" fill="${color}"/>`)
      } else if (ch === '■') {
        shapes.push(`<rect x="${cx - 4}" y="${cy - 4}" width="8" height="8" rx="1.5" fill="${color}"/>`)
      } else if (ch === '•') {
        shapes.push(`<circle cx="${cx}" cy="${cy}" r="2.4" fill="${color}"/>`)
      } else if (ch === '·') {
        shapes.push(`<circle cx="${cx}" cy="${cy}" r="1.4" fill="${color}"/>`)
      } else {
        // Text: one run per style, every glyph placed at its own cell, so wide
        // characters keep their two columns whatever the font. Placed from the
        // left (a renderer may center a whole run, not each glyph): a monospace
        // glyph is about 0.6 em, a wide one 1 em, so each is moved in by half
        // of what its cells leave over.
        const at = round1(x + (cell.w === 2 ? (SVG_CW * 2 - MONO_SIZE) / 2 : (SVG_CW - MONO_SIZE * 0.6) / 2))
        if (run && run.color === color && run.bold === Boolean(cell.bold)) {
          run.x.push(Number(at))
          run.text += ch
        } else {
          flush()
          run = { x: [Number(at)], text: ch, color, bold: Boolean(cell.bold) }
        }
      }
    }
    flush()
  })
  const strokePaths = [...strokes.entries()].map(([key, ds]) => {
    const [color, weight] = key.split('|')
    return `<path d="${ds.join('')}" fill="none" stroke="${color}" stroke-width="${weight}" stroke-linecap="square"/>`
  })
  return {
    svg:
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">\n` +
      `<rect width="${width}" height="${height}" rx="18" fill="#17191d"/>\n` +
      `<text x="${left}" y="40" font-family="${FONT}" font-size="20" font-weight="600" fill="${hexOf('claude')}">${xml(`◆ ${title}`)}</text>\n` +
      `${strokePaths.join('\n')}\n${shapes.join('\n')}\n` +
      `<g font-family="${MONO}" font-size="${MONO_SIZE}">\n${texts.join('\n')}\n</g>\n</svg>\n`,
    width,
    height,
  }
}

// The width the card's own body takes, so its buttons can sit at its right edge.
const bodyWidth = (body: any, room: number): number => {
  try {
    return layoutTree(body, room).width
  } catch {
    return room
  }
}

// ---------------------------------------------------------------- cards

type Info = { title: string; subtitle?: string; tags: string[]; lines: string[]; quote?: string; tone: string }
type Cards = { title: string; cards: Info[] }

const readCards = (input: unknown): Cards | string => {
  const raw = record(input)
  const cards: Info[] = []
  for (const one of items(raw.cards).slice(0, 9)) {
    const card = record(one)
    const title = words(card.title ?? card.name, 50)
    if (title === undefined) continue
    cards.push({
      title,
      subtitle: words(card.subtitle, 70),
      tags: wordList(card.tags, 5, 18),
      lines: wordList(card.lines, 6, 90),
      quote: words(card.quote, 160),
      tone: pick(card.tone, ['good', 'bad', 'warn', 'plain'] as const, 'plain'),
    })
  }
  if (cards.length === 0) return 'cards is empty: each needs a title'

  return { title: words(raw.title, 80) ?? 'Cards', cards }
}

const drawCards = (ui: UI, cards: Cards, room: number): any => {
  const width = clamp(Math.floor(room / Math.min(cards.cards.length, 3)) - 1, 24, 46)

  return (
    <ui.Box flexDirection="row" flexWrap="wrap" columnGap={1}>
      {cards.cards.map((card, index) => {
        const color = card.tone === 'plain' ? tint(index) : (TONES[card.tone] ?? 'text')

        return (
          <ui.Box borderStyle="round" borderColor={color} flexDirection="column" paddingX={1} width={width}>
            <ui.Text bold color={color} wrap="truncate-end">
              {card.title}
            </ui.Text>
            {card.subtitle !== undefined && (
              <ui.Text dimColor wrap="wrap">
                {card.subtitle}
              </ui.Text>
            )}
            {card.tags.length > 0 && (
              <ui.Text color="suggestion" wrap="truncate-end">
                {card.tags.map(tag => `#${tag}`).join(' ')}
              </ui.Text>
            )}
            {card.lines.map(line => (
              <ui.Box flexDirection="row" columnGap={1}>
                <ui.Text color={color}>•</ui.Text>
                <ui.Text wrap="wrap">{line}</ui.Text>
              </ui.Box>
            ))}
            {card.quote !== undefined && (
              <ui.Text italic dimColor wrap="wrap">
                {`“${card.quote}”`}
              </ui.Text>
            )}
          </ui.Box>
        )
      })}
    </ui.Box>
  )
}

// ---------------------------------------------------------------- compare

type Option = { name: string; summary?: string; pros: string[]; cons: string[]; effort?: string; isRecommended: boolean }
type Comparison = { title: string; options: Option[]; verdict?: string; isAsking: boolean }

const readComparison = (input: unknown): Comparison | string => {
  const raw = record(input)
  const options: Option[] = []
  for (const one of items(raw.options).slice(0, 4)) {
    const option = record(one)
    const name = words(option.name, 40)
    if (name === undefined) continue
    options.push({
      name,
      summary: words(option.summary, 120),
      pros: wordList(option.pros, 4, 80),
      cons: wordList(option.cons, 4, 80),
      effort: words(option.effort, 40),
      isRecommended: option.isRecommended === true,
    })
  }
  if (options.length < 2) return 'options needs at least two entries, each with a name'

  return {
    title: words(raw.question, 100) ?? 'Options',
    options,
    verdict: words(raw.verdict, 200),
    isAsking: raw.isAsking !== false,
  }
}

const drawComparison = (ui: UI, comparison: Comparison, room: number): any => {
  const width = clamp(Math.floor(room / comparison.options.length) - 1, 24, 44)
  const point = (mark: string, color: string, text: string): any => (
    <ui.Box flexDirection="row" columnGap={1}>
      <ui.Text color={color}>{mark}</ui.Text>
      <ui.Text color={color} wrap="wrap">
        {text}
      </ui.Text>
    </ui.Box>
  )

  return [
    <ui.Box flexDirection="row" flexWrap="wrap" columnGap={1}>
      {comparison.options.map(option => (
        <ui.Box
          borderStyle={option.isRecommended ? 'bold' : 'round'}
          borderColor={option.isRecommended ? 'success' : 'inactive'}
          flexDirection="column"
          paddingX={1}
          width={width}
        >
          <ui.Text bold color={option.isRecommended ? 'success' : 'text'} wrap="truncate-end">
            {option.isRecommended ? `★ ${option.name}` : option.name}
          </ui.Text>
          {option.summary !== undefined && (
            <ui.Text dimColor wrap="wrap">
              {option.summary}
            </ui.Text>
          )}
          {option.pros.map(text => point('+', 'success', text))}
          {option.cons.map(text => point('−', 'error', text))}
          {option.effort !== undefined && (
            <ui.Text dimColor wrap="truncate-end">
              {`≈ ${option.effort}`}
            </ui.Text>
          )}
        </ui.Box>
      ))}
    </ui.Box>,
    comparison.verdict !== undefined && (
      <ui.Box flexDirection="row" columnGap={1}>
        <ui.Text bold color="success">
          →
        </ui.Text>
        <ui.Text wrap="wrap">{comparison.verdict}</ui.Text>
      </ui.Box>
    ),
  ]
}

// ---------------------------------------------------------------- the tools

const text = (description?: string): Record<string, unknown> =>
  description === undefined ? { type: 'string' } : { type: 'string', description }
const list = (of: Record<string, unknown>, description?: string): Record<string, unknown> =>
  description === undefined ? { type: 'array', items: of } : { type: 'array', items: of, description }
const shape = (properties: Record<string, unknown>, required: string[] = []): Record<string, unknown> => ({
  type: 'object',
  properties,
  required,
})
const TONE = { type: 'string', enum: ['good', 'bad', 'warn', 'plain'] }
const SEEN = 'The person sees the card, not this result: do not repeat it in text. Keep every label short.'

type Kind = {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  // Reads the input: a string is the reason it cannot be drawn.
  read: (input: unknown) => any
  draw: (ui: UI, model: any, room: number, played: number) => any
  summary: (model: any) => string
  isAnimated?: boolean
}

const KINDS: Kind[] = [
  {
    name: 'diagram',
    description: `Draws nodes and arrows as a diagram laid out top to bottom: system architecture, data or user flows, dependencies, processes, org charts. Call it in place of describing structure in paragraphs. Edges may branch, merge, skip layers and loop back; the wires leaving a node travel together in its color. A node's group gives it a color and its shape says what it is. An edge from a node to itself is drawn as a loop inside it, so state machines work: states as round nodes, transitions as labelled edges. Up to 28 nodes; a layer wider than about 6 nodes gets cramped, so prefer depth. ${SEEN}`,
    inputSchema: shape(
      {
        title: text(),
        nodes: list(
          shape({ id: text('short key the edges use'), label: text(), note: text('one short phrase'), group: text('color group: Client, API, Data'), shape: { type: 'string', enum: [...SHAPES], description: 'box (default), round (a start, an end, a state), decision (a branch point), store (a database or queue), external (outside the system), person (a user or role)' } }, ['id', 'label']),
        ),
        edges: list(shape({ from: text('node id'), to: text('node id'), label: text('what travels, one or two words') }, ['from', 'to'])),
        notes: list(text(), 'key decisions or risks, 4 at most'),
        numbers: { type: 'boolean', description: 'number the nodes and mark each arrow with the numbers of its sources; off by default' },
        layout: { type: 'string', enum: ['flow', 'zones', 'matrix'], description: 'flow (default): boxes and wires. zones: each group is a framed band, stacked in the order the groups first appear, for boundaries such as a VPC, a subsystem or a C4 container view. matrix: a grid of who depends on whom, for dependencies too dense for wires' },
      },
      ['title', 'nodes', 'edges'],
    ),
    read: readGraph,
    draw: (ui, graph, room) => drawDiagram(ui, graph, room),
    summary: (graph: Graph) =>
      `diagram "${graph.title}", ${graph.nodes.length} nodes, ${graph.edges.length} edges${graph.dropped > 0 ? `; ${graph.dropped} edges left out (unknown node id, a duplicate, or a node to itself)` : ''}`,
  },
  {
    name: 'layers',
    description: `Draws the block picture of an architecture: bands stacked top to bottom (Clients, Gateway, Services, Data, Infrastructure), each holding components as blocks, optionally gathered into named zones that may hold zones of their own (region, availability zone, subnet: a deployment topology), with cross-cutting concerns (security, monitoring, CI/CD) standing beside every band. Use it for a tech stack, a platform or capability map, a layered system overview: what exists and where it sits. For how things connect, use diagram. Up to 8 layers. ${SEEN}`,
    inputSchema: shape(
      {
        title: text(),
        layers: list(
          shape({ name: text(), items: list(text(), 'components directly in this layer'), zones: list(shape({ name: text(), items: list(text()), zones: list({ type: 'object' }, 'zones inside this one, same shape, up to 3 deep') }, ['name']), 'named groups inside the layer, 5 at most') }, ['name']),
          'top (what people touch) to bottom (infrastructure)',
        ),
        sides: list(shape({ name: text(), items: list(text()) }, ['name']), 'concerns that cut across all layers, 3 at most'),
        notes: list(text(), 'decisions or risks, 4 at most'),
      },
      ['title', 'layers'],
    ),
    read: readLayers,
    draw: (ui, layers, room) => drawLayers(ui, layers, room),
    summary: (layers: Layers) => `layers "${layers.title}", ${layers.bands.length} layers`,
  },
  {
    name: 'schema',
    description: `Draws a data model or a class diagram: each entity is a box with its fields listed under its name, and relations are wires between boxes. For database tables and their keys (an ER diagram), domain models, classes or components with their members. Mark a field's key as pk or fk; put the cardinality (1:1, 1:N, N:N) or the kind of link (extends, uses) on the relation. Up to 14 entities of 14 fields. ${SEEN}`,
    inputSchema: shape(
      {
        title: text(),
        entities: list(
          shape({ name: text(), note: text(), group: text('color group'), fields: list(shape({ name: text(), type: text(), key: { type: 'string', enum: ['pk', 'fk'] } }, ['name']), 'fields of a table, or members of a class') }, ['name', 'fields']),
        ),
        relations: list(shape({ from: text('entity name'), to: text('entity name'), kind: text('1:1, 1:N, N:N, extends, uses'), label: text() }, ['from', 'to'])),
        notes: list(text()),
      },
      ['title', 'entities'],
    ),
    read: readSchema,
    draw: (ui, graph, room) => drawDiagram(ui, graph, room),
    summary: (graph: Graph) => `schema "${graph.title}", ${graph.nodes.length} entities, ${graph.edges.length} relations`,
  },
  {
    name: 'swimlane',
    description: `Draws a process as swimlanes: one lane per role, team or system, the steps left to right in the order they happen, each in the lane of whoever does it, so every handover shows. Up to 6 lanes and 10 steps. A step flows to the next one unless next names other steps. ${SEEN}`,
    inputSchema: shape(
      {
        title: text(),
        lanes: list(text(), 'top to bottom'),
        steps: list(shape({ id: text(), label: text('two or three words'), lane: text('one of lanes'), next: list(text(), 'ids of later steps it leads to, when not simply the next one') }, ['label', 'lane']), 'in time order'),
      },
      ['title', 'lanes', 'steps'],
    ),
    read: readSwimlane,
    draw: (ui, swim, room) => drawSwimlane(ui, swim, room),
    summary: (swim: Swimlane) => `swimlane "${swim.title}", ${swim.lanes.length} lanes, ${swim.steps.length} steps`,
  },
  {
    name: 'pipeline',
    description: `Draws stages left to right, each a column of jobs, every stage feeding the next: CI/CD pipelines, ETL and data flows, build or release steps, any process that reads as "then". A job may carry a status. Up to 7 stages of 6 jobs. ${SEEN}`,
    inputSchema: shape(
      {
        title: text(),
        stages: list(shape({ name: text(), jobs: list(shape({ label: text(), status: { type: 'string', enum: ['done', 'doing', 'todo', 'risk'] } }, ['label'])) }, ['name', 'jobs'])),
        labels: shape({ done: text(), doing: text(), todo: text(), risk: text() }),
      },
      ['title', 'stages'],
    ),
    read: readPipeline,
    draw: (ui, pipeline, room) => drawPipeline(ui, pipeline, room),
    summary: (pipeline: Pipeline) => `pipeline "${pipeline.title}", ${pipeline.stages.length} stages`,
  },
  {
    name: 'gitgraph',
    description: `Draws branches as lanes over time: commits, where a branch forks, where it merges back, and tags. For a branching strategy, a release flow, the history of a feature. branches go top to bottom, the first being the trunk; events are in time order. Up to 6 branches and 24 events. ${SEEN}`,
    inputSchema: shape(
      {
        title: text(),
        branches: list(shape({ name: text(), from: text('the branch it forks from; the trunk when left out') }, ['name'])),
        events: list(shape({ branch: text(), label: text('a few words'), merge: text('a branch merged into this one at this commit'), tag: text('v1.2') }, ['branch']), 'in time order'),
      },
      ['title', 'branches', 'events'],
    ),
    read: readGitGraph,
    draw: (ui, git, room) => drawGitGraph(ui, git, room),
    summary: (git: GitGraph) => `gitgraph "${git.title}", ${git.branches.length} branches, ${git.events.length} events`,
  },
  {
    name: 'sequence',
    description: `Draws a sequence diagram: actors across the top, messages between them in order. For request flows, protocols, handoffs between people or teams. Up to 7 actors and 24 messages. ${SEEN}`,
    inputSchema: shape(
      {
        title: text(),
        actors: list(text(), 'left to right'),
        messages: list(shape({ from: text(), to: text(), label: text(), isReply: { type: 'boolean', description: 'a dashed return arrow' } }, ['from', 'to', 'label'])),
      },
      ['title', 'actors', 'messages'],
    ),
    read: readSequence,
    draw: (ui, sequence, room) => drawSequence(ui, sequence, room),
    summary: (sequence: Sequence) => `sequence "${sequence.title}", ${sequence.actors.length} actors, ${sequence.messages.length} messages`,
  },
  {
    name: 'tree',
    description: `Draws a hierarchy as a tree: sitemaps, goal breakdowns (OKRs), mind maps, file layouts, taxonomies, topic outlines. Up to 90 nodes. ${SEEN}`,
    inputSchema: shape(
      {
        title: text(),
        layout: { type: 'string', enum: ['list', 'mindmap'], description: 'list (default): an indented outline. mindmap: branches spreading to the right' },
        root: shape({ label: text(), note: text(), children: list({ type: 'object' }, 'nodes of the same shape: { label, note, children }') }, ['label']),
      },
      ['title', 'root'],
    ),
    read: readTree,
    draw: (ui, tree, room) => drawTree(ui, tree, room),
    summary: (tree: Tree) => `tree "${tree.title}", ${tree.count} nodes`,
  },
  {
    name: 'timeline',
    description: `Draws bars over periods: roadmaps, gantt schedules, project phases, study plans. periods are the column labels in order; each item spans from one period to another. ${SEEN}`,
    inputSchema: shape(
      {
        title: text(),
        periods: list(text(), 'in order: Q1, Q2 or W1, W2 or Jan, Feb; 18 at most'),
        items: list(
          shape({ name: text(), from: text('a period label'), to: text('a period label'), status: { type: 'string', enum: ['done', 'doing', 'todo', 'risk'] }, group: text('a heading above consecutive items') }, ['name', 'from', 'to']),
        ),
        milestones: list(shape({ name: text(), at: text('a period label') }, ['name', 'at'])),
        labels: shape({ done: text(), doing: text(), todo: text(), risk: text() }),
      },
      ['title', 'periods', 'items'],
    ),
    read: readTimeline,
    draw: drawTimeline,
    summary: (timeline: Timeline) => `timeline "${timeline.title}", ${timeline.tasks.length} items over ${timeline.periods.length} periods`,
    isAnimated: true,
  },
  {
    name: 'board',
    description: `Draws columns of cards: kanban, backlog by status, now/next/later, ideas by theme. Up to 6 columns of 8 cards. ${SEEN}`,
    inputSchema: shape(
      {
        title: text(),
        columns: list(shape({ name: text(), cards: list(shape({ title: text(), meta: text('owner, size or tag') }, ['title'])) }, ['name', 'cards'])),
      },
      ['title', 'columns'],
    ),
    read: readBoard,
    draw: (ui, board, room) => drawBoard(ui, board, room),
    summary: (board: Board) => `board "${board.title}", ${board.columns.length} columns`,
  },
  {
    name: 'quadrant',
    description: `Draws a 2x2. With items it plots each on two axes (impact vs effort, value vs risk, positioning maps). With areas that hold points and no items it draws four lists (SWOT, do/delegate/defer/drop). areas go top-left, top-right, bottom-left, bottom-right. ${SEEN}`,
    inputSchema: shape(
      {
        title: text(),
        xLow: text('the left end of the x axis'),
        xHigh: text(),
        yLow: text('the bottom end of the y axis'),
        yHigh: text(),
        areas: list(shape({ name: text(), points: list(text()) }), 'four, in order TL, TR, BL, BR'),
        items: list(shape({ name: text(), x: { type: 'number', description: '0 (left) to 1 (right)' }, y: { type: 'number', description: '0 (bottom) to 1 (top)' } }, ['name', 'x', 'y'])),
      },
      ['title'],
    ),
    read: readQuadrant,
    draw: (ui, quadrant, room) => drawQuadrant(ui, quadrant, room),
    summary: (quadrant: Quadrant) => `quadrant "${quadrant.title}", ${quadrant.points.length > 0 ? `${quadrant.points.length} items plotted` : 'four lists'}`,
  },
  {
    name: 'journey',
    description: `Draws a journey map: stages left to right with a mood curve, and rows of notes under each stage (what they do, pain points, opportunities). For user journeys, service blueprints, onboarding, research synthesis. Up to 7 stages and 5 rows. ${SEEN}`,
    inputSchema: shape(
      {
        title: text(),
        who: text('the persona or scenario, one line'),
        moodLabel: text('the word for the mood row'),
        stages: list(shape({ name: text(), mood: { type: 'number', description: '1 (worst) to 5 (best)' } }, ['name', 'mood'])),
        rows: list(shape({ name: text('row label: Actions, Pain, Ideas'), tone: TONE, cells: list(text(), 'one short cell per stage, in order') }, ['name', 'cells'])),
      },
      ['title', 'stages'],
    ),
    read: readJourney,
    draw: drawJourney,
    summary: (journey: Journey) => `journey "${journey.title}", ${journey.stages.length} stages, ${journey.rows.length} rows`,
    isAnimated: true,
  },
  {
    name: 'wireframe',
    description: `Draws a low-fidelity wireframe of a screen from nested rows and columns of boxes. For page layouts, app screens, dashboards, before any real design. A container is { type: "row" | "column", children, size }; a leaf is { kind, label, size, lines } with kind one of heading, text, image, button, input, nav, list, label. size is a share of the row's width. Up to 48 boxes. ${SEEN}`,
    inputSchema: shape(
      {
        title: text(),
        device: { type: 'string', enum: ['desktop', 'mobile'] },
        screen: shape({ type: { type: 'string', enum: ['row', 'column'] }, children: list({ type: 'object' }, 'containers and leaves, nested') }, ['children']),
      },
      ['title', 'screen'],
    ),
    read: readWireframe,
    draw: (ui, wireframe, room) => drawWireframe(ui, wireframe, room),
    summary: (wireframe: Wireframe) => `wireframe "${wireframe.title}", ${wireframe.count} boxes`,
  },
  {
    name: 'metrics',
    description: `Draws number tiles: a label, a big value, the change, and a small trend line from series. For KPIs, experiment results, a status snapshot. Up to 8 tiles. ${SEEN}`,
    inputSchema: shape(
      {
        title: text(),
        tiles: list(
          shape({ label: text(), value: text('as shown: 12.4k, 38%, $1.2M'), delta: text('as shown: ▲ 12% vs last week'), tone: TONE, series: list({ type: 'number' }, 'recent values, oldest first'), note: text() }, ['label', 'value']),
        ),
      },
      ['title', 'tiles'],
    ),
    read: readMetrics,
    draw: drawMetrics,
    summary: (metrics: Metrics) => `metrics "${metrics.title}", ${metrics.tiles.length} tiles`,
    isAnimated: true,
  },
  {
    name: 'chart',
    description: `Draws one chart from numbers you already have. kind: bar (categories, horizontal), column (categories, vertical), stacked (parts per category), line (series over an ordered x), scatter (points: x against y), heatmap (series are rows, labels are columns), histogram (one series of raw values, binned), funnel (steps that shrink), share (parts of one whole). labels name the categories or x positions; series hold the numbers in the same order. Never invent numbers to fill a chart. ${SEEN}`,
    inputSchema: shape(
      {
        kind: { type: 'string', enum: [...CHART_KINDS] },
        style: { type: 'string', enum: ['text', 'image'], description: 'image draws line, scatter, column and histogram plots as a real picture where the terminal shows images; text (default) everywhere' },
        title: text(),
        unit: text('ms, %, $: appended to values'),
        labels: list(text()),
        series: list(shape({ name: text(), values: list({ type: 'number' }) }, ['values'])),
        points: list(shape({ x: { type: 'number' }, y: { type: 'number' } }, ['x', 'y']), 'scatter only'),
        xLabel: text('scatter only'),
        yLabel: text('scatter only'),
        bins: { type: 'number', description: 'histogram only' },
      },
      ['kind', 'title'],
    ),
    read: readChart,
    draw: drawChart,
    summary: (chart: Chart) => `${chart.kind} chart "${chart.title}"`,
    isAnimated: true,
  },
  {
    name: 'cards',
    description: `Draws titled cards side by side: personas, research findings with a quote, feature summaries, principles, risks. Up to 9 cards. ${SEEN}`,
    inputSchema: shape(
      {
        title: text(),
        cards: list(shape({ title: text(), subtitle: text(), tags: list(text()), lines: list(text(), 'short bullet points, 6 at most'), quote: text('a verbatim quote'), tone: TONE }, ['title'])),
      },
      ['title', 'cards'],
    ),
    read: readCards,
    draw: (ui, cards, room) => drawCards(ui, cards, room),
    summary: (cards: Cards) => `${cards.cards.length} cards "${cards.title}"`,
  },
  {
    name: 'compare',
    description: `Draws two to four options as side-by-side cards with pros, cons and the recommended one marked, then has the person pick one in a dialog under the cards; the result says which they picked. Call it when the person has to weigh a choice, and do not ask the same question again in text or with another question tool. ${SEEN}`,
    inputSchema: shape(
      {
        question: text('the decision, as a short question'),
        options: list(
          shape({ name: text(), summary: text('one line: what choosing it means'), pros: list(text()), cons: list(text()), effort: text('cost or effort in a few words'), isRecommended: { type: 'boolean' } }, ['name']),
          '2 to 4',
        ),
        verdict: text('one line: which and why'),
        isAsking: { type: 'boolean', description: 'false: only draw, no dialog, for a comparison that needs no decision now' },
      },
      ['question', 'options'],
    ),
    read: readComparison,
    draw: (ui, comparison, room) => drawComparison(ui, comparison, room),
    summary: (comparison: Comparison) => `${comparison.options.length} options`,
  },
]

const KIND_OF = new Map(KINDS.map(kind => [toolOf(kind.name), kind]))
const COMPARE = toolOf('compare')

const GUIDE = [
  '# Visual answers (sketch mod)',
  'The person reads in a terminal and finds long paragraphs hard to follow. Whenever the content has a shape, draw the shape with a sketch tool and keep the text around it to a line or two. This holds for any field: engineering, product, design, research, planning.',
  `- What a system is made of (layers of components, zones, cross-cutting concerns): ${toolOf('layers')}. How things connect (architecture wiring, a flow or process with decisions, dependencies, a pipeline): ${toolOf('diagram')}, with layout "zones" to frame subsystems or boundaries and "matrix" when dependencies are dense; a state machine is a diagram too. Tables and their relations, or classes and their members: ${toolOf('schema')}. A process across roles or systems: ${toolOf('swimlane')}. Stages left to right (CI/CD, ETL, a data flow): ${toolOf('pipeline')}. Branches, merges and releases: ${toolOf('gitgraph')}. Who calls whom in order: ${toolOf('sequence')}. A hierarchy, breakdown or mind map: ${toolOf('tree')}.`,
  `- A plan over time, a roadmap or schedule: ${toolOf('timeline')}. Work by status or theme: ${toolOf('board')}.`,
  `- Prioritising on two axes, positioning, SWOT: ${toolOf('quadrant')}. A user journey or service blueprint: ${toolOf('journey')}. A screen or page layout: ${toolOf('wireframe')}.`,
  `- Numbers: ${toolOf('chart')} (bar, column, stacked, line, scatter, heatmap, histogram, funnel, share); a handful of headline numbers: ${toolOf('metrics')}.`,
  `- Personas, findings, principles, feature summaries: ${toolOf('cards')}. A choice between two to four options: ${COMPARE}, which also asks the person to pick; act on what its result says and do not ask again in text.`,
  '- A plain list of facts or a small comparison with no better shape: a markdown table.',
  'The person sees the card, not the tool result, so never repeat a card in text. Keep labels short: a card is for scanning, and detail belongs in a follow-up when asked. Draw only what is true: no invented numbers, nodes or quotes to fill a card.',
].join('\n')

// Which node each diagram card has focused, by tool_use_id (see types/).
// The tag changes when the value's meaning does, so old values are dropped.
const picked = atom({ plugin: 'sketch', key: 'picked' } as const, {} as Picked, { shape: 'picked-1' })

// The pulse along focused wires steps on this tick; it runs for FLOW_MS after
// the last click, then stops, so a card left focused stops redrawing.
const tick = atom({ plugin: 'sketch', key: 'tick' } as const, 0)
const FLOW_MS = 30_000
let lastPress = 0

// How far each running card's entrance has played, 0 to 1, by tool_use_id.
const entrances = new Map<string, number>()
// About a second and a quarter: redraws of a transcript row come at most ten
// a second, so each step gets one.
const STEPS = 12

const roomOf = (columns: number | undefined): number => Math.max(40, Math.min(columns ?? 100, 150) - 6)

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    $.clock.every(150, () => {
      if (Date.now() - lastPress < FLOW_MS + 300) void update($, tick, n => ((n ?? 0) + 1) % 600)
    })
    for (const kind of KINDS) {
      await $.tool.register({
        name: kind.name,
        description: kind.description,
        inputSchema: kind.inputSchema,
        isDeferred: false,
      })
    }

    return next(e)
  })

  for (const kind of KINDS) {
    const tool = toolOf(kind.name)
    on('tool.call', { tool }, async ($: any, e: any, next: any) => {
      const model = kind.read(e)
      if (typeof model === 'string') return { deny: model }
      const drawn = `Drawn for the person: ${kind.summary(model)}.`

      if (kind.isAnimated === true && (next?.budget?.remainingMs ?? 0) > 4000) {
        const id = String(e.tool_use_id)
        entrances.set(id, 0.04)
        try {
          for (let frame = 1; frame <= STEPS; frame++) {
            const at = frame / (STEPS + 1)
            entrances.set(id, 1 - (1 - at) * (1 - at))
            $.ui.invalidate('ui.render')
            await $.clock.sleep(100)
          }
        } catch {
          // An entrance that cannot play is skipped: the card draws whole.
        }
        entrances.delete(id)
        $.ui.invalidate('ui.render')
      }

      if (tool !== COMPARE || !model.isAsking) return { result: `${drawn} Do not repeat it in text.` }

      // Cards in a transcript cannot be pressed, so the pick is made in the
      // engine's own dialog under them: arrow keys and Enter, recommended first.
      const comparison = model as Comparison
      const labelOf = (option: Option): string => (option.isRecommended ? `${option.name} ★` : option.name)
      const ordered = [
        ...comparison.options.filter(option => option.isRecommended),
        ...comparison.options.filter(option => !option.isRecommended),
      ]
      let answer: string | undefined
      try {
        answer = await $.ui.ask(comparison.title, { options: ordered.map(labelOf) })
      } catch {
        answer = undefined
      }
      if (answer === undefined) {
        return {
          result: `${drawn} The person closed the dialog without picking. Do not repeat the cards; ask in one line what they want, and change nothing until they say.`,
        }
      }
      const chosen = ordered.find(option => labelOf(option) === answer)

      return {
        result: chosen
          ? `${drawn} The person picked "${chosen.name}" in the dialog. Act on that choice; do not repeat the cards.`
          : `${drawn} The person picked none of them and answered in their own words: "${answer.slice(0, 500)}". Follow that; do not repeat the cards.`,
      }
    }).catch(() => ({ deny: `sketch could not draw this ${kind.name}: check the input against the tool's schema` }))
  }

  // The first version's tool, kept answering so a call made from habit says where to go.
  on('tool.call', { tool: toolOf('architecture') }, async () => ({
    deny: `architecture is now ${toolOf('diagram')}: nodes [{ id, label, note, group }] and edges [{ from, to, label }]`,
  })).catch(() => ({ deny: `use ${toolOf('diagram')}` }))

  on('prompt.compose', async (_$, e, next) => {
    const composed = await next(e)

    return {
      sections: [
        ...composed.sections.filter(section => section.id !== 'sketch:visual-answers'),
        { id: 'sketch:visual-answers', text: GUIDE, scope: 'session' },
      ],
    }
  })

  on('ui.render', { component: 'ToolUse' }, async ($: any, e: any, next: any) => {
    const kind = KIND_OF.get(e.props.tool)
    if (!kind) return next(e)
    // ctrl+o and --verbose show the call as the engine draws it.
    if (e.props.isExpanded === true || e.props.isErrored === true) return next(e)
    const model = kind.read(e.props.input)
    if (typeof model === 'string') return next(e)

    const ui: UI = $.ui.resolve(e)
    const card = String(e.props.tool_use_id ?? '')
    // Every read before any module-wide setting, so two cards drawn at once
    // never mix: from here to the end the draw runs without yielding.
    const focused = (await read($, picked))[card]
    const phase = focused !== undefined && Date.now() - lastPress < FLOW_MS ? await read($, tick) : undefined
    scopeBase = `sk${card.slice(-20)}`
    details = []
    focusNode = focused
    flowPhase = phase
    pressNode = node => {
      lastPress = Date.now()
      void update($, picked, all => {
        const chosen = { ...all }
        if (chosen[card] === node) delete chosen[card]
        else chosen[card] = node
        // Only the last few cards keep a focus.
        const keys = Object.keys(chosen)
        for (const old of keys.slice(0, Math.max(0, keys.length - 40))) delete chosen[old]

        return chosen
      })
    }
    // While the call's own hook plays the entrance, the row reports the call
    // as not yet running, so the entrance is found by the call's id instead.
    const played = kind.isAnimated === true ? (entrances.get(String(e.props.tool_use_id)) ?? 1) : 1

    const room = roomOf(e.viewport?.columns)
    const body = kind.draw(ui, model, room, played)
    if (ui.Button === undefined) return frameOf(ui, model.title, body)
    // A picture chart is drawn again from its numbers; any other card as laid out.
    const isPictureChart = kind.name === 'chart' && model.style === 'image' && IMAGE_KINDS.includes(model.kind)
    const save = (isCopy: boolean): void => {
      void exportSvg($, isPictureChart ? chartSvg(model) : cardSvg(model.title, body, room), model.title, isCopy)
    }
    const actions = (
      <ui.Box flexDirection="row" columnGap={2}>
        <ui.Button key={scopeOf('copy')} plain dimColor onPress={() => save(true)}>
          ⧉ Copy image
        </ui.Button>
        <ui.Button key={scopeOf('save')} plain dimColor onPress={() => save(false)}>
          ⤓ Save PNG
        </ui.Button>
      </ui.Box>
    )
    const titleWidth = widthOf(`◆ ${model.title}`) + 28
    return frameOf(ui, model.title, body, actions, Math.min(room, Math.max(titleWidth, bodyWidth(body, room))))
  })

  // The result is written for the model; under a drawn card it is noise.
  on('ui.render', { component: 'ToolResult' }, async ($: any, e: any, next: any) => {
    if (!KIND_OF.has(e.props.tool) || e.props.isErrored === true || e.props.isExpanded === true) return next(e)
    const ui: UI = $.ui.resolve(e)

    return <ui.Box />
  })
}
