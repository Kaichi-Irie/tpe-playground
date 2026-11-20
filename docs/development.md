# Development and model notes

See the [README](../README.md) for an overview and planned features.

## Local development

Node.js 22.12+ and npm are required.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5173/tpe-playground/.

For sound development, open [the dedicated audition pane](../sound-preview.html) at
http://127.0.0.1:5173/tpe-playground/sound-preview.html. It uses the Lab's own
synthesis and playback code. Every Lab sound is in C major:

- Split γ: a ratchet click per good-count step, slightly higher when the divider
  moves up and lower when it moves down; a confirming tap is neutral.
- Kernel: a soft "pop" on a C-major triad tone (C4–E5) chosen by the observation's x.
- Bandwidth h: a muted wooden note on C-major pentatonic notes (C3–C5), higher for narrower h.
- Roll the dice: a low claves tap, C4 → E4.
- Prior α: a warm pad chord built from C3 (C3, G3, C4, E4, G4) as α grows. Drag or
  hold an arrow key to sustain it; release to fade out. Button and assistive-technology
  edits fade after inactivity.

Adjust volume on your device. This separate entry point is excluded from production builds.

## Checks

```sh
npm run check
```

Runs TypeScript checking, numerical tests and a server-rendered React smoke test, and the production build. The smoke test checks page content, not browser behavior. Individual commands: `npm run typecheck`, `npm test`, `npm run build`. Use `npm run preview` to serve the production build locally.

## Deployment

GitHub Actions tests and builds pull requests. Pushes to `main` deploy `dist/` to GitHub Pages. Set repository Settings → Pages → Source to GitHub Actions.

Public URL: https://kaichi-irie.github.io/tpe-playground/

Vite's base path is `/tpe-playground/`. No backend, external fonts, or API credentials are required.

Keep secrets and personal data out of the source and examples. Environment variables exposed to frontend code (such as `VITE_*`) can be read in browser assets and cannot store secrets. If a credential is exposed, revoke or rotate it first; removing it from Git does not invalidate it.

See [CI and Pages protection](../docs/ci-security.md) for workflow permissions,
required PR checks, repository settings, and publication verification.

See [Agent workflow](agent-workflow.md) for how Claude plans issues, Codex
implements them, and Claude reviews and merges the PRs.

## References

The site's References section links to the papers behind the current single-objective TPE explorer:

- James S. Bergstra, Rémi Bardenet, Yoshua Bengio, and Balázs Kégl. [Algorithms for Hyper-Parameter Optimization](https://proceedings.neurips.cc/paper/2011/hash/86e8f7ab32cfd12577bc2619bc635690-Abstract.html). NIPS, 2011. Original TPE paper.
- Shuhei Watanabe. [Tree-Structured Parzen Estimator: Understanding Its Algorithm Components and Their Roles for Better Empirical Performance](https://arxiv.org/abs/2304.11127). arXiv:2304.11127, 2023. Review and empirical study of TPE algorithm components.

## Structure

- [src/App.tsx](../src/App.tsx): interactive plots, proposals, playback, and prior controls
- [src/model/](../src/model/): shared numerical engine, model snapshots, proposal traces and field evaluation
- [src/oneParamTpe.ts](../src/oneParamTpe.ts) and [src/twoParamTpe.ts](../src/twoParamTpe.ts): one- and two-parameter adapters for the common engine
- [Shared model contract](../docs/tpe-model.md): data ownership, group semantics, provenance and extension boundaries
- [src/oneParamTpe.test.ts](../src/oneParamTpe.test.ts): numerical and proposal-loop tests
- [src/main.tsx](../src/main.tsx): React entry point
- [src/style.css](../src/style.css): responsive styles
- [src/App.test.tsx](../src/App.test.tsx): smoke test
- [.github/workflows/deploy.yml](../.github/workflows/deploy.yml): validation and deployment

The live controls below the plot adjust the Good fraction γ (5–50%) and Gaussian bandwidth. In both Play 2D and Play 3D, choose Constant (the default), Scott, or Silverman under Settings → Model → Bandwidth rule. Dragging the Bandwidth slider switches to Constant and uses the selected width for the observation kernels in both KDEs. Automatic rules resolve widths separately for ℓ and g as observations change. The slider follows the first coordinate of ℓ. Play 3D displays both coordinate widths when available. Until Good has observation kernels, the automatic width display is unavailable and the slider retains the manual value.

Scott uses `s n^(-1/5)`. Silverman uses the robust rule `0.9 min(s, IQR/1.34) n^(-1/5)` ([R documentation](https://www.stat.ethz.ch/R-manual/R-devel/library/stats/html/bandwidth.html)). Here `s` is the sample standard deviation, `n` is the group's observation count, and quartiles use linear interpolation (type 7). Both rules use unweighted observation locations and exclude the prior; observation weights affect the mixture proportions only. Automatic widths use [Optuna-style magic clipping](https://github.com/optuna/optuna/blob/master/optuna/samplers/_tpe/parzen_estimator.py): `maximum = range`, `minimum = range / min(100, 1 + n + priorKernelCount)`, where `priorKernelCount` is 1 when the prior is enabled and 0 otherwise. Clipping is applied separately for each density and coordinate within a parameter group. A singleton has no estimable standard deviation; its raw width is zero, so it uses the same lower bound as coincident observations or a zero IQR. There is no separate spread fallback or temporal smoothing. For seed 50 with γ = 0.1 and the prior enabled, the good group's width changes from 3.333 to 2.5 when its count increases from one to two. These are clipped Scott/Silverman rules rather than unrestricted rule-of-thumb estimates. Constant widths are applied directly without automatic clipping. The prior retains its existing width. In Play 2D, Constant keeps the density axis fixed during playback. Automatic rules update the axis using the current kernel widths.

Changing settings or resetting defaults preserves evaluated observations and affects future proposals; densities, acquisition, and candidate sampling use the selected settings.

Searches run for 200 evaluations.

Each Play 2D objective is shifted by a constant so its minimum is 1. The comparison selector shows either the relative best-so-far error or average regret (cumulative objective gaps divided by evaluation count), on a logarithmic axis.

Play 3D switches between multivariate joint kernels and univariate independent axes. Switching keeps observations and historical proposal settings; future proposals use the new mode.

Play 3D includes Multimodal, Quadratic, and Rosenbrock objectives; changing the objective or choosing Settings → New seed restarts the search. New seed draws an integer from 0 to 99. Good fraction, bandwidth, weights, prior weight, startup trials, and candidate count preserve observations and change future proposals. Objective contours overlay a faint translucent surface. Linear height preserves relative function heights; optional Log1p height expands the valley bottom without changing optimization. Rosenbrock contours are computed directly from its level-curve equation to resolve the narrow valley. The diamond marks the optimum, numerically estimated for Multimodal. Performance compares against reproducible random search using absolute best-so-far gaps and average regret, supporting objectives with zero minima.
