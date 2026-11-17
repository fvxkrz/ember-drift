# Ember Drift

A small arcade game about being the only light in a cave. You are a firefly with one
ember-bright glow, and the glow is both your only way to see and the only thing the moths
can find.

**Play:** open `game/index.html` in a desktop browser, or run `node serve.ts` and visit
http://localhost:8080.

## The rule that makes it a game

You have to gather 24 embers to bring the dawn. The cave is dark, so you cannot see an
ember until you are almost on top of it — unless you glow. Glowing widens your light
enormously, which reveals the embers and the moths around you, and it also tells every
moth in range exactly where you are. So the light you need to finish the run is the same
light that gets you killed, and the glow meter drains while it is held. There is no way to
play that does not spend it.

- **Move** with the arrow keys or WASD.
- **Glow** by holding Space (or holding the mouse button).
- **Pause** with P or Escape, **restart** with R.
- Three lives, five moth waves, 24 embers, and a score that counts embers, survival time
  and a dawn bonus.

## Layout

    game/index.html        the page: one canvas, one module script
    game/src/config.js     every tuning number and colour in one place
    game/src/random.js     a seeded generator, so a seed replays the same game
    game/src/world.js      the rules: movement, embers, moths, lives, score, win and loss
    game/src/input.js      keyboard and pointer, reduced to axes and a glow flag
    game/src/render.js     drawing only: the cave, the dark, the light pool, the HUD, the panels
    game/src/shots.js      the screenshot scenes, flown by a pilot over the real rules
    game/src/main.js       the loop and the screens: title, play, paused, over, win
    screenshots/           four real renders of the game, the first is the cover
    main.ts                copies game/ and screenshots/ to /output and writes dossier.json

`world.js` never draws and `render.js` never changes state, so the rules can be run without
a browser — which is how the screenshot scenes and the tests below work.

## Screenshots

The four images in `screenshots/` are captures of this game's own code, taken headlessly at
1280×720 with `?shot=` scenes that fly the real rules forward from a fixed seed:

| file | scene |
| --- | --- |
| `1-start.png` | the title screen over a live cave |
| `2-play.png` | mid-run, HUD showing 11 of 24 embers |
| `3-glow.png` | the glow held wide, with a moth inside the light |
| `4-end.png` | game over with the score and the way back |

`shots.json` records the scene and seed behind each one, so any of them can be reproduced.

## Building the dossier

    mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

That writes `out/game/`, `out/screenshots/` and `out/dossier.json`.

## Tests

    node --test

The suite covers the rules without a browser: the seed replays exactly, embers and lives
behave, the glow drains and refills, a moth only hunts a glowing firefly, the win and loss
conditions fire, and the renderer draws every screen without throwing.

## Licence

MIT. See `LICENSE`.
