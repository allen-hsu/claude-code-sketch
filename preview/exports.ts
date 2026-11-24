// Presses Save PNG on two sample cards, as a person would, and copies the
// pictures it writes into docs/images: what Copy image puts on the clipboard.
// Needs rsvg-convert (or macOS's sips) like the button itself.
// usage: bun --jsx-factory=h --jsx-fragment=Fragment --jsx-runtime=classic exports.ts ../hooks/register.tsx ./samples.en.ts ../docs/images/en
import { mkdtempSync, readdirSync, copyFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadMod } from './render.ts'

const [modPath, samplesPath, outDir] = process.argv.slice(2)
// The button saves under $HOME/Downloads/sketch: here a throwaway home.
const home = mkdtempSync(join(tmpdir(), 'sketch-export-'))
const $ = {
  ui: { resolve: () => ({ Box: 'Box', Text: 'Text', Button: 'Button', Image: 'Image' }), toast: (text: string) => console.log(text), invalidate: () => undefined },
  env: { get: async (key: string) => (key === 'HOME' ? home : undefined) },
  fs: { write: async (path: string, text: string) => void (await Bun.write(path, text)) },
  process: {
    run: async (argv: string[]) => {
      const done = Bun.spawnSync(argv)
      return { exitCode: done.exitCode, stdout: '', stderr: '' }
    },
  },
}
const hooks = await loadMod(modPath!)
const render = hooks.find(hook => hook.event === 'ui.render' && hook.matcher?.component === 'ToolUse')!.fn
const samples: Record<string, any[]> = (await import(samplesPath!)).samples

const shots: [string, string, any][] = [
  ['export-chart', 'chart', { ...samples.chart!.find((one: { kind: string }) => one.kind === 'line'), style: 'image' }],
  ['export-diagram', 'diagram', samples.diagram![0]],
]
for (const [name, tool, input] of shots) {
  const tree = await render($, { props: { tool: `mcp__sketch__${tool}`, input, isRunning: false, tool_use_id: name }, viewport: { columns: 110 } }, async () => undefined)
  let save: any
  const walk = (node: any) => {
    if (!node || typeof node !== 'object') return
    if (node.type === 'Button' && String(node.props?.key).endsWith('-save')) save = node
    node.children?.forEach(walk)
  }
  walk(tree)
  const before = new Set(safeList(join(home, 'Downloads', 'sketch')))
  save.props.onPress()
  for (let tries = 0; tries < 50; tries++) {
    const made = safeList(join(home, 'Downloads', 'sketch')).find(file => file.endsWith('.png') && !before.has(file))
    if (made) {
      copyFileSync(join(home, 'Downloads', 'sketch', made), join(outDir!, `${name}.png`))
      break
    }
    await Bun.sleep(200)
  }
}

function safeList(dir: string): string[] {
  try {
    return readdirSync(dir)
  } catch {
    return []
  }
}
