import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { ProgressComparison2D } from "./ProgressComparison2D";
import { emptyPlayback2D, findObjectiveMinimum2D, movePlayback2D, objectivePresets2D, settings2D } from "./tpe2d";

it("uses a reproducible random baseline sharing startup observations for every 2D objective", () => {
  for (const objectivePreset of Object.keys(objectivePresets2D) as (keyof typeof objectivePresets2D)[]) {
    const random = movePlayback2D(emptyPlayback2D(), 200, 42, "multivariate", { startupTrials: settings2D.count, objectivePreset });
    const search = movePlayback2D(emptyPlayback2D(), 12, 42, "multivariate", { objectivePreset });
    expect(search.trials.slice(0, 10)).toEqual(random.trials.slice(0, 10));
    const minimum = findObjectiveMinimum2D(objectivePreset);
    expect(Number.isFinite(minimum)).toBe(true);
    expect(search.trials.every((trial) => trial.value >= minimum - 1e-10)).toBe(true);
    const html = renderToStaticMarkup(<ProgressComparison2D trials={search.trials} seed={42} objectivePreset={objectivePreset} />);
    expect(html).toContain("Performance");
    expect(html).toContain("Best so far");
    expect(html).toContain("Average regret");
    expect(html).toContain("Random search");
    expect(html).toContain("Shown through trial 12");
    expect(html).not.toContain("NaN");
    expect(html).not.toContain("Infinity");
  }
});
