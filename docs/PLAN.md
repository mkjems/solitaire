# Solitaire: build plan

Goal: an online solitaire game that is as good as or better than kabale.net, with a luxury full-screen experience on desktop, fluent drag and drop, a dealing animation, sound, and first-class mobile play.

The game gets its own name, look and sound. Klondike, FreeCell and Spider are traditional games anyone may implement, so we compete with kabale.net on quality and do not copy its design.

## Progress

Updated 16 November 2026.

| Phase | State |
|---|---|
| 0. Foundations | Done. Git and GitHub, deploys to solitaire.mkjems.dk on every push to main. |
| 1. Game engine | Done. Unit-tested. |
| 2. Table and cards | Done. Custom navy and gold card back. |
| 3. Motion | Done. Spring animation, opening deal, deal-in when continuing a saved game. |
| 4. Drag and drop | Done. Mouse, touch, tap to move, right-click, keyboard. |
| 5. Sound and haptics | Done with synthesised sounds; recorded samples can replace them later. Vibration on Android. |
| 6. The game around the game | Done: title screen, settings, statistics, how to play, saving and continuing, win celebration, Danish and English. |
| 7. Pulling ahead | Hints done (rule-based). Solver, winnable deals, daily deal and themes still to do. |
| 8. Mobile and install | Mostly done: large-print cards on phones (half-figure court cards), side layout for phones held sideways, page scrolls to hide browser bars, full screen on Android, installable with icon, works offline after the first visit. Tuned through rounds of testing on a real iPhone. Still to do: testing on an Android phone. |
| 9–11 | Not started |

## 1. What we are competing with

I read the kabale.net home page (7-kabale) and its FreeCell page on 15 November 2026. I only saw the page text, so ads, the underlying technology and mobile behaviour could not be checked.

| Area | kabale.net has | We aim for |
|---|---|---|
| Games | Klondike, FreeCell (Napoleon), Spider (Edderkop) | Klondike first, done superbly. FreeCell and Spider follow on the same engine. |
| Rules options | Draw 1 or draw 3; scoring off, standard, timed, Vegas | The same options |
| Controls | Drag, right-click to auto-move, undo and redo, F11 fullscreen | Drag, tap-to-move, double-click, keyboard, undo and redo, in-game fullscreen button |
| Feedback | Sound on/off, timer, score | Layered sound, haptics on Android, timer, score, move counter |
| Statistics | Played, won, streaks, best and average score, time, moves | The same, plus per-mode history |
| Not seen there | Hints, auto-finish, winnable deals, daily deal, themes, deal animation | All of these. This is where we pull ahead. |
| Reach | About 45 language versions on separate domains | Danish and English at launch, built so more languages are a translation file |

The last row matters most for "outcompete". Their advantage is distribution: many domains and years of search ranking. A better game does not win that on its own (see section 8).

## 2. What "luxury" means here

These are the standards each milestone is checked against.

- **Motion**: every card movement is animated with spring physics. Nothing teleports. Animation holds 60 fps on a mid-range phone and follows the display rate on 120 Hz screens.
- **Drag**: the card is under the finger within one frame of touch. Dragged stacks trail slightly, tilt with speed, lift with a growing shadow, and snap to a valid target with a soft magnetic pull. An invalid drop glides home.
- **Deal**: a new game opens with the deck dealing to the seven piles in an arc, one card at a time with matching sound, and the top cards flipping in sequence. It lasts about two seconds and can be skipped with a tap.
- **Table**: a full-screen felt with soft lighting and a vignette. Cards scale to fill any screen. Controls are minimal and fade back during play.
- **Sound**: recorded card sounds (slide, place, flip, shuffle, deal) with small pitch and volume variation so no two moves sound identical, plus a restrained win flourish.
- **Win**: a celebration worth finishing a game for, then a clean summary of time, moves and score.
- **Respect**: no forced sign-up, instant load, works offline, resumes the game where you left it, honours the "reduce motion" system setting.

## 3. Technical approach

| Decision | Choice | Reason |
|---|---|---|
| Language and build | TypeScript with Vite | Fast builds, small output, type-checked game rules |
| UI framework | None for the table; plain TypeScript | 52 cards do not need a framework, and we want full control of every frame |
| Card rendering | One DOM element per card, moved only with GPU transforms | Crisp at any size, cheap to animate. Cards are rasterised once per size so the complex court cards never redraw during motion. |
| Animation | Our own spring animator on `requestAnimationFrame` | Springs can be interrupted and retargeted mid-flight, which is what makes drag and rapid play feel fluent |
| Effects | A canvas layer above the table | Win celebration and particles without touching the card layer |
| Input | Pointer Events with pointer capture | One code path for mouse, touch and pen |
| Sound | Web Audio API with a small sample bank | Low latency, per-play variation, unlocked on the first tap as browsers require |
| Game rules | A pure engine with no DOM access: state, legal moves, undo history | Fully unit-testable, reusable for FreeCell and Spider |
| Deals | Seeded random numbers; each deal has a number | Deals can be replayed, shared and used for a daily deal |
| Solver | Runs in a Web Worker | Powers hints and the "winnable deals only" option without stalling animation |
| Storage | `localStorage` for settings, statistics and the game in progress | No account or server needed |
| Offline and install | PWA manifest and service worker | Installable, works offline, and gives true full screen on iPhone |
| Tests | Vitest for the engine, Playwright for the browser | Rules are verified by tests; layout and input are verified in real browser engines |
| Hosting | Static files on a CDN (Cloudflare Pages recommended) | No server to run, fast everywhere, free at this scale |

Layout is computed in code from the viewport size, not by CSS breakpoints. One function returns the card size and the position of every pile for any screen. That lets the table fill a 4K monitor, fit a phone in portrait, and animate smoothly when the window is resized or rotated.

## 4. Existing art

`art/deck/` holds 52 faces, 2 jokers and 2 backs as SVG, from cards.revk.uk. The zip in the project root is the same set.

- The faces are clean and scale well. They are a good base.
- The ace of spades carries the text "cards.revk.uk" in a font (Bariol) that will not be present on players' devices. It needs replacing with our own mark.
- The two backs are plain diamond patterns. A luxury table needs a custom back, and later a choice of backs.
- The faces are flat white with a black outline. A subtle paper tone, edge shading and a soft shadow are added in the game, not in the files.
- Jokers are unused in these games.

## 5. Build phases

Each phase ends with something you can open and judge.

### Phase 0: Foundations
- Initialise git, Vite, TypeScript, linting, Vitest, Playwright.
- Set up automatic deploys to a preview URL so every phase can be tried on a real phone.
- **Result**: an empty felt table at a public preview address.

### Phase 1: Game engine
- Klondike state, seeded deal, legal move generation, move application, undo and redo.
- Draw 1 and draw 3, the scoring modes, win detection, auto-finish detection.
- Unit tests for every rule and for full played-through games.
- **Result**: the complete rules, proven by tests, with nothing on screen yet.

### Phase 2: Table and cards
- The layout function for desktop, tablet, phone portrait and phone landscape.
- Felt, lighting, pile outlines, card elements with face, back and shadow.
- Card rasterising pipeline and the custom card back.
- **Result**: a static dealt game that looks right at every screen size.

### Phase 3: Motion
- The spring animator, the flip, stacking order during flight.
- The opening deal animation.
- Animated moves for stock, waste, tableau and foundation, including undo.
- **Result**: the deal animation plays and the game can be driven by clicks.

### Phase 4: Drag and drop
- Pointer handling, stack dragging with trail and tilt, lift shadow.
- Drop target detection, magnetic snap, glide home on invalid drops.
- Tap-to-move, double-click to foundation, right-click auto-move, keyboard play.
- **Result**: a fully playable game. This is the phase to judge the feel hardest.

### Phase 5: Sound and haptics
- Sample bank, audio engine with variation, sound tied to animation contact points.
- Volume and mute settings, vibration on Android.
- **Result**: the game sounds like cards on felt.

### Phase 6: The game around the game
- New game, settings, statistics, help, win celebration and summary.
- Saving and resuming, Danish and English text, fullscreen button.
- **Result**: feature parity with kabale.net's Klondike.

### Phase 7: Pulling ahead
- Solver in a worker, hints, "winnable deals only", auto-finish.
- Daily deal, numbered deals that can be shared by link.
- Card back and table themes.
- **Result**: features the competitor does not appear to offer.

### Phase 8: Mobile and install
- Safe areas, one-handed reach, larger touch targets, rotation handling.
- PWA manifest, icons, offline service worker.
- Testing on real iPhones and Android phones.
- **Result**: installable, offline, and as good on a phone as on a desktop.

### Phase 9: Hardening
- Performance profiling on slow devices, bundle size, load time.
- Accessibility: keyboard play, screen reader labels, reduced motion, colour-blind friendly suits option.
- Cross-browser pass on Chrome, Safari, Firefox and Edge.
- **Result**: ready for the public.

### Phase 10: Launch
- Domain, production deploy, page titles and descriptions, rules and help pages for search, privacy page, privacy-friendly analytics.
- **Result**: live.

### Phase 11: After launch
- FreeCell and Spider on the same engine and table.
- More languages. Optional accounts, leaderboards and achievements, which need a backend.

## 6. What you need to do

### Decisions before work starts
Each has a default I will use unless you say otherwise.

| Decision | Default |
|---|---|
| Name and domain | Work under the placeholder "Solitaire" and pick the name before Phase 10 |
| Languages at launch | Danish and English |
| Visual direction | Deep green felt, warm lighting, gold accents, dark navy and gold card back |
| Monetisation | None at launch. No ads keeps the experience premium and avoids a cookie consent banner. |
| First game | Klondike only, until it is excellent |

### Things only you can do
1. **Confirm the card art licence.** I believe the cards.revk.uk deck is released as public domain (CC0). Check the site and keep a note of it.
2. **Approve the sound set.** I will shortlist CC0 or licensed card recordings and wire them in. I cannot hear them, so your ears make the final choice. Budget for a paid sound pack if the free ones are not good enough.
3. **Test on real devices.** I can test in desktop browsers and in emulated phone screens. I cannot feel a drag on a real phone. After Phases 4, 5 and 8, play on an iPhone and an Android phone and tell me what feels off.
4. **Give feedback at the end of each phase.** The luxury feel comes from rounds of tuning: spring stiffness, timings, shadow depth, volume. Short, specific notes ("the snap is too slow", "the flip sounds too loud") are what moves it forward.
5. **Create the hosting account** (Cloudflare Pages or similar) and connect the repository. This takes about ten minutes and I will write out the steps when we get there.
6. **Buy the domain** before Phase 10.
7. **Decide on a privacy page and analytics** before launch. If you add ads or tracking cookies later, EU rules require a consent banner.

## 7. Risks

| Risk | Handling |
|---|---|
| The feel is good but not "luxury" | Feel is tuned in dedicated rounds after Phases 4 and 5, with your feedback, before more features are added |
| Slow phones drop frames | Cards are pre-rasterised and moved only with transforms; shadows are images, not live blur; performance is measured in Phase 9 with throttled devices |
| Sound is blocked or late on iPhone | Audio is unlocked on the first tap and samples are decoded up front |
| No web fullscreen on iPhone Safari | Detect support; on iPhone offer "Add to Home Screen", which runs full screen |
| Free sound samples are not good enough | Buy a pack or commission recordings |
| Scope grows before Klondike is excellent | FreeCell and Spider wait for Phase 11 |

## 8. Can this be done?

**The game: yes.** I can build all of Phases 0 to 9: the rules engine with tests, the responsive table, the spring animation system, the deal animation, drag and drop for mouse and touch, the audio engine, hints and the solver, statistics, offline support, and the browser testing. Nothing in this plan is beyond what the web platform does well, and 52 cards is a small scene.

**As good as or better than kabale.net: yes on features and presentation.** Matching its features is straightforward, and hints, winnable deals, a daily deal, the deal animation and themes go beyond what I saw there.

**Three things I cannot deliver alone:**

- **The last part of "feel".** I can see the game in a browser and measure frame times, but I cannot hear sound or feel a drag on a phone. That part depends on your testing and feedback.
- **Sound recordings.** I can find, select and integrate them, and I can synthesise simple effects in code. Realistic card sounds need real recordings from a licensed source.
- **Outcompeting in the market.** That means players finding the game. kabale.net has around 45 language domains and an established search position. A better game is necessary but not sufficient; it also needs a good domain, search-friendly content pages, more languages over time, and patience. I can build the technical side of that. The ranking itself is outside anyone's direct control.

## 9. Suggested start

Say the word and I will begin with Phases 0 and 1, then build Phases 2 to 4 through to the first playable version, since that is the earliest point at which the feel can be judged.
