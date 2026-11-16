/** A Klondike game in progress: the current position plus undo and redo history. */

import {
  DEFAULT_OPTIONS,
  type KlondikeOptions,
  type KlondikeState,
  type Move,
  applyMove,
  deal,
  isLegal,
} from './klondike';

interface Entry {
  /** The position before the move. */
  readonly state: KlondikeState;
  readonly move: Move;
}

export class KlondikeGame {
  state: KlondikeState;
  private past: Entry[] = [];
  /** Undone moves, most recently undone last. */
  private future: Move[] = [];

  constructor(seed: number, options: KlondikeOptions = DEFAULT_OPTIONS) {
    this.state = deal(seed, options);
  }

  /** Rebuilds a saved game by replaying its moves. Stops at the first move that no longer applies. */
  static restore(seed: number, options: KlondikeOptions, moves: readonly Move[]): KlondikeGame {
    const game = new KlondikeGame(seed, options);
    for (const move of moves) {
      if (!game.play(move)) break;
    }
    return game;
  }

  /** The moves that lead from the deal to the current position. */
  get log(): Move[] {
    return this.past.map((entry) => entry.move);
  }

  /** Plays a move if it is legal. Returns whether it was played. */
  play(move: Move): boolean {
    if (!isLegal(this.state, move)) return false;
    this.past.push({ state: this.state, move });
    this.future = [];
    this.state = applyMove(this.state, move);
    return true;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  undo(): boolean {
    const entry = this.past.pop();
    if (!entry) return false;
    this.future.push(entry.move);
    this.state = entry.state;
    return true;
  }

  redo(): boolean {
    const move = this.future.pop();
    if (!move) return false;
    this.past.push({ state: this.state, move });
    this.state = applyMove(this.state, move);
    return true;
  }
}
