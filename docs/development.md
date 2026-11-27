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

See [AGENTS.md](../AGENTS.md) for repository conventions, PR checks, and agent boundaries.

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

The live controls below the plot adjust the Good fraction γ (5–50%) and Gaussian bandwidth. In both Play 2D and Play 3D, choose Constant (the default), Scott, or Optuna under Settings → Model → Bandwidth rule. Dragging the Bandwidth slider switches to Constant and uses the selected width for the observation kernels in both KDEs. Automatic rules resolve widths separately for ℓ and g as observations change. The slider follows the median observation width of the first coordinate of ℓ. The readout shows a min–max range when widths vary, with a separate readout per coordinate in Play 3D. Until Good has observation kernels, the automatic width display is unavailable and the slider retains the manual value.

Scott uses `s n^(-1/5)`. Here `s` is the sample standard deviation and `n` is the group's observation count. The rule uses unweighted observation locations and exclude the prior; observation weights affect the mixture proportions only. Magic clipping bounds automatic widths between `range / min(100, 1 + n + priorKernelCount)` and `range`. Here `priorKernelCount` is 1 when the prior is enabled and 0 otherwise. Clipping is applied separately for each density and coordinate within a parameter group. For Scott, a singleton has no estimable standard deviation; its raw width is zero, so it uses the same lower bound as coincident observations. There is no separate spread fallback or temporal smoothing. For seed 50 with γ = 0.1 and the prior enabled, the good group's width changes from 3.333 to 2.5 when its count increases from one to two. This is a clipped Scott rule rather than unrestricted rule-of-thumb estimates. Constant widths are applied directly without automatic clipping. The prior retains its existing width. In Play 2D, the density axis follows the largest truncated kernel peak. Under Constant it stays stable during playback except when a kernel is near ±5.

The Optuna rule assigns each observation kernel the larger gap to its neighboring centers within its group and coordinate. With at least two centers, each outermost center uses only the gap to the next observation inside the box. A singleton uses the larger gap to the box edges. The prior is excluded from the gap calculation.

Optuna weights give the newest 25 observations in each group weight 1 and ramp the older weights linearly from `1 / n` to 1. If there is only one older observation, it gets `1 / n`. The raw weights and prior weight are normalized together. The **Optuna preset** button applies both options and the rest of Optuna’s model settings. Its share link uses `tpe=optuna`. See [Optuna parity](tpe-model.md#optuna-parity).

Changing settings or resetting defaults preserves evaluated observations and affects future proposals; densities, acquisition, and candidate sampling use the selected settings.

Searches run for 200 evaluations.

Each Play 2D objective is shifted by a constant so its minimum is 1. The comparison selector shows either the relative best-so-far error or average regret (cumulative objective gaps divided by evaluation count), on a logarithmic axis.

Play 3D switches between multivariate joint kernels and univariate independent axes. Switching keeps observations and historical proposal settings; future proposals use the new mode.

Play 3D includes Multimodal, Quadratic, and Rosenbrock objectives; changing the objective or choosing Settings → New seed restarts the search. New seed draws an integer from 0 to 99. Good fraction, bandwidth, weights, prior weight, startup trials, and candidate count preserve observations and change future proposals. Objective contours overlay a faint translucent surface. Linear height preserves relative function heights; optional Log1p height expands the valley bottom without changing optimization. Rosenbrock contours are computed directly from its level-curve equation to resolve the narrow valley. The diamond marks the optimum, numerically estimated for Multimodal. Performance compares against reproducible random search using absolute best-so-far gaps and average regret, supporting objectives with zero minima.
