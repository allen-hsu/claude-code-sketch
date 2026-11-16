// The state the sketch mod keeps: which node each diagram card has focused,
// by the card's tool_use_id (a click on a node's name sets or clears it), and
// the tick the pulse along focused wires steps on.
export type Picked = Record<string, number>

declare module 'claude-code' {
  interface PluginState {
    sketch: { picked: Shaped<Picked>; tick: number }
  }
}
