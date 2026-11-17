// Keyboard and pointer in, one small input state out. The rest of the game never touches a DOM
// event: it reads `axes()` and `isGlowing()` each step, so the controls stay in one place.

const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const GLOW = new Set(['Space', 'ShiftLeft', 'ShiftRight']);

export function createInput(target) {
  const held = new Set();
  let pointerGlow = false;
  let pressedStart = false;
  let pressedPause = false;
  let pressedRestart = false;

  function onKeyDown(event) {
    if (event.repeat) {
      // A repeat still counts as held, but never as a fresh press.
      held.add(event.code);
      return;
    }
    held.add(event.code);
    if (event.code === 'Space' || event.code === 'Enter') pressedStart = true;
    if (event.code === 'KeyP' || event.code === 'Escape') pressedPause = true;
    if (event.code === 'KeyR') pressedRestart = true;
    // The arrows, space and shift would scroll or select the page otherwise.
    if (LEFT.has(event.code) || RIGHT.has(event.code) || UP.has(event.code) || DOWN.has(event.code) || GLOW.has(event.code)) {
      event.preventDefault();
    }
  }

  function onKeyUp(event) {
    held.delete(event.code);
  }

  function onBlur() {
    // A window that loses focus must not leave a key stuck down.
    held.clear();
    pointerGlow = false;
  }

  function onPointerDown(event) {
    if (event.button === 0) pointerGlow = true;
    pressedStart = true;
  }

  function onPointerUp() {
    pointerGlow = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  target.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointerup', onPointerUp);
  target.addEventListener('contextmenu', (event) => event.preventDefault());

  function any(set) {
    for (const code of set) if (held.has(code)) return true;
    return false;
  }

  return {
    /** The movement axes, each -1, 0 or 1, from the keys held. */
    axes() {
      const ax = (any(RIGHT) ? 1 : 0) - (any(LEFT) ? 1 : 0);
      const ay = (any(DOWN) ? 1 : 0) - (any(UP) ? 1 : 0);
      return { ax, ay };
    },
    isGlowing() {
      return pointerGlow || any(GLOW);
    },
    /** True once per press; reading it clears it, so a held key starts the game only once. */
    takeStart() {
      const value = pressedStart;
      pressedStart = false;
      return value;
    },
    takePause() {
      const value = pressedPause;
      pressedPause = false;
      return value;
    },
    takeRestart() {
      const value = pressedRestart;
      pressedRestart = false;
      return value;
    },
  };
}
