# sketch

English | [繁體中文](README.zh-TW.md)

**Claude Code answers with pictures instead of paragraphs.**

`sketch` is a Claude Code mod (plugin). It gives Claude 17 drawing tools and one standing instruction: when an answer has a shape, draw the shape. Architecture, flows, roadmaps, user journeys, wireframes and charts appear as cards in the transcript, in your terminal, in your theme's colors.

![A layered architecture card](docs/images/en/layers.png)

## Install

At the prompt of a Claude Code terminal session:

```
/plugin marketplace add allen-hsu/claude-code-sketch
/plugin install sketch --marketplace allen-hsu/claude-code-sketch
```

Answer `y` to add the marketplace, then pick a scope (user scope loads it in every session).

From a shell:

```
claude plugin install sketch --marketplace allen-hsu/claude-code-sketch
```

In the desktop app, where `/plugin` does not run: click **+** next to the prompt box, then **Plugins**, **Add marketplace** with `allen-hsu/claude-code-sketch`, then **Add plugin**.

Then just ask as usual: "how is this service put together?", "compare these three options", "plan the next quarter". Claude picks the card.

## What you get

| Tool | Draws | Good for |
| --- | --- | --- |
| `layers` | Bands of components, nested zones, side concerns | Tech stacks, platform maps, deployment topologies |
| `diagram` | Nodes and wires, laid out automatically | Architecture wiring, flowcharts, state machines, boundaries (C4), dependencies |
| `schema` | Boxes with fields, and their relations | Data models (ER), class and component diagrams |
| `swimlane` | Steps across lanes of roles or systems | Processes with handovers |
| `pipeline` | Stages left to right, each a column of jobs | CI/CD, ETL, data flows |
| `gitgraph` | Branches, commits, merges and tags | Branching strategy, release flow |
| `sequence` | Actors and the messages between them | Request flows, protocols, handoffs |
| `tree` | An outline or a mind map | Goal breakdowns, sitemaps, taxonomies |
| `timeline` | Bars over periods, milestones | Roadmaps, gantt schedules, study plans |
| `board` | Columns of cards | Kanban, now / next / later |
| `quadrant` | Points on two axes, or four lists | Prioritisation, positioning, SWOT |
| `journey` | Stages, a mood line, rows of notes | User journeys, service blueprints |
| `wireframe` | A low-fidelity screen | Page and app layouts |
| `metrics` | Number tiles with a trend | KPIs, experiment results |
| `chart` | Bar, column, stacked, line, scatter, heatmap, histogram, funnel, share | Any numbers you already have |
| `cards` | Titled cards with tags and quotes | Personas, research findings, principles |
| `compare` | Options side by side, then a pick dialog | Decisions between two to four options |

The cards below are drawn from the made-up inputs in [`preview/samples.en.ts`](preview/samples.en.ts). Labels can be in any language; Chinese, Japanese and Korean text is measured correctly (see the [繁體中文 README](README.zh-TW.md) for the same cards in Chinese).

## Architecture and structure

`layers` shows what a system is made of. `diagram` shows how it connects: wires leaving a node travel together in that node's color, loops are drawn with an upward arrow, and a node's shape says what it is (decision, store, external system).

![System wiring](docs/images/en/diagram.png)

| Flowchart | Dependencies |
| --- | --- |
| ![Flowchart with decisions](docs/images/en/diagram-flow-1.png) | ![Dependency graph](docs/images/en/diagram-flow-2.png) |

When dependencies are too dense for wires, `layout: "matrix"` draws who uses whom as a grid, with counts:

![Dependency matrix](docs/images/en/diagram-flow-matrix.png)

With `layout: "zones"`, each group becomes a framed band: subsystems, network boundaries, a C4 container view. The `person` shape marks a user or a role.

![Zones and boundaries](docs/images/en/diagram-zones.png)

An edge from a node to itself is drawn as a loop inside the node, so a state machine is a diagram too:

![State machine](docs/images/en/diagram-state.png)

Zones in `layers` can hold zones of their own, which covers deployment topologies (region, availability zone, subnet):

![Deployment topology](docs/images/en/layers-topology.png)

`schema` draws tables or classes with their fields, and the relations between them:

| Data model (ER) | Classes |
| --- | --- |
| ![ER diagram](docs/images/en/schema-er.png) | ![Class diagram](docs/images/en/schema-class.png) |

`swimlane` puts each step of a process in the lane of whoever does it, `pipeline` lays stages out left to right, and `gitgraph` shows branches over time:

![Swimlane](docs/images/en/swimlane.png)

![Pipeline](docs/images/en/pipeline.png)

![Branch graph](docs/images/en/gitgraph.png)

![Sequence diagram](docs/images/en/sequence.png)

| Outline | Mind map |
| --- | --- |
| ![Tree](docs/images/en/tree.png) | ![Mind map](docs/images/en/tree-mind.png) |

## Product and planning

![Roadmap](docs/images/en/timeline.png)

![Kanban board](docs/images/en/board.png)

![Prioritisation on two axes](docs/images/en/quadrant-1.png)

![SWOT](docs/images/en/quadrant-2.png)

`compare` draws the options, then opens a dialog under the cards so you pick with the arrow keys; Claude carries on with your choice.

![Options compared](docs/images/en/compare.png)

## Design and research

![User journey](docs/images/en/journey.png)

![Wireframe](docs/images/en/wireframe-1.png)

![Mobile wireframe](docs/images/en/wireframe-2.png)

![Research findings and a persona](docs/images/en/cards.png)

## Numbers

![Metric tiles](docs/images/en/metrics.png)

![Line chart](docs/images/en/chart-line.png)

![Scatter chart with trend line](docs/images/en/chart-scatter.png)

![Bar chart](docs/images/en/chart-bar.png)

![Column chart](docs/images/en/chart-column.png)

![Stacked bars](docs/images/en/chart-stacked.png)

![Histogram](docs/images/en/chart-histogram.png)

![Funnel](docs/images/en/chart-funnel.png)

![Heatmap](docs/images/en/chart-heatmap.png)

![Share of a whole](docs/images/en/chart-share.png)

## How it works

The whole mod is one hooks module, [`hooks/register.tsx`](hooks/register.tsx):

- At session start it registers the 17 tools. Each takes plain structured input (nodes and edges, periods and items, labels and series).
- A `ui.render` hook replaces each tool call's row in the transcript with the card, drawn from the call's own input. The mod keeps no state.
- A `prompt.compose` hook adds one short section to the system prompt telling Claude when to reach for which card and to keep the text around it brief.
- Charts, metrics, timelines and journeys play a half-second entrance while the call runs.
- Press `ctrl+o` to see the raw tool call behind a card.

Things to know:

- The tool definitions and the prompt section ride on every request in a session where the mod is loaded: roughly 5 thousand tokens (an estimate, not a measurement).
- Cards are sized to the terminal width when they are drawn. Below about 60 columns the wider cards get cramped.
- Wide characters (Chinese, Japanese, Korean) are measured as two cells. A terminal that draws ambiguous-width symbols such as `●` two cells wide will misalign some cards.
- Built and tried on Claude Code 2.1.325 in a terminal. The cards use only `Box` and `Text`, which every surface has, but the desktop and mobile surfaces are untested.

## About the images

The images in this README are not window screenshots. They are produced by the scripts in [`preview/`](preview): `render.ts` runs the mod's real hooks against a stand-in engine with a small flex layout of its own, and `paint.py` paints the resulting cells with the default dark theme's colors. Layout in your terminal comes from Claude Code's own engine and your theme, so spacing and colors can differ slightly.

To regenerate them (macOS, needs [Bun](https://bun.sh) and Python with Pillow; use `samples.zh-TW.ts` and `docs/images/zh-TW` for the Chinese set):

```
cd preview
bun --jsx-factory=h --jsx-fragment=Fragment --jsx-runtime=classic render.ts ../hooks/register.tsx 110 cards.json ./samples.en.ts
python3 paint.py cards.json ../docs/images/en
```

## Develop

```
claude --plugin-dir .        # run a session with the mod loaded from this folder
claude plugin validate .     # check the manifest and the hooks module
```

Edits to `hooks/register.tsx` hot-reload in a session started with `--plugin-dir`.

## License

MIT
