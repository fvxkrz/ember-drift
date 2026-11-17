// A small deterministic random generator, so a seed always replays the same game: the same ember
// placements, the same moth arrivals, and the same frame for the screenshots.

/** mulberry32: 32 bits of state, uniform enough for spawning and cheap to step. */
export function createRandom(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A number in [-1, 1) from `next`. */
export function signed(next) {
  return next() * 2 - 1;
}
