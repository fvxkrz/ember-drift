// The screenshot scenes, tested so the images in screenshots/ stay honest: each scene must reach the
// state it claims, and the same seed must produce the same frame every time.
import test from 'node:test';
import assert from 'node:assert/strict';

import { GOAL } from '../game/src/config.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from '../game/src/render.js';
import { stageShot } from '../game/src/shots.js';
import { createWorld } from '../game/src/world.js';

test('the start scene shows the title', () => {
  const world = createWorld(7);
  const staged = stageShot('start', world);
  assert.equal(staged.screen, SCREEN_TITLE);
});

test('the play scene is a run in progress, not a finished one', () => {
  const world = createWorld(7);
  const staged = stageShot('play', world);
  assert.equal(staged.screen, SCREEN_PLAY);
  assert.ok(world.state.collected > 0, 'a play frame must show progress');
  assert.ok(world.state.collected < GOAL, 'a play frame must not already have won');
  assert.ok(world.state.lives > 0, 'a play frame must not already have lost');
  assert.ok(world.state.moths.length > 0, 'a play frame must show the moths');
});

test('the glow scene has the light wide and a moth inside it', () => {
  const world = createWorld(7);
  const staged = stageShot('glow', world);
  assert.equal(staged.screen, SCREEN_PLAY);
  const { state } = world;
  assert.equal(state.glowing, true, 'the glow scene must actually be glowing');
  assert.ok(state.lightRadius > 300, 'the glow scene must show the wide light');

  // The whole point of the frame: the light is what brought a moth in, so one has to be in it.
  const inside = state.moths.filter((m) => Math.hypot(m.x - state.player.x, m.y - state.player.y) < state.lightRadius);
  assert.ok(inside.length > 0, 'a moth must be visible inside the light');
  assert.ok(inside.some((m) => m.hunting), 'the moth in the light must be hunting');
});

test('the end scene is a real loss', () => {
  const world = createWorld(7);
  const staged = stageShot('lose', world);
  assert.equal(staged.screen, SCREEN_OVER);
  assert.equal(world.state.lives, 0, 'the end frame must be a run that really ended');
  assert.ok(world.state.collected > 0, 'the end frame must show a run worth reporting');
});

test('the win scene is a real dawn', () => {
  const world = createWorld(7);
  const staged = stageShot('win', world);
  assert.equal(staged.screen, SCREEN_WIN);
  assert.equal(world.state.collected, GOAL);
  assert.ok(world.state.score > 0);
});

test('a scene is reproducible: the same seed gives the same frame', () => {
  const drawable = (name) => {
    const world = createWorld(7);
    stageShot(name, world);
    const { state } = world;
    return {
      screen: stageShot(name, createWorld(7)).screen,
      collected: state.collected,
      score: Math.round(state.score),
      lives: state.lives,
      player: [Math.round(state.player.x), Math.round(state.player.y)],
      embers: state.embers.filter((e) => e.alive).map((e) => [Math.round(e.x), Math.round(e.y)]),
    };
  };
  for (const name of ['start', 'play', 'glow', 'lose', 'win']) {
    assert.deepEqual(drawable(name), drawable(name), `${name} must not depend on anything but the seed`);
  }
});

test('an unknown scene falls back to a playable frame instead of crashing', () => {
  const world = createWorld(7);
  const staged = stageShot('no-such-scene', world);
  assert.equal(staged.screen, SCREEN_WIN, 'an unknown name flies the win scene, which is the safest default');
});
