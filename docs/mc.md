# Monte Carlo (MC): Distribution Parameters and Multi-Run Simulation

> Corresponds to `reference_engine/src/mc_utils.py`. For the architecture decision see [ADR 0045](decisions/0045-2026-04-30_sim_mc-probabilistic-simulation-and-random-parameter-architecture.md); for the historical bug where opt's inner-loop MC once had no effect at all, and the decoupling of Sim/Opt MC, see [ADR 0130](decisions/0130-2026-07-10_sim_opt-inner-mc-reset-bug-and-gui-decoupling.md) (**required reading** — the step below, "writing the sample back to `variable_history[0]` after sampling," is exactly this bug's fix point; always read this ADR before touching `mc_utils.py`).

## Purpose

A `parameter`-type variable's `value` can hold, besides a static number, a distribution expression (`normal(μ, σ)` / `uniform(a, b)` / `lognormal(μ, σ)`), representing individual variation. Deterministic mode (the default) takes the distribution's mean, giving a single reproducible trajectory; MC mode independently samples each `parameter` that declares a distribution N times, running N trajectories to get a distribution of the output rather than a single point. For the YAML syntax, see §2.2/§2.3 of `docs/LM_format_1.0.md` in the `life-matters-models` repository.

MC takes effect at two independent layers that share no state ([ADR 0130](decisions/0130-2026-07-10_sim_opt-inner-mc-reset-bug-and-gui-decoupling.md) decision 2 reversed the earlier design where "the two shared one configuration"):


| Layer     | Configuration location                                                         | Effect                                                                |
| ---------- | ------------------------------------------------------------------ | --------------------------------------------------------------------- |
| Sim top level | `simulation.mc.runs` / `simulation.mc.seed`                      | Runs N trajectories for a single simulation itself, giving a distribution                 |
| Opt inner loop | `optimization.mc.runs` / `optimization.mc.seed` (see [opt.md](opt.md)) | When the optimizer evaluates each candidate solution, it runs N samples for that candidate and takes an aggregate objective value, for robust optimization |

The GUI's Sim tab and Opt tab each bind their MCxN/Seed controls to their own configuration, independent of each other. The CLI batch scenario (`--input-dir`) runs each model YAML's own `mc.runs`, not a batch-level unified parameter — a model declaring a large `mc.runs` will correspondingly slow down the batch test, see [cli.md](cli.md).

## Distribution-expression parsing

`parse_distribution(value)`: uses a regex to match `normal(p1, p2)` / `uniform(p1, p2)` / `lognormal(p1, p2)`, returning `(dist_type, (p1, p2))`; no match (including a plain non-distribution number/string) returns `None`.

- `get_mean_value(value)`: used in deterministic mode, taking the distribution's first parameter (mu for `normal`/`lognormal`, a for `uniform`); a non-distribution value is converted directly to `float`.
- `sample_value(value, rng)`: used in MC mode, sampling with the passed-in `numpy.random.Generator` — `normal(μ,σ)` uses `rng.normal`, `uniform(a,b)` uses `rng.uniform`, `lognormal(μ,σ)` uses `rng.lognormal`.

## Seed derivation: one master seed to N independent run seeds

`derive_seed_list(session_seed, n_runs)`: builds a master `Generator` from `session_seed`, then draws `n_runs` independent integers from it in sequence, each serving as one run's seed (`master_rng.integers(0, 2**31)`). The GUI's `start_session` and the CLI's batch/MC entry points share this same function, guaranteeing that under the same master seed, each run's trajectory is exactly identical and reproducible between the CLI and the GUI.

## Applying sampling, and a lesson learned

`collect_param_distributions(model)`: collects every `parameter` variable that declares a distribution value, preferring to read the Loader-stored `model._param_dist_raw` (the raw distribution string), falling back to scanning whether `Variable.value` itself is a distribution string (for scenarios that construct a `ModelStructure` directly without going through the standard Loader).

`apply_parameter_sampling(model, param_distributions, rng=None)`: `rng=None` gives deterministic mode, setting each distribution parameter to its mean; `rng=<Generator>` gives random mode, sampling once independently. **Right after sampling, the value is immediately written back to `model.variable_history[var_name][0]`** — this step is not an optional tidiness measure, but the core of [ADR 0130](decisions/0130-2026-07-10_sim_opt-inner-mc-reset-bug-and-gui-decoupling.md)'s fix: `reset_simulation()` resets every variable to `variable_history[var_name][0]` (the "initial-value snapshot" taken at clone time), and `optimizer_eval.py::_run_sim()` unconditionally calls `reset_simulation()` at the start of every evaluation. If this snapshot is not synced after sampling, any subsequent `reset_simulation()` will silently wipe out the just-sampled value and revert to the pre-sampling mean — this is not a hypothetical risk: this bug once caused every model declaring `optimization.mc.runs > 1` to actually repeatedly evaluate the same deterministic mean throughout the optimization search, with `mc.seed` never actually affecting the optimization result, contaminating the historical optimization results of 19 `*_opt_*.yaml` files under `models/papers/` (see ADR 0130 for detail). This write-back must be preserved whenever this function is changed.

## Model cloning: `clone_model`

`ModelStructure` holds an unpicklable asteval `Interpreter` and cannot use `copy.deepcopy`. `clone_model(base)` therefore manually constructs an independent copy:

- Read-only metadata (`metadata`/`equations`/`simulator`/`optimizer`/`time_unit`, etc.) **shares a reference**, not copied.
- Each variable gets a freshly constructed, independent `Variable` instance (each run needs a current value that doesn't interfere with the others).
- Runtime state is reset: `variable_history` is re-initialized to `{name: [initial value]}`, `current_step=0`, `time=0.0`, and `_initialize_asteval()` is called again to inject a fresh asteval symbol table.
- Distribution metadata (`_param_dist_raw`/`param_distributions`) is inherited as-is, for later use by `apply_parameter_sampling`.

**Each MC run must resample from this "clean clone," and must not chain-reuse the previous run's final state** — otherwise spurious correlation arises between runs (`test_verification/verification_report.md` §1.2 lists this as an implementation detail requiring manual/semi-automated spot-checking, with no dedicated automated assertion currently covering it; spot-check after changing MC-related code).

## Determinism guarantee

When `mc.runs` is absent or 1, the simulation is fully deterministic and reproducible — part of `test_verification/test_sim_cli_consistency.py`'s assertions depend on this property (the CLI and GUI go through the same core code path, and the same input must match bit for bit).
