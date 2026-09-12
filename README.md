<img src="gui/public/favicon.svg" width="48" height="48" alt="Life Matters icon" />

# Life Matters · Reference Engine

Life Matters (LM) is a cross-scale, multi-model dynamics simulation framework, running multi-objective optimization over individual-behavior decisions this project calls a Regimen. This repository holds the simulation backend, a FastAPI service, and the simulation frontend GUI, built in React; the YAML model library these components run is maintained independently at [life-matters-models](https://github.com/shenfan19/life-matters-models), whose README also states the project's overall positioning and disclaimer. This repository maintains only the simulation and optimization engine itself, for which the author is responsible.

---

## Repository structure

```
reference_engine/   Python LM Reference Engine + a FastAPI backend (port 18080)
gui/          The simulation frontend interface (React + Vite, port 5173)
cli/          The command-line interface (lm-sim plus the batch runner batch.py), aimed at AI/script scenarios, see docs/cli.md
scripts/      Development tooling scripts (i18n, AI assistance, code checks, etc.)
docs/  Technical specifications and architecture decisions (ADRs)
```

---

## The variable-type system

| Type | Purpose | Optimization ownership |
|------|------|---------|
| `state` | A state variable evolving over time | — |
| `input` | A user-intervention quantity, structurally scheduled by a Regimen | The outer optimization loop (Simulator) |
| `parameter` | A dynamics mechanism coefficient, fixed by fitting to literature data | The inner optimization loop (Modeller, not yet implemented) |

When a `parameter` variable declares an `evidence_type` field (OR/HR/RR/Cohen's d, etc.), the Loader automatically converts the literature effect size into a usable coefficient — "evidence" is a display concept for this kind of variable, and the `type` field itself is still `parameter`, not a fourth independent enum value; see [docs/design.md](docs/design.md) for detail.

---

## The dual-loop optimization architecture

```
Inner loop (Modeller, not yet implemented)      Outer loop (Simulator, the current primary focus)
  calibrate parameter    →      search optimal input Regimen
  fit to literature data         Pareto front output
```

When the outer-loop optimizer has no single optimal solution, the result is by default presented as a Pareto front, handing the full set of better combinations to the user for evaluation and reference.

---

## Quick start

**Dependencies**: Python 3.10+, Node.js 18+

```bash
pip install -r reference_engine/requirements.txt
cd gui && npm install && cd ..
```

Start the backend plus frontend together with one command (dev mode, two windows; Ctrl+C / closing the window stops it):

```bash
./run.sh          # macOS / Linux / Git Bash
run.cmd           # Windows
```

Or start them separately by hand:

```bash
cd reference_engine && python src/api_server.py   # http://localhost:18080
cd gui && npm run dev                             # http://localhost:5173
```

`gui` forwards `/api` to the backend at `:18080` via the Vite proxy.

**Online demo** (no install needed): [http://137.184.220.139](http://137.184.220.139). This address runs on temporary cloud infrastructure and may change without notice; this README is the authoritative place to find the current link — other documents (the models repo, the paper) point here rather than hardcoding the address themselves.

### Command-line interface (CLI)

A run interface aimed at scripts and AI agents, with no need to start the backend/frontend:

```bash
python cli/main.py <model.yaml>              # runs both sim and opt
python cli/main.py <model.yaml> --sim-only
python cli/main.py <model.yaml> --opt-only

# Batch-run every model under a folder, generating batch_report.md
python cli/batch.py --input-dir <models_folder>
```

The output is structured CSV plus logs, written to `output/<model name>/`. A compiled `lm-sim` is provided in the release, requiring no Python installation. See [docs/cli.md](docs/cli.md) for detail.

---

## FAQ

**The backend port is in use?** The default is 18080. Change it in `reference_engine/src/api_server.py`, and update `gui/vite.config.ts`'s proxy target to match.

**The frontend is blank?** Confirm the backend has started by visiting `http://localhost:18080/api/health`, then check whether `npm install` finished.

**How do I add a model?** Place the `.yaml` under the corresponding subdirectory of `../life-matters-models/models/references/`, following the naming convention `{topic}_{year}_{author}.yaml`; for the format, see [LM_format_1.0.md](https://github.com/shenfan19/life-matters-models/blob/main/docs/LM_format_1.0.md), and for a modeling-practice guide, see [life-matters-models/docs/authoring/](https://github.com/shenfan19/life-matters-models/blob/main/docs/authoring/README.md).

---

## Documentation index

| Document | Content |
|------|------|
| [docs/design.md](docs/design.md) | The Reference Engine's software design (Regimen K x 4, session management) |
| [docs/impl.md](docs/impl.md) | The Reference Engine's implementation detail |
| [docs/requirements.md](docs/requirements.md) | The software requirements document |
| [docs/opt.md](docs/opt.md) | The Optimizer's design and implementation (NSGA-II, scipy, embedded MC) |
| [docs/cli.md](docs/cli.md) | An explanation of the CLI batch-run interface |
| [docs/deploy_scs.md](docs/deploy_scs.md) | The SCS public-deployment guide (DigitalOcean and similar cloud hosts, systemd plus Nginx) |
| [docs/evidence/conversion.md](docs/evidence/conversion.md) | Evidence's 8 subtype conversion equations and traceability fields (the authoritative implementation description) |
| [docs/evidence/applies_to.md](docs/evidence/applies_to.md) | Evidence's `applies_to` mechanism for automatically wiring into dynamics |
| [docs/mc.md](docs/mc.md) | Monte Carlo implementation detail (distribution sampling, seed derivation, model cloning) |
| [test_verification/verification_report.md](test_verification/verification_report.md) | The validation report (verify): engine implementation correctness / numerical precision, with methodology and current execution results combined |
| [life-matters-models/models/test_validation/validation_report.md](https://github.com/shenfan19/life-matters-models/blob/main/models/test_validation/validation_report.md) | The validation report (validate): literature benchmarking / optimization plausibility / API-IO / a model's scientific content |
| [life-matters-models/models/test_fixtures/fixture_catalog.md](https://github.com/shenfan19/life-matters-models/blob/main/models/test_fixtures/fixture_catalog.md) | A complete overview of the test_fixtures fixtures: explaining each test case item by item, grouped by area, evidence/import/mc/opt/lm_score, etc. |
| [docs/ui_guidelines.md](docs/ui_guidelines.md) | The frontend UI/UX design conventions (color tokens, i18n, responsiveness) |
| [docs/data_flow.md](docs/data_flow.md) | The data-flow design |
| [docs/decisions/README.md](docs/decisions/README.md) | An index of architecture decision records (ADRs) |

---

## Citation

See the [life-matters-models](https://github.com/shenfan19/life-matters-models#citation) README's Citation section.

## Acknowledgments

This project was developed with AI coding assistance for code generation, automated testing, and documentation.
