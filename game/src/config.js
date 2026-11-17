// Every tuning number and colour in one place. The playfield is a fixed 1280x720 logical area and
// the renderer scales it to the window, so no rule below depends on the screen size.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

export const PLAYER = {
  radius: 9,
  accel: 2100,
  maxSpeed: 330,
  drag: 0.86,
  hitInvulnerable: 1.6,
};

/** Light the player throws: a small halo by default, a wide wake while the glow is held. */
export const LIGHT = {
  idle: 150,
  glowing: 380,
  /** How fast the glow meter drains while held and refills while not. */
  drain: 0.12,
  refill: 0.16,
  /** Once the meter runs dry the glow stays out until it has recovered this much, so it cannot
   *  flicker on and off frame by frame at empty. */
  relight: 0.22,
};

/** Moths hunt by light: only a glowing firefly draws them, and only from inside this radius. */
export const MOTH = {
  radius: 11,
  speed: 118,
  speedPerWave: 17,
  huntSpeed: 246,
  huntPerWave: 22,
  senseGlowing: 430,
  senseIdle: 0,
  wanderTurn: 2.4,
  spawnInterval: 2.6,
  spawnIntervalFloor: 0.85,
};

export const EMBER = {
  radius: 7,
  count: 16,
  drift: 16,
  /** Embers are worth this many points, and refill this much of the glow meter. */
  points: 25,
  charge: 0.22,
};

export const LIVES = 3;

/** Embers to collect before dawn breaks: the game's win condition. */
export const GOAL = 24;

/** Moths gain one wave every this many embers collected. */
export const EMBERS_PER_WAVE = 8;

export const SCORE = {
  perEmber: 25,
  perSurvivedSecond: 2,
  winBonus: 500,
};

export const PALETTE = {
  void: '#05070d',
  cave: '#0b1020',
  floor: '#0f1530',
  firefly: '#7ef9d4',
  fireflyCore: '#e8fffa',
  ember: '#ffb547',
  emberCore: '#fff0c2',
  moth: '#ff5d8f',
  mothDark: '#8a2547',
  text: '#eef4ff',
  muted: '#7c8aa8',
  panel: '#101a33',
  panelEdge: '#22314f',
  good: '#7ef9d4',
  bad: '#ff5d8f',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'ember-drift.best';
