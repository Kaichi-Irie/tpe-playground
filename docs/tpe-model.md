# Shared TPE model contract

The engine in [src/model](../src/model/) has no React, objective evaluator, DOM,
plot resolution, or camera dependencies. [oneParamTpe.ts](../src/oneParamTpe.ts) and
[twoParamTpe.ts](../src/twoParamTpe.ts) adapt one- and two-parameter searches to that engine.

## Data ownership

| Data | Owner and lifecycle |
| --- | --- |
| Problem and completed observations | Input facts: named coordinates, raw objective values and constraint values. Objective evaluators remain outside the engine. |
| Model snapshot | Derived, deeply immutable, JSON-compatible data: version, problem, resolved config, input IDs/history key, partition, groups and kernels. Only displayed models need to remain in memory. |
| Proposal trace | Historical decision: input IDs/history key, problem, seed, resolved config, selected point, and per-group candidates/scores/winner. Stored alongside each evaluated trial in both playback adapters. |
| Field samples | Derived by the visualization adapter from a fitted model; no separate fitting or split in React. |
| Playback position, camera, colors, layer visibility | UI state. |

The page adapters retain their existing trial shapes for compatibility. A trial's
position in playback links it to the same position in the proposal array. A
proposal's input IDs refer only to earlier observations. Moving backward truncates
both arrays; a setting change retains past observations and traces and affects
future proposals. This is a linear branch, not a persistent branch tree. Reloading
the page starts a fresh run. In either Play view, Settings → Share link copies a
URL with the seed, objective, model settings, and any applicable density mode
and constraint. The link opens at trial zero. Playback history stays in memory.

History keys include coordinates and objective/constraint values, not just IDs.
They are deterministic cache/provenance identifiers, not cryptographic digests.
Exact history reconstruction still requires the observations. Proposals use
NumPy's seeded random stream and inverse-CDF sampling. Older share links replay
with these draws and produce different trajectories.

## Fitting and proposing

`fitTpe(problem, observations, config)` returns a fitted model exposing:

- `snapshot`: serializable model parameters and diagnostics.
- `evaluate(points)`: `logL`, `logG`, and `score = logL - logG`. The ratio is undefined outside the box.
- `propose(seed)`: candidate traces and the selected coordinates.

`proposeTpe(...)` applies the startup rule before fitting. A fitted model may be
shown during startup for explanation; it is not evidence that startup proposals
used TPE. The trace explicitly records `method: "random"` and `reason: "startup"`.
`restoreModel(snapshot)` restores a trusted, typed snapshot produced by this
engine (for example after a JSON round trip), copying it before constructing the
runtime. It is not an untrusted file parser or schema migration service.

The current policy supports a single objective (minimize or maximize), fixed
continuous box domains, Constant, Scott and Optuna bandwidth rules,
uniform, recency, EI and Optuna weighting, and an optional broad prior. Observations retain their original objective values.
The unconstrained split threshold uses minimization-oriented values.

A constrained problem declares the number of finite constraint values per
observation. A trial is feasible when every value is at most zero. Its total
violation is the sum of the positive values. The target Good size is
`min(n − 1, max(1, ceil(γ·n)))`, counting all trials. Feasible trials rank by
objective, and ties break by ascending trial ID. With infeasible filling enabled
(the default), any remaining Good slots go to infeasible trials from lowest to
highest total violation, with the same tie-break. With filling disabled, Good
can fall below its target size. All remaining trials go to Bad.

The constrained partition records the target size, feasible IDs, total
violations, and filled IDs. Its weights can be uniform, recency-based or Optuna weights. EI
requires an objective threshold, so the engine rejects EI for constrained
problems. When Good is empty, a positive prior weight supplies the only Good
kernel. Without a prior, proposing falls back to a uniform draw with
`method: "random"` and `reason: "no-feasible-good"` after startup. There is no
fitted model in that case.

The ranking and weighting functions are separate. Future MOTPE policies
must explicitly define their diagnostic types. Algorithms requiring several
density pairs will need additional field IDs and models, not a fake single split.
Categorical/conditional spaces, full covariance kernels and arbitrary plug-in
policies are not implemented.

## Independent and joint groups

With two parameters, univariate mode uses groups `[x1]` and `[x2]`; multivariate uses `[x1, x2]`. Every
group owns a good and bad density and selects its own best candidate. The final
point combines the selected coordinates. Independent mode therefore has two
sets of scalar candidates, not an invented set of joint candidate points.

A joint density is a mixture of diagonal Gaussian kernels whose coordinates
share an observation index. It is not a full-covariance Gaussian, nor the product
of independently mixed marginal densities. All modes use the same density and
candidate-selection code. The RNG traverses groups in declared parameter order.

Kernels distinguish observation and prior sources, raw observation-equivalent
weights, and normalized mixture weights. Prior weights are applied per group.
Kernels have one bandwidth per coordinate. Constant uses the configured width
for every observation kernel. Scott resolves widths separately for
each density and coordinate within a parameter group. Optuna resolves a width
for each observation kernel and coordinate. Prior widths remain fixed.

Each observation and prior kernel is a product of per-coordinate truncated
Gaussians. For each coordinate, the Gaussian is divided by its probability mass
inside that coordinate's search interval. The error function, log CDF, and
interval-mass routines are adapted from Optuna v5.1.0. Each component and mixture
integrates to one on the box and has log density `-Infinity` outside it. Marginals
drop the omitted coordinates' terms, including their normalization factors, and
preserve the mixture weights.

Sampling chooses a component by weight for each candidate, then applies the
truncated-normal inverse CDF to a uniform draw for each coordinate. The snapshot records
`normalization: "truncated-box"` and `sampling: "truncated-components"`.

## Optuna parity

The opt-in preset uses Optuna 5.1.0's split, neighboring-center bandwidths,
observation weights and broad prior for completed trials in single-objective
continuous box problems. For 2 ≤ n ≤ 250, the playground’s Good fraction of 0.10
gives the same count as Optuna’s `min(ceil(0.1 n), 25)`. Optuna defaults to
multivariate TPE for a single objective. Play 3D’s univariate mode corresponds
to `multivariate=False`.

The fixture compares Good and Bad trial IDs, every kernel's center, per-coordinate
width and normalized mixture weight, and log ℓ and log g at 50 box points per
case. The playground sorts coincident centers stably in trial order under the
preset. Optuna calls NumPy’s default `argsort`, which can assign unequal
Optuna widths to different trials when centers coincide.

Startup and TPE index two independent NumPy legacy `RandomState(seed)` streams.
Startup consumes one uniform per parameter per trial in declaration order. Each
TPE group consumes all component uniforms first, followed by all candidate
uniforms for each parameter in turn. The history size determines both offsets,
so seeking to a trial reproduces its proposal. The fallback for an empty Good
group without a prior also uses the startup stream.

For sequential completed float trials, the same seed, same history and unchanged
preset settings give the same Optuna proposal within 1e-9 per coordinate. Last-bit
differences can affect which candidate wins when the top scores nearly tie.
The trajectory fixture checks each step against Optuna with the preceding Optuna
trials as history. Startup points match to within the last bit because some
NumPy builds fuse the range multiplication and addition.

Regenerate the fixtures from the repository root with Python and uv.

```sh
uv run --with optuna==5.1.0 python scripts/optuna_parity_fixtures.py
```

`npm run check` compares against the committed fixtures without running Python.
See the versioned [Optuna sampler](https://github.com/optuna/optuna/blob/v5.1.0/optuna/samplers/_tpe/sampler.py)
and [Parzen estimator](https://github.com/optuna/optuna/blob/v5.1.0/optuna/samplers/_tpe/parzen_estimator.py).

## Visualization

`evaluateField(model, request)` returns the originating model ID, request metadata
and values. Field IDs currently identify good density, bad density and log ratio.
Requests explicitly distinguish:

- `full`: all coordinates supplied;
- `slice`: omitted coordinates fixed explicitly;
- `marginal`: omitted coordinates analytically integrated out.

A marginal log ratio means the log ratio of the two marginal densities, not the
integral of an acquisition function. Group marginals preserve mixture weights.
Density values retain their original units; plot scaling happens in page adapters.
The objective landscape is evaluated separately from the problem's evaluator.

Both pages use the same fitted instance for displayed densities and the next TPE
proposal preview. Historical proposals keep their own provenance when current
settings change. Immutable density evaluators cache their kernel constants in a
WeakMap so old models can be garbage collected.

## Verification and references

The [trajectory fixture](../src/model/fixtures/trajectories.json) records 30 trials
from the truncated-kernel model with seed 42 in both the one-parameter search and
the joint two-parameter search. Comparisons allow floating-point roundoff.
Tests also cover box normalization, analytic marginals, independent cross peaks
versus joint peaks, per-group winner selection, snapshot round trips and
immutability, invalid inputs, field semantics, and branching with historical
settings.

Design references (interfaces and separation of responsibilities, not numerical
compatibility claims):

- [Optuna Parzen estimator](https://github.com/optuna/optuna/blob/master/optuna/samplers/_tpe/parzen_estimator.py)
- [Rustuna sampler contract](https://github.com/optuna/rustuna/blob/main/rustuna_core/src/sampler.rs)
- [Rustuna TPE observations and sampling](https://github.com/optuna/rustuna/blob/main/rustuna_sampler/src/tpe/sampler.rs)
