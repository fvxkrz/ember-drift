// The rules: a firefly in a dark cave, embers to gather, and moths that hunt light. Nothing here
// draws; the renderer reads this state and paints it. Every step is fixed-size and driven by the
// seeded generator, so the same seed and the same inputs always give the same game.
import {
  EMBER,
  EMBERS_PER_WAVE,
  FIELD,
  GOAL,
  LIGHT,
  LIVES,
  MOTH,
  PLAYER,
  SCORE,
  STEP,
} from './config.js';
import { createRandom, signed } from './random.js';

/** Events a step can report, so the caller can react (sound, screen changes). */
export const EVENT_HIT = 1;
export const EVENT_EMBER = 2;
export const EVENT_OVER = 4;
export const EVENT_WIN = 8;

const TAU = Math.PI * 2;

function clamp(value, low, high) {
  return value < low ? low : value > high ? high : value;
}

function distance(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

export function createWorld(seed) {
  const random = createRandom(seed);

  const state = {
    player: { x: FIELD.width / 2, y: FIELD.height / 2, vx: 0, vy: 0, invulnerable: 0 },
    /** 0 to 1: how much glow is left. Holding the glow drains it, letting go refills it. */
    charge: 1,
    glowing: false,
    /** True while the glow is spent and resting: it stays out until the meter recovers. */
    glowLocked: false,
    lives: LIVES,
    score: 0,
    collected: 0,
    wave: 1,
    seconds: 0,
    won: false,
    embers: [],
    moths: [],
    /** Seconds until the next moth slips in from the dark. */
    mothTimer: MOTH.spawnInterval,
    /** Ripples where an ember was taken, for feedback that fades. */
    sparks: [],
    /** Where the light is, after easing: the renderer draws the cave from this. */
    lightRadius: LIGHT.idle,
  };

  function spawnEmber() {
    // Embers keep clear of the very edges, where the dark swallows them.
    const margin = 70;
    state.embers.push({
      x: margin + random() * (FIELD.width - margin * 2),
      y: margin + random() * (FIELD.height - margin * 2),
      phase: random() * TAU,
      driftX: signed(random) * EMBER.drift,
      driftY: signed(random) * EMBER.drift,
      age: 0,
      alive: true,
    });
  }

  function spawnMoth() {
    // A moth enters from one of the four walls, so it never appears on top of the player.
    const side = Math.floor(random() * 4);
    const inset = 26;
    let x = 0;
    let y = 0;
    if (side === 0) {
      x = random() * FIELD.width;
      y = -inset;
    } else if (side === 1) {
      x = FIELD.width + inset;
      y = random() * FIELD.height;
    } else if (side === 2) {
      x = random() * FIELD.width;
      y = FIELD.height + inset;
    } else {
      x = -inset;
      y = random() * FIELD.height;
    }
    state.moths.push({
      x,
      y,
      vx: signed(random) * 40,
      vy: signed(random) * 40,
      heading: random() * TAU,
      hunting: false,
      wing: random() * TAU,
      alive: true,
    });
  }

  function reset() {
    state.player.x = FIELD.width / 2;
    state.player.y = FIELD.height / 2;
    state.player.vx = 0;
    state.player.vy = 0;
    state.player.invulnerable = 0;
    state.charge = 1;
    state.glowing = false;
    state.glowLocked = false;
    state.lives = LIVES;
    state.score = 0;
    state.collected = 0;
    state.wave = 1;
    state.seconds = 0;
    state.won = false;
    state.embers = [];
    state.moths = [];
    state.sparks = [];
    state.mothTimer = MOTH.spawnInterval;
    state.lightRadius = LIGHT.idle;
    for (let index = 0; index < EMBER.count; index += 1) spawnEmber();
  }

  // The spawn stream starts from a freshly reset world, so a seed's first frame is fixed.
  reset();

  /**
   * Advance the world by one fixed step. `input` carries the axes (-1..1) and whether the glow is
   * held; `autopilot` replaces the axes and the glow when the screenshot scenes fly the game.
   */
  function step(input, autopilot) {
    let events = 0;
    state.seconds += STEP;

    const wantsGlow = autopilot ? autopilot.glowing : input.glowing;
    // The meter only refills once the key is released. If it refilled while the key was still held,
    // holding the glow forever would pulse the light on and off instead of running it dry, and the
    // game's one scarce resource would stop being scarce.
    if (state.charge <= 0.02) state.glowLocked = true;
    if (state.charge >= LIGHT.relight) state.glowLocked = false;
    state.glowing = wantsGlow && !state.glowLocked && state.charge > 0.02;
    if (state.glowing) {
      state.charge = Math.max(0, state.charge - LIGHT.drain * STEP);
    } else if (!wantsGlow) {
      state.charge = Math.min(1, state.charge + LIGHT.refill * STEP);
    }
    const targetRadius = state.glowing ? LIGHT.glowing : LIGHT.idle;
    // Ease the light so the cave opens and closes smoothly rather than snapping.
    state.lightRadius += (targetRadius - state.lightRadius) * Math.min(1, STEP * 7);

    const player = state.player;
    const ax = autopilot ? autopilot.ax : input.ax;
    const ay = autopilot ? autopilot.ay : input.ay;
    player.vx += ax * PLAYER.accel * STEP;
    player.vy += ay * PLAYER.accel * STEP;
    // Drag, so letting go coasts to a stop instead of stopping dead.
    const damp = Math.pow(PLAYER.drag, STEP * 60);
    player.vx *= damp;
    player.vy *= damp;
    const speed = Math.hypot(player.vx, player.vy);
    if (speed > PLAYER.maxSpeed) {
      player.vx = (player.vx / speed) * PLAYER.maxSpeed;
      player.vy = (player.vy / speed) * PLAYER.maxSpeed;
    }
    player.x = clamp(player.x + player.vx * STEP, PLAYER.radius, FIELD.width - PLAYER.radius);
    player.y = clamp(player.y + player.vy * STEP, PLAYER.radius, FIELD.height - PLAYER.radius);
    if (player.invulnerable > 0) player.invulnerable = Math.max(0, player.invulnerable - STEP);

    // Embers drift a little, so the cave is never quite still.
    for (const ember of state.embers) {
      ember.age += STEP;
      ember.x = clamp(ember.x + Math.cos(ember.phase + ember.age * 0.9) * ember.driftX * STEP, 40, FIELD.width - 40);
      ember.y = clamp(ember.y + Math.sin(ember.phase + ember.age * 0.7) * ember.driftY * STEP, 40, FIELD.height - 40);
      if (!ember.alive) continue;
      if (distance(player.x, player.y, ember.x, ember.y) < PLAYER.radius + EMBER.radius + 6) {
        ember.alive = false;
        state.collected += 1;
        state.score += SCORE.perEmber;
        state.charge = Math.min(1, state.charge + EMBER.charge);
        state.sparks.push({ x: ember.x, y: ember.y, age: 0 });
        events |= EVENT_EMBER;
        if (state.collected % EMBERS_PER_WAVE === 0) state.wave += 1;
        if (state.collected >= GOAL) {
          state.won = true;
          state.score += SCORE.winBonus;
          return events | EVENT_WIN;
        }
      }
    }
    // A taken ember is replaced a moment later, so there are always the same number to find.
    let alive = 0;
    for (const ember of state.embers) if (ember.alive) alive += 1;
    if (alive < EMBER.count) spawnEmber();

    // Moths: they wander in the dark and only turn hunter while the firefly glows.
    state.mothTimer -= STEP;
    const cap = 2 + state.wave * 2;
    if (state.mothTimer <= 0 && state.moths.length < cap) {
      state.mothTimer = Math.max(MOTH.spawnIntervalFloor, MOTH.spawnInterval - state.wave * 0.22);
      spawnMoth();
    }

    const mothSpeed = MOTH.speed + (state.wave - 1) * MOTH.speedPerWave;
    const huntSpeed = MOTH.huntSpeed + (state.wave - 1) * MOTH.huntPerWave;
    const senseRange = state.glowing ? MOTH.senseGlowing : MOTH.senseIdle;

    for (const moth of state.moths) {
      moth.wing += STEP * 22;
      const toPlayer = distance(moth.x, moth.y, player.x, player.y);
      moth.hunting = senseRange > 0 && toPlayer < senseRange;
      if (moth.hunting) {
        // Drawn to the glow: turn toward it, but turn at a rate, so a sharp dodge can shake it.
        const wanted = Math.atan2(player.y - moth.y, player.x - moth.x);
        let delta = wanted - moth.heading;
        while (delta > Math.PI) delta -= TAU;
        while (delta < -Math.PI) delta += TAU;
        moth.heading += clamp(delta, -MOTH.wanderTurn * 2.2 * STEP, MOTH.wanderTurn * 2.2 * STEP);
      } else {
        // Drifting: a lazy random turn keeps it wandering instead of flying straight.
        moth.heading += signed(random) * MOTH.wanderTurn * STEP;
      }
      const speedNow = moth.hunting ? huntSpeed : mothSpeed;
      moth.vx = Math.cos(moth.heading) * speedNow;
      moth.vy = Math.sin(moth.heading) * speedNow;
      moth.x += moth.vx * STEP;
      moth.y += moth.vy * STEP;
      // The cave walls turn a wandering moth; a hunting one is too fixed on the light to bounce.
      if (moth.x < -40 || moth.x > FIELD.width + 40 || moth.y < -40 || moth.y > FIELD.height + 40) {
        if (moth.hunting) continue;
        moth.x = clamp(moth.x, -40, FIELD.width + 40);
        moth.y = clamp(moth.y, -40, FIELD.height + 40);
        moth.heading += Math.PI * 0.6;
      }
      if (player.invulnerable === 0 && distance(moth.x, moth.y, player.x, player.y) < MOTH.radius + PLAYER.radius) {
        state.lives -= 1;
        player.invulnerable = PLAYER.hitInvulnerable;
        // A hit shoves the moth away and knocks the firefly back, so the moment reads.
        moth.heading += Math.PI;
        const push = Math.atan2(player.y - moth.y, player.x - moth.x);
        player.vx += Math.cos(push) * 260;
        player.vy += Math.sin(push) * 260;
        events |= EVENT_HIT;
        if (state.lives <= 0) {
          events |= EVENT_OVER;
          return events;
        }
      }
    }

    // Ripples fade on their own; they are feedback only, never a rule.
    for (const spark of state.sparks) spark.age += STEP;
    state.sparks = state.sparks.filter((spark) => spark.age < 0.7);

    state.score += SCORE.perSurvivedSecond * STEP;
    return events;
  }

  return { state, step, reset, spawnEmber };
}
