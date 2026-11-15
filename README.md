# <img src="public/favicon.svg" width="40" height="40" alt="TPE Playground favicon"> TPE Playground

[**Open TPE Playground →**](https://kaichi-irie.github.io/tpe-playground/)

<img src="src/assets/fuwatane.webp" width="150" align="right" alt="tippy, the TPE Playground mascot holding red and blue crayons">

An interactive playground for understanding the Tree-structured Parzen Estimator (TPE).
Explore sampling and density estimation in Play 2D / 3D, or walk through the algorithm in the Lab.
Runs entirely in your browser.

Currently a simplified, single-objective, unconstrained TPE implementation for learning.

## Planned

- [ ] Constrained optimization (c-TPE)
- [ ] Multi-objective optimization (MOTPE)

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
