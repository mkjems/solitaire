// The text search engines and link previews see, one entry per language.
//
// Each language gets its own static page, built from index.html by the plugin in
// site/plugin.ts: English at /, the others at /<code>/. To add a language, add an
// entry here (and the game's own text to src/ui/strings.ts, so the page opens in it).

export const SITE_URL = 'https://solitaire.mkjems.dk';
export const AUTHOR = { name: 'M. Kjems', url: 'https://mkjems.dk/' };
/** Size of every link preview image (made from the art/ originals at 1200×630). */
export const IMAGE_SIZE = { width: 1200, height: 630 };

export interface Page {
  /** Language code, as in `<html lang>` and hreflang. */
  lang: string;
  /** Where the page is served: `/` or `/<lang>/`. */
  path: string;
  /** Open Graph locale, such as `en_GB`. */
  locale: string;
  /** The `<title>`: what search results show as the link. Keep under 60 characters. */
  title: string;
  /** The search result snippet. Keep under 155 characters. */
  description: string;
  /** The shorter title and description used in link previews. */
  shareTitle: string;
  shareDescription: string;
  /** The link preview image in public/, with its title in this language. */
  image: string;
  imageAlt: string;
  /** Other names people search for, for the structured data. */
  alternateName: string;
  genre: string[];
  /** The page text, kept off-screen behind the game for search engines and screen readers. */
  about: {
    heading: string;
    intro: string;
    featuresHeading: string;
    features: string[];
    howHeading: string;
    how: string[];
    keysHeading: string;
    keys: string;
    /** `{author}` becomes a link to the author's site. */
    madeBy: string;
  };
}

const en: Page = {
  lang: 'en',
  path: '/',
  locale: 'en_GB',
  title: 'Solitaire – Free Klondike Card Game, No Ads',
  description:
    'Play classic Klondike solitaire free in your browser. Draw one or three, unlimited undo and hints. No ads, no sign-up, works offline on desktop and phone.',
  shareTitle: 'Solitaire – Free Klondike Card Game',
  shareDescription:
    'Classic Klondike solitaire in your browser. Free, no ads, no sign-up. Draw one or three, unlimited undo and hints.',
  image: '/og-image.jpg',
  imageAlt:
    'A laughing grandfather holds up the ace of hearts next to a solitaire table, with the words Solitaire – Free Klondike Card Game.',
  alternateName: 'Klondike Solitaire',
  genre: ['Card game', 'Solitaire'],
  about: {
    heading: 'Solitaire: free Klondike card game',
    intro:
      'Classic Klondike solitaire that you play in your browser, on a computer, tablet or phone. It is free, has no ads and needs no sign-up. Once it has loaded it also works offline, and you can add it to your home screen to play in full screen.',
    featuresHeading: 'Features',
    features: [
      'Every deal can be won: the computer plays each one through before you get it (or choose fully random deals)',
      'Draw one card or three cards from the stock',
      'Unlimited undo and redo',
      'Hints when you are stuck, and a button that finishes a solved game for you',
      'Standard, timed or Vegas scoring, or no score at all',
      'Statistics: games won, win streaks, best time, fewest moves and best score',
      'Numbered deals, so you can replay a deal or send it to a friend',
      'Drag and drop, or tap a card to send it to the best place',
      'Large-print cards on small screens',
      'In English and Danish',
    ],
    howHeading: 'How to play Klondike solitaire',
    how: [
      'The goal is to move all 52 cards to the four piles at the top right, one pile per suit, from Ace up to King.',
      'In the seven columns, place a card on one that is one rank higher and the other colour: a red 6 on a black 7. You can move a run of face-up cards together, and only a King may go in an empty column. Hidden cards turn over by themselves.',
      'Tap the deck at the top left to turn cards over. When it runs out, tap again to turn the pile back. In draw three, three cards turn at a time and only the top one can be played.',
    ],
    keysHeading: 'Keyboard shortcuts',
    keys: 'Space: draw · Z: undo · R: redo · H: hint · N: new game · F: full screen',
    madeBy: 'Made by {author}, who also makes other free browser games.',
  },
};

const da: Page = {
  lang: 'da',
  path: '/da/',
  locale: 'da_DK',
  title: 'Kabale – gratis 7-kabale (Klondike) uden reklamer',
  description:
    'Spil klassisk 7-kabale (Klondike) gratis i browseren. Træk ét eller tre kort, fortryd frit og få tips. Ingen reklamer, intet login, virker offline.',
  shareTitle: 'Kabale – gratis 7-kabale',
  shareDescription:
    'Klassisk 7-kabale i browseren. Gratis, uden reklamer og uden login. Træk ét eller tre kort, fortryd så tit du vil, og få tips.',
  image: '/og-image-da.jpg',
  imageAlt:
    'En leende bedstefar holder hjerter es op ved siden af et kabalebord med ordene 7-kabale – Gratis kortspil.',
  alternateName: '7-kabale',
  genre: ['Kortspil', 'Kabale'],
  about: {
    heading: 'Kabale: gratis 7-kabale (Klondike)',
    intro:
      'Klassisk 7-kabale, også kaldet Klondike, som du spiller i browseren på computer, tablet eller telefon. Den er gratis, uden reklamer og kræver intet login. Når den er indlæst, virker den også uden internet, og du kan lægge den på hjemmeskærmen og spille i fuld skærm.',
    featuresHeading: 'Det kan den',
    features: [
      'Alle kabaler kan gå op: computeren spiller hver kabale igennem, før du får den (eller vælg helt tilfældige)',
      'Træk ét eller tre kort fra bunken',
      'Fortryd og gentag så mange træk du vil',
      'Tips, når du sidder fast, og en knap, der lægger resten op, når kabalen er gået op',
      'Almindelige point, point med tid, Vegas-point eller slet ingen point',
      'Statistik: vundne spil, sejre i træk, bedste tid, færrest træk og flest point',
      'Nummererede spil, så du kan spille det samme spil igen eller sende det til en ven',
      'Træk og slip, eller tryk på et kort for at flytte det til det bedste sted',
      'Kort med stor skrift på små skærme',
      'På dansk og engelsk',
    ],
    howHeading: 'Sådan spiller du 7-kabale',
    how: [
      'Målet er at flytte alle 52 kort op i de fire bunker øverst til højre, én bunke for hver kulør, fra es op til konge.',
      'I de syv rækker lægger du et kort på et kort, der er én højere og har den anden farve: en rød 6’er på en sort 7’er. Du kan flytte flere åbne kort på én gang, og kun en konge må lægges på en tom plads. Skjulte kort vender sig selv.',
      'Tryk på bunken øverst til venstre for at vende kort. Når den er tom, trykker du igen for at vende den om. Med tre kort vendes tre ad gangen, og kun det øverste kan spilles.',
    ],
    keysHeading: 'Tastaturgenveje',
    keys: 'Mellemrum: træk · Z: fortryd · R: gentag · H: tip · N: nyt spil · F: fuld skærm',
    madeBy: 'Lavet af {author}, som også laver andre gratis spil til browseren.',
  },
};

/** The first page is the default: served at `/` and named as `x-default`. */
export const PAGES: Page[] = [en, da];
