# THE STAND — Keep the Chant Alive

A five-level, multi-round Three.js rhythm game

You are the capo of a stadium supporters' section. Shift into the called lane, strike each pulse, protect the crowd's energy, survive rival noise surges, and carry one chant into a larger final anthem.

## Play

### Fastest option

Open `The-Stand-Standalone.html` in a modern desktop or mobile browser. It is a self-contained build with the game code, styles, Three.js bundle, and artwork embedded.

### Development

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5188`.

Production verification:

```bash
npm run build
npm test
npm run inspect:canvas
```

## Controls

- Keyboard: `A` / `D` or left/right arrows to change lanes; `Space` to chant; `P` or `Esc` to pause; `M` to mute; `R` to restart after failure.
- Touch: left/right lane buttons or horizontal swipe; hold/tap the central Chant button.
- Add `?seed=12345` to replay a deterministic rivalry.

## The run

Every level contains four named objective rounds. Win three rounds to seal the level; a missed target opens a slower recovery phrase instead of abruptly ending the run.

- Level 1 — First Voice: learn readable calls, open the wings, and carry a first chorus through all three sections.
- Level 2 — Call & Response: watch short lane phrases, remember them, and mirror them back.
- Level 3 — Break the Surge: complete each phrase while answering marked rival-noise calls.
- Level 4 — Shutter Run: read reversing and pinching gates to follow the safe route.
- Level 5 — The Whole Stand: combine memory, rival surges, and moving shutters across four anthem verses.
- Finale — One Stand, One Voice: the shutters lift away for twelve final calls and one held anthem note.

The normal 20-round route is about 6.37 minutes including timed transitions. One recovery phrase per level produces roughly 7.56 minutes, keeping both clean and imperfect runs inside the 5–8 minute target.

## Systems

- 181 authored/seeded calls across 20 normal rounds, rather than continuous punishment on every background beat.
- Human reaction model: 1.35 seconds of visual telegraph, an 820 ms safe early-buffer zone, a 440 ms active window before the pulse, and 440 ms of late grace.
- Perfect window: ±180 ms; any correct-lane input inside ±440 ms is Good, and a buffered early tap resolves automatically.
- Very early and wrong-lane taps are harmless guidance; only a cue that fully expires becomes a Miss.
- Normal round pass targets range from 62.5% to 72.7%; recovery rounds need 4 of 7 slower calls.
- Energy rises on accurate hits, falls gently on misses, and receives round/level recovery bonuses.
- Streak thresholds raise the score multiplier from ×1 to ×3.
- A conditional Rally Save restores a collapsing run; failed objectives trigger playable recovery phrases.
- Seeded shutter routes, phrase variants, crowd variation, and test states make replay and QA deterministic.
- Runtime content is procedural: instanced crowd, animated shutters, pulse rings, hazards, confetti, lighting, and Web Audio crowd/impact feedback.

## Google AI use

Google Gemini image generation was used once, offline, to create the home supporters' tifo mural. The original output was reviewed, converted to a 111 KB WebP, and embedded as a source data URI for the stadium and title/results presentation. The browser never calls Gemini and contains no API key.

## Credits

- Three.js — real-time 3D rendering.
- Vite and TypeScript — development and production build.
- Playwright — desktop/mobile interaction verification.
- `majidmanzarpour/threejs-game-skills` — scaffold, deterministic hooks, and canvas-inspection workflow used and adapted for this project.
- Google Gemini image generation — original fictional tifo mural texture.

All game design, gameplay code, procedural stadium content, UI treatment, and audio synthesis in this release were created for this challenge entry. No real club marks or copyrighted team identities are used.