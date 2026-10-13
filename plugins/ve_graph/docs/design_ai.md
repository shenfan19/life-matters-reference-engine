# VE Graph design

## 1. Purpose

The graph answers the question of what depends on what in a model. A reader sorting out a model needs to see which variables feed which equations and which variables an equation changes, and needs to rearrange the picture while thinking. A fixed image from a text diagram language does not allow that, so the page is interactive, with a static layered mode kept for reading and for export.

## 2. Placement

The feature is a bundle plugin, not part of the GUI application. The reasons:

- Load cost: the plugin backend is imported only when its endpoint is called, and the page lives in an iframe that is created only when the strip button is clicked. A user who never opens it pays nothing at startup and nothing in the main views.
- Isolation: the main views stay mounted under the plugin view, so a running simulation or an edit in progress is not disturbed by opening or closing the graph.
- Reuse: the plugin reads the model through the same serialization as the models API and follows the selection of the model tree, so it adds no second loader and no second selection state.

## 3. No graph library

The page draws SVG with a few hundred lines of its own script and loads nothing.

- Offline use: a plugin page must work without internet, which rules out loading a library from a CDN.
- No build step: a hand-written `dist` folder keeps the plugin editable in place. A bundled library would have added a build tool and a checked-in artifact for a graph that has a few hundred nodes at most.
- Control: the arrow geometry, the pair curves, the pinning rule and the SVG export all needed custom behavior, which is simpler to write directly than to bend out of a library.

The cost is that the layout algorithms are simple. If the graphs grow to thousands of nodes, replacing the force loop with a library or a spatial grid is a local change inside the page.

## 4. Graph construction

Rules, with the reasoning behind each:

- Equations are nodes, not edges. A single equation can read many variables and update several, so a square node between circles shows the real shape of the model, where a variable to variable edge would lose which equation does the work.
- Reads come from parsing expression text with the engine's own `extract_vars_from_expr`, so the plugin agrees with how the engine finds dependencies and does not carry a second parser.
- Reads are reduced to declared variables. Names that are engine symbols or functions drop out, and an undeclared name is not drawn as a node, since the model validator reports names that are not defined.
- The `condition` counts as a read, because it decides whether the equation acts.
- Variables that no equation touches stay in the graph as isolated nodes with a flag, so nothing is silently missing. A checkbox hides them.
- Node ids carry a prefix by kind, because a variable and an equation may share a name.
- A state update reads and writes the same variable. The two arrows are drawn as curves bending to opposite sides, so neither covers the other.

Not drawn: the priority and ordering of equations within a step, and the numeric values of dependencies. The picture shows structure only.

## 5. Dynamic layout

A small force simulation runs in the page.

- Repulsion between every pair of visible nodes, inverse square, ignored beyond a cutoff distance.
- A spring along every arrow with a rest length of 120 units.
- A weak pull toward the origin so unconnected parts do not drift away.
- Velocity damping and a cooling factor, so the motion stops by itself. Dragging a node or changing a filter reheats it.
- For larger graphs the repulsion and rest length grow with the square root of the node count, so a graph of a hundred nodes is given more room than one of ten.
- Pinned nodes keep their position and exert force on others.

The loop cost grows with the square of the node count. This is fine for a few hundred nodes and would need a spatial index for a few thousand.

The first positions come from the layered layout with a small random offset, which starts the simulation near a sensible arrangement and shortens the time to settle.

## 6. Layered layout

The layered mode is deterministic and fixed.

1. A depth first search from nodes with no incoming arrow marks arrows that close a cycle as back edges and ignores them. State updates always create cycles, so this step is needed.
2. Each node gets a depth equal to the longest path from a source, computed in reverse finishing order, so equations and variables alternate along the columns.
3. Within each column, nodes are ordered by the average position of their neighbors in four sweeps, which reduces crossing arrows.
4. Columns are 190 units apart and rows 46 units apart, centered vertically.

Source variables land on the left and outputs on the right. Dragging a node still works in this mode and the arrows follow.

## 7. Interaction model

- A pointer press on a node either becomes a drag after a few pixels of movement or ends as a click. Only a click selects, so a drag never opens the detail panel.
- Highlighting uses the neighbor set of the node and dims the rest by opacity, which is cheap and keeps the layout steady.
- The page keeps its own coordinates for nodes and one transform on a single group for the view, so zoom and pan never touch node positions.
- Each model switch resets the selection and rebuilds the graph. Positions are not remembered per model.

## 8. Known limits

- Large models form a dense cluster in the dynamic mode. Hover highlighting, search and the two hiding options are the tools for reading them, and the layered mode usually separates them more clearly.
- Dependencies are found by parsing expression text. An expression the Python parser rejects yields no reads for that equation, and the engine logs a warning.
- The graph is static with respect to simulation. It shows no values over time.
- The page was checked on a model of 12 nodes and one of 184 nodes and 508 arrows for correct behavior. Frame rate on larger graphs has not been measured.

## 9. Possible extensions

- Color nodes by the final value or trend of a simulation, using the `sim_results` input of the plugin interface.
- Group variables by prefix or by source model for scenario models built from many components.
- Remember the position of pinned nodes per model in browser storage.
