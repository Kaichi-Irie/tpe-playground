import { twoParamConstraintPresets, getTwoParamConstraint, type TwoParamConstraintPreset } from "./twoParamConstraints";
import { Help } from "./Help";
import { HelpMath } from "./HelpMath";

export function Play3DConstraintSettings({ preset, infeasibleFilling, onPresetChange, onFillingChange }: {
  preset: TwoParamConstraintPreset;
  infeasibleFilling: boolean;
  onPresetChange: (preset: TwoParamConstraintPreset) => void;
  onFillingChange?: (enabled: boolean) => void;
}) {
  const definition = getTwoParamConstraint(preset);
  return <>
    <div className="parameter constraint-picker">
      <div className="parameter-label"><label htmlFor="constraint-preset-play-3d">Constraint</label>
        <Help label="Play 3D constraint preset"><strong>{definition.label}</strong><br />
          {definition.description}{definition.formula && <> Feasible when:<HelpMath tex={definition.formula} /></>}{preset === "none" && <br />}
          {preset !== "none" && <>About {definition.feasibleShare} of the domain is feasible. </>}Changing the constraint restarts the search.
        </Help>
      </div>
      <select id="constraint-preset-play-3d" value={preset} onChange={(event) => onPresetChange(event.target.value as TwoParamConstraintPreset)}>
        {Object.entries(twoParamConstraintPresets).map(([id, constraint]) => <option key={id} value={id}>{constraint.label}</option>)}
      </select>
    </div>
    {preset !== "none" && onFillingChange && <div className="parameter infeasible-filling">
      <label><input type="checkbox" checked={infeasibleFilling} onChange={(event) => onFillingChange(event.target.checked)} /> Infeasible filling</label>
      <Help label="infeasible filling">Good takes feasible trials first. With filling on, the least-violating infeasible trials, those closest to the feasible region, fill open slots. With filling off, Good can fall short of its target size.</Help>
    </div>}
  </>;
}
