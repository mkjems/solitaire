/** Interface text. Danish and English for now; another language is another entry here. */

const en = {
  title: 'Solitaire',
  subtitle: 'Klondike',
  start: 'Deal the cards',
  resume: 'Continue game',
  newGame: 'New game',
  undo: 'Undo',
  redo: 'Redo',
  hint: 'Hint',
  menu: 'Menu',
  fullScreen: 'Full screen',
  finish: 'Finish the game',
  deal: 'Deal',
  time: 'Time',
  moves: 'Moves',
  score: 'Score',
  wonTitle: 'Solved',
  wonText: 'Every card is home.',
  streak: 'Win streak',
  playAgain: 'New game',
  noHint: 'No useful moves left',
  close: 'Close',

  tabGame: 'Game',
  tabStats: 'Statistics',
  tabHelp: 'How to play',

  draw: 'Draw',
  draw1: 'One card',
  draw3: 'Three cards',
  scoring: 'Scoring',
  scoringNone: 'Off',
  scoringStandard: 'Standard',
  scoringTimed: 'Timed',
  scoringVegas: 'Vegas',
  deals: 'Deals',
  dealsWinnable: 'Winnable',
  dealsAny: 'Any',
  sound: 'Sound',
  screen: 'Screen',
  swipeTip: 'Swipe up on the table to hide the browser bars',
  on: 'On',
  off: 'Off',
  nextGame: 'Changes to the rules apply from your next game.',
  newGameNow: 'New game now',

  statsDraw1: 'Draw one',
  statsDraw3: 'Draw three',
  played: 'Played',
  won: 'Won',
  winRate: 'Win rate',
  currentStreak: 'Current streak',
  bestStreak: 'Best streak',
  bestTime: 'Best time',
  fewestMoves: 'Fewest moves',
  bestScore: 'Best score',
  reset: 'Reset statistics',
  resetConfirm: 'Press again to reset',

  help: [
    ['The goal', 'Move all 52 cards to the four piles at the top right, one pile per suit, from Ace up to King.'],
    [
      'The columns',
      'Place a card on one that is one rank higher and the other colour: a red 6 on a black 7. You can move a run of face-up cards together. Only a King may go in an empty column.',
    ],
    [
      'The stock',
      'Tap the deck at the top left to turn cards over. When it runs out, tap again to turn the pile back. In draw three, three cards turn at a time and only the top one can be played.',
    ],
    [
      'Moving cards',
      'Drag cards where you want them, or tap a card to send it to the best place. Right-click works as a tap. Hidden cards turn over by themselves.',
    ],
    [
      'Deals',
      'With winnable deals, the computer plays each deal through before you get it, so every game can be won. Choose Any for fully random deals, some of which cannot be won.',
    ],
    [
      'On a phone',
      'Swipe up on the table to hide the browser bars. For true full screen, add the game to your home screen from the browser’s share or menu button.',
    ],
    ['Keys', 'Space: draw · Z: undo · R: redo · H: hint · N: new game · F: full screen'],
  ] as [string, string][],
};

export type Strings = typeof en;

const da: Strings = {
  title: 'Kabale',
  subtitle: '7-kabale',
  start: 'Læg kortene ud',
  resume: 'Fortsæt spillet',
  newGame: 'Nyt spil',
  undo: 'Fortryd',
  redo: 'Gentag',
  hint: 'Tip',
  menu: 'Menu',
  fullScreen: 'Fuld skærm',
  finish: 'Læg resten op',
  deal: 'Spil',
  time: 'Tid',
  moves: 'Træk',
  score: 'Point',
  wonTitle: 'Kabalen gik op',
  wonText: 'Alle kort er på plads.',
  streak: 'Sejre i træk',
  playAgain: 'Nyt spil',
  noHint: 'Ingen nyttige træk tilbage',
  close: 'Luk',

  tabGame: 'Spil',
  tabStats: 'Statistik',
  tabHelp: 'Sådan spiller du',

  draw: 'Træk',
  draw1: 'Ét kort',
  draw3: 'Tre kort',
  scoring: 'Point',
  scoringNone: 'Fra',
  scoringStandard: 'Standard',
  scoringTimed: 'Med tid',
  scoringVegas: 'Vegas',
  deals: 'Kabaler',
  dealsWinnable: 'Kan gå op',
  dealsAny: 'Alle',
  sound: 'Lyd',
  screen: 'Skærm',
  swipeTip: 'Stryg op på bordet for at skjule browserens bjælker',
  on: 'Til',
  off: 'Fra',
  nextGame: 'Ændringer i reglerne gælder fra næste spil.',
  newGameNow: 'Nyt spil nu',

  statsDraw1: 'Træk ét',
  statsDraw3: 'Træk tre',
  played: 'Spillet',
  won: 'Vundet',
  winRate: 'Vundet i %',
  currentStreak: 'Sejre i træk nu',
  bestStreak: 'Flest sejre i træk',
  bestTime: 'Bedste tid',
  fewestMoves: 'Færrest træk',
  bestScore: 'Flest point',
  reset: 'Nulstil statistik',
  resetConfirm: 'Tryk igen for at nulstille',

  help: [
    ['Målet', 'Flyt alle 52 kort op i de fire bunker øverst til højre, én bunke for hver kulør, fra es op til konge.'],
    [
      'Rækkerne',
      'Læg et kort på et kort, der er én højere og har den anden farve: en rød 6 på en sort 7. Du kan flytte en række af synlige kort samlet. Kun en konge må lægges på en tom plads.',
    ],
    [
      'Bunken',
      'Tryk på bunken øverst til venstre for at vende kort. Når den er tom, trykker du igen for at vende bunken om. Med træk tre vendes tre kort ad gangen, og kun det øverste kan spilles.',
    ],
    [
      'Flyt kort',
      'Træk kortene derhen, hvor du vil have dem, eller tryk på et kort for at sende det til det bedste sted. Højreklik virker som et tryk. Skjulte kort vender sig selv.',
    ],
    [
      'Kabaler',
      'Med Kan gå op spiller computeren hver kabale igennem, før du får den, så alle spil kan gå op. Vælg Alle for helt tilfældige kabaler, hvoraf nogle ikke kan gå op.',
    ],
    [
      'På en telefon',
      'Stryg op på bordet for at skjule browserens bjælker. Vil du have rigtig fuld skærm, så føj spillet til din hjemmeskærm via browserens del- eller menuknap.',
    ],
    ['Taster', 'Mellemrum: træk · Z: fortryd · R: gentag · H: tip · N: nyt spil · F: fuld skærm'],
  ],
};

const languages: Record<string, Strings> = { en, da };

/** Picks the language from a `?lang=` parameter, then the browser, then English. */
export function pickLanguage(): { code: string; strings: Strings } {
  const requested = new URLSearchParams(location.search).get('lang');
  // The page for one language (such as /da/) opens the game in that language;
  // the main page follows the browser.
  const page = document.documentElement.dataset.gameLanguage;
  const candidates = [requested, page, ...navigator.languages, navigator.language];
  for (const candidate of candidates) {
    const code = candidate?.slice(0, 2).toLowerCase();
    // Norwegian readers get Danish rather than English.
    const lookup = code === 'nb' || code === 'no' || code === 'nn' ? 'da' : code;
    const strings = lookup ? languages[lookup] : undefined;
    if (lookup && strings) return { code: lookup, strings };
  }
  return { code: 'en', strings: en };
}
