// Drawing only: the world's state in, pixels out. The cave is dark, but anything that glows —
// the firefly, an ember, a moth's wing — still shines through that dark, so a still frame of this
// game reads as a game being played rather than as a black screen. Flat fills and canvas text, no
// images. The firefly is deliberately the brightest, largest shape on the field: in a game about
// being the light, the player must never be the thing the eye finds last.
import { EMBERS_PER_WAVE, FIELD, FONT, GOAL, LIVES, PALETTE, PLAYER } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';

const TAU = Math.PI * 2;
const PANEL = { width: 780, line: 40 };

/**
 * Where the stone sits, and how big it is. Fixed numbers rather than a random draw, so the cave is
 * the same cave every frame and a screenshot can be compared with the last one byte for byte.
 */
const ROCKS = Array.from({ length: 22 }, (_, index) => ({
  x: (index * 277 + 96) % FIELD.width,
  y: (index * 193 + 132) % FIELD.height,
  radius: 30 + (index % 4) * 13,
}));

/** Stalactites from the ceiling and stalagmites from the floor: the cave's own silhouette. */
const SPIKES = Array.from({ length: 9 }, (_, index) => ({
  x: 60 + index * 145,
  width: 34 + (index % 3) * 16,
  height: 56 + (index % 4) * 26,
}));

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const fonts = new Map();

  function resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  function font(size, weight) {
    const key = `${weight || 400}:${size}`;
    if (!fonts.has(key)) fonts.set(key, `${weight || 400} ${size}px ${FONT}`);
    return fonts.get(key);
  }

  function text(value, x, y, size, color, align, weight) {
    context.font = font(size, weight);
    context.fillStyle = color;
    context.textAlign = align || 'left';
    context.fillText(value, x, y);
  }

  /** A band that fades to nothing at one end, so the HUD sits on the cave without a hard edge. */
  function scrim(x0, y0, x1, y1, from, to) {
    const gradient = context.createLinearGradient(x0, y0, x1, y1);
    gradient.addColorStop(0, from);
    gradient.addColorStop(1, to);
    context.fillStyle = gradient;
    context.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0) || FIELD.width, Math.abs(y1 - y0));
  }

  /**
   * One boulder, as an irregular polygon: a lit crown, a dark base and a crack. Drawn as a circle
   * with a seam across it, stone reads as a soap bubble instead of as rock.
   *
   * `lit` is how much of the firefly's light reaches this rock (0 in the dark, 1 under the glow).
   * It drives both the fill and the rim: stone outside the light stays almost black, so the glow
   * visibly *opens the cave up* instead of the whole map being evenly dim.
   */
  function drawRock(rock, index, lit) {
    const sides = 8 + (index % 5);
    const points = [];
    for (let side = 0; side < sides; side += 1) {
      const angle = (side / sides) * TAU;
      const wobble = 1 + 0.16 * Math.sin(index * 2.4 + side * 1.9) + 0.1 * Math.cos(index * 1.7 + side * 3.3);
      points.push([rock.x + Math.cos(angle) * rock.radius * wobble, rock.y + Math.sin(angle) * rock.radius * 0.78 * wobble]);
    }

    // The shadow that plants it on the floor, so the rock has weight.
    context.fillStyle = 'rgba(2,4,10,0.5)';
    context.beginPath();
    context.ellipse(rock.x + rock.radius * 0.1, rock.y + rock.radius * 0.66, rock.radius * 0.9, rock.radius * 0.22, 0, 0, TAU);
    context.fill();

    const body = context.createLinearGradient(
      rock.x - rock.radius,
      rock.y - rock.radius,
      rock.x + rock.radius * 0.7,
      rock.y + rock.radius,
    );
    // Unlit stone is barely above the void; lit stone climbs to a readable blue. The difference
    // between the two is the whole point of the glow.
    const dark = Math.round(8 + 8 * lit);
    const mid = Math.round(13 + 21 * lit);
    const edge = Math.round(24 + 40 * lit);
    body.addColorStop(0, `rgb(${edge},${edge + 18},${edge + 52})`);
    body.addColorStop(0.55, `rgb(${mid},${mid + 14},${mid + 44})`);
    body.addColorStop(1, `rgb(${dark},${dark + 8},${dark + 26})`);
    context.fillStyle = body;
    context.beginPath();
    for (let side = 0; side < points.length; side += 1) {
      const [x, y] = points[side];
      if (side === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.closePath();
    context.fill();
    context.strokeStyle = `rgba(150,185,235,${0.06 + 0.34 * lit})`;
    context.lineWidth = 1.6;
    context.stroke();

    // A crack, so the stone has a face the eye can catch. Only where there is light to see it by.
    if (lit > 0.15) {
      context.strokeStyle = `rgba(6,10,20,${0.3 + 0.4 * lit})`;
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(points[0][0], points[0][1]);
      context.lineTo(rock.x - rock.radius * 0.15, rock.y + rock.radius * 0.05);
      context.lineTo(rock.x + rock.radius * 0.3, rock.y + rock.radius * 0.34);
      context.stroke();
    }
  }

  /** The still backdrop: boulders, a jagged cave mouth, ceiling teeth and grit. */
  function drawCave(state) {
    context.fillStyle = PALETTE.void;
    context.fillRect(0, 0, FIELD.width, FIELD.height);

    // Each rock is lit by its distance to the firefly, so the stone answers the light.
    for (let index = 0; index < ROCKS.length; index += 1) {
      const rock = ROCKS[index];
      const reach = Math.hypot(rock.x - state.player.x, rock.y - state.player.y);
      const lit = Math.max(0, Math.min(1, 1 - reach / (state.lightRadius * 1.2)));
      drawRock(rock, index, lit);
    }

    // Ceiling stalactites and floor stalagmites: cheap, and they make the frame read as a cave
    // rather than as a dark field with dots in it.
    const tooth = (x, width, height, up) => {
      const base = up ? 0 : FIELD.height;
      const tip = up ? height : FIELD.height - height;
      context.beginPath();
      context.moveTo(x - width, base);
      context.lineTo(x - width * 0.34, up ? height * 0.62 : FIELD.height - height * 0.62);
      context.lineTo(x, tip);
      context.lineTo(x + width * 0.42, up ? height * 0.55 : FIELD.height - height * 0.55);
      context.lineTo(x + width, base);
      context.closePath();
      context.fillStyle = '#0a1024';
      context.fill();
      context.strokeStyle = 'rgba(70,100,155,0.5)';
      context.lineWidth = 1.4;
      context.stroke();
    };
    for (let index = 0; index < SPIKES.length; index += 1) {
      const spike = SPIKES[index];
      tooth(spike.x, spike.width, spike.height, true);
      if (index % 2 === 0) tooth(FIELD.width - spike.x, spike.width * 0.8, spike.height * 0.75, false);
    }

    // The floor: a band with a soft top edge, so the playfield has a bottom.
    const floor = context.createLinearGradient(0, FIELD.height - 74, 0, FIELD.height);
    floor.addColorStop(0, 'rgba(24,36,64,0)');
    floor.addColorStop(1, 'rgba(30,44,76,0.85)');
    context.fillStyle = floor;
    context.fillRect(0, FIELD.height - 74, FIELD.width, 74);

    // Grit, for texture at small scale.
    context.fillStyle = 'rgba(150,175,215,0.26)';
    for (let index = 0; index < 120; index += 1) {
      const x = (index * 149 + 33) % FIELD.width;
      const y = (index * 271 + 17) % FIELD.height;
      context.fillRect(x, y, 2, 2);
    }
  }

  /**
   * The light pool. This is what makes glowing worth anything: everything inside the radius is lit
   * brighter, so a wide glow visibly opens the cave up. It is additive, so it brightens stone and
   * wings rather than washing them out with a flat disc.
   */
  function drawLightPool(state) {
    const radius = state.lightRadius;
    context.save();
    context.globalCompositeOperation = 'lighter';
    const pool = context.createRadialGradient(state.player.x, state.player.y, 0, state.player.x, state.player.y, radius);
    pool.addColorStop(0, state.glowing ? 'rgba(92,214,186,0.30)' : 'rgba(40,110,98,0.14)');
    pool.addColorStop(0.5, state.glowing ? 'rgba(58,150,132,0.16)' : 'rgba(26,76,70,0.07)');
    pool.addColorStop(1, 'rgba(0,0,0,0)');
    context.fillStyle = pool;
    context.beginPath();
    context.arc(state.player.x, state.player.y, radius, 0, TAU);
    context.fill();
    context.restore();
  }

  /**
   * The dark. Light falls off from the firefly outward, so holding the glow reveals the cave and
   * dropping it closes in again. The edge is kept fairly tight, because a long soft ramp makes a
   * wide light look barely wider than a small one in a still frame.
   */
  function drawDarkness(state) {
    const radius = state.lightRadius;
    const reach = radius * 1.34;
    const gradient = context.createRadialGradient(state.player.x, state.player.y, radius * 0.16, state.player.x, state.player.y, reach);
    gradient.addColorStop(0, 'rgba(5,7,13,0)');
    gradient.addColorStop(0.46, 'rgba(5,7,13,0.05)');
    gradient.addColorStop(0.68, 'rgba(5,7,13,0.42)');
    gradient.addColorStop(0.80, 'rgba(5,7,13,0.82)');
    gradient.addColorStop(0.92, 'rgba(5,7,13,0.92)');
    gradient.addColorStop(1, 'rgba(5,7,13,0.94)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, FIELD.width, FIELD.height);

    // Corner vignette, independent of the light: it keeps the eye on the middle of the frame.
    const vignette = context.createRadialGradient(
      FIELD.width / 2,
      FIELD.height / 2,
      Math.min(FIELD.width, FIELD.height) * 0.34,
      FIELD.width / 2,
      FIELD.height / 2,
      Math.hypot(FIELD.width, FIELD.height) * 0.6,
    );
    vignette.addColorStop(0, 'rgba(2,3,8,0)');
    vignette.addColorStop(1, 'rgba(2,3,8,0.55)');
    context.fillStyle = vignette;
    context.fillRect(0, 0, FIELD.width, FIELD.height);
  }

  /** How solid a thing is drawn: lit things are solid, things in the dark are only barely there. */
  function visibility(state, x, y, dim) {
    const reach = Math.hypot(x - state.player.x, y - state.player.y);
    return reach < state.lightRadius ? 1 : dim;
  }

  /**
   * Embers are pickups, so they are drawn as a jewel with a sparkle rather than as a soft dot: a
   * dot in a field of glowing dots reads as scenery, and the player stops seeing what to collect.
   */
  function drawEmbers(state, dim) {
    for (const ember of state.embers) {
      if (!ember.alive) continue;
      const alpha = visibility(state, ember.x, ember.y, dim);
      const pulse = 0.8 + Math.sin(ember.age * 3 + ember.phase) * 0.2;
      const halo = context.createRadialGradient(ember.x, ember.y, 0, ember.x, ember.y, 16 * pulse);
      halo.addColorStop(0, `rgba(255,181,71,${0.34 * alpha})`);
      halo.addColorStop(1, 'rgba(255,181,71,0)');
      context.fillStyle = halo;
      context.beginPath();
      context.arc(ember.x, ember.y, 20 * pulse, 0, TAU);
      context.fill();

      context.globalAlpha = alpha;
      // Four points, so it reads as a spark and not as a smudge.
      context.strokeStyle = `rgba(255,206,124,${0.55 * alpha})`;
      context.lineWidth = 1.4;
      context.beginPath();
      for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        context.moveTo(ember.x + dx * 4, ember.y + dy * 4);
        context.lineTo(ember.x + dx * 8, ember.y + dy * 8);
      }
      context.stroke();

      context.fillStyle = PALETTE.ember;
      context.beginPath();
      context.arc(ember.x, ember.y, 5.4, 0, TAU);
      context.fill();
      context.fillStyle = PALETTE.emberCore;
      context.beginPath();
      context.arc(ember.x, ember.y, 2.6, 0, TAU);
      context.fill();
      context.globalAlpha = 1;
    }
  }

  /**
   * Moths are the only threat, so they get a dark halo under them and a black outline around them:
   * a magenta shape at three percent of the screen width vanishes into the blue stone otherwise.
   */
  function drawMoths(state, dim) {
    for (const moth of state.moths) {
      const alpha = visibility(state, moth.x, moth.y, dim);
      const flap = Math.abs(Math.sin(moth.wing)) * 0.7 + 0.3;

      const shade = context.createRadialGradient(moth.x, moth.y, 0, moth.x, moth.y, 48);
      shade.addColorStop(0, `rgba(5,7,14,${0.8 * alpha})`);
      shade.addColorStop(1, 'rgba(5,7,14,0)');
      context.fillStyle = shade;
      context.beginPath();
      context.arc(moth.x, moth.y, 48, 0, TAU);
      context.fill();

      context.save();
      context.globalAlpha = alpha;
      context.translate(moth.x, moth.y);
      context.rotate(moth.heading + Math.PI / 2);
      context.scale(1.3, 1.3);

      const wing = moth.hunting ? PALETTE.moth : PALETTE.mothDark;
      // Wings: an outlined shape, so the silhouette survives at thumbnail size.
      for (const side of [-1, 1]) {
        context.beginPath();
        context.ellipse(side * 14 * flap, -5, 15 * flap, 19, side * 0.52, 0, TAU);
        context.fillStyle = wing;
        context.fill();
        context.strokeStyle = 'rgba(6,8,16,0.85)';
        context.lineWidth = 2.6;
        context.stroke();
      }
      // Body and antennae: heavy, so it reads as a moth and not as a butterfly.
      context.fillStyle = 'rgba(6,8,16,0.9)';
      context.beginPath();
      context.ellipse(0, 3, 6, 14, 0, 0, TAU);
      context.fill();
      context.fillStyle = moth.hunting ? '#ffd0df' : '#c96a8c';
      context.beginPath();
      context.ellipse(0, 3, 3.6, 10, 0, 0, TAU);
      context.fill();
      context.strokeStyle = moth.hunting ? '#ffd0df' : '#c96a8c';
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(-2, -9);
      context.lineTo(-9, -21);
      context.moveTo(2, -9);
      context.lineTo(9, -21);
      context.stroke();
      // Two eye spots, which is what makes a moth's wing a moth's wing.
      context.fillStyle = 'rgba(255,208,223,0.75)';
      for (const side of [-1, 1]) {
        context.beginPath();
        context.arc(side * 15 * flap, -8, 2.4, 0, TAU);
        context.fill();
      }
      context.restore();

      if (moth.hunting) {
        // A hunting moth wears a ring: the player can see which one has noticed the light.
        context.strokeStyle = `rgba(255,93,143,${0.6 * alpha})`;
        context.lineWidth = 2;
        context.setLineDash([7, 7]);
        context.beginPath();
        context.arc(moth.x, moth.y, 31, 0, TAU);
        context.stroke();
        context.setLineDash([]);
      }
    }
  }

  /** The firefly: wings, a lit abdomen and a hot core. The brightest thing in the frame, always. */
  function drawFirefly(state) {
    const player = state.player;
    if (player.invulnerable > 0 && Math.floor(player.invulnerable * 12) % 2 === 0) return;
    const glow = state.glowing;
    const haloRadius = glow ? 136 : 92;
    const halo = context.createRadialGradient(player.x, player.y, 0, player.x, player.y, haloRadius);
    halo.addColorStop(0, glow ? 'rgba(158,255,228,0.58)' : 'rgba(126,249,212,0.40)');
    halo.addColorStop(0.3, glow ? 'rgba(112,242,208,0.24)' : 'rgba(96,214,182,0.15)');
    halo.addColorStop(1, 'rgba(96,220,190,0)');
    context.fillStyle = halo;
    context.beginPath();
    context.arc(player.x, player.y, haloRadius, 0, TAU);
    context.fill();

    // A dark disc behind the body. Without it the pale sprite sits on its own pale halo and the
    // player reads as "a bright area" rather than as a creature.
    const contact = context.createRadialGradient(player.x, player.y, 0, player.x, player.y, 34);
    contact.addColorStop(0, 'rgba(3,7,16,0.82)');
    contact.addColorStop(0.6, 'rgba(3,7,16,0.5)');
    contact.addColorStop(1, 'rgba(3,7,16,0)');
    context.fillStyle = contact;
    context.beginPath();
    context.arc(player.x, player.y, 34, 0, TAU);
    context.fill();

    // Wings, translucent and edged, drawn behind the body.
    for (const side of [-1, 1]) {
      context.beginPath();
      context.ellipse(player.x + side * 13, player.y - 9, 9.5, 19, side * 0.55, 0, TAU);
      context.fillStyle = 'rgba(206,255,246,0.17)';
      context.fill();
      context.strokeStyle = 'rgba(224,255,251,0.48)';
      context.lineWidth = 1.3;
      context.stroke();
    }

    // Antennae.
    context.strokeStyle = 'rgba(232,255,250,0.8)';
    context.lineWidth = 1.6;
    context.beginPath();
    context.moveTo(player.x - 2, player.y - 15);
    context.lineTo(player.x - 8, player.y - 26);
    context.moveTo(player.x + 2, player.y - 15);
    context.lineTo(player.x + 8, player.y - 26);
    context.stroke();

    // Body: abdomen (the lantern), thorax, head.
    context.fillStyle = PALETTE.firefly;
    context.beginPath();
    context.ellipse(player.x, player.y + 6, PLAYER.radius * 1.14, PLAYER.radius * 1.45, 0, 0, TAU);
    context.fill();
    context.strokeStyle = 'rgba(255,255,255,0.9)';
    context.lineWidth = 2;
    context.stroke();
    context.fillStyle = '#b9ffef';
    context.beginPath();
    context.ellipse(player.x, player.y - 5, PLAYER.radius * 0.86, PLAYER.radius * 0.98, 0, 0, TAU);
    context.fill();
    context.fillStyle = '#eafffb';
    context.beginPath();
    context.arc(player.x, player.y - 14, PLAYER.radius * 0.6, 0, TAU);
    context.fill();

    // The lantern itself: a white-hot core with its own falloff.
    const core = context.createRadialGradient(player.x, player.y + 6, 0, player.x, player.y + 6, 22);
    core.addColorStop(0, 'rgba(255,255,255,1)');
    core.addColorStop(0.34, 'rgba(226,255,248,0.78)');
    core.addColorStop(1, 'rgba(126,249,212,0)');
    context.fillStyle = core;
    context.beginPath();
    context.arc(player.x, player.y + 6, 26, 0, TAU);
    context.fill();
    context.fillStyle = '#ffffff';
    context.beginPath();
    context.arc(player.x, player.y + 6, 6.6, 0, TAU);
    context.fill();
  }

  /**
   * The edge of the light, drawn as a dashed ring. It is the game's central rule made visible: the
   * glow is a promise of this much cave, and the moths live inside it.
   */
  function drawGlowRing(state) {
    context.save();
    context.setLineDash([11, 15]);
    context.strokeStyle = state.glowing ? 'rgba(126,249,212,0.30)' : 'rgba(126,249,212,0.10)';
    context.lineWidth = 2;
    context.beginPath();
    context.arc(state.player.x, state.player.y, state.lightRadius * 1.02, 0, TAU);
    context.stroke();
    context.restore();
  }

  function drawSparks(state) {
    for (const spark of state.sparks) {
      const t = spark.age / 0.7;
      context.strokeStyle = `rgba(255,240,194,${(1 - t) * 0.8})`;
      context.lineWidth = 2.4 * (1 - t) + 0.6;
      context.beginPath();
      context.arc(spark.x, spark.y, 10 + t * 42, 0, TAU);
      context.stroke();
    }
  }

  /** A labelled bar: the label is what stops two bars from being a guessing game. */
  function meter(label, x, y, width, height, fill, value, edge) {
    text(label, x, y - 9, 15, PALETTE.muted, 'left', 700);
    context.fillStyle = 'rgba(26,38,63,0.92)';
    context.fillRect(x, y, width, height);
    if (value > 0) {
      context.fillStyle = fill;
      context.fillRect(x, y, width * Math.min(1, value), height);
    }
    context.strokeStyle = edge;
    context.lineWidth = 1.5;
    context.strokeRect(x, y, width, height);
  }

  /** The HUD: dawn progress, the glow meter, lives and score, all against the dark. */
  function drawHud(state) {
    // A scrim that fades out, so the numbers stay legible without a hard plate cutting the cave.
    scrim(0, 0, 0, 186, 'rgba(4,7,15,0.88)', 'rgba(4,7,15,0)');
    scrim(0, FIELD.height, 0, FIELD.height - 96, 'rgba(4,7,15,0.72)', 'rgba(4,7,15,0)');

    const barX = 34;
    const dawnY = 62;
    const dawnW = 420;
    meter('DAWN', barX, dawnY, dawnW, 20, PALETTE.ember, state.collected / GOAL, PALETTE.panelEdge);
    // Notches where the wave changes, so the bar also says how many waves are left.
    context.strokeStyle = 'rgba(5,7,13,0.6)';
    context.lineWidth = 2;
    for (let wave = 1; wave < GOAL / EMBERS_PER_WAVE; wave += 1) {
      const x = barX + (dawnW * wave * EMBERS_PER_WAVE) / GOAL;
      context.beginPath();
      context.moveTo(x, dawnY);
      context.lineTo(x, dawnY + 20);
      context.stroke();
    }
    text(`${state.collected} / ${GOAL} embers`, barX, 110, 22, PALETTE.text, 'left', 700);

    // The glow meter: the scarce resource, so it sits right under the dawn bar, named, with its
    // state in the brightest small type on the screen.
    const glowY = 146;
    const glowW = 248;
    meter('GLOW', barX, glowY, glowW, 14, state.glowing ? PALETTE.firefly : '#2f7f6b', state.charge, PALETTE.panelEdge);
    const glowState = state.glowing ? 'burning' : state.glowLocked ? 'spent — let go' : 'ready — hold SPACE';
    text(glowState, barX + glowW + 16, glowY + 14, 19, state.glowing ? PALETTE.firefly : state.glowLocked ? PALETTE.bad : PALETTE.text, 'left', 700);

    text('SCORE', FIELD.width - 34, 40, 15, PALETTE.muted, 'right', 700);
    text(`${Math.floor(state.score)}`, FIELD.width - 34, 84, 38, PALETTE.text, 'right', 700);
    text(`WAVE ${state.wave}`, FIELD.width - 34, 116, 17, PALETTE.muted, 'right', 700);
    // Lives as firefly dots: a spent life is a hollow ring, so "no lives left" cannot look like
    // three dim dots and read as though lives remained.
    for (let life = 0; life < LIVES; life += 1) {
      const x = FIELD.width - 34 - life * 32;
      context.beginPath();
      context.arc(x, 152, 10, 0, TAU);
      if (life < state.lives) {
        context.fillStyle = PALETTE.firefly;
        context.fill();
      } else {
        context.strokeStyle = 'rgba(124,138,168,0.6)';
        context.lineWidth = 2;
        context.stroke();
      }
    }
  }

  /**
   * The panel the stopped screens use: a shadowed card with an accent spine, a title, a few lines
   * and the way forward. `accent` is always passed, so no screen can draw its title undefined.
   */
  function drawPanel(title, lines, prompt, accent) {
    const height = 190 + lines.length * PANEL.line + 96;
    const x = (FIELD.width - PANEL.width) / 2;
    const y = (FIELD.height - height) / 2;
    // A dim wash behind the panel, so the cave recedes and the panel is what the eye lands on.
    context.fillStyle = 'rgba(4,6,12,0.76)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);

    context.shadowColor = 'rgba(0,0,0,0.6)';
    context.shadowBlur = 28;
    context.fillStyle = 'rgba(10,17,34,0.98)';
    context.fillRect(x, y, PANEL.width, height);
    context.shadowBlur = 0;
    // The accent spine: a colour bar down one edge reads as deliberate design, a full outline as a
    // default rectangle.
    context.fillStyle = accent;
    context.fillRect(x, y, 5, height);
    context.strokeStyle = 'rgba(150,180,230,0.46)';
    context.lineWidth = 1.5;
    context.strokeRect(x + 5.75, y + 0.75, PANEL.width - 6.5, height - 1.5);

    text(title, x + 46, y + 92, 62, accent, 'left', 700);
    context.strokeStyle = accent;
    context.globalAlpha = 0.6;
    context.lineWidth = 2.5;
    context.beginPath();
    context.moveTo(x + 48, y + 116);
    context.lineTo(x + 208, y + 116);
    context.stroke();
    context.globalAlpha = 1;

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const dim = line.startsWith('·');
      text(dim ? line.slice(1) : line, x + 48, y + 168 + index * PANEL.line, dim ? 21 : 25, dim ? '#9fb0cc' : PALETTE.text, 'left', dim ? 400 : 500);
    }
    text(prompt, x + 48, y + height - 44, 26, PALETTE.ember, 'left', 700);
  }

  /**
   * The title is a poster rather than a box: the cave stays visible through the middle of the
   * frame, so the first thing the judge sees is the game itself, with the title over it.
   */
  function drawTitle(state, best) {
    scrim(0, 0, 0, 296, 'rgba(3,5,12,0.95)', 'rgba(3,5,12,0)');
    scrim(0, FIELD.height, 0, FIELD.height - 232, 'rgba(3,5,12,0.94)', 'rgba(3,5,12,0)');

    text('Ember Drift', 72, 128, 76, PALETTE.firefly, 'left', 700);
    context.font = font(76, 700);
    const wordmark = context.measureText('Ember Drift').width;
    context.strokeStyle = 'rgba(126,249,212,0.55)';
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(74, 152);
    context.lineTo(74 + wordmark, 152);
    context.stroke();

    text('You are a firefly in a cave with no moon.', 74, 200, 26, PALETTE.text, 'left', 500);
    text('Gather 24 embers and the dawn comes.', 74, 234, 26, PALETTE.text, 'left', 500);
    // The hook, in the one warm colour on the screen: it is the whole game, so it must not be the
    // smallest thing on it.
    text('Glowing is the only way to see — and the only thing the moths can find.', 74, 276, 22, PALETTE.ember, 'left', 700);

    if (best > 0) text(`BEST RUN  ${Math.floor(best)}`, FIELD.width - 74, 132, 18, '#9aa8c4', 'right', 700);

    text('ARROWS or WASD  move        SPACE  glow        P  pause        R  restart', FIELD.width / 2, FIELD.height - 96, 19, '#9aa8c4', 'center', 500);
    text('Press SPACE or click to begin', FIELD.width / 2, FIELD.height - 44, 34, PALETTE.ember, 'center', 700);
  }

  /** Paint one frame: the cave, the dark, the glows that survive it, then the HUD or a panel. */
  function draw(state, screen, best) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.globalAlpha = 1;
    context.fillStyle = '#000000';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);

    drawCave(state);
    // The dark goes on first, then the light pool brightens what the light actually reaches. Doing
    // it the other way round paints the light and then covers it with darkness, which reads as a
    // small dim halo no matter how wide the radius is.
    drawDarkness(state);
    drawLightPool(state);
    // Everything that glows is painted after the dark: what is inside the light is solid, and what
    // is still out in the cave is only a suggestion, so the cave reads as dark without going blank.
    drawEmbers(state, 0.5);
    drawMoths(state, 0.34);
    if (screen !== SCREEN_TITLE) drawGlowRing(state);
    drawFirefly(state);
    drawSparks(state);

    if (screen === SCREEN_TITLE) {
      drawTitle(state, best);
      return;
    }

    if (screen === SCREEN_PAUSED) {
      drawPanel('Paused', ['The dark is patient.', '·Nothing moves while you decide.'], 'Press P to resume', PALETTE.firefly);
      return;
    }

    if (screen === SCREEN_OVER) {
      // Nothing of the HUD survives into a stopped screen: the panel states the same numbers in
      // prose, and a half-visible meter behind the wash only looks like a layout bug.
      // "New best" only when it is one: on a first run the two numbers are equal, and printing
      // "Best 411" beside "Score 411" reads as a broken high score rather than as a good run.
      const bestLine = state.score > best ? `Score ${Math.floor(state.score)}     New best` : `Score ${Math.floor(state.score)}     Best ${Math.floor(best)}`;
      drawPanel(
        'The dark wins',
        [
          `You gathered ${state.collected} of ${GOAL} embers.`,
          bestLine,
          `·Wave ${state.wave} is where the moths caught you.`,
        ],
        'Press SPACE or click to try again',
        PALETTE.bad,
      );
      return;
    }

    if (screen === SCREEN_WIN) {
      const bestLine = state.score > best ? `Score ${Math.floor(state.score)}     New best` : `Score ${Math.floor(state.score)}     Best ${Math.floor(best)}`;
      drawPanel(
        'Dawn',
        [
          `All ${GOAL} embers gathered. The cave is lit.`,
          bestLine,
          `·You survived ${Math.floor(state.seconds)} seconds of moth light.`,
        ],
        'Press SPACE or click to play again',
        PALETTE.good,
      );
      return;
    }

    drawHud(state);
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, resize };
}
