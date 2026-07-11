# THE STAND — Focused QA Evidence

QA result: PASS

## Commands

- `npm run build`
- `npm test`
- `node scripts/inspect-threejs-canvas.mjs --url http://127.0.0.1:5188 --state active-play --seed 12345`
- `node scripts/inspect-threejs-canvas.mjs --url http://127.0.0.1:5188 --mobile --state finale --seed 12345`
- Standalone repeat: inspector against `/The-Stand-Standalone.html`

## Interaction coverage

- Desktop keyboard lane movement.
- Mobile touch lane movement.
- Real Space/touch chant input changes score.
- Very early input is harmless, correct-lane early input buffers, buffered input auto-resolves, late grace scores, wrong-lane input is harmless, and expired cues miss.
- Normal round scoring and completion.
- Slower recovery-round scoring.
- All 20 normal rounds advance through five level seals into the finale.
- Failure overlay and same-seed restart.
- Deterministic active-play, recovery, fail, stress, finale, and results hooks.
- Finale state, held-note UI, results screen, and 5/5 level-seal completion.
- Responsive canvas and mobile touch controls.

## Results

- Production build: PASS.
- Playwright: 2/2 PASS (desktop Chrome + mobile Chrome emulation).
- Console errors: 0.
- Page errors: 0.
- Desktop active-play standalone canvas: nonblank; variance 244; 122 color buckets; edge density 0.148; contrast 96.9.
- Mobile finale standalone canvas: nonblank; variance 255; 172 color buckets; edge density 0.207; contrast 84.8.
- Duration model: 382.3 seconds for the normal 20-round route (6.37 minutes); 453.6 seconds with one recovery phrase per level (7.56 minutes).
- Human reaction model: 1.35-second visual telegraph, 820 ms early buffer, ±440 ms Good eligibility, and ±180 ms Perfect timing. Correct-lane buffered taps resolve automatically.
- Invalid-input safety: very early and wrong-lane taps do not drain energy or consume the cue; only full expiry creates a Miss.
- Difficulty model: normal pass targets range from 62.5% to 72.7%; recovery rounds require 4 of 7 slower calls.
- Standalone HTML canvas: PASS with 0 console/page errors.

## Render budget

| Metric | Actual | Desktop limit | Mobile limit |
| --- | ---: | ---: | ---: |
| Draw calls | 81 | 300 | 150 |
| Triangles | 20,538 | 750,000 | 300,000 |
| Geometries | 77 | 300 | 200 |
| Textures | 4 | 60 | 40 |

All budget rows pass.

## Issues found and fixed

- npm registry access initially blocked dependency installation; current-thread access was granted and dependencies installed.
- The original continuous every-beat loop was too short, too punishing, and lacked level objectives; it was replaced with five levels, 20 objective rounds, authored cue phrases, memory/surge/route tasks, and playable recovery rounds.
- Exact-millisecond cue judgement felt robotic. It was replaced with perceptual cue stages, 1.26 seconds of eligible/bufferable reaction time, harmless invalid taps, and Miss only after full expiry.
- Automated cue input could arrive one render frame late; judgement remains on the input event path while buffered hits resolve deterministically.
- The finale's shutters did not clear the portrait camera; their finale lift was extended beyond the full camera frustum.
- Mobile score/utility/energy/finale UI overlaps were removed and touch controls reduced slightly.
- Crowd instance updates were throttled to 20 Hz while rendering remains full rate, reducing CPU work without changing timing.

## Residual risk

- WebKit could not run in this Linux sandbox because system multimedia/GTK libraries are missing, so mobile interaction was verified through Chromium mobile emulation plus the packaged canvas inspector. The production code is standards-based WebGL/DOM/Web Audio and has no browser-specific API dependency.
