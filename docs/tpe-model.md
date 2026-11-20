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
Exact history reconstruction still requires the observations. Version 1 records
the per-trial seed mixing and Box–Muller sampling implementation; seed alone is
not a cross-version reproducibility guarantee.

## Fitting and proposing

`fitTpe(problem, observations, config)` returns a fitted model exposing:

- `snapshot`: serializable model parameters and diagnostics.
- `evaluate(points)`: full-space `logL`, `logG`, and `score = logL - logG`.
- `propose(seed)`: candidate traces and the selected coordinates.

`proposeTpe(...)` applies the startup rule before fitting. A fitted model may be
shown during startup for explanation; it is not evidence that startup proposals
used TPE. The trace explicitly records `method: "random"` and `reason: "startup"`.
`restoreModel(snapshot)` restores a trusted, typed snapshot produced by this
engine (for example after a JSON round trip), copying it before constructing the
runtime. It is not an untrusted file parser or schema migration service.

The current policy supports a single objective (minimize or maximize), fixed
continuous box domains, Constant/Scott/Silverman bandwidth rules,
uniform/recency/EI weighting, and an
optional broad prior. Observations retain their original objective values.
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
violations, and filled IDs. Its weights can be uniform or recency-based. EI
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
for every observation kernel. Scott and Silverman resolve widths separately for
each density and coordinate within a parameter group. Prior widths remain fixed.

To preserve the existing educational model, density values integrate to one over
the whole real space. Sampling rejects the entire mixture draw outside the box,
thus sampling the mixture conditioned on the box. These measures are explicitly
named in the snapshot. The displayed full-space log ratio differs from the ratio
of box-conditioned densities by a group-wise constant, so candidate ordering is
unchanged. It is not a reproduction of Optuna's truncated-component estimator.
Rejection sampling is bounded and throws for pathological settings instead of
hanging the browser.

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

Tests cover seeded pre-refactor trajectories (30 trials, seed 42), normalization,
independent cross peaks versus joint peaks, per-group winner selection, snapshot
round trips and immutability, invalid inputs, field semantics, and branching with
historical settings. The trajectory fixture was captured from origin/main at
`8e35761` before the refactor; comparisons allow floating-point roundoff.

Design references (interfaces and separation of responsibilities, not numerical
compatibility claims):

- [Optuna Parzen estimator](https://github.com/optuna/optuna/blob/master/optuna/samplers/_tpe/parzen_estimator.py)
- [Rustuna sampler contract](https://github.com/optuna/rustuna/blob/main/rustuna_core/src/sampler.rs)
- [Rustuna TPE observations and sampling](https://github.com/optuna/rustuna/blob/main/rustuna_sampler/src/tpe/sampler.rs)
