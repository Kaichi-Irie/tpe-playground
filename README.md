# <img src="public/favicon.svg" width="40" height="40" alt="TPE Playground favicon"> TPE Playground

[**Open TPE Playground →**](https://kaichi-irie.github.io/tpe-playground/)

<img src="src/assets/fuwatane.webp" width="150" align="right" alt="tippy, the TPE Playground mascot holding red and blue crayons">

An interactive playground for understanding the Tree-structured Parzen Estimator (TPE).
Runs entirely in your browser.

- **Lab**: follow one TPE decision step by step: split, kernels, densities, candidates, and the choice.
- **Play 2D**: run TPE on a one-dimensional objective and compare it with random search.
- **Play 3D**: run TPE on a two-dimensional surface, compare multivariate and univariate density models, and add constraints.

TPE Playground is a simplified, single-objective implementation for learning. Constraints follow Optuna's joint approach: feasible trials rank first, and infeasible trials with the smallest violation can fill the rest of the good group, so one density pair models objective and feasibility together ([Watanabe & Irie, 2026](https://arxiv.org/abs/2606.09889)).

In Play 2D or Play 3D, use **Settings → Share link** to copy the objective, seed, and model and search settings. When a Play 3D constraint is active, the link also includes its preset and the **Infeasible filling** setting. The link stays in the address bar, and reloading starts a fresh run at trial 0 with the linked settings and seed. Edits stay in the current run. To share those edits, use **Share link** again to copy a new URL.

## Future work

- Independent c-TPE: the original [c-TPE](https://ijcai.org/proceedings/2023/486) formulation, which fits a separate density ratio to each constraint and multiplies them, for comparison with the joint approach.
- Multi-objective optimization (MOTPE)

## Run locally

Node.js 22.12+ and npm.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5173/tpe-playground/. Run `npm run check` for type checking, tests, and a production build.

[Development and model notes](docs/development.md) · [Model architecture](docs/tpe-model.md)

## License

[MIT](LICENSE) · [Third-party notices](THIRD_PARTY_NOTICES.md)
