# Module-Splitting Conventions

> Scope: Python and TypeScript/JSX source under `cli/`, `reference_engine/`, and `gui/`.
> Whether a file/function needs splitting, and how, is decided uniformly by this file.

## 1. Core principle: responsibility, not line count

**The signal for splitting is "a file/function mixes multiple unrelated responsibilities," not "the line count exceeds some threshold."**

- A 300-line file that does only one thing (e.g. pure data loading) does not need splitting.
- A 150-line file that mixes four things, "parsing input plus running an algorithm plus formatting output plus writing a file," needs splitting.
- Line count can serve as a reminder signal to "stop and check the responsibilities," but **the reason for splitting must be written as "responsibility A and responsibility B should be separated," not "this file is too long."**

## 2. How to identify responsibilities

Answer the following for each function/component:

1. **What granularity are its inputs and outputs?** If some functions in a file operate on "a single event," others on "the whole simulation session," and others on "an HTTP request/response," that's three different granularities, a splitting signal.
2. **What external systems does it depend on?** If the same file both directly reads and writes the filesystem, calls business-logic algorithms, and assembles an API response, that shows the I/O layer, the computation layer, and the interface layer are mixed together.
3. **Do the reasons for changing it entangle with each other?** If "changing an optimization-algorithm parameter" and "changing the CLI output format" both require touching the same file, that shows the algorithm logic and the presentation logic are not separated.
4. **Is a closure secretly acting as a standalone function?** Multiple closures defined within a function body (such as `_build_regimen_events`/`_clone`/`evaluate` inside `run_optimizer`), if each has a clear, independent input and output and does not depend on the outer function's local variables for implicit shared state, should be promoted to top-level functions or a separate module, rather than left indefinitely as closures.

## 3. Splitting checklist (check against this when reviewing a diff)

- [ ] Can a new or changed function be described in one sentence? If describing it needs "and" to join two unrelated things, consider splitting.
- [ ] Are all the functions in a file at the same "layer" (pure computation / I/O / interface adaptation)? Split into different files when layers are mixed.
- [ ] Are algorithm backends (e.g. multiple optimizer implementations) each independent, not mixed into the same function body as the dispatch logic for "which backend to call"?
- [ ] Can helper/utility functions (time-window parsing, string formatting, etc.) be tested independently of the main flow? If they can only be tested by dragging in the whole main flow, the coupling is too tight.
- [ ] Can each new file/module after splitting still be described by a single responsibility in one sentence? If it still needs "and," the split isn't clean yet.
- [ ] Does the split avoid introducing new shared state (global variables, a shared mutable object) as a substitute for inter-module coupling?

## 4. What not to do

- Don't mechanically split just because "the file exceeds N lines" — if the resulting files still mix responsibilities, nothing has been solved.
- Don't introduce an unnecessary abstraction layer (an interface, a base class) just for the sake of splitting — if there's only one implementation, use a concrete function/class directly.
- Don't mix "splitting/refactoring" with "fixing a bug/changing behavior" in the same PR; the two should be two separate commits, so the diff can be checked item by item.

## 5. Acceptance criteria

- When reviewing a diff, every new or changed file should be checkable item by item against checklist item 3.
- Any "splitting" commit's message must state the responsibility of each module split out; it cannot just say "refactor xxx.py."
