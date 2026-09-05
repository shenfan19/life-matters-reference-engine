# LM Software Requirements

## Core positioning

LM (Life Matters) is a **cross-scale, multi-model dynamics simulation framework**, focused on simulating an individual's personal health trajectory.

**Core capability**: running models at different scales simultaneously within a unified framework, and running Regimen-level multi-objective optimization over the interaction across models.

> An analogy to GPS: not more precise than surveying, but solving the problem of "real-time route planning," which surveying itself does not solve.

## Feature scope

**Core (80%)**: personal health-trajectory simulation

**Extensions (20%)**: medical / social-science applications
- Growing the user base
- Demonstrating LM's generality
- Not changing the core positioning

## Academic gap and technical positioning

Existing medical-simulation tools cover:
- Minute-to-hour scale: blood-glucose ODEs, PK/PD
- Year-to-decade scale: epidemiological SD

**The gap**: day-week-month-scale cross-model composition, and "multi-model cross-scale optimization at the individual-behavior layer" — no existing tool covers this.

## Core value proposition

LM converts statistical conclusions scattered across the literature into a dynamics simulation system that can be jointly run and optimized across scales, through a composable YAML framework.

## Application scenarios

LM's use falls into two categories, sharing the same engine and models.

### Forward application: behavioral optimization

Given an already-calibrated dynamics model, run multi-objective Pareto optimization over a user's behavioral-intervention plan (Regimen), outputting an actionable optimal-plan recommendation. Typical scenarios: joint diet-plus-medication optimization for a chronic-disease patient, exercise-plan design.

### Reverse application: literature-consistency checking (Simulation-as-Validation)

Load parameters reported by the literature into YAML, run the simulation, and compare the output against the literature's conclusion, checking the literature's internal self-consistency and cross-literature consistency.

**Three checking modes:**

| Mode | Operation | Typical output |
|------|------|---------|
| **Single-publication reproduction** | Run the simulation with the original text's parameters, see whether it reproduces the original text's reported conclusion | Parameters self-consistent / an unstated implicit assumption exists / parameter specification incomplete |
| **Cross-publication parameter overlay** | Load two studies' parameters into the same framework at once and run it | The joint feasible region is constrained / a stratification variable needs introducing / the applicable populations differ |
| **Multi-publication joint constraint** | Multiple studies act as constraints simultaneously, searching the jointly feasible parameter range | The feasible region's boundary / the feasible region is an empty set |

**A typical example**: insulin sensitivity (HOMA-IR) and glucose tolerance (OGTT) can show an internal contradiction in simulation results under parameters from different sources — this corresponds to the "inconsistent results across studies" problem already known in the medical literature, and LM supplies a dynamics-based path to reproducing it.

**Social-science applications**: historical data and social-dynamics parameters can likewise be cross-checked across sources through LM, testing the dynamical self-consistency of different research records.

## The dual-loop optimization requirement

LM's optimization requirement splits into two independent objectives:

**Outer loop (Regimen search)**: given a physiological/dynamics model, search for the user behavior/medication plan (a Regimen schedule of `input` variables) that optimizes the state output. This is LM-Simulator's core function, currently the primary focus. It outputs a Pareto front, serving physician and patient decisions directly.

**Inner loop (parameter calibration)**: fitting a YAML's `parameter` (mechanism coefficients, such as the Bergman minimal model's p1/p2/p3) against literature-observed data, so the model fits real physiological data. This falls within the scope of the **Modeller tool**, serving model developers, not yet implemented.

The two loops' objectives are orthogonal, and the tools are separate: the outer loop runs on the premise that `parameter` is already fixed; the inner loop, once calibrated, is written into the model YAML and fixed. The `evidence` variable (a raw literature effect size, automatically converted by the Loader) enters neither optimization loop.
