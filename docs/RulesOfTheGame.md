# Rules of the game

This document describes the three solitaire games in the plan: Klondike, FreeCell and Spider. It is the specification the game engine is built and tested against. Klondike is the first game we build; FreeCell and Spider follow later.

## Shared vocabulary

| Term | Meaning |
|---|---|
| Tableau | The main columns of cards where most play happens |
| Foundation | The piles where finished cards are collected. Filling the foundations wins the game. |
| Stock | The face-down pile of cards not yet dealt |
| Waste | The face-up pile next to the stock, where drawn cards land (Klondike only) |
| Free cell | A space that can hold one card temporarily (FreeCell only) |
| Build down | Place a card on a card one rank higher, for example a 6 on a 7 |
| Build up | Place a card on a card one rank lower, for example a 7 on a 6 |
| Rank order | Ace (low), 2 to 10, Jack, Queen, King (high) |
| Colours | Hearts and diamonds are red. Spades and clubs are black. |

## The three games at a glance

| | Klondike | FreeCell | Spider |
|---|---|---|---|
| Name on kabale.net | 7-kabale | Napoleon | Edderkop |
| Decks | 1 (52 cards) | 1 (52 cards) | 2 (104 cards) |
| Tableau columns | 7 | 8 | 10 |
| Cards face down at start | 21 | None | 44 |
| Stock | 24 cards, drawn to a waste pile | None | 50 cards, dealt 10 at a time |
| Extra spaces | None | 4 free cells | None |
| Tableau building | Down, alternating colours | Down, alternating colours | Down, any suit |
| What moves as a group | Any face-up sequence | One card at a time (groups as a shortcut) | Only sequences of one suit |
| Empty column accepts | Kings only | Any card | Any card |
| How cards leave the tableau | One by one, Ace to King by suit | One by one, Ace to King by suit | A full King-to-Ace run of one suit at once |
| Character | Luck and judgement; many deals cannot be won | Almost pure skill; nearly every deal can be won | Long and demanding; difficulty set by number of suits |

---

## Klondike

Klondike is the game most people simply call "solitaire".

### Goal

Move all 52 cards to the four foundations. Each foundation holds one suit, built up from Ace to King.

### Setup

1. Shuffle one deck of 52 cards.
2. Deal seven tableau columns from left to right. Column 1 gets 1 card, column 2 gets 2 cards, and so on up to 7 cards in column 7. That uses 28 cards.
3. The top card of each column is face up. All cards beneath it are face down.
4. The remaining 24 cards form the stock, face down.
5. The waste pile and the four foundations start empty.

The traditional deal goes row by row: one face-up card on column 1 and a face-down card on each of columns 2 to 7, then a face-up card on column 2 and face-down cards on columns 3 to 7, and so on. Our opening animation follows this order.

### Moves

**Tableau**
- A face-up card can be placed on a tableau card that is one rank higher and of the opposite colour. A red 6 goes on a black 7.
- A face-up sequence can be moved as a group, starting from any card in it. The first card of the group must fit the destination.
- An empty column accepts only a King, or a group that starts with a King.
- When a move uncovers a face-down card, that card is turned face up. Our game does this automatically.

**Foundations**
- An Ace can be placed on any empty foundation.
- After that, a foundation accepts the next higher card of the same suit: 2 on Ace, 3 on 2, up to the King.
- Only one card at a time moves to a foundation.
- The top card of a foundation can be moved back to the tableau if it fits there. This is sometimes needed to free other cards.

**Stock and waste**
- Clicking the stock turns cards over onto the waste pile.
- Only the top card of the waste can be played, to a tableau column or a foundation.
- When the stock is empty, the waste pile is turned over to become the new stock. The cards keep their order; they are not shuffled.

### Variants

**Draw one or draw three**

| Variant | How it works | Difficulty |
|---|---|---|
| Draw one | One card at a time goes from stock to waste. Every card in the stock is reachable on each pass. | Easier |
| Draw three | Three cards at a time go to the waste, and only the top one can be played. Playing it frees the one below. If fewer than three cards remain, all of them are turned. | Harder |

In draw three, playing a card from the waste shifts which cards are on top in the next pass. Much of the skill lies in using that.

**Passes through the stock**

Standard play allows unlimited passes. Vegas play limits them: one pass in draw one, three passes in draw three.

### Scoring

The game offers four scoring modes.

**No scoring.** Only time and moves are shown.

**Standard scoring**

| Action | Points |
|---|---|
| Waste to tableau | +5 |
| Waste to foundation | +10 |
| Tableau to foundation | +10 |
| Turning a tableau card face up | +5 |
| Foundation back to tableau | −15 |
| Turning the waste over, draw one | −100 each time |
| Turning the waste over, draw three | −20 each time, from the fourth pass onward |

The score never drops below zero.

**Standard scoring with time.** As above, plus:
- 2 points are lost for every 10 seconds played.
- On winning, a bonus of 700,000 divided by the number of seconds played is added. No bonus is given for games shorter than 30 seconds.

**Vegas scoring**
- The player "buys" the deck for 52, so the score starts at −52.
- Every card moved to a foundation pays 5.
- Passes through the stock are limited, as described above.
- A finished game ends at +208. A score above zero is a profit.

### Winning and losing

- The game is won when all four foundations show a King.
- The game is lost when no legal move brings progress. The game does not declare a loss; the player decides when to start again.
- Once every card is face up and the stock and waste are empty, the game can no longer be lost. Our game then offers to finish it automatically.

### Can every deal be won?

No. Roughly four deals in five can be won in theory by a player who could see every card. In real play, where hidden cards force guesses, the win rate is far lower. For that reason the plan includes a "winnable deals only" option backed by a solver.

---

## FreeCell

FreeCell deals every card face up, so nothing is hidden. It is a game of planning, not luck.

### Goal

Move all 52 cards to the four foundations, each built up by suit from Ace to King.

### Setup

1. Shuffle one deck of 52 cards.
2. Deal all cards face up into eight tableau columns. The first four columns get 7 cards each and the last four get 6 each.
3. Four free cells and four foundations start empty.
4. There is no stock.

### Moves

- Only the top card of a column, or a card in a free cell, can be moved.
- **To a tableau column:** the card must be one rank lower and of the opposite colour to the column's top card. A black 9 goes on a red 10.
- **To an empty column:** any card.
- **To a free cell:** any card, if the cell is empty. Each cell holds one card.
- **To a foundation:** an Ace on an empty foundation, then the next higher card of the same suit.
- Cards on foundations normally stay there.

### Moving several cards at once

The rules move one card at a time. Computer versions let the player move a whole ordered sequence in one go, as a shortcut for moving its cards one by one through the free cells and empty columns. The move is allowed only if those single moves would be possible.

The largest sequence that can be moved is:

> (empty free cells + 1) × 2 ^ (empty columns)

When the destination is itself an empty column, that column does not count as empty.

| Empty free cells | Empty columns | Cards that can move |
|---|---|---|
| 0 | 0 | 1 |
| 2 | 0 | 3 |
| 4 | 0 | 5 |
| 4 | 1 | 10 |
| 4 | 2 | 20 |

### Automatic moves

Most versions send a card to its foundation automatically when it can no longer be useful in the tableau. A safe rule is to move a card when both cards of the opposite colour and one rank lower are already on the foundations.

### Scoring

FreeCell has no traditional scoring. Games are compared by time, number of moves, and win streak.

### Can every deal be won?

Almost. Of the 32,000 numbered deals in the original Microsoft version, only one (number 11982) cannot be solved. Across all possible deals, well over 99.9% are winnable.

### Variants

- **Fewer free cells.** Playing with three, two or one cell makes the game harder.
- **Baker's Game.** The older game FreeCell comes from. Tableau columns are built down by suit instead of by alternating colour. It is much harder.

---

## Spider

Spider is played with two decks. Runs are built inside the tableau and leave the game only when complete.

### Goal

Assemble eight complete runs, each from King down to Ace in a single suit. A completed run is removed from the tableau. The game is won when all eight are removed and the tableau is empty.

### Setup

1. Shuffle two decks together, 104 cards.
2. Deal ten tableau columns. The first four columns get 6 cards each and the other six get 5 each. That uses 54 cards.
3. The top card of each column is face up. The rest are face down.
4. The remaining 50 cards form the stock. They are dealt later in five rounds of ten.

### Moves

- A card can be placed on any card that is one rank higher, **regardless of suit**. A 7 of hearts can go on an 8 of spades.
- A group of cards can be moved together **only if they are all the same suit** and in descending order. A 9-8-7 of spades moves as a group. A 9 of spades, 8 of hearts, 7 of spades does not; only the 7 can move.
- An empty column accepts any card or any movable group.
- When a move uncovers a face-down card, it is turned face up.
- When a column holds a complete King-to-Ace run of one suit on top, that run is removed to a foundation.
- Nothing is placed on a King except by starting from an empty column, since there is no higher rank. Aces cannot have anything placed on them.

Mixing suits is always allowed but locks the cards beneath, because a mixed sequence cannot be moved as a group. Managing that trade-off is the heart of the game.

### Dealing from the stock

- Clicking the stock deals one face-up card onto every column, ten cards in all.
- In the classic rules, **dealing is not allowed while any column is empty**. Every empty column must first be filled.
- The stock holds five deals. There is no waste pile and no second pass.

### Variants by number of suits

All three variants use 104 cards. They differ in how many suits those cards have.

| Variant | Cards | Level |
|---|---|---|
| One suit | Eight sets of spades | Beginner. Every sequence can be moved as a group. |
| Two suits | Four sets of spades and four of hearts | Intermediate |
| Four suits | Two full decks | Advanced. Won only a minority of the time, even by strong players. |

### Scoring

The common computer scoring:
- The score starts at 500.
- Every move costs 1 point. So does every undo.
- Every completed run adds 100 points.

### Can every deal be won?

One-suit games are won nearly every time with careful play. Two-suit games are won often. Four-suit games are hard, and many deals are lost even with perfect technique.

---

## How our game applies these rules

These choices hold for all three games unless a setting says otherwise.

| Topic | Our choice |
|---|---|
| Turning over uncovered cards | Automatic |
| Undo | Unlimited. In Klondike it restores the previous score. In Spider it costs 1 point, as in the common scoring. |
| Numbered deals | Every deal has a number. The same number always gives the same deal, so deals can be replayed and shared. |
| Quick move | Tapping a card sends it to the best legal place: a foundation first, then a tableau column. |
| Automatic finish | Offered in Klondike when all cards are face up and the stock and waste are empty |
| Klondike default | Draw one, standard scoring with time, unlimited passes |
| Foundation to tableau in Klondike | Allowed, at −15 in standard scoring |
| Spider deal with an empty column | Not allowed, following the classic rule |
| FreeCell group moves | Allowed up to the limit in the formula above |
