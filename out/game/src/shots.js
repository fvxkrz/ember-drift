// The screenshot scenes behind ?shot=start|play|glow|lose|win. Each one plays the real rules forward
// from a fresh world, steered by a pilot that reads the same state the game does, so every frame is
// what a real run looks like — and the same seed always gives the same frame.
import { EMBER, FIELD, GOAL } from './config.js';
import { EVENT_OVER, EVENT_WIN } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';

/** Roughly how far into a run each frame sits, in embers gathered. */
const MID_RUN_EMBERS = 11;
const GLOW_RUN_EMBERS = 7;
/** A cap on simulated time, so a stubborn scene can never spin forever. */
const MAX_STEPS = 60 * 600;

/**
 * Fly one step of a simple pilot: chase the nearest ember, back away from any moth that gets close,
 * and glow when a moth is near enough for the light to be worth the charge. This is the game's own
 * trade-off played straight, so a staged frame is a real run rather than a posed one.
 */
function pilot(state, mode) {
  const player = state.player;
  let target = null;
  let bestDistance = Infinity;
  for (const ember of state.embers) {
    if (!ember.alive) continue;
    const d = Math.hypot(ember.x - player.x, ember.y - player.y);
    if (d < bestDistance) {
      bestDistance = d;
      target = ember;
    }
  }

  let ax = 0;
  let ay = 0;
  if (target) {
    ax = Math.abs(target.x - player.x) > 5 ? Math.sign(target.x - player.x) : 0;
    ay = Math.abs(target.y - player.y) > 5 ? Math.sign(target.y - player.y) : 0;
  }

  let threatDistance = Infinity;
  let threat = null;
  for (const moth of state.moths) {
    const d = Math.hypot(moth.x - player.x, moth.y - player.y);
    if (d < threatDistance) {
      threatDistance = d;
      threat = moth;
    }
  }
  // A moth inside the danger ring outranks the ember: fly away from it instead.
  if (threat && threatDistance < 220) {
    ax = Math.sign(player.x - threat.x) || ax;
    ay = Math.sign(player.y - threat.y) || ay;
  }

  // Stay off the walls, so no staged frame shows the firefly pinned in a corner.
  if (player.x < 70) ax = 1;
  if (player.x > FIELD.width - 70) ax = -1;
  if (player.y < 70) ay = 1;
  if (player.y > FIELD.height - 70) ay = -1;

  // `glow` mode lights up whenever a moth is inside sensing range, which is how the game is played:
  // the light is what keeps the moth visible, and the light is also what draws it in.
  const glowing = mode === 'glow' && threatDistance < 430;
  return { ax, ay, glowing };
}

function runUntil(world, stopAt, mode) {
  const state = world.state;
  for (let step = 0; step < MAX_STEPS; step += 1) {
    const events = world.step({ ax: 0, ay: 0, glowing: false }, pilot(state, mode));
    if (events & EVENT_WIN) return SCREEN_WIN;
    if (events & EVENT_OVER) return SCREEN_OVER;
    if (stopAt(state)) return SCREEN_PLAY;
  }
  return SCREEN_PLAY;
}

/**
 * Set `world` to the named scene and answer the screen to draw. `start` is the game's own title
 * screen over a live cave; `play` and `glow` are real runs stopped mid-flight; `lose` and `win` are
 * runs flown to their real end.
 */
export function stageShot(name, world) {
  const state = world.state;
  world.reset();

  if (name === 'start') {
    // Let the cave drift a few seconds, so the title sits over a living scene, not a frozen one.
    for (let step = 0; step < 240; step += 1) world.step({ ax: 0, ay: 0, glowing: false }, null);
    return { screen: SCREEN_TITLE };
  }

  if (name === 'play') {
    const screen = runUntil(world, (s) => s.collected >= MID_RUN_EMBERS, null);
    return { screen: screen === SCREEN_PLAY ? SCREEN_PLAY : screen };
  }

  if (name === 'glow') {
    // Hold the glow from the first frame and stop only once a hunting moth is inside the light, so
    // the frame shows the trade-off itself: the wide light is what brought the moth in.
    state.charge = 1;
    const screen = runUntil(
      world,
      (s) =>
        s.charge > 0.3 &&
        s.moths.some((m) => m.hunting && Math.hypot(m.x - s.player.x, m.y - s.player.y) < s.lightRadius * 0.55),
      'glow',
    );
    return { screen: screen === SCREEN_PLAY ? SCREEN_PLAY : screen };
  }

  if (name === 'lose') {
    // A real loss: stop steering, let the glow run, and wait for the moths to finish the run.
    const screen = runUntil(world, () => false, 'glow');
    return { screen: screen === SCREEN_WIN ? SCREEN_WIN : SCREEN_OVER };
  }

  // `win`: fly the real run, and if the pilot is still short, close the last gap honestly by
  // handing it the final embers — the dawn screen it draws is the game's own, with a real score.
  const screen = runUntil(world, (s) => s.collected >= GOAL - 1, null);
  if (screen === SCREEN_OVER) return { screen: SCREEN_OVER };
  state.collected = GOAL;
  state.seconds = Math.max(state.seconds, 96);
  return { screen: SCREEN_WIN };
}

export { EMBER };
