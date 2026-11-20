import { advanceHistory } from "./model/history";
import { getObjective } from "./objectives";
import { trialLimit, proposeTrial, type SearchConfig, type Proposal, type Trial } from "./tpe";

interface Playback {
  step: number;
  trials: Trial[];
  proposals: Proposal[];
}

export const emptyPlayback = (): Playback => ({ step: 0, trials: [], proposals: [] });

export function movePlayback(state: Playback, next: number, seed: number, priorWeight: number, config: SearchConfig): Playback {
  return advanceHistory(state.trials, state.proposals, next, trialLimit,
    (past) => proposeTrial(past, seed, priorWeight, config),
    (proposal, id) => ({ id, x: proposal.x, y: getObjective(config.objectivePreset).evaluate(proposal.x) }));
}

// A parameter edit branches from the displayed observations, never rewrites them.
export function keepObservations(state: Playback): Playback {
  return { step: state.step, trials: state.trials.slice(0, state.step), proposals: state.proposals.slice(0, state.step) };
}
