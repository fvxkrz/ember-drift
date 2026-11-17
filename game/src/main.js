// The game loop and the screens: title, play, paused, over and win, each with its own start and its
// own way back. The world owns the rules, the renderer owns the pixels, and this file decides which
// screen is showing and what a key press does on it.
import { BEST_KEY, GOAL, STEP } from './config.js';
import { createInput } from './input.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';
import { createWorld, EVENT_EMBER, EVENT_HIT, EVENT_OVER, EVENT_WIN } from './world.js';
import { stageShot } from './shots.js';

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const renderer = createRenderer(canvas);
const input = createInput(canvas);

/** The seed comes from the URL so a screenshot scene is reproducible; a plain visit varies. */
const params = new URLSearchParams(window.location.search);
const seedParam = Number(params.get('seed'));
const seed = Number.isFinite(seedParam) && seedParam > 0 ? seedParam : Math.floor(Math.random() * 1e9);

const world = createWorld(seed);
let screen = SCREEN_TITLE;
let best = readBest();
// A staged frame must not depend on whatever this browser happens to remember from earlier runs.
const stagedMode = params.has('shot');
if (stagedMode) best = 0;

/** A tiny synthesised click and chime: no audio file, no network, and it starts on first input. */
let audio = null;
function sound(kind) {
  try {
    if (audio === null) {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return;
      audio = new Ctor();
    }
    if (audio.state === 'suspended') audio.resume();
    const now = audio.currentTime;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    const shape = { ember: 'triangle', hit: 'sawtooth', win: 'sine', click: 'square' }[kind] || 'sine';
    const from = { ember: 660, hit: 150, win: 520, click: 420 }[kind] || 440;
    const to = { ember: 990, hit: 70, win: 1040, click: 320 }[kind] || 440;
    osc.type = shape;
    osc.frequency.setValueAtTime(from, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, to), now + 0.18);
    const level = kind === 'hit' ? 0.13 : kind === 'click' ? 0.05 : 0.09;
    gain.gain.setValueAtTime(level, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + (kind === 'win' ? 0.5 : 0.22));
    osc.connect(gain).connect(audio.destination);
    osc.start(now);
    osc.stop(now + (kind === 'win' ? 0.52 : 0.24));
  } catch {
    // Sound is a nicety: a browser that refuses it never stops the game.
  }
}

function readBest() {
  try {
    return Number(window.localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}

function writeBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(Math.floor(value)));
  } catch {
    // Private mode: the best score simply does not persist.
  }
}

function announce(value) {
  if (status) status.textContent = value;
}

function startRun() {
  world.reset();
  screen = SCREEN_PLAY;
  sound('click');
  announce('Glow with space. Gather 24 embers before the moths get you.');
}

function endRun(won) {
  if (world.state.score > best) {
    best = world.state.score;
    writeBest(best);
  }
  screen = won ? SCREEN_WIN : SCREEN_OVER;
  sound(won ? 'win' : 'hit');
  announce(won ? `Dawn: you gathered all ${GOAL} embers.` : `The dark wins. Score ${Math.floor(world.state.score)}.`);
}

/** Read the keys for the screen showing, so one key never does two jobs at once. */
function handleInput() {
  if (input.takeRestart()) {
    startRun();
    return;
  }
  if (screen === SCREEN_PLAY) {
    if (input.takePause()) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
      return;
    }
    return;
  }
  if (input.takeStart()) {
    if (screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Resumed.');
    } else {
      startRun();
    }
  } else if (input.takePause() && screen === SCREEN_PAUSED) {
    screen = SCREEN_PLAY;
  }
}

/** One step of the game, whatever screen is showing. */
function advance() {
  if (screen !== SCREEN_PLAY) return;
  const axes = input.axes();
  const events = world.step({ ax: axes.ax, ay: axes.ay, glowing: input.isGlowing() }, null);
  if (events & EVENT_EMBER) sound('ember');
  if (events & EVENT_HIT) sound('hit');
  if (events & EVENT_OVER) endRun(false);
  else if (events & EVENT_WIN) endRun(true);
}

// A fixed-step accumulator: the rules run at 60 a second whatever the display's refresh rate.
let previous = 0;
let accumulator = 0;
function frame(now) {
  const delta = previous === 0 ? STEP : Math.min(0.25, (now - previous) / 1000);
  previous = now;
  handleInput();
  accumulator += delta;
  let guard = 0;
  while (accumulator >= STEP && guard < 8) {
    advance();
    accumulator -= STEP;
    guard += 1;
  }
  renderer.draw(world.state, screen, best);
  window.requestAnimationFrame(frame);
}

/**
 * `?shot=start|play|glow|lose|win` stages the real rules forward from a fresh world for the
 * screenshot in screenshots/: the frames are what a real game looks like, never drawn by hand.
 */
if (stagedMode) {
  const staged = stageShot(params.get('shot'), world);
  screen = staged.screen;
  best = Math.max(best, world.state.score);
  // Assigning canvas.width clears the canvas, and the window fires a resize as its size settles, so
  // a staged frame has to repaint after that or it captures blank.
  const paint = () => renderer.draw(world.state, screen, best);
  paint();
  window.addEventListener('resize', paint);
  announce('Staged frame for a screenshot.');
  // The title carries the frame's real numbers, so a capture can be checked against the state that
  // produced it instead of being taken on trust.
  const mark = () => {
    document.title = `shot ${params.get('shot')} | ${screen} | ${world.state.collected}/${GOAL} embers | score ${Math.floor(world.state.score)} | lives ${world.state.lives}`;
  };
  mark();
  window.setTimeout(mark, 1200);
} else {
  window.requestAnimationFrame(frame);
}
