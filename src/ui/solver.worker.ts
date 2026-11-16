/**
 * Runs the solver away from the page, so searching never makes the cards stutter.
 * Its jobs: find a winnable deal, work out the day's daily deal, and analyse a game in progress.
 */

import type { KlondikeOptions, KlondikeState } from '../engine/klondike';
import { dailyDeal } from '../engine/daily';
import { randomDealNumber } from '../engine/rng';
import { type SolveResult, analyse, findWinnableDeal } from '../engine/solver';

export type SolverJob =
  | { kind: 'winnable'; options: KlondikeOptions }
  | { kind: 'daily'; day: string; options: KlondikeOptions }
  | { kind: 'analyse'; state: KlondikeState };

export type SolverAnswer =
  | { kind: 'winnable'; seed: number | null; tries: number }
  | { kind: 'daily'; seed: number }
  | { kind: 'analyse'; result: SolveResult };

const MAX_TRIES = 300;

function run(job: SolverJob): SolverAnswer {
  if (job.kind === 'analyse') return { kind: 'analyse', result: analyse(job.state) };
  if (job.kind === 'daily') return { kind: 'daily', seed: dailyDeal(job.day, job.options) };
  const found = findWinnableDeal(job.options, randomDealNumber, { maxTries: MAX_TRIES });
  return { kind: 'winnable', seed: found?.seed ?? null, tries: found?.tries ?? MAX_TRIES };
}

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<{ id: number; job: SolverJob }>) => void) | null;
  postMessage(reply: { id: number; answer: SolverAnswer }): void;
};

scope.onmessage = ({ data }) => {
  scope.postMessage({ id: data.id, answer: run(data.job) });
};
