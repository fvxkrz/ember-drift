// The renderer, tested with a mock canvas: it must paint every screen without throwing, and each
// screen must put its own words on the frame. That is what makes a screenshot trustworthy.
import test from 'node:test';
import assert from 'node:assert/strict';

import { GOAL } from '../game/src/config.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from '../game/src/render.js';
import { createWorld } from '../game/src/world.js';

/** A 2D context that records what was drawn, and throws on any call the real one would reject. */
function mockCanvas() {
  const calls = [];
  const gradient = () => ({ addColorStop: (stop, color) => calls.push({ kind: 'stop', stop, color }) });
  const context = {
    canvas: null,
    setTransform() {}, save() {}, restore() {}, translate() {}, rotate() {},
    fillRect() { calls.push({ kind: 'fillRect' }); },
    strokeRect() { calls.push({ kind: 'strokeRect' }); },
    beginPath() {}, closePath() {}, arc() {}, ellipse() {}, moveTo() {}, lineTo() {},
    fill() { calls.push({ kind: 'fill' }); }, stroke() { calls.push({ kind: 'stroke' }); },
    createRadialGradient() { return gradient(); },
    measureText: (value) => ({ width: String(value).length * 8 }),
    fillText(value) { calls.push({ kind: 'text', value: String(value) }); },
    set fillStyle(value) { if (value === undefined) throw new Error('fillStyle set to undefined'); this._fill = value; },
    get fillStyle() { return this._fill; },
    set strokeStyle(value) { if (value === undefined) throw new Error('strokeStyle set to undefined'); this._stroke = value; },
    get strokeStyle() { return this._stroke; },
    set lineWidth(value) { if (value === undefined) throw new Error('lineWidth set to undefined'); },
    set globalAlpha(value) { if (value === undefined) throw new Error('globalAlpha set to undefined'); },
    set globalCompositeOperation(value) { if (value === undefined) throw new Error('globalCompositeOperation set to undefined'); },
    set font(value) { if (value === undefined) throw new Error('font set to undefined'); },
    set textAlign(value) { if (value === undefined) throw new Error('textAlign set to undefined'); },
    set textBaseline(value) {},
  };
  return { canvas: { getContext: () => context, width: 1280, height: 720 }, calls };
}

/** The renderer reads window for its scale; a plain object is enough for a headless test. */
function withStubWindow(run) {
  const listeners = [];
  globalThis.window = {
    innerWidth: 1280,
    innerHeight: 720,
    devicePixelRatio: 1,
    addEventListener: (name, handler) => listeners.push([name, handler]),
  };
  try {
    return run();
  } finally {
    delete globalThis.window;
  }
}

const screens = [SCREEN_TITLE, SCREEN_PLAY, SCREEN_PAUSED, SCREEN_OVER, SCREEN_WIN];

for (const screen of screens) {
  test(`the ${screen} screen draws without throwing and says something`, () => {
    withStubWindow(() => {
      const { canvas, calls } = mockCanvas();
      const renderer = createRenderer(canvas);
      const world = createWorld(7);
      world.state.collected = 7;
      world.state.score = 412;

      assert.doesNotThrow(() => renderer.draw(world.state, screen, 900));

      const words = calls.filter((c) => c.kind === 'text').map((c) => c.value);
      assert.ok(words.length > 0, 'a screen with nothing written on it cannot be judged');

      // Every screen must say its own name, so no two screenshots can be mistaken for each other.
      const title = { title: 'Ember Drift', play: null, paused: 'Paused', over: 'The dark wins', win: 'Dawn' }[screen];
      if (title) assert.ok(words.includes(title), `${screen} screen must show "${title}"`);
      // Play draws the HUD rather than a panel, so it must show the ember count instead.
      if (screen === SCREEN_PLAY) assert.ok(words.some((w) => w.includes(`/ ${GOAL}`)), 'the HUD must show progress toward the goal');
    });
  });
}

test('the HUD shows the player what they are doing', () => {
  withStubWindow(() => {
    const { canvas, calls } = mockCanvas();
    const renderer = createRenderer(canvas);
    const world = createWorld(7);
    world.state.collected = 13;
    world.state.score = 341;
    world.state.wave = 2;
    renderer.draw(world.state, SCREEN_PLAY, 0);
    const words = calls.filter((c) => c.kind === 'text').map((c) => c.value).join(' | ');
    assert.match(words, /13 \/ 24 embers/);
    assert.match(words, /Score 341/);
    assert.match(words, /wave 2/);
    assert.match(words, /glow/i);
  });
});

test('the end screen reports the real numbers of the run', () => {
  withStubWindow(() => {
    const { canvas, calls } = mockCanvas();
    const renderer = createRenderer(canvas);
    const world = createWorld(7);
    world.state.collected = 15;
    world.state.score = 411;
    world.state.wave = 2;
    renderer.draw(world.state, SCREEN_OVER, 300);
    const words = calls.filter((c) => c.kind === 'text').map((c) => c.value).join(' | ');
    assert.match(words, /15 of 24 embers/);
    assert.match(words, /411/);
    assert.match(words, /try again/i);
  });
});

test('a new best is called out, and a worse run is compared to the record', () => {
  withStubWindow(() => {
    const { canvas, calls } = mockCanvas();
    const renderer = createRenderer(canvas);
    const world = createWorld(7);

    world.state.score = 500;
    renderer.draw(world.state, SCREEN_WIN, 400);
    let words = calls.filter((c) => c.kind === 'text').map((c) => c.value).join(' | ');
    assert.match(words, /New best/, 'a run past the record must say so');

    calls.length = 0;
    world.state.score = 120;
    renderer.draw(world.state, SCREEN_WIN, 400);
    words = calls.filter((c) => c.kind === 'text').map((c) => c.value).join(' | ');
    assert.match(words, /Best 400/, 'a run under the record must show the record beside it');
    assert.doesNotMatch(words, /New best/);
  });
});
