// The four jobs as a small state machine. The world owns the player and the
// police; this file only knows what each job asks for, where its marker sits,
// and what happens when the player gets there. A runtime is plain data so the
// save file can hold it.

import { MISSIONS } from './config.js';

export function createMissionRuntime() {
  return { index: 0, phase: 'go', checkpoint: 0, timer: 0, done: false, complete: false };
}

export function currentMission(rt) {
  return MISSIONS[Math.min(rt.index, MISSIONS.length - 1)];
}

/** Where the marker on the map and in the world should point right now. */
export function targetFor(rt) {
  const m = currentMission(rt);
  if (rt.complete) return null;
  if (m.checkpoints) {
    const c = m.checkpoints[Math.min(rt.checkpoint, m.checkpoints.length - 1)];
    return { x: c.x, y: c.y, label: c.label };
  }
  if (m.pickup && rt.phase === 'go') return { x: m.pickup.x, y: m.pickup.y, label: m.pickupLabel };
  return { x: m.target.x, y: m.target.y, label: m.targetLabel };
}

/** One line for the HUD: what Lena wants, and what is left of the clock. */
export function objectiveFor(rt) {
  const m = currentMission(rt);
  if (rt.complete) return 'All jobs done — Solmar Bay is yours, Mars.';
  if (m.checkpoints) {
    return `${m.title}: ${m.checkpoints.length - rt.checkpoint} drop${m.checkpoints.length - rt.checkpoint === 1 ? '' : 's'} left`;
  }
  if (m.pickup && rt.phase === 'go') return `${m.title}: ${m.pickupLabel}`;
  return `${m.title}: ${m.targetLabel}`;
}

/**
 * Feed an arrival: kind is 'pickup', 'deliver' or 'checkpoint'. Returns the cash
 * the arrival pays (0 when it only moves the job along), and moves the runtime.
 */
export function arrive(rt, kind) {
  const m = currentMission(rt);
  if (rt.complete) return 0;
  if (m.checkpoints) {
    if (kind !== 'checkpoint') return 0;
    rt.checkpoint += 1;
    if (rt.checkpoint >= m.checkpoints.length) {
      rt.done = true;
      return finish(rt);
    }
    return 0;
  }
  if (kind === 'pickup' && m.pickup && rt.phase === 'go') {
    rt.phase = 'deliver';
    return 0;
  }
  if (kind === 'deliver') {
    rt.done = true;
    return finish(rt);
  }
  return 0;
}

/** Close out the current job: pay it, and either open the next or finish the game. */
function finish(rt) {
  const m = currentMission(rt);
  const pay = m.reward;
  if (rt.index >= MISSIONS.length - 1) {
    rt.complete = true;
  } else {
    rt.index += 1;
    rt.phase = 'go';
    rt.checkpoint = 0;
    rt.timer = 0;
    rt.done = false;
  }
  return pay;
}

/** Start the current job's clock (0 when the job has no limit). */
export function startTimer(rt) {
  const m = currentMission(rt);
  rt.timer = m.timeLimit || 0;
}
