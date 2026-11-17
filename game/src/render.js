// Drawing only: the world's state in, pixels out. The cave is dark, but anything that glows — the
// firefly, an ember, a moth's wing — still shines through that dark, so a still frame of this game
// reads as a game being played rather than as a black screen. Flat fills and canvas text, no images.
import { FIELD, FONT, GOAL, LIVES, PALETTE, PLAYER } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';

const TAU = Math.PI * 2;
const PANEL = { width: 760, line: 38 };

/** How much of the dark still lets a glow through: moths sit lowest, embers highest. */
const GLOW_THROUGH = { ember: 0.86, moth: 0.42, firefly: 1 };

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

  /** The still backdrop: a cave of stacked boulders and grit, lit only where the light falls. */
  function drawCave() {
    context.fillStyle = PALETTE.void;
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    // Boulders: a body, a darker underside and a bright top edge, so the light has something that
    // actually reads as stone. A flat blob stays invisible at any light radius.
    for (let index = 0; index < 16; index += 1) {
      const x = (index * 211 + 70) % FIELD.width;
      const y = (index * 337 + 60) % FIELD.height;
      const radius = 48 + (index % 4) * 26;
      context.fillStyle = index % 2 === 0 ? '#31456f' : '#3b5179';
      context.beginPath();
      context.arc(x, y, radius, 0, TAU);
      context.fill();
      // Underside shadow, so the boulder has a bottom that the eye can read as mass.
      context.fillStyle = 'rgba(4,7,16,0.42)';
      context.beginPath();
      context.arc(x, y + radius * 0.30, radius * 0.82, 0, Math.PI);
      context.fill();
      // Top edge: the lit rim that makes a boulder a lit boulder rather than a smudge.
      context.strokeStyle = 'rgba(190,220,255,0.62)';
      context.lineWidth = 2.2;
      context.beginPath();
      context.arc(x, y, radius - 1.5, Math.PI * 1.12, Math.PI * 1.88);
      context.stroke();
    }
    // Grit, for texture at small scale, and the cave floor under everything.
    context.fillStyle = 'rgba(150,175,215,0.30)';
    for (let index = 0; index < 90; index += 1) {
      const x = (index * 149 + 33) % FIELD.width;
      const y = (index * 271 + 17) % FIELD.height;
      context.fillRect(x, y, 2, 2);
    }
    context.fillStyle = '#2b3d63';
    context.fillRect(0, FIELD.height - 20, FIELD.width, 20);
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
    pool.addColorStop(0, state.glowing ? 'rgba(64,170,150,0.22)' : 'rgba(34,96,86,0.12)');
    pool.addColorStop(0.55, state.glowing ? 'rgba(48,128,114,0.11)' : 'rgba(24,70,64,0.06)');
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
    const reach = radius * 1.32;
    const gradient = context.createRadialGradient(state.player.x, state.player.y, radius * 0.18, state.player.x, state.player.y, reach);
    gradient.addColorStop(0, 'rgba(5,7,13,0)');
    gradient.addColorStop(0.52, 'rgba(5,7,13,0.06)');
    gradient.addColorStop(0.76, 'rgba(5,7,13,0.55)');
    gradient.addColorStop(0.92, 'rgba(5,7,13,0.85)');
    gradient.addColorStop(1, 'rgba(5,7,13,0.93)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, FIELD.width, FIELD.height);
  }

  /** How solid a thing is drawn: lit things are solid, things in the dark are only barely there. */
  function visibility(state, x, y, dim) {
    const reach = Math.hypot(x - state.player.x, y - state.player.y);
    return reach < state.lightRadius ? 1 : dim;
  }

  function drawEmbers(state, dim) {
    for (const ember of state.embers) {
      if (!ember.alive) continue;
      const alpha = visibility(state, ember.x, ember.y, dim);
      const pulse = 0.72 + Math.sin(ember.age * 3 + ember.phase) * 0.28;
      const halo = context.createRadialGradient(ember.x, ember.y, 0, ember.x, ember.y, 34 * pulse);
      halo.addColorStop(0, `rgba(255,181,71,${0.62 * alpha})`);
      halo.addColorStop(0.5, `rgba(255,140,40,${0.22 * alpha})`);
      halo.addColorStop(1, 'rgba(255,181,71,0)');
      context.fillStyle = halo;
      context.beginPath();
      context.arc(ember.x, ember.y, 34 * pulse, 0, TAU);
      context.fill();
      context.globalAlpha = alpha;
      context.fillStyle = PALETTE.ember;
      context.beginPath();
      context.arc(ember.x, ember.y, 7.5, 0, TAU);
      context.fill();
      context.fillStyle = PALETTE.emberCore;
      context.beginPath();
      context.arc(ember.x, ember.y, 3.2, 0, TAU);
      context.fill();
      context.globalAlpha = 1;
    }
  }

  function drawMoths(state, dim) {
    for (const moth of state.moths) {
      // A moth in the dark is nearly invisible; the light is how the player finds it at all.
      const alpha = visibility(state, moth.x, moth.y, dim);
      const flap = Math.abs(Math.sin(moth.wing)) * 0.75 + 0.25;
      context.save();
      context.globalAlpha = alpha;
      context.translate(moth.x, moth.y);
      context.rotate(moth.heading + Math.PI / 2);
      context.fillStyle = moth.hunting ? PALETTE.moth : PALETTE.mothDark;
      for (const side of [-1, 1]) {
        context.beginPath();
        context.ellipse(side * 8 * flap, -3, 9 * flap, 11, side * 0.5, 0, TAU);
        context.fill();
      }
      context.fillStyle = moth.hunting ? '#ffd0df' : '#c96a8c';
      context.beginPath();
      context.ellipse(0, 2, 3.4, 8, 0, 0, TAU);
      context.fill();
      context.strokeStyle = moth.hunting ? '#ffd0df' : '#c96a8c';
      context.lineWidth = 1.4;
      context.beginPath();
      context.moveTo(-1.6, -6);
      context.lineTo(-5, -13);
      context.moveTo(1.6, -6);
      context.lineTo(5, -13);
      context.stroke();
      context.restore();
      if (moth.hunting) {
        // A hunting moth wears a ring: the player can see which one has noticed the light.
        context.strokeStyle = `rgba(255,93,143,${0.55 * alpha})`;
        context.lineWidth = 1.8;
        context.beginPath();
        context.arc(moth.x, moth.y, 21, 0, TAU);
        context.stroke();
      }
    }
  }

  function drawFirefly(state) {
    const player = state.player;
    if (player.invulnerable > 0 && Math.floor(player.invulnerable * 12) % 2 === 0) return;
    const glow = state.glowing;
    const haloRadius = glow ? 86 : 54;
    const halo = context.createRadialGradient(player.x, player.y, 0, player.x, player.y, haloRadius);
    halo.addColorStop(0, glow ? 'rgba(126,249,212,0.70)' : 'rgba(126,249,212,0.42)');
    halo.addColorStop(0.45, glow ? 'rgba(126,249,212,0.22)' : 'rgba(126,249,212,0.12)');
    halo.addColorStop(1, 'rgba(126,249,212,0)');
    context.fillStyle = halo;
    context.beginPath();
    context.arc(player.x, player.y, haloRadius, 0, TAU);
    context.fill();
    context.fillStyle = PALETTE.firefly;
    context.beginPath();
    context.arc(player.x, player.y, PLAYER.radius, 0, TAU);
    context.fill();
    context.fillStyle = PALETTE.fireflyCore;
    context.beginPath();
    context.arc(player.x, player.y, PLAYER.radius * 0.48, 0, TAU);
    context.fill();
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

  /** The HUD: dawn progress, the glow meter, lives and score, all against the dark. */
  function drawHud(state) {
    // A soft plate behind the numbers, so the HUD stays legible over the cave.
    context.fillStyle = 'rgba(5,7,13,0.55)';
    context.fillRect(0, 0, FIELD.width, 172);

    const barX = 34;
    const barY = 30;
    const barW = 400;
    const barH = 18;
    context.fillStyle = 'rgba(34,49,79,0.9)';
    context.fillRect(barX, barY, barW, barH);
    const progress = Math.min(1, state.collected / GOAL);
    if (progress > 0) {
      context.fillStyle = PALETTE.ember;
      context.fillRect(barX, barY, barW * progress, barH);
    }
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 1.5;
    context.strokeRect(barX, barY, barW, barH);
    text(`${state.collected} / ${GOAL} embers`, barX, barY + 46, 26, PALETTE.text, 'left', 700);

    // The glow meter: the scarce resource, so it sits right under the dawn bar.
    const glowY = barY + 62;
    const glowW = 240;
    context.fillStyle = 'rgba(34,49,79,0.9)';
    context.fillRect(barX, glowY, glowW, 13);
    const charge = Math.max(0, state.charge);
    if (charge > 0) {
      context.fillStyle = state.glowing ? PALETTE.firefly : '#2f7f6b';
      context.fillRect(barX, glowY, glowW * charge, 13);
    }
    context.strokeStyle = PALETTE.panelEdge;
    context.strokeRect(barX, glowY, glowW, 13);
    text(state.glowing ? 'glow: burning' : 'glow: hold SPACE', barX, glowY + 40, 18, PALETTE.muted, 'left', 500);

    text(`Score ${Math.floor(state.score)}`, FIELD.width - 34, 54, 32, PALETTE.text, 'right', 700);
    text(`wave ${state.wave}`, FIELD.width - 34, 88, 20, PALETTE.muted, 'right', 500);
    // Lives as firefly dots: a spent life is a hollow ring, so "no lives left" cannot look like
    // three dim dots and read as though lives remained.
    for (let life = 0; life < LIVES; life += 1) {
      const x = FIELD.width - 34 - life * 30;
      context.beginPath();
      context.arc(x, 128, 10, 0, TAU);
      if (life < state.lives) {
        context.fillStyle = PALETTE.firefly;
        context.fill();
      } else {
        context.strokeStyle = 'rgba(124,138,168,0.55)';
        context.lineWidth = 2;
        context.stroke();
      }
    }
  }

  /**
   * The one panel every stopped screen uses: a title, a few lines, and the way forward. `accent` is
   * always passed, so no screen can end up drawing its title in an undefined colour.
   */
  function drawPanel(title, lines, prompt, accent) {
    const height = 168 + lines.length * PANEL.line + 92;
    const x = (FIELD.width - PANEL.width) / 2;
    const y = (FIELD.height - height) / 2;
    // A dim wash behind the panel, so the cave recedes and the panel is what the eye lands on.
    context.fillStyle = 'rgba(5,7,13,0.55)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    context.fillStyle = 'rgba(16,26,51,0.97)';
    context.fillRect(x, y, PANEL.width, height);
    context.strokeStyle = accent;
    context.lineWidth = 2;
    context.strokeRect(x, y, PANEL.width, height);
    // A hairline inside the border, so the panel reads as framed rather than as a plain rectangle.
    context.strokeStyle = 'rgba(255,255,255,0.06)';
    context.lineWidth = 1;
    context.strokeRect(x + 7, y + 7, PANEL.width - 14, height - 14);

    text(title, FIELD.width / 2, y + 104, 64, accent, 'center', 700);
    // A rule under the title separates it from the body without another colour.
    context.strokeStyle = accent;
    context.globalAlpha = 0.35;
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(FIELD.width / 2 - 90, y + 128);
    context.lineTo(FIELD.width / 2 + 90, y + 128);
    context.stroke();
    context.globalAlpha = 1;

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const dim = line.startsWith('·');
      text(dim ? line.slice(1) : line, FIELD.width / 2, y + 176 + index * PANEL.line, dim ? 20 : 24, dim ? PALETTE.muted : PALETTE.text, 'center', dim ? 400 : 500);
    }
    text(prompt, FIELD.width / 2, y + height - 46, 26, PALETTE.ember, 'center', 700);
  }

  function titleLines(best) {
    return [
      'You are a firefly in a cave with no moon.',
      'Gather 24 embers and the dawn comes.',
      '·Glowing is the only way to see, and the only thing the moths can find.',
      best > 0 ? `·Best score: ${Math.floor(best)}` : '·Move: arrows or WASD     Glow: SPACE     Pause: P     Restart: R',
    ];
  }

  /** Paint one frame: the cave, the dark, the glows that survive it, then the HUD or a panel. */
  function draw(state, screen, best) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.globalAlpha = 1;
    context.fillStyle = '#000000';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);

    drawCave();
    // The dark goes on first, then the light pool brightens what the light actually reaches. Doing
    // it the other way round paints the light and then covers it with darkness, which reads as a
    // small dim halo no matter how wide the radius is.
    drawDarkness(state);
    drawLightPool(state);
    // Everything that glows is painted after the dark: what is inside the light is solid, and what
    // is still out in the cave is only a suggestion, so the cave reads as dark without going blank.
    drawMoths(state, 0.22);
    drawEmbers(state, 0.55);
    drawSparks(state);
    drawFirefly(state);

    if (screen === SCREEN_TITLE) {
      drawPanel('Ember Drift', titleLines(best), 'Press SPACE or click to begin', PALETTE.firefly);
      return;
    }

    drawHud(state);

    if (screen === SCREEN_PAUSED) {
      drawPanel('Paused', ['The dark is patient.', '·Nothing moves while you decide.'], 'Press P to resume', PALETTE.firefly);
    } else if (screen === SCREEN_OVER) {
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
    } else if (screen === SCREEN_WIN) {
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
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, resize };
}
