# Model Compose design

## 1. Purpose

Models in this library are built to be combined. A scenario imports components, and the components read each other's variables by name. Before combining, a modeler needs to know which variables two models share, who produces a value and who consumes it, and whether combining creates a conflict. The plugin answers those questions from the models themselves, so the decision to merge is made with the structure in view.

## 2. Why the model tree does the selecting

The ticked models come from the same tree the user already uses, not from a list inside the plugin. A list inside the plugin would repeat the folders, the search and the naming of the tree. The cost on the host side is small, because the library editor already renders checkboxes in the tree. The host therefore gained one manifest field, `ui.model_selection`, and one message field, `models`, and the default behavior of every other plugin is unchanged. The decision is recorded in ADR 0158.

## 3. How the relation between models is found

Every model is loaded with imports resolved. For each model the backend collects the variables it declares, the variables its equations write, and the variables its expressions and conditions read. A variable counts as shared when at least two models touch it, meaning declare, read or write it, and at least one of them declares it.

Two choices matter here.

- Loading without validation. A component model whose equations read variables that another component defines fails validation alone. That failure is the very dependency to analyse. The load therefore skips validation and the loader cache, so an unvalidated model never reaches a caller that asked for a validated one.
- Reads and writes of undeclared names count. A component asks another component for a variable by using its name without declaring it. If only declarations counted, such a link would never be drawn.

A name that is read but declared by no ticked model, such as a function name, is not drawn. A variable that is not declared anywhere is out of scope, because the plugin cannot tell a missing variable from an unknown function.

## 4. What the arrows and colors encode

Direction answers the question of who feeds whom. The writer of a variable points at it, and a reader is pointed at by it, in the same convention as VE Graph, where an input points at an equation and an equation points at its output.

The status of a variable follows from the roles.

- Only readers, or readers and models that merely declare it: shared input or parameter. Nothing is wrong, and it is drawn neutral.
- One writer and at least one reader: a coupling. The writer's result feeds the others. This is the useful case, drawn green.
- Two or more writers: a conflict, drawn red with a mark. Whatever each writer does to the variable, the merged model applies all of it.

A model that reads and writes the same variable counts as a writer, since the usual form of a state update reads its own state.

The differences in unit, type and value are separate from the status, shown as an amber outline and listed in the panel. They matter because of how the merge treats declarations.

## 5. The merge

The merge button uses the loader's merge, the same one the library editor uses, through `POST /api/merge`. The plugin does not write files itself. That keeps one writer, so the write protection of the public deployment mode and its handling of session mode apply unchanged. In that mode no file is written and the merged text is downloaded instead.

Steps after pressing the button:

1. The plugin asks for an unused file name under `temp_merged_ai/`, built from the model names.
2. A dialog lists the models and shows a warning when conflicts exist. The user can edit the file name.
3. On confirmation the name is checked. It may use only letters, digits, underscore and hyphen, end in `.yaml`, and must not exist. The folder is fixed, so the plugin cannot write elsewhere.
4. The ticked model keys are posted in tick order, and the result is validated through `POST /api/validate`. The dialog reports the saved path and the validation outcome.

What the merge does to the models, as observed on the loader and recorded in ADR 0158.

- A shared variable is declared once in the result, and the declaration from the model ticked later replaces the earlier one. A unit or value difference therefore resolves silently in favor of the later model, which is why differences are listed before the merge and the panel says the later model wins.
- Equations with different names are all kept. Two models that write the same variable through differently named equations leave both equations in the result, and the variable is updated by both in every step.
- Equations with the same name replace each other, and the later one is kept.
- The merged file is written under the models directory in a folder starting with `temp_`, which the models repository ignores, so a trial merge does not enter version control. Moving a result into the library is a separate, deliberate step.

The new file appears in the model tree after the tree is reloaded.

## 6. Layout and interaction

The force layout and interaction follow VE Graph. Differences for this page:

- Model nodes are wide rounded rectangles with the name inside, and they repel more strongly, so models keep apart.
- Arrows end on the border of a rectangle or circle, computed from the direction between centers.
- A ticked model that shares no variable with any other ticked model is not laid out. It drifts slowly in random directions across the visible area, avoiding the findings panel, and turns back at the edges. Dragging it pins it in place, and double-click lets it drift again. Such a model leaves the drifting state as soon as a link to another model appears.
- Node positions are kept across updates by node id, and a new variable node starts at the average position of the models it joins. Ticking another model therefore adds to the picture without rearranging it.
- The view fits itself when the layout settles, and stops doing so after the user zooms or pans.

## 7. Samples

The sample list serves demonstrations, where a good picture matters more than a general tool. Each sample is a fixed list of model paths in the backend, with an expectation. Every model in a sample belongs to the public models repository, so the samples work on a clone of it.

- Coupling samples expect at least a stated number of couplings and no conflict, such as a food model feeding a nutrition model and a flu model, or a chain from rowing through interval training to insulin sensitivity in the diabetes model.
- Conflict samples expect at least a stated number of variables written by several models, such as running, cycling and rowing, and show the red warning. A mixed sample, badminton and squash, shows one variable passing between the models and three written by both.
- A no-link sample expects no shared variable, and shows models drifting apart.

The list is checked every time it is requested. The backend runs the ordinary analysis on each sample, and a sample is offered only if every model loads, the counts match its expectation, and, for a coupling or conflict sample, every model shares a variable with another one. A model that is renamed, moved or changed enough to break the sample therefore removes the sample from the list, instead of showing a wrong picture. The checks use counts and not exact variable names, so ordinary edits to a model do not remove its sample.

Choosing a sample asks the host to tick the models, so the tree, the graph and the merge button all see the same selection. This is why the page sends `lm-set-models` and does not draw the sample on its own.

## 8. Known limits

- Detection is by variable name. Two models that use one name for different things look shared, and two that use different names for the same quantity do not. Unit and value differences are the only hint of the first case.
- At most 12 models are analysed in one request.
- Only structure is analysed. The plugin does not run the merged model, so a merge that passes validation can still behave badly.
- A variable that no ticked model declares is not drawn, even when several of them use it.
- The ticked list is kept for the session but not across a reload.
- Session models that exist only in the browser cannot be ticked.
- The sample list is a hand-written set. A random choice of connected models from the whole library is not offered, because it would load many models on every click and could pick pairs that look poor on a slide.

## 9. Possible extensions

- List variables that a ticked model reads but no ticked model provides, as the open inputs of a combination.
- Offer an order for the merge, since the later model wins on declarations.
- Run a short simulation of the merged file and show the key variables.
