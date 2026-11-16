/** Card model shared by all games. A card id is rank + suit, e.g. "AS", "TD", "KH". */

export const SUITS = ['S', 'H', 'D', 'C'] as const;
export type Suit = (typeof SUITS)[number];

export const RANK_CHARS = 'A23456789TJQK';

/** 1 = Ace … 13 = King. */
export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;

export type CardId = string;

export type Colour = 'red' | 'black';

export function cardId(rank: number, suit: Suit): CardId {
  const ch = RANK_CHARS[rank - 1];
  if (ch === undefined) throw new Error(`Invalid rank ${rank}`);
  return ch + suit;
}

export function rankOf(id: CardId): Rank {
  const rank = RANK_CHARS.indexOf(id.charAt(0)) + 1;
  if (rank < 1) throw new Error(`Invalid card id ${id}`);
  return rank as Rank;
}

export function suitOf(id: CardId): Suit {
  const suit = id.charAt(1) as Suit;
  if (!SUITS.includes(suit)) throw new Error(`Invalid card id ${id}`);
  return suit;
}

export function colourOf(id: CardId): Colour {
  const suit = suitOf(id);
  return suit === 'H' || suit === 'D' ? 'red' : 'black';
}

/** A full 52-card deck in a fixed order: spades A–K, hearts, diamonds, clubs. */
export function fullDeck(): CardId[] {
  const deck: CardId[] = [];
  for (const suit of SUITS) {
    for (let rank = 1; rank <= 13; rank++) deck.push(cardId(rank, suit));
  }
  return deck;
}
