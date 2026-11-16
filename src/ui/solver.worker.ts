/**
 * Runs the solver away from the page, so searching never makes the cards stutter.
 * Each request asks for a winnable deal with the given rules.
 */

import type { KlondikeOptions } from '../engine/klondike';
import { randomDealNumber } from '../engine/rng';
import { findWinnableDeal } from '../engine/solver';

export interface WinnableRequest {
  id: number;
  options: KlondikeOptions;
}

export interface WinnableReply {
  id: number;
  /** A winnable deal number, or null if none was found in time. */
  seed: number | null;
  tries: number;
  ms: number;
}

const MAX_TRIES = 300;

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<WinnableRequest>) => void) | null;
  postMessage(reply: WinnableReply): void;
};

scope.onmessage = ({ data }) => {
  const started = performance.now();
  const found = findWinnableDeal(data.options, randomDealNumber, { maxTries: MAX_TRIES });
  scope.postMessage({
    id: data.id,
    seed: found?.seed ?? null,
    tries: found?.tries ?? MAX_TRIES,
    ms: Math.round(performance.now() - started),
  });
};
