// Boot and the one loop: input is read every frame, the world advances in fixed
// 1/60 s steps (several in a slow frame, none in a fast one), and the renderer
// paints what is there. The game moves between title, play, paused, busted,
// wasted and complete screens, and a run can be saved and continued.
//
// ?seed=N fixes the city and the traffic. ?shot=start|drive|chase|end (with
// &seed=N) stages that scene instead of running the loop, paints it twice and
// sets window.__shotReady for a screenshot.

import { BEST_KEY, SAVE_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_BUSTED, EVENT_CASH, EVENT_COMPLETE, EVENT_MISSION, EVENT_WASTED, stepWorld } from './world.js';
import {
  ACTION_CONFIRM,
  ACTION_CONTINUE,
  ACTION_MUTE,
  ACTION_PAUSE,
  ACTION_SAVE,
  createInput,
} from './input.js';
import { createAudio } from './audio.js';
import {
  SCREEN_BUSTED,
  SCREEN_COMPLETE,
  SCREEN_PAUSED,
  SCREEN_PLAY,
  SCREEN_TITLE,
  SCREEN_WASTED,
  createRenderer,
} from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();
// Debug hook for headless play-tests: the live world, readable from the console.
window.__solmar = world;

function readNumber(key) {
  try {
    return Number.parseInt(window.localStorage.getItem(key) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeSave(state) {
  try {
    window.localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({
        cash: state.cash,
        missionIndex: state.mission.index,
        phase: state.mission.phase,
        checkpoint: state.mission.checkpoint,
        health: state.player.health,
        ammo: state.player.ammo,
        x: state.player.x,
        y: state.player.y,
      }),
    );
    return true;
  } catch {
    return false;
  }
}

function applySave(state, save) {
  state.cash = save.cash;
  state.mission.index = save.missionIndex;
  state.mission.phase = save.phase;
  state.mission.checkpoint = save.checkpoint;
  state.player.health = save.health;
  state.player.ammo = save.ammo;
  state.player.x = save.x;
  state.player.y = save.y;
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readNumber(BEST_KEY);
  let accumulator = 0;
  let last = performance.now();
  let camX = 0;
  let camY = 0;

  // Screen readers (and anyone watching the page's text) hear the screen changes.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    world.reset();
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('Playing. Lena has four jobs for you.');
    audio.unlock();
  }

  function continueGame() {
    const save = readSave();
    if (!save) {
      announce('No saved run yet.');
      return;
    }
    world.reset();
    applySave(world.state, save);
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('Continuing your run.');
    audio.unlock();
  }

  function finishRun(endScreen) {
    screen = endScreen;
    const cash = world.state.cash;
    if (cash > best) {
      best = cash;
      try {
        window.localStorage.setItem(BEST_KEY, String(best));
      } catch {
        // Storage can be off (private windows): the best then lasts this visit only.
      }
    }
    announce(
      endScreen === SCREEN_BUSTED
        ? `Busted. Cash banked $${cash}.`
        : endScreen === SCREEN_WASTED
          ? `Wasted. Cash banked $${cash}.`
          : `Complete. You leave Solmar Bay with $${cash}.`,
    );
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      audio.setMuted(!audio.isMuted());
      announce(audio.isMuted() ? 'Muted.' : 'Sound on.');
    }
    if (screen === SCREEN_TITLE) {
      if (actions & ACTION_CONTINUE) continueGame();
      else if (actions & ACTION_CONFIRM) startGame();
      return;
    }
    if (screen === SCREEN_PAUSED) {
      if (actions & ACTION_SAVE) {
        announce(writeSave(world.state) ? 'Run saved. Press P to keep playing.' : 'Save failed — storage is off.');
      } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
      return;
    }
    if (screen === SCREEN_PLAY) {
      if (actions & ACTION_PAUSE) {
        screen = SCREEN_PAUSED;
        announce('Paused. G saves, P resumes.');
      }
      return;
    }
    if (actions & ACTION_CONFIRM) startGame();
  }

  function step() {
    const state = world.state;
    const control = input.control(camX, camY);
    const events = stepWorld(world, STEP, control, false);
    input.endFrame();
    if (events & EVENT_MISSION) audio.cash();
    if (events & EVENT_CASH) audio.cash();
    if (events & EVENT_BUSTED) {
      audio.busted();
      finishRun(SCREEN_BUSTED);
    } else if (events & EVENT_WASTED) {
      audio.busted();
      finishRun(SCREEN_WASTED);
    } else if (events & EVENT_COMPLETE) {
      audio.cash();
      finishRun(SCREEN_COMPLETE);
    }
    // The camera follows the player; the input aims through it.
    camX = Math.max(0, Math.min(3200 - 1280, state.player.x - 640));
    camY = Math.max(0, Math.min(2400 - 720, state.player.y - 360));
    audio.update(state, STEP);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE) {
      while (accumulator >= STEP) {
        stepWorld(world, STEP, null, true);
        accumulator -= STEP;
      }
    } else if (screen === SCREEN_PLAY) {
      while (accumulator >= STEP && screen === SCREEN_PLAY) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, best);
  }

  // Leaving the tab pauses a running game rather than letting the city move unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Solmar Bay. Press Enter to start, or L to continue a saved run.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
