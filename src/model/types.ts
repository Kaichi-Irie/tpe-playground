export type Point = Readonly<Record<string, number>>;
export interface Parameter { readonly id: string; readonly low: number; readonly high: number }
export interface Problem {
  readonly id: string;
  readonly parameters: readonly Parameter[];
  readonly directions: readonly ("minimize" | "maximize")[];
  readonly constraintCount: number;
}
export interface Observation {
  readonly id: number;
  readonly params: Point;
  readonly objectives: readonly number[];
  readonly constraints: readonly number[];
}
