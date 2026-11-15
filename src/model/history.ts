// Shared history movement; page adapters own evaluation and their legacy trial shapes.
export function advanceHistory<T, P>(trials: readonly T[], proposals: readonly P[], next: number, limit: number, propose: (past: readonly T[]) => P, evaluate: (proposal: P, id: number) => T) {
  if (!Number.isInteger(next)) throw new Error("Trial step must be an integer.");
  const step = Math.max(0, Math.min(limit, next));
  const keptTrials = trials.slice(0, step), keptProposals = proposals.slice(0, step);
  while (keptTrials.length < step) {
    const proposal = propose(keptTrials);
    keptProposals.push(proposal);
    keptTrials.push(evaluate(proposal, keptTrials.length + 1));
  }
  return { step, trials: keptTrials, proposals: keptProposals };
}
