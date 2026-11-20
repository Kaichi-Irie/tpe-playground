# <img src="public/favicon.svg" width="40" height="40" alt="TPE Playground favicon"> TPE Playground

[**Open TPE Playground →**](https://kaichi-irie.github.io/tpe-playground/)

<img src="src/assets/fuwatane.webp" width="150" align="right" alt="tippy, the TPE Playground mascot holding red and blue crayons">

An interactive playground for understanding the Tree-structured Parzen Estimator (TPE), the default sampler in [Optuna](https://optuna.org/).
Watch TPE split past trials into good and bad groups, model each group with a density, and choose the next point where good is most likely relative to bad.
The implementation is simplified for learning and runs entirely in your browser.

- **Lab**: follow one TPE decision step by step, from the split to the chosen point.
- **Play 2D**: run TPE on a one-dimensional function and compare it with random search.
- **Play 3D**: run TPE on a two-dimensional surface, with multivariate or univariate densities and optional constraints.
- **Share link**: copy a URL that reproduces your objective, seed, and settings.

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

The [one-parameter adapter](src/oneParamTpe.ts) serves Play 2D and the Lab. The [two-parameter adapter](src/twoParamTpe.ts) serves Play 3D.

[Development and model notes](docs/development.md) · [Model architecture](docs/tpe-model.md)

## License

[MIT](LICENSE) · [Third-party notices](THIRD_PARTY_NOTICES.md)
