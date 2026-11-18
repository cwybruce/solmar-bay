// Keyboard and mouse, turned into one control object per frame. The world never
// sees a key code — only movement, steering, aiming and the action edges, which
// keeps the screenshot autopilot and the player on the same interface.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_SAVE = 4;
export const ACTION_MUTE = 8;
export const ACTION_CONTINUE = 16;

const KEY = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  run: ['ShiftLeft', 'ShiftRight'],
  interact: ['KeyE'],
  melee: ['KeyF'],
  brake: ['Space'],
  confirm: ['Enter'],
  pause: ['KeyP', 'Escape'],
  save: ['KeyG'],
  mute: ['KeyM'],
  cont: ['KeyL'],
};

export function createInput(canvas) {
  const held = new Set();
  const pressed = new Set();
  const mouse = { x: 0, y: 0, down: false, clicked: false };
  let actions = 0;

  function isDown(names) {
    return names.some((n) => held.has(n));
  }

  function onKeyDown(event) {
    if (event.repeat) return;
    held.add(event.code);
    pressed.add(event.code);
    if (KEY.confirm.includes(event.code)) actions |= ACTION_CONFIRM;
    if (KEY.pause.includes(event.code)) actions |= ACTION_PAUSE;
    if (KEY.save.includes(event.code)) actions |= ACTION_SAVE;
    if (KEY.mute.includes(event.code)) actions |= ACTION_MUTE;
    if (KEY.cont.includes(event.code)) actions |= ACTION_CONTINUE;
    if (KEY.brake.includes(event.code) || KEY.up.includes(event.code)) event.preventDefault();
  }

  function onKeyUp(event) {
    held.delete(event.code);
  }

  function onMouseMove(event) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 1280;
    mouse.y = ((event.clientY - rect.top) / rect.height) * 720;
  }

  function onMouseDown(event) {
    onMouseMove(event);
    mouse.down = true;
    mouse.clicked = true;
  }

  function onMouseUp() {
    mouse.down = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  return {
    mouse,
    /** Edge-triggered actions since the last call; reading clears them. */
    takeActions() {
      const out = actions;
      actions = 0;
      return out;
    },
    /** The continuous control for this frame. camX/camY turn the mouse into world aim. */
    control(camX, camY) {
      const mx = (isDown(KEY.right) ? 1 : 0) - (isDown(KEY.left) ? 1 : 0);
      const my = (isDown(KEY.down) ? 1 : 0) - (isDown(KEY.up) ? 1 : 0);
      const shoot = mouse.clicked || mouse.down;
      mouse.clicked = false;
      return {
        mx,
        my,
        run: isDown(KEY.run),
        steer: (isDown(KEY.right) ? 1 : 0) - (isDown(KEY.left) ? 1 : 0),
        throttle: (isDown(KEY.up) ? 1 : 0) - (isDown(KEY.down) ? 1 : 0),
        brake: isDown(KEY.brake),
        interact: pressed.has('KeyE'),
        melee: pressed.has('KeyF'),
        shoot,
        aimX: mouse.x + camX,
        aimY: mouse.y + camY,
      };
    },
    /** Clear per-frame edges after the world has read them. */
    endFrame() {
      pressed.clear();
    },
  };
}
