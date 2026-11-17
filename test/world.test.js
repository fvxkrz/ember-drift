// The rules, tested without a browser: world.js never draws, so the whole game can be run in Node.
// Each test states one rule the game promises, and fails loudly if that promise breaks.
import test from 'node:test';
import assert from 'node:assert/strict';

import { EMBER, GOAL, LIGHT, LIVES, MOTH, STEP } from '../game/src/config.js';
import { createWorld, EVENT_EMBER, EVENT_HIT, EVENT_OVER, EVENT_WIN } from '../game/src/world.js';

const still = { ax: 0, ay: 0, glowing: false };

/** Run the world with no player input for a while, and report the events it raised. */
function idle(world, seconds) {
  let events = 0;
  for (let step = 0; step < Math.round(seconds / STEP); step += 1) events |= world.step(still, null);
  return events;
}

test('a seed replays the same game', () => {
  const a = createWorld(1234);
  const b = createWorld(1234);
  idle(a, 12);
  idle(b, 12);
  assert.deepEqual(a.state.embers, b.state.embers);
  assert.deepEqual(a.state.moths.map((m) => [Math.round(m.x), Math.round(m.y)]), b.state.moths.map((m) => [Math.round(m.x), Math.round(m.y)]));

  // A different seed is a different cave: the embers must not land in the same places.
  const c = createWorld(4321);
  assert.notDeepEqual(
    a.state.embers.map((e) => Math.round(e.x)),
    c.state.embers.map((e) => Math.round(e.x)),
  );
});

test('a new world starts whole', () => {
  const { state } = createWorld(7);
  assert.equal(state.lives, LIVES);
  assert.equal(state.collected, 0);
  assert.equal(state.wave, 1);
  assert.equal(state.charge, 1);
  assert.equal(state.won, false);
  assert.equal(state.embers.filter((e) => e.alive).length, EMBER.count);
});

test('the ember count never drops: a taken ember is replaced', () => {
  const world = createWorld(7);
  for (let step = 0; step < 60 * 20; step += 1) {
    world.step(still, null);
    assert.equal(world.state.embers.filter((e) => e.alive).length, EMBER.count);
  }
});

test('the glow drains while held and refills while released', () => {
  const world = createWorld(7);
  const held = { ax: 0, ay: 0, glowing: true };
  for (let step = 0; step < 60; step += 1) world.step(held, null);
  const afterHolding = world.state.charge;
  assert.ok(afterHolding < 1, 'holding the glow must cost charge');
  assert.ok(afterHolding > 1 - LIGHT.drain * 1.2, 'one second of glow costs about LIGHT.drain');

  world.step(still, null);
  assert.ok(world.state.charge > afterHolding, 'releasing the glow must refill it');
});

test('an empty glow cannot be held', () => {
  const world = createWorld(7);
  const held = { ax: 0, ay: 0, glowing: true };
  for (let step = 0; step < 60 * 30; step += 1) world.step(held, null);
  assert.ok(world.state.charge <= 0.03, 'the meter empties if held long enough');
  // With no charge left the glow must not be lit, however hard the key is held.
  assert.equal(world.state.glowing, false);
});

test('the light widens while glowing and narrows again', () => {
  const world = createWorld(7);
  const held = { ax: 0, ay: 0, glowing: true };
  for (let step = 0; step < 60 * 3; step += 1) world.step(held, null);
  const wide = world.state.lightRadius;
  assert.ok(wide > LIGHT.idle * 1.5, 'a held glow must open the cave up');

  idle(world, 4);
  assert.ok(world.state.lightRadius < wide, 'letting go must close the light in again');
});

test('a moth only hunts a glowing firefly', () => {
  const world = createWorld(7);
  // Wander quietly until a moth is on the field and close enough to notice a light.
  const { state } = world;
  let found = null;
  for (let step = 0; step < 60 * 40 && found === null; step += 1) {
    world.step(still, null);
    for (const moth of state.moths) {
      const d = Math.hypot(moth.x - state.player.x, moth.y - state.player.y);
      if (d < MOTH.senseGlowing * 0.8 && d > 200) found = moth;
    }
  }
  assert.ok(found, 'no moth ever came within sensing range');

  // Dark: it must not be hunting, whatever the distance.
  assert.equal(found.hunting, false, 'a dark firefly draws no moth');
});

test('collecting embers scores and fills the glow', () => {
  const world = createWorld(7);
  const { state } = world;
  // Put an ember on the player and step once.
  state.embers[0] = { ...state.embers[0], x: state.player.x, y: state.player.y, alive: true };
  state.charge = 0.5;
  const before = state.score;
  const events = world.step(still, null);
  assert.ok(events & EVENT_EMBER, 'taking an ember must raise EVENT_EMBER');
  assert.equal(state.collected, 1);
  assert.ok(state.score > before, 'an ember must add to the score');
  assert.ok(state.charge > 0.5, 'an ember must give some charge back');
});

test('the score rises with survival time', () => {
  const world = createWorld(7);
  const before = world.state.score;
  idle(world, 2);
  assert.ok(world.state.score > before);
});

test('reaching the goal wins', () => {
  const world = createWorld(7);
  const { state } = world;
  state.collected = GOAL - 1;
  state.embers[0] = { ...state.embers[0], x: state.player.x, y: state.player.y, alive: true };
  const events = world.step(still, null);
  assert.ok(events & EVENT_WIN, 'the last ember must win the run');
  assert.equal(state.won, true);
  assert.equal(state.collected, GOAL);
});

test('a hit costs a life and grants a moment of grace', () => {
  const world = createWorld(7);
  const { state } = world;
  // Park a moth on the player.
  state.moths.push({ x: state.player.x, y: state.player.y, vx: 0, vy: 0, heading: 0, hunting: false, wing: 0, alive: true });
  const lives = state.lives;
  const events = world.step(still, null);
  assert.ok(events & EVENT_HIT, 'touching a moth must raise EVENT_HIT');
  assert.equal(state.lives, lives - 1);
  assert.ok(state.player.invulnerable > 0, 'a hit must leave the player briefly untouchable');

  // While invulnerable, another touch must not take a second life.
  const after = state.lives;
  state.moths[state.moths.length - 1].x = state.player.x;
  state.moths[state.moths.length - 1].y = state.player.y;
  world.step(still, null);
  assert.equal(state.lives, after, 'grace must protect against a second hit');
});

test('losing the last life ends the run', () => {
  const world = createWorld(7);
  const { state } = world;
  state.lives = 1;
  state.moths.push({ x: state.player.x, y: state.player.y, vx: 0, vy: 0, heading: 0, hunting: false, wing: 0, alive: true });
  const events = world.step(still, null);
  assert.ok(events & EVENT_OVER, 'the last hit must end the run');
  assert.equal(state.lives, 0);
});

test('the player cannot leave the field', () => {
  const world = createWorld(7);
  const { state } = world;
  const push = { ax: -1, ay: -1, glowing: false };
  for (let step = 0; step < 60 * 8; step += 1) world.step(push, null);
  assert.ok(state.player.x >= 0 && state.player.x <= 1280);
  assert.ok(state.player.y >= 0 && state.player.y <= 720);
});

test('a reset returns the world to its start', () => {
  const world = createWorld(7);
  world.step({ ax: 1, ay: 0, glowing: true }, null);
  world.reset();
  const { state } = world;
  assert.equal(state.lives, LIVES);
  assert.equal(state.collected, 0);
  assert.equal(state.score, 0);
  assert.equal(state.seconds, 0);
  assert.deepEqual(state.moths, []);
  assert.equal(state.sparks.length, 0);
});
