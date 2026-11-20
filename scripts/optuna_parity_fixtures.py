"""Regenerate the reference fixture with Optuna 5.1.0.

uv run --with optuna==5.1.0 python scripts/optuna_parity_fixtures.py
"""

import json
from pathlib import Path

import numpy as np
import optuna
from optuna.distributions import FloatDistribution
from optuna.samplers import TPESampler
from optuna.samplers._tpe.sampler import _split_trials, default_gamma
from optuna.trial import create_trial

OPTUNA_VERSION = "5.1.0"
LOW, HIGH = -5, 5
FIXTURE = Path(__file__).resolve().parents[1] / "src/model/fixtures/optuna-5.1-parity.json"


def reference_density(sampler, study, space, trials, points, *, below):
    estimator = sampler._build_parzen_estimator(study, space, trials, handle_below=below)
    mixture = estimator._mixture_distribution
    kernels = [
        {
            "trialId": trials[i].number if i < len(trials) else None,
            "center": {name: d.mu[i] for name, d in zip(space, mixture.distributions)},
            "bandwidths": {name: d.sigma[i] for name, d in zip(space, mixture.distributions)},
            "mixtureWeight": weight,
        }
        for i, weight in enumerate(mixture.weights)
    ]
    return {"kernels": kernels, "logPdf": estimator.log_pdf(points).tolist()}


def make_case(name, count, dimensions=1, mode="univariate", direction="minimize",
              constraints=None, boundary=False):
    rng = np.random.RandomState(75)
    ids = ["x"] if dimensions == 1 else ["x1", "x2"]
    search_space = {param: FloatDistribution(LOW, HIGH) for param in ids}
    positions = rng.uniform(LOW, HIGH, size=(count, dimensions))
    objectives = rng.normal(size=count)
    if boundary:
        # Put the boundary and the near-coincident cluster in Good.
        positions[:3, 0] = [LOW, LOW + 1e-6, LOW + 2e-6]
        objectives[:3] = [-12, -11, -10]

    sampler = TPESampler()
    study = optuna.create_study(direction=direction, sampler=sampler)
    for i in range(count):
        study.add_trial(create_trial(
            params=dict(zip(ids, positions[i].tolist())),
            distributions=search_space,
            value=float(objectives[i]),
            constraints=None if constraints is None else constraints[i],
        ))

    trials = study.trials
    below, above = _split_trials(study, trials, default_gamma(count))
    coordinates = rng.uniform(LOW, HIGH, size=(50, dimensions))
    coordinates[:2] = [LOW] * dimensions, [HIGH] * dimensions
    points = dict(zip(ids, coordinates.T))
    spaces = [search_space] if mode == "multivariate" else [
        {key: distribution} for key, distribution in search_space.items()
    ]
    return {
        "name": name,
        "problem": {
            "id": name,
            "parameters": [{"id": param, "low": LOW, "high": HIGH} for param in ids],
            "directions": [direction],
            "constraintCount": len(constraints[0]) if constraints is not None else 0,
        },
        "mode": mode,
        "trials": [
            {"id": t.number, "params": t.params, "objectives": t.values,
             "constraints": list(t.constraints.values())}
            for t in trials
        ],
        "goodIds": [t.number for t in below],
        "badIds": [t.number for t in above],
        "points": [dict(zip(ids, point)) for point in coordinates.tolist()],
        "groups": [
            {
                "parameterIds": list(space),
                "good": reference_density(sampler, study, space, below,
                                          {p: points[p] for p in space}, below=True),
                "bad": reference_density(sampler, study, space, above,
                                         {p: points[p] for p in space}, below=False),
            }
            for space in spaces
        ],
    }


def main():
    if optuna.__version__ != OPTUNA_VERSION:
        raise SystemExit(f"Expected Optuna {OPTUNA_VERSION}, got {optuna.__version__}")
    optuna.logging.set_verbosity(optuna.logging.WARNING)

    cases = [make_case(f"1D n={count}", count) for count in (10, 11, 29, 30, 60, 200)]
    cases.extend(
        make_case(f"2D {mode} n={count}", count, dimensions=2, mode=mode)
        for mode in ("multivariate", "univariate")
        for count in (10, 30, 200)
    )
    cases.append(make_case("1D boundary and clip floor", 30, boundary=True))
    rng = np.random.RandomState(751)
    constraints = [{"c1": float(a), "c2": float(b)}
                   for a, b in zip(rng.uniform(-1, 1, 30), rng.uniform(-1, 0.1, 30))]
    cases.append(make_case("2D constrained", 30, dimensions=2, mode="multivariate",
                           constraints=constraints))
    cases.append(make_case("1D maximize", 30, direction="maximize"))

    FIXTURE.write_text(json.dumps({"optunaVersion": optuna.__version__, "cases": cases},
                                  indent=2, allow_nan=False) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
