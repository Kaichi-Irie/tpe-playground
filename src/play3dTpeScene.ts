import type { Play3DSceneItem } from "./Play3DCanvas";
import type { TwoParamProjectedPoint } from "./projectTwoParamSurface";
import type { TwoParamProposal } from "./twoParamTpe";

const axisCandidateTickLength = 0.38;
const guideSegmentCount = 16;

export interface Play3DCandidateInspectorEntry {
  id: string;
  label: string;
  x: number;
  y: number;
  selected: boolean;
}

export function buildPlay3DCandidateScene(
  proposal: TwoParamProposal | null,
  visible: boolean,
  project: (x: number, y: number, height: number) => TwoParamProjectedPoint,
  onInspect: (label: string) => void,
  options: { tickDirection?: -1 | 1; includeFloorAnchor?: boolean } = {},
): {
  items: Play3DSceneItem[];
  hitTargets: Play3DSceneItem[];
  inspectorEntries: Play3DCandidateInspectorEntry[];
  defaultInspectorIndex: number;
} {
  if (!visible || !proposal) return { items: [], hitTargets: [], inspectorEntries: [], defaultInspectorIndex: 0 };
  const tickOffset = (options.tickDirection ?? -1) * axisCandidateTickLength;
  const includeFloorAnchor = options.includeFloorAnchor ?? true;
  const items: Play3DSceneItem[] = [];
  const hitTargets: Play3DSceneItem[] = [];
  const inspectorEntries: Play3DCandidateInspectorEntry[] = [];
  if (proposal.candidates.length > 0) {
    proposal.candidates.forEach((candidate, index) => {
      const selected = index === proposal.selectedCandidateIndex;
      const p = project(candidate.x1, candidate.x2, 0);
      const label = `${selected ? "Selected candidate" : "Candidate"} ${index + 1} · x₁ = ${candidate.x1.toFixed(2)}, x₂ = ${candidate.x2.toFixed(2)} · log ℓ/g = ${candidate.logRatio.toFixed(3)}`;
      const item: Play3DSceneItem = {
        id: `candidate-${index}`,
        kind: "candidate",
        depth: p.depth + (selected ? 0.028 : 0.02),
        x: p.x,
        y: p.y,
        selected,
        inspect: () => onInspect(label),
      };
      items.push(item);
      hitTargets.push(item);
      inspectorEntries.push({ id: item.id, label, x: p.x, y: p.y, selected });
    });
    hitTargets.sort((a, b) => a.depth - b.depth);
    return { items, hitTargets, inspectorEntries, defaultInspectorIndex: proposal.selectedCandidateIndex ?? 0 };
  }
  if (proposal.axisCandidates) {
    const { x1, x2, selectedX1Index, selectedX2Index } = proposal.axisCandidates;
    const combinedFloor = project(proposal.x1, proposal.x2, 0);
    const x1Selected = x1[selectedX1Index];
    const x2Selected = x2[selectedX2Index];
    if (x1Selected && x2Selected) {
      inspectorEntries.push({
        id: "candidate-winners",
        label: `Selected candidates · x₁ #${selectedX1Index + 1} = ${x1Selected.value.toFixed(2)} (log ℓ/g = ${x1Selected.logRatio.toFixed(3)}) · x₂ #${selectedX2Index + 1} = ${x2Selected.value.toFixed(2)} (log ℓ/g = ${x2Selected.logRatio.toFixed(3)})`,
        x: combinedFloor.x,
        y: combinedFloor.y,
        selected: true,
      });
    }
    x1.forEach((candidate, index) => {
      const selected = index === selectedX1Index;
      const start = project(candidate.value, -5, 0);
      const end = project(candidate.value, -5 + tickOffset, 0);
      const label = `${selected ? "Selected x₁ candidate" : "x₁ candidate"} ${index + 1} · x₁ = ${candidate.value.toFixed(2)} · log ℓ/g = ${candidate.logRatio.toFixed(3)}`;
      const item: Play3DSceneItem = {
        id: `candidate-x1-${index}`,
        kind: "axis-candidate",
        depth: selected ? start.depth + 0.028 : (start.depth + end.depth) / 2 + 0.02,
        points: [start.x, start.y, end.x, end.y],
        x: start.x,
        y: start.y,
        selected,
        inspect: () => onInspect(label),
      };
      items.push(item);
      hitTargets.push(item);
      inspectorEntries.push({ id: item.id, label, x: start.x, y: start.y, selected });
    });
    x2.forEach((candidate, index) => {
      const selected = index === selectedX2Index;
      const start = project(-5, candidate.value, 0);
      const end = project(-5 + tickOffset, candidate.value, 0);
      const label = `${selected ? "Selected x₂ candidate" : "x₂ candidate"} ${index + 1} · x₂ = ${candidate.value.toFixed(2)} · log ℓ/g = ${candidate.logRatio.toFixed(3)}`;
      const item: Play3DSceneItem = {
        id: `candidate-x2-${index}`,
        kind: "axis-candidate",
        depth: selected ? start.depth + 0.028 : (start.depth + end.depth) / 2 + 0.02,
        points: [start.x, start.y, end.x, end.y],
        x: start.x,
        y: start.y,
        selected,
        inspect: () => onInspect(label),
      };
      items.push(item);
      hitTargets.push(item);
      inspectorEntries.push({ id: item.id, label, x: start.x, y: start.y, selected });
    });
    const addSubdividedGuide = (prefix: string, startX1: number, startX2: number, endX1: number, endX2: number) => {
      let prev = project(startX1, startX2, 0);
      let dashOffset = 0;
      for (let i = 1; i <= guideSegmentCount; i++) {
        const next = i === guideSegmentCount
          ? project(endX1, endX2, 0)
          : project(startX1 + (endX1 - startX1) * (i / guideSegmentCount), startX2 + (endX2 - startX2) * (i / guideSegmentCount), 0);
        items.push({
          id: `${prefix}-${i}`,
          kind: "guide",
          depth: (prev.depth + next.depth) / 2 + 0.018,
          points: [prev.x, prev.y, next.x, next.y],
          dashOffset,
        });
        dashOffset += Math.hypot(next.x - prev.x, next.y - prev.y);
        prev = next;
      }
    };
    addSubdividedGuide("candidate-guide-x1", proposal.x1, -5, proposal.x1, proposal.x2);
    addSubdividedGuide("candidate-guide-x2", -5, proposal.x2, proposal.x1, proposal.x2);
    if (includeFloorAnchor) {
      items.push({
        id: "candidate-floor-anchor",
        kind: "floor-anchor",
        depth: combinedFloor.depth + 0.028,
        x: combinedFloor.x,
        y: combinedFloor.y,
      });
    }
    hitTargets.sort((a, b) => a.depth - b.depth);
    return { items, hitTargets, inspectorEntries, defaultInspectorIndex: 0 };
  }
  return { items: [], hitTargets: [], inspectorEntries: [], defaultInspectorIndex: 0 };
}
