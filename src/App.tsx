import { TopBar } from "./TopBar";
import { ErrorBoundary } from "./ErrorBoundary";
import { ChunkLoadComplete } from "./chunkReload";
import Play2D from "./Play2D";
import { playPageHrefs, readRoute, type Route } from "./shareSearch";
import { lazy, Suspense, useCallback, useEffect, useState, type MouseEvent } from "react";

const StepExplanation = lazy(() => import("./StepExplanation"));

const Play3D = lazy(() => import("./Play3D"));

function initialTheme(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const saved = localStorage.getItem("tpe-theme");
    if (saved === "dark" || saved === "light") return saved === "dark";
  } catch { /* System preference remains available when storage is blocked. */ }
  return window.matchMedia ? !window.matchMedia("(prefers-color-scheme: light)").matches : true;
}

export default function App({ initialRoute = { page: "play-2d", share: null } }: { initialRoute?: Route } = {}) {
  const [route, setRoute] = useState(() => ({ ...initialRoute, visit: 0, navigation: 0 }));
  const { page } = route;
  // Keep the Lab mounted after the first visit so its stage, progress, and settings survive tab switches.
  const [labVisited, setLabVisited] = useState(page === "lab");
  useEffect(() => { if (page === "lab") setLabVisited(true); }, [page]);
  const [algorithmContainer, setAlgorithmContainer] = useState<HTMLDivElement | null>(null);
  const syncRoute = useCallback(() => {
    const next = readRoute(window.location.hash);
    setRoute((current) => ({
      ...next,
      visit: current.page === next.page && !next.share ? current.visit : current.visit + 1,
      // Play 2D also pauses on hash changes that keep the same page and visit.
      navigation: current.navigation + 1,
    }));
  }, []);
  useEffect(() => {
    window.addEventListener("hashchange", syncRoute);
    return () => window.removeEventListener("hashchange", syncRoute);
  }, [syncRoute]);
  function openPlay2D(event: MouseEvent<HTMLAnchorElement>) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const { pathname, search, hash } = window.location;
    if (event.currentTarget.pathname !== pathname) return;
    event.preventDefault();
    if (!hash) return;
    window.history.pushState(null, "", `${pathname}${search}`);
    syncRoute();
  }
  const [dark, setDark] = useState(initialTheme);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#21252b" : "#f2f3f5");
  }, [dark]);
  return (
    <main className={`page-${page}`}>
      <TopBar page={page} dark={dark} onPlay2D={openPlay2D} onThemeChange={() => {
        const next = !dark;
        setDark(next);
        try { localStorage.setItem("tpe-theme", next ? "dark" : "light"); } catch { /* Theme still works without storage. */ }
      }} actionSlot={<div className="lab-header-actions" ref={setAlgorithmContainer} />} />
      <ErrorBoundary routeKey={`${page}:${route.visit}`} onError={() => setLabVisited(false)}>
      {(labVisited || page === "lab") && <div hidden={page !== "lab"} className="lab-page"><Suspense fallback={<p>Loading explanation…</p>}><StepExplanation visible={page === "lab"} algorithmContainer={page === "lab" ? algorithmContainer : null} />{page === "lab" && <ChunkLoadComplete />}</Suspense></div>}
      <div hidden={page === "about" || page === "lab"} className="play-page">
      {page === "play-3d" ? <Suspense fallback={<p>Loading 3D explorer…</p>}><Play3D key={route.visit} sharedSettings={route.share} /><ChunkLoadComplete /></Suspense> : null}
      <Play2D active={page === "play-2d"} hidden={page !== "play-2d"} sharedSettings={page === "play-2d" ? route.share : null}
        visit={route.visit} navigation={route.navigation} />
      </div>
      <article hidden={page !== "about"} className="about-page" aria-label="About">
        <figure className="tpe-mascot">
          <img src={new URL("./assets/fuwatane.webp", import.meta.url).href} width="640" height="585" alt="tippy, the fluffy TPE mascot holding red and blue crayons" decoding="async" />
          <figcaption>tippy</figcaption>
        </figure>
        <h2>What is TPE?</h2>
        <p><strong>TPE (Tree-structured Parzen Estimator) is a Bayesian optimization algorithm for black-box functions.</strong> It uses past evaluations to choose promising inputs, without a formula or gradient (<a href="https://proceedings.neurips.cc/paper/2011/hash/86e8f7ab32cfd12577bc2619bc635690-Abstract.html">Bergstra et al., 2011</a>).</p>
        <p>Think of tuning a machine learning model’s learning rate. Each evaluation requires training, so Bayesian optimization aims to find good settings with fewer trials.</p>
        <h2>TPE in Optuna</h2>
        <p>TPE is the default sampler in <a href="https://optuna.org/">Optuna</a> (<a href="https://arxiv.org/abs/1907.10902">paper</a>), implemented as <a href="https://optuna.readthedocs.io/en/stable/reference/samplers/generated/optuna.samplers.TPESampler.html">TPESampler</a> (<a href="https://github.com/optuna/optuna/blob/master/optuna/samplers/_tpe/sampler.py">source</a>). For multi-objective studies, the default changed from NSGA-II in 4.x to TPE in <a href="https://optuna.readthedocs.io/en/stable/reference/generated/optuna.create_study.html">5.0</a>.</p>
        <p>TPESampler supports <a href="https://doi.org/10.1613/jair.1.13188">multi-objective</a> and <a href="https://arxiv.org/abs/2606.09889">black-box constrained optimization</a>.</p>
        <h2>Inside TPE</h2>
        <ol className="explanation-steps">
          <li><strong>Split.</strong> The best fraction γ of observations forms the good group; the rest form the other group.</li>
          <li><strong>Model.</strong> Fit densities ℓ(x) and g(x) to the two groups using kernel density estimation (KDE).</li>
          <li><strong>Sample.</strong> Draw candidates from ℓ(x), evaluate the one with the highest ℓ(x)/g(x), and repeat.</li>
        </ol>
        <p>For bandwidths, weights, and other design choices, see <a href="https://arxiv.org/abs/2304.11127">Watanabe’s TPE tutorial</a>.</p>
        <h2>Explore the playground</h2>
        <ul className="explanation-steps">
          <li><strong><a href="#lab">Lab</a>.</strong> Follow one TPE decision step by step, from 10 observations to the next trial: split, kernels, densities, candidates, and the choice. Adjust γ, bandwidth, prior, weighting, and the number of candidates along the way, with hints for each control.</li>
          <li><strong><a href={playPageHrefs["play-2d"]} onClick={openPlay2D}>Play 2D</a>.</strong> Run TPE on a one-dimensional objective, trial by trial. Watch ℓ(x), g(x), and their ratio change, and compare progress against random search.</li>
          <li><strong><a href={playPageHrefs["play-3d"]}>Play 3D</a>.</strong> Run TPE on a two-dimensional surface. Compare multivariate and univariate density models, and add a constraint to see constrained search.</li>
        </ul>
        <p>In Play 2D and Play 3D, <strong>Settings → Share link</strong> copies a URL that restarts the same search: objective, seed, settings, and any constraint.</p>
        <p>TPE Playground is a simplified educational implementation: single-objective, with continuous inputs only. <a href="https://github.com/Kaichi-Irie/tpe-playground">View the playground’s source code on GitHub</a>.</p>
        <h2>Constrained TPE</h2>
        <p>Play 3D can restrict the search to a feasible region c(x) ≤ 0. Constraint values are observed like the objective, so TPE learns the region from trials.</p>
        <p>The playground follows Optuna’s <strong>joint</strong> approach. Feasible trials rank first by objective value. If they cannot fill the good group, <strong>Infeasible filling</strong> adds the infeasible trials with the smallest violation. A single pair ℓ(x), g(x) then models objective and feasibility together (<a href="https://arxiv.org/abs/2606.09889">Watanabe &amp; Irie, 2026</a>).</p>
        <p>The original <a href="https://ijcai.org/proceedings/2023/486">c-TPE</a> instead fits a separate density ratio to each constraint and multiplies them. That independent variant is not implemented here.</p>
        <section className="algorithm-comparison" aria-labelledby="comparison-heading">
          <h2 id="comparison-heading">TPE and other optimizers</h2>
          <div className="algorithm-table-scroll" role="region" aria-label="Optimization algorithm comparison" tabIndex={0}>
            <table className="algorithm-table">
              <thead><tr><th scope="col">Method</th><th scope="col">How it searches</th><th scope="col">Typical use</th></tr></thead>
              <tbody>
                <tr><th scope="row">TPE<span className="algorithm-software"><a href="https://optuna.readthedocs.io/en/stable/reference/samplers/generated/optuna.samplers.TPESampler.html">Optuna</a> · <a href="https://hyperopt.github.io/hyperopt/">Hyperopt</a></span></th><td>Bayesian optimization using the good/rest density ratio ℓ(x)/g(x).</td><td>Continuous, discrete, categorical, and conditional spaces.</td></tr>
                <tr><th scope="row">GP (Gaussian process)<span className="algorithm-software"><a href="https://optuna.readthedocs.io/en/stable/reference/samplers/generated/optuna.samplers.GPSampler.html">Optuna</a> · <a href="https://botorch.org/docs/introduction">BoTorch</a></span></th><td>Bayesian optimization using predicted objective values and uncertainty.</td><td>Low-dimensional continuous spaces; discrete inputs need extra treatment.</td></tr>
                <tr><th scope="row">CMA-ES<span className="algorithm-software"><a href="https://optuna.readthedocs.io/en/stable/reference/samplers/generated/optuna.samplers.CmaEsSampler.html">Optuna</a> · <a href="https://github.com/CMA-ES/pycma">pycma</a></span></th><td>Evolutionary search adapting a Gaussian’s mean, covariance, and step size.</td><td>Continuous spaces with strong parameter interactions.</td></tr>
                <tr><th scope="row">Random search</th><td>Samples independently of past results.</td><td>A simple baseline.</td></tr>
              </tbody>
            </table>
          </div>
        </section>
      <section className="references" aria-labelledby="references-heading">
        <h2 id="references-heading">References</h2>
        <ol>
          <li>
            <a href="https://proceedings.neurips.cc/paper/2011/hash/86e8f7ab32cfd12577bc2619bc635690-Abstract.html">Algorithms for Hyper-Parameter Optimization</a>
            <p>Bergstra et al. · NIPS 2011 · Original TPE.</p>
          </li>
          <li>
            <a href="https://arxiv.org/abs/1907.10902">Optuna: A Next-generation Hyperparameter Optimization Framework</a>
            <p>Akiba et al. · KDD 2019 · Optuna framework.</p>
          </li>
          <li>
            <a href="https://arxiv.org/abs/2304.11127">Tree-Structured Parzen Estimator: Understanding Its Algorithm Components and Their Roles for Better Empirical Performance</a>
            <p>Watanabe · 2023 · TPE components and design choices.</p>
          </li>
          <li>
            <a href="https://doi.org/10.1613/jair.1.13188">Multiobjective Tree-Structured Parzen Estimator</a>
            <p>Ozaki et al. · JAIR 2022 · MOTPE.</p>
          </li>
          <li>
            <a href="https://ijcai.org/proceedings/2023/486">c-TPE: Tree-structured Parzen Estimator with Inequality Constraints for Expensive Hyperparameter Optimization</a>
            <p>Watanabe &amp; Hutter · IJCAI 2023 · Constrained TPE.</p>
          </li>
          <li>
            <a href="https://arxiv.org/abs/2606.09889">Optuna Constrained Tree-Structured Parzen Estimator Is a Joint Density Generalization of c-TPE</a>
            <p>Watanabe &amp; Irie · 2026 preprint · Optuna’s joint-density constraint handling.</p>
          </li>
        </ol>
      </section>
      </article>
      {(page === "play-2d" || page === "about") && <ChunkLoadComplete />}
      </ErrorBoundary>
      <footer><span>Browser-only computation</span></footer>
    </main>
  );
}
