# 0160 — Deep Links to a Model, a Tab and a Plugin View

**Date**: 2026-10-17
**Status**: ✅ accepted

---

## Background

The page had one address. Which model was open, and whether it was on Overview, Simulation or Optimization, lived only in memory and in the visitor's own `localStorage`. A model could not be pointed to. A paper, an email or a chat message could say which model to look at but could not link to it, and a reload reopened whatever the visitor had open last, not what was meant.

The deployment already answers every path with `index.html`: Nginx uses `try_files $uri /index.html` and the Vite dev server does the same. So the server needs nothing new, and the whole question is how the page reads and writes its own address.

## Decision

**1. The form of a link.** `/model/<model path>/<tab>`, where the model path is the key the model tree already uses and the tab is `overview`, `sim` or `opt`. For example `/model/papers/lm_format/banister/banister_validation.yaml/sim`. Each segment of the path is URL encoded. A path that does not have this form, does not end in `.yaml` or `.yml` in its model part, or contains `..` is not a link, and the page starts as it would without one.

**2. Opening a link.** The address is read once when the page loads. The model it names is selected and loaded, the tab it names is shown, and the simulation or optimization mode is set to match the tab. The link takes the place of the model restored from the last visit, and the results of the last visit are not restored when they belong to another model, because they would be drawn under the wrong model. A run status restored from the last visit also does not switch the tab away from the one the link names. A run started on the page still switches to the Simulation tab, as before.

**3. Links to a plugin view.** `/model/<model path>/plugin/<plugin id>` opens a bundle plugin with that model selected, and `/plugin/<plugin id>` opens it with the selection left as it was. For a plugin whose manifest sets `ui.model_selection: multi`, the models ticked in the model tree are written as repeated `m=<model path>` query parameters, and are ticked again once the model tree and the plugin list have loaded. The plugin id is limited to letters, digits, underscore and hyphen. The state kept inside a plugin page, for example the organs picked in the Body Map, belongs to the page and is not part of the link. A link to a plugin the server does not list shows the model tabs, and the address is rewritten to match.

**4. Following the page.** Every change of model or tab writes a new address with `history.pushState`, so back and forward move between them and apply the model and tab of the entry they return to. The first write only tidies the address of a page opened without a link and uses `replaceState`, so that it adds no history entry. While the builder covers the model tabs, the address keeps the last model tab. Opening, closing or switching a plugin view writes an address like any other change.

**5. What has no link.** A model imported into the session exists only in the visitor's browser, so its key, which starts with `session/`, gives the plain address.

**6. A Copy link button.** The toolbar above the tabs has a button that copies the address as it stands, which is the link of the open model and tab or plugin view. It is absent when no model is open or the model is a session model. Three locale keys, `sim.ctrl.copy_link`, `sim.ctrl.copy_link_tip` and `sim.ctrl.copy_link_done`, are added in four languages.

**7. Where the code lives.** `gui/src/core/urlRoute.ts` holds the format: parse, build and the link read at load. `gui/src/components/Simulator/useUrlSync.ts` writes the address and handles back and forward. The two places that restored the previous model, `useFileTree.ts` and `usePersistedUI.ts`, read the link before `localStorage`.

## Alternatives considered

- **react-router.** The package is a dependency but nothing used it. Adopting it would mean wrapping the application in a router and moving the tab state into routes, which touches every place that sets a tab, for a mapping of two values, model and tab. Rejected for now. The format above is what a router would use too, so this can change later without breaking a link.
- **A hash, `/#/model/...`.** Works without any server rule, but the deployment already has the rule, and a path reads better in a paper or an email.
- **Query parameters, `/?model=...&tab=...`.** Also needs no server rule. Rejected because a path leaves the query free for the next layer, which is the settings of a run.
- **Dropping the file suffix from the link.** Shorter, but a model could be `.yaml` or `.yml`, and guessing the suffix needs a lookup before the page can load. The suffix stays.
- **Pushing an entry only for a model change, not for a tab change.** Rejected: a visitor expects back to undo the last thing they did, and a tab change is one.

## Limits

- A link names a model of the published library. A visitor on a server whose library lacks that path gets the usual load failure message.
- A link does not carry run settings or results, nor the state inside a plugin page. Opening it shows the model with its defaults, or with what the visitor saved in their own browser for that model.

## Scope of impact

- `gui/src/core/urlRoute.ts` and `gui/src/components/Simulator/useUrlSync.ts`, new.
- `gui/src/components/Simulator/index.tsx`: the initial tab, the hook, the copy handler.
- `gui/src/components/Simulator/useFileTree.ts` and `usePersistedUI.ts`: the link is read before the saved model, saved results of another model are not restored, and a restored status does not override the linked tab.
- `gui/src/components/sim_tab/GlobalModelToolbar.tsx`: the Copy link button.
- `gui/public/locales/engine/`: three strings in four languages.
- `gui/e2e/specs/regression-deep-links.spec.ts`, new.
