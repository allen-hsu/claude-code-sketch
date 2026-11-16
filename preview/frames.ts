// Renders the frames of the README's animations, for paint.py to turn into GIFs:
//   interaction: a diagram at rest, hovered on two nodes, then clicked on two
//                nodes with the pulse running along the focused wires
//   entrance:    a chart drawing itself in while its call runs
// usage: bun --jsx-factory=h --jsx-fragment=Fragment --jsx-runtime=classic frames.ts ../hooks/register.tsx 110 ./samples.en.ts out
//        then: python3 paint.py out-interaction.frames.json interaction.gif (and the same for entrance)
import { cellsOf, engine, layout, loadMod, stateFor } from './render.ts'

const [modPath, columnsArg, samplesPath, outBase] = process.argv.slice(2)
const columns = Number(columnsArg ?? 110)
// The pulse runs for a while after the last click; the clock is held at the
// start of that while, so every frame shows it running.
Date.now = () => 1000

const hooks = await loadMod(modPath!)
const samples: Record<string, any[]> = (await import(samplesPath!)).samples
const render = hooks.find(hook => hook.event === 'ui.render' && hook.matcher?.component === 'ToolUse')!.fn
const callOf = (tool: string) => hooks.find(hook => hook.event === 'tool.call' && hook.matcher?.tool === tool)!.fn
const CARD = 't'
const scope = (node: number) => `sk${CARD}-${node}`

const draw = async (tool: string, input: unknown, isRunning = false) => {
  const tree = await render(engine, { props: { tool, input, isRunning, tool_use_id: CARD }, viewport: { columns } }, async () => undefined)
  const block = layout(tree, columns)
  return { lines: cellsOf(block.lines.slice(block.lines[0]?.length === 0 ? 1 : 0)) }
}

// The interaction: hover two nodes, then click two, the pulse stepping on.
const diagram = samples['diagram#interactive']![0]
const tool = 'mcp__sketch__diagram'
const nodeAt = (id: string) => diagram.nodes.findIndex((node: { id: string }) => node.id === id)
const [hoverA, hoverB] = [nodeAt(diagram.demo.hover[0]), nodeAt(diagram.demo.hover[1])]
const [clickA, clickB] = [nodeAt(diagram.demo.click[0]), nodeAt(diagram.demo.click[1])]
const interaction: { card: unknown; ms: number; lit?: string }[] = []
const rest = await draw(tool, diagram)
interaction.push({ card: rest, ms: 1400 })
interaction.push({ card: rest, ms: 1100, lit: scope(hoverA) })
interaction.push({ card: rest, ms: 1100, lit: scope(hoverB) })
for (const [node, cycles] of [
  [clickA, 3],
  [clickB, 3],
] as const) {
  stateFor.picked = { [CARD]: node }
  for (let tick = 0; tick < cycles * 6; tick++) {
    stateFor.tick = tick
    interaction.push({ card: await draw(tool, diagram), ms: 140 })
  }
}
delete stateFor.picked
interaction.push({ card: rest, ms: 900 })
await Bun.write(`${outBase}-interaction.frames.json`, JSON.stringify(interaction))

// The entrance: the chart's call runs, and each step of it is a frame.
const chart = samples.chart!.find((one: { kind: string }) => one.kind === 'line')
const chartTool = 'mcp__sketch__chart'
const entrance: { card: unknown; ms: number }[] = [{ card: await draw(chartTool, chart, true), ms: 500 }]
const stepping = {
  ...engine,
  clock: {
    sleep: async () => {
      entrance.push({ card: await draw(chartTool, chart, true), ms: 90 })
    },
  },
  ui: { ...engine.ui, invalidate: () => undefined },
}
await callOf(chartTool)(stepping, { tool: chartTool, tool_use_id: CARD, ...chart }, { budget: { remainingMs: 10_000 } })
entrance.push({ card: await draw(chartTool, chart), ms: 2200 })
await Bun.write(`${outBase}-entrance.frames.json`, JSON.stringify(entrance))

console.log(`${interaction.length} interaction frames, ${entrance.length} entrance frames`)
