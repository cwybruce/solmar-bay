// The screenshot scenes behind ?shot=start|drive|chase|end. Each one plays the
// real rules forward from a fresh world for a fixed number of steps, steered by
// a simple autopilot that walks to a car, steals it, then follows the road grid
// toward the current job marker — so every frame is what a short game really
// looks like, and the same seed always gives the same frame.

import { CITY, STEP } from './config.js';
import { nearestRoadPoint } from './city.js';
import { stepWorld } from './world.js';
import { targetFor } from './missions.js';
import { SCREEN_BUSTED, SCREEN_COMPLETE, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WASTED } from './render.js';

const START_SECONDS = 5;
const DRIVE_SECONDS = 18;
const CHASE_SECONDS = 16;
const END_LIMIT_SECONDS = 120;

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

function angleDiff(a, b) {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function nearestRoad(value) {
  let best = CITY.roadAt[0];
  let bestD = Infinity;
  for (const r of CITY.roadAt) {
    const d = Math.abs(value - r);
    if (d < bestD) {
      bestD = d;
      best = r;
    }
  }
  return best;
}

/**
 * The autopilot drives a route, not a crow-flies line: it builds an
 * axis-aligned route along the road grid (nearest road point, then the grid
 * corner, then the marker's intersection, then the marker) and steers by pure
 * pursuit — it aims at a point 180 px ahead along the route, so it rejoins
 * the middle of a road instead of scraping along its edge toward a far point.
 */
export function createAutopilot() {
  let route = [];
  let targetKey = '';

  function buildRoute(state, car) {
    const target = targetFor(state.mission);
    const tx = target ? target.x : 1600;
    const ty = target ? target.y : 1000;
    const key = `${tx},${ty}`;
    if (key === targetKey && route.length > 0) return;
    targetKey = key;
    const vx = nearestRoad(tx);
    const hy = nearestRoad(ty);
    const road = nearestRoadPoint(car.x, car.y);
    const points = [{ x: car.x, y: car.y }, road];
    // From the road point, stay on the grid: along its road to the corner,
    // then along the other road to the marker's intersection.
    if (CITY.roadAt.includes(road.y)) points.push({ x: vx, y: road.y });
    else points.push({ x: road.x, y: hy });
    points.push({ x: vx, y: hy }, { x: tx, y: ty });
    route = [];
    for (const pt of points) {
      const last = route[route.length - 1];
      if (!last || Math.hypot(pt.x - last.x, pt.y - last.y) > 5) route.push(pt);
    }
  }

  /** The point 180 px ahead along the route from the car's closest route point. */
  function lookahead(car) {
    let bestS = 0;
    let bestD = Infinity;
    let total = 0;
    for (let i = 0; i < route.length - 1; i += 1) {
      const a = route[i];
      const b = route[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const t = Math.max(0, Math.min(1, ((car.x - a.x) * dx + (car.y - a.y) * dy) / (len * len)));
      const px = a.x + dx * t;
      const py = a.y + dy * t;
      const d = Math.hypot(car.x - px, car.y - py);
      if (d < bestD) {
        bestD = d;
        bestS = total + len * t;
      }
      total += len;
    }
    const want = Math.min(total, bestS + 180);
    let acc = 0;
    for (let i = 0; i < route.length - 1; i += 1) {
      const a = route[i];
      const b = route[i + 1];
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      if (acc + len >= want) {
        const t = (want - acc) / len;
        return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      }
      acc += len;
    }
    return route[route.length - 1];
  }

  return function autoControl(state) {
    const p = state.player;
    const control = {
      mx: 0,
      my: 0,
      run: true,
      steer: 0,
      throttle: 0,
      brake: false,
      interact: false,
      melee: false,
      shoot: false,
      aimX: p.x + 100,
      aimY: p.y,
    };
    if (!p.inCar) {
      // A wrecked car is not a getaway car: take the sedan while it runs,
      // otherwise the nearest parked or traffic car that still drives.
      const sedan = state.cars.find((c) => c.id === 'sedan' && c.hp > 0);
      const fallback = state.cars.find(
        (c) => (c.kind === 'parked' || c.kind === 'traffic') && c.hp > 0 && c.driver !== 'player',
      );
      const car = sedan || fallback;
      if (!car) return control;
      const dx = car.x - p.x;
      const dy = car.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d < 50) {
        control.interact = true;
        return control;
      }
      control.mx = dx / d;
      control.my = dy / d;
      return control;
    }
    const car = state.cars.find((c) => c.id === p.inCar);
    if (!car) return control;
    buildRoute(state, car);
    const wp = lookahead(car);
    const desired = Math.atan2(wp.y - car.y, wp.x - car.x);
    const diff = angleDiff(desired, car.angle);
    control.steer = clamp(diff * 2.2, -1, 1);
    // Slow down for turns — and brake for sharp ones: a 120-degree turn taken
    // at full speed ends in a wall, and the marina turn is exactly that.
    control.throttle = Math.abs(diff) < 0.4 ? 1 : Math.abs(diff) < 1.0 ? 0.5 : 0.25;
    control.brake = Math.abs(diff) > 1.2;
    return control;
  };
}

function runSteps(world, seconds, controlFn) {
  const steps = Math.floor(seconds / STEP);
  let events = 0;
  for (let i = 0; i < steps; i += 1) {
    const state = world.state;
    if (state.over) break;
    events = stepWorld(world, STEP, controlFn ? controlFn(state) : null, !controlFn);
  }
  return events;
}

/** The screen a finished run actually shows, so a staged scene that ends early is never mislabelled as play. */
function endScreen(state) {
  if (state.over === 'busted') return SCREEN_BUSTED;
  if (state.over === 'wasted') return SCREEN_WASTED;
  if (state.over === 'complete') return SCREEN_COMPLETE;
  return SCREEN_PLAY;
}

/**
 * Set `world` to the named scene and return the screen to draw over it and the
 * best cash to show. Any unknown name stages the title.
 */
export function stageShot(name, world) {
  world.reset();
  const state = world.state;
  if (name === 'drive') {
    runSteps(world, DRIVE_SECONDS, createAutopilot());
    return { screen: endScreen(state), best: state.cash };
  }
  if (name === 'chase') {
    state.wanted = 3;
    runSteps(world, CHASE_SECONDS, createAutopilot());
    return { screen: endScreen(state), best: state.cash };
  }
  if (name === 'end') {
    // A real busted ending: maximum heat, an officer right on top of Marco.
    state.wanted = 5;
    state.peds.push({
      id: 'officer-shot',
      kind: 'officer',
      x: state.player.x + 12,
      y: state.player.y + 8,
      angle: 0,
      speed: 250,
      hp: 40,
      target: null,
      panic: 0,
      color: '#1d4fd7',
    });
    const steps = Math.floor(END_LIMIT_SECONDS / STEP);
    for (let i = 0; i < steps; i += 1) {
      const events = stepWorld(world, STEP, { mx: 0, my: 0, run: false, steer: 0, throttle: 0, brake: false, interact: false, melee: false, shoot: false, aimX: 0, aimY: 0 }, false);
      if (state.over === 'busted') break;
      if (events & 8) break;
    }
    if (!state.over) state.over = 'busted';
    return { screen: SCREEN_BUSTED, best: state.cash };
  }
  runSteps(world, START_SECONDS, null);
  return { screen: SCREEN_TITLE, best: 0 };
}
