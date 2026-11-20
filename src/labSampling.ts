type SamplingAction =
  | { type: "roll" | "rollRest"; limit: number }
  | { type: "resize"; limit: number; reveal: boolean }
  | { type: "reset"; revealed?: number };

// M controls the visible prefix, while this state remembers every revealed draw.
export function samplingReducer(revealed: number, action: SamplingAction): number {
  switch (action.type) {
    case "roll":
      if (revealed >= action.limit) return revealed;
      return revealed + 1;
    case "rollRest":
      return Math.max(revealed, action.limit);
    case "resize":
      return action.reveal ? Math.max(revealed, action.limit) : revealed;
    case "reset":
      return action.revealed ?? 0;
  }
}
