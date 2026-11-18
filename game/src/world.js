// The simulation: one fixed-step world holding the player, the traffic, the
// pedestrians, the police, the bullets and the four jobs. The step takes a
// control object (from the keyboard or from the screenshot autopilot) and
// returns an event bitmask. Nothing here touches the DOM or the network.

import {
  CAR,
  CITY,
  MISSIONS,
  PALETTE,
  PEDS,
  PLACES,
  PLAYER,
  POLICE,
  STEP,
  TRAFFIC,
  WANTED,
  WORLD,
} from './config.js';
import { createCity, insideBuilding, nearestRoadPoint, onRoad, roadAngle } from './city.js';
import { arrive, createMissionRuntime, currentMission, startTimer, targetFor } from './missions.js';

export const EVENT_NONE = 0;
export const EVENT_HIT = 1;
export const EVENT_CASH = 2;
export const EVENT_MISSION = 4;
export const EVENT_BUSTED = 8;
export const EVENT_WASTED = 16;
export const EVENT_COMPLETE = 32;
export const EVENT_PICKUP = 64;

const TAU = Math.PI * 2;

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

function angleTo(ax, ay, bx, by) {
  return Math.atan2(by - ay, bx - ax);
}

function angleDiff(a, b) {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/** Push a circle out of every building it overlaps; returns true on a hard hit. */
function resolveBuildings(city, x, y, r) {
  let hit = false;
  for (const b of city.buildings) {
    const cx = clamp(x, b.x, b.x + b.w);
    const cy = clamp(y, b.y, b.y + b.h);
    const dx = x - cx;
    const dy = y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 < r * r) {
      hit = true;
      if (d2 > 0.01) {
        const d = Math.sqrt(d2);
        x = cx + (dx / d) * r;
        y = cy + (dy / d) * r;
      } else {
        x = b.x - r;
      }
    }
  }
  return { x, y, hit };
}

function randomRoadPoint(random) {
  const vertical = random.chance(0.5);
  if (vertical) {
    return {
      x: random.pick(CITY.roadAt),
      y: random.range(120, CITY.beachY - 120),
      angle: random.chance(0.5) ? Math.PI / 2 : -Math.PI / 2,
    };
  }
  return {
    x: random.range(120, WORLD.width - 120),
    y: random.pick(CITY.roadAt.filter((y) => y < CITY.beachY)),
    angle: random.chance(0.5) ? 0 : Math.PI,
  };
}

function makeTrafficCar(random, index) {
  const spot = randomRoadPoint(random);
  return {
    id: `traffic-${index}`,
    kind: 'traffic',
    x: spot.x,
    y: spot.y,
    angle: spot.angle,
    speed: random.range(120, 180),
    cruise: random.range(120, 180),
    color: random.pick(PALETTE.traffic),
    hp: 60,
    driver: 'traffic',
    lane: random.pick([-22, 22]),
    turnAt: 0,
    stopped: 0,
  };
}

function makePed(random, index) {
  const spot = randomRoadPoint(random);
  // Civilians stroll the sidewalks, not the middle of the road: offset them
  // perpendicular to the road they walk beside, so a car that stays on the
  // road does not mow them down by accident.
  const off = random.range(70, 110) * random.pick([-1, 1]);
  const px = -Math.sin(spot.angle) * off;
  const py = Math.cos(spot.angle) * off;
  return {
    id: `ped-${index}`,
    kind: 'ped',
    x: spot.x + px,
    y: spot.y + py,
    angle: random.range(0, TAU),
    speed: random.range(40, 70),
    hp: 30,
    target: null,
    panic: 0,
    color: random.pick(['#c9d4e0', '#e0b48a', '#8ab8e0', '#d98ab8']),
  };
}

function makePoliceCar(random, id, x, y) {
  const spot = nearestRoadPoint(x, y);
  return {
    id,
    kind: 'police',
    x: spot.x,
    y: spot.y,
    angle: roadAngle(spot.x, spot.y),
    speed: 0,
    cruise: POLICE.carSpeed,
    color: PALETTE.policeCar,
    hp: 80,
    driver: 'police',
    lane: 0,
    siren: random.range(0, 1),
  };
}

function makeOfficer(random, id, x, y) {
  return {
    id,
    kind: 'officer',
    x: x + random.range(-40, 40),
    y: y + random.range(-40, 40),
    angle: 0,
    speed: POLICE.officerSpeed,
    hp: 40,
    target: null,
    panic: 0,
    color: PALETTE.police,
  };
}

export function createWorld(random) {
  const city = createCity(random);
  const state = {
    time: 0,
    random,
    city,
    player: {
      x: PLACES.garage.x,
      y: PLACES.garage.y + 60,
      angle: -Math.PI / 2,
      health: PLAYER.health,
      ammo: PLAYER.ammo,
      inCar: null,
      punchCd: 0,
      shotCd: 0,
      hurtCd: 0,
      bustMeter: 0,
      run: false,
    },
    cars: [],
    peds: [],
    bullets: [],
    particles: [],
    pickups: [],
    wanted: 0,
    quietTime: 0,
    cash: 0,
    mission: createMissionRuntime(),
    banner: { text: 'Solmar Bay — press Enter to start', until: 0 },
    toast: '',
    toastUntil: 0,
    over: null,
    stats: { stolen: 0, shots: 0, busted: 0 },
  };

  // The mission sedan by the garage (Job 1) and the gold coupe up north (Job 4).
  state.cars.push({
    id: 'sedan',
    kind: 'mission',
    x: PLACES.garage.x + 40,
    y: PLACES.garage.y,
    angle: 0,
    speed: 0,
    cruise: 0,
    color: '#3a6bb8',
    hp: 160,
    driver: 'none',
    lane: 0,
  });
  state.cars.push({
    id: 'coupe',
    kind: 'mission',
    x: PLACES.northLot.x,
    y: PLACES.northLot.y,
    angle: Math.PI / 2,
    speed: 0,
    cruise: 0,
    color: '#d8a521',
    hp: 160,
    driver: 'none',
    lane: 0,
  });
  for (let i = 0; i < 3; i += 1) {
    const spot = randomRoadPoint(random);
    state.cars.push({
      id: `parked-${i}`,
      kind: 'parked',
      x: spot.x + random.range(-30, 30),
      y: spot.y + random.range(-30, 30),
      angle: roadAngle(spot.x, spot.y),
      speed: 0,
      cruise: 0,
      color: random.pick(PALETTE.traffic),
      hp: 120,
      driver: 'none',
      lane: 0,
    });
  }
  for (let i = 0; i < TRAFFIC.count; i += 1) state.cars.push(makeTrafficCar(random, i));
  for (let i = 0; i < PEDS.count; i += 1) state.peds.push(makePed(random, i));

  // Health and ammo stashes the player can find in the city.
  state.pickups.push(
    { x: PLACES.plaza.x + 120, y: PLACES.plaza.y - 80, kind: 'health', amount: 40 },
    { x: PLACES.garage.x - 120, y: PLACES.garage.y + 90, kind: 'ammo', amount: 12 },
    { x: PLACES.lenas.x + 100, y: PLACES.lenas.y + 60, kind: 'health', amount: 40 },
    { x: PLACES.marina.x - 140, y: PLACES.marina.y - 60, kind: 'ammo', amount: 12 },
  );

  const world = {
    state,
    reset() {
      const fresh = createWorld(random);
      for (const key of Object.keys(state)) delete state[key];
      Object.assign(state, fresh.state);
      startTimer(state.mission);
      state.banner = { text: MISSIONS[0].brief, until: 6 };
    },
  };
  startTimer(state.mission);
  state.banner = { text: MISSIONS[0].brief, until: 6 };
  return world;
}

function setBanner(state, text, seconds) {
  state.banner = { text, until: state.time + seconds };
}

function setToast(state, text) {
  state.toast = text;
  state.toastUntil = state.time + 2.5;
}

function addWanted(state, amount) {
  if (amount <= 0) return;
  state.wanted = Math.min(WANTED.max, state.wanted + amount);
  state.quietTime = 0;
}

function burst(state, x, y, color, count, speed) {
  for (let i = 0; i < count; i += 1) {
    const a = state.random.range(0, TAU);
    const s = state.random.range(speed * 0.3, speed);
    state.particles.push({
      x,
      y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      life: state.random.range(0.3, 0.8),
      maxLife: 0.8,
      color,
      size: state.random.range(2, 5),
    });
  }
}

function carById(state, id) {
  return state.cars.find((c) => c.id === id) || null;
}

function nearestCar(state, x, y, maxDist, kinds) {
  let best = null;
  let bestD = maxDist;
  for (const car of state.cars) {
    if (kinds && !kinds.includes(car.kind)) continue;
    const d = dist(x, y, car.x, car.y);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best;
}

function stepPlayerOnFoot(state, c, dt) {
  const p = state.player;
  const len = Math.hypot(c.mx, c.my) || 1;
  const speed = c.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
  let nx = p.x + (c.mx / len) * speed * dt * (c.mx || c.my ? 1 : 0);
  let ny = p.y + (c.my / len) * speed * dt * (c.mx || c.my ? 1 : 0);
  if (c.mx || c.my) p.angle = Math.atan2(c.my, c.mx);
  nx = clamp(nx, 20, WORLD.width - 20);
  ny = clamp(ny, 20, WORLD.height - 20);
  if (!insideBuilding(state.city, nx, p.y)) p.x = nx;
  if (!insideBuilding(state.city, p.x, ny)) p.y = ny;
  p.x = clamp(p.x, 20, WORLD.width - 20);
  p.y = clamp(p.y, 20, WORLD.height - 20);
  p.punchCd = Math.max(0, p.punchCd - dt);
  p.shotCd = Math.max(0, p.shotCd - dt);
  p.hurtCd = Math.max(0, p.hurtCd - dt);

  // Pick up stashes.
  for (let i = state.pickups.length - 1; i >= 0; i -= 1) {
    const pk = state.pickups[i];
    if (dist(p.x, p.y, pk.x, pk.y) < 30) {
      if (pk.kind === 'health') p.health = Math.min(PLAYER.health, p.health + pk.amount);
      if (pk.kind === 'ammo') p.ammo = Math.min(PLAYER.maxAmmo, p.ammo + pk.amount);
      if (pk.kind === 'cash') state.cash += pk.amount;
      state.pickups.splice(i, 1);
      burst(state, pk.x, pk.y, PALETTE.gold, 10, 120);
      setToast(state, pk.kind === 'cash' ? `+$${pk.amount}` : pk.kind === 'health' ? '+40 health' : '+12 ammo');
    }
  }

  // Enter a car. A wreck (hp 0) is not a car any more — it cannot be stolen,
  // or the driver would climb into a dead car and be wrecked again at once.
  if (c.interact) {
    const car = nearestCar(state, p.x, p.y, 70, ['parked', 'mission', 'traffic']);
    if (car && car.driver !== 'player' && car.hp > 0) {
      const wasMission = car.id === 'sedan' || car.id === 'coupe';
      const wasTraffic = car.kind === 'traffic';
      car.driver = 'player';
      p.inCar = car.id;
      p.x = car.x;
      p.y = car.y;
      p.angle = car.angle;
      state.stats.stolen += 1;
      addWanted(state, wasTraffic ? WANTED.stealTraffic : WANTED.stealParked);
      burst(state, car.x, car.y, '#ffffff', 8, 90);
      const rt = state.mission;
      if (wasMission && car.id === 'sedan' && rt.index === 0 && !rt.complete) {
        const pay = arrive(rt, 'deliver');
        state.cash += pay;
        setBanner(state, `Lena: "Nice. $${pay} — job 2 is at the marina."`, 5);
        startTimer(rt);
        return EVENT_MISSION | EVENT_CASH;
      }
      if (wasMission && car.id === 'coupe' && rt.index === 3 && rt.phase === 'go' && !rt.complete) {
        arrive(rt, 'pickup');
        addWanted(state, WANTED.heatOnPickup || 3);
        setBanner(state, 'Lena: "Go! Garage, ninety seconds — lose them!"', 5);
        startTimer(rt);
        return EVENT_MISSION;
      }
      setToast(state, 'Car stolen — the law noticed.');
    }
  }

  // Pistol.
  if (c.shoot && p.shotCd <= 0 && p.ammo > 0) {
    p.ammo -= 1;
    p.shotCd = PLAYER.shotCooldown;
    state.stats.shots += 1;
    const a = Math.atan2(c.aimY - p.y, c.aimX - p.x);
    state.bullets.push({
      x: p.x + Math.cos(a) * 20,
      y: p.y + Math.sin(a) * 20,
      vx: Math.cos(a) * 900,
      vy: Math.sin(a) * 900,
      life: PLAYER.shotRange / 900,
      from: 'player',
    });
    burst(state, p.x + Math.cos(a) * 22, p.y + Math.sin(a) * 22, PALETTE.bullet, 3, 60);
    addWanted(state, 0); // shooting alone is quiet until it hits something
  }

  // Melee.
  if (c.melee && p.punchCd <= 0) {
    p.punchCd = PLAYER.punchCooldown;
    const hx = p.x + Math.cos(p.angle) * PLAYER.punchRange;
    const hy = p.y + Math.sin(p.angle) * PLAYER.punchRange;
    for (const ped of state.peds) {
      if (ped.kind !== 'officer') continue;
      if (dist(hx, hy, ped.x, ped.y) < 30) {
        ped.hp -= PLAYER.punchDamage;
        burst(state, ped.x, ped.y, PALETTE.blood, 6, 100);
        if (ped.hp <= 0) {
          ped.hp = 0;
          state.pickups.push({ x: ped.x, y: ped.y, kind: 'cash', amount: 25 });
        }
      }
    }
  }
  return EVENT_NONE;
}

function stepPlayerDriving(state, c, dt) {
  const p = state.player;
  const car = carById(state, p.inCar);
  if (!car) {
    p.inCar = null;
    return EVENT_NONE;
  }
  const forward = c.throttle > 0 ? 1 : c.throttle < 0 ? -1 : 0;
  if (c.throttle > 0) car.speed = Math.min(CAR.maxSpeed, car.speed + CAR.accel * dt);
  else if (c.throttle < 0) car.speed = Math.max(-CAR.reverseMax, car.speed - CAR.accel * 0.7 * dt);
  else car.speed *= Math.max(0, 1 - 2.2 * dt);
  if (c.brake) car.speed *= Math.max(0, 1 - 5 * dt);
  const dir = car.speed >= 0 ? 1 : -1;
  car.angle += c.steer * CAR.turnRate * dir * Math.min(1, Math.abs(car.speed) / 220) * dt;
  let nx = car.x + Math.cos(car.angle) * car.speed * dt;
  let ny = car.y + Math.sin(car.angle) * car.speed * dt;
  const fixed = resolveBuildings(state.city, nx, ny, 30);
  car.crashCd = Math.max(0, (car.crashCd || 0) - dt);
  if (fixed.hit) {
    // Only a hard crash hurts: scraping a wall at low speed just slows the car.
    // A per-hit cooldown stops one long scrape from draining the car.
    if (Math.abs(car.speed) > 250 && car.crashCd <= 0) {
      car.crashCd = 0.5;
      car.hp -= (Math.abs(car.speed) - 250) * 0.08;
      burst(state, fixed.x, fixed.y, PALETTE.smoke, 8, 120);
    }
    car.speed *= 0.4;
  }
  car.x = clamp(fixed.x, 20, WORLD.width - 20);
  car.y = clamp(fixed.y, 20, WORLD.height - 20);
  p.x = car.x;
  p.y = car.y;
  p.angle = car.angle;
  p.shotCd = Math.max(0, p.shotCd - dt);
  p.hurtCd = Math.max(0, p.hurtCd - dt);

  // Step out.
  if (c.interact) {
    car.driver = 'none';
    car.speed = 0;
    p.inCar = null;
    p.x = car.x + Math.cos(car.angle + Math.PI / 2) * 44;
    p.y = car.y + Math.sin(car.angle + Math.PI / 2) * 44;
    const fixedOut = resolveBuildings(state.city, p.x, p.y, PLAYER.radius);
    p.x = fixedOut.x;
    p.y = fixedOut.y;
    setToast(state, 'Out of the car.');
  }

  // Drive-by shooting is not a thing here: the pistol needs both hands.
  if (car.hp <= 0) {
    burst(state, car.x, car.y, '#ff7a3d', 26, 260);
    burst(state, car.x, car.y, PALETTE.smoke, 20, 140);
    car.driver = 'none';
    car.hp = 0;
    p.inCar = null;
    p.health -= 20;
    p.x = car.x + 50;
    p.y = car.y + 50;
    setBanner(state, 'Your car is wrecked — get out and run!', 4);
    if (p.health <= 0) return EVENT_WASTED;
    return EVENT_HIT;
  }
  return EVENT_NONE;
}

function stepTraffic(state, dt) {
  for (const car of state.cars) {
    if (car.kind !== 'traffic') continue;
    // Slow for the car ahead in the same lane.
    let blocked = false;
    for (const other of state.cars) {
      if (other === car || other.kind === 'parked') continue;
      const ahead = (other.x - car.x) * Math.cos(car.angle) + (other.y - car.y) * Math.sin(car.angle);
      const side = Math.abs((other.x - car.x) * Math.sin(car.angle) - (other.y - car.y) * Math.cos(car.angle));
      if (ahead > 0 && ahead < 110 && side < 40) {
        blocked = true;
        break;
      }
    }
    car.speed = blocked ? Math.max(0, car.speed - 300 * dt) : Math.min(car.cruise, car.speed + 120 * dt);
    // At an intersection, sometimes turn.
    const nearX = CITY.roadAt.find((rx) => Math.abs(car.x - rx) < 24);
    const nearY = CITY.roadAt.find((ry) => ry < CITY.beachY && Math.abs(car.y - ry) < 24);
    if (nearX !== undefined && nearY !== undefined && state.time > car.turnAt) {
      car.turnAt = state.time + 1.5;
      const r = state.random.next();
      const heading = Math.round(((car.angle % TAU) + TAU) % TAU / (Math.PI / 2)) % 4;
      if (r < 0.3) car.angle = ((heading + 1) % 4) * (Math.PI / 2);
      else if (r < 0.55) car.angle = ((heading + 3) % 4) * (Math.PI / 2);
    }
    const laneX = -Math.sin(car.angle) * car.lane;
    const laneY = Math.cos(car.angle) * car.lane;
    car.x += Math.cos(car.angle) * car.speed * dt + laneX * dt * 0.2;
    car.y += Math.sin(car.angle) * car.speed * dt + laneY * dt * 0.2;
    // Keep traffic on the roads: nudge back toward the nearest centreline.
    const spot = nearestRoadPoint(car.x, car.y);
    car.x += (spot.x - car.x) * 0.02;
    car.y += (spot.y - car.y) * 0.02;
    car.x = clamp(car.x, 40, WORLD.width - 40);
    car.y = clamp(car.y, 40, CITY.beachY - 40);
    // A traffic car that hits the player on foot hurts.
    const p = state.player;
    if (!p.inCar && dist(car.x, car.y, p.x, p.y) < 34 && p.hurtCd <= 0 && Math.abs(car.speed) > 40) {
      p.health -= 15;
      p.hurtCd = 1;
      burst(state, p.x, p.y, PALETTE.blood, 8, 120);
      return EVENT_HIT;
    }
  }
  return EVENT_NONE;
}

function stepPeds(state, dt) {
  const p = state.player;
  for (const ped of state.peds) {
    if (ped.hp <= 0) continue;
    if (ped.kind === 'officer') {
      // Officers chase the player on foot when the heat is on.
      if (state.wanted >= 2 && !p.inCar) {
        const a = angleTo(ped.x, ped.y, p.x, p.y);
        ped.angle = a;
        ped.x += Math.cos(a) * ped.speed * dt;
        ped.y += Math.sin(a) * ped.speed * dt;
        if (dist(ped.x, ped.y, p.x, p.y) < 26) {
          p.bustMeter += dt;
          if (p.bustMeter >= POLICE.bustTime) return EVENT_BUSTED;
        } else {
          p.bustMeter = Math.max(0, p.bustMeter - dt);
        }
        if (dist(ped.x, ped.y, p.x, p.y) < 30 && p.hurtCd <= 0) {
          p.health -= 8;
          p.hurtCd = 0.8;
          burst(state, p.x, p.y, PALETTE.blood, 6, 100);
          if (p.health <= 0) return EVENT_WASTED;
        }
      } else if (state.wanted >= 2 && p.inCar) {
        // Officers jog toward the player's car and wait by the road.
        const a = angleTo(ped.x, ped.y, p.x, p.y);
        ped.angle = a;
        ped.x += Math.cos(a) * ped.speed * 0.6 * dt;
        ped.y += Math.sin(a) * ped.speed * 0.6 * dt;
      }
      continue;
    }
    // Civilians stroll the sidewalks and panic away from a speeding car.
    const playerCar = p.inCar ? carById(state, p.inCar) : null;
    const threat = playerCar || (!p.inCar && dist(ped.x, ped.y, p.x, p.y) < 60 ? p : null);
    if (threat && dist(ped.x, ped.y, threat.x, threat.y) < 130) {
      ped.panic = 1.2;
      const away = angleTo(threat.x, threat.y, ped.x, ped.y);
      ped.angle = away;
      ped.x += Math.cos(away) * ped.speed * 2.2 * dt;
      ped.y += Math.sin(away) * ped.speed * 2.2 * dt;
    } else {
      ped.panic = Math.max(0, ped.panic - dt);
      if (!ped.target || dist(ped.x, ped.y, ped.target.x, ped.target.y) < 20) {
        const spot = randomRoadPoint(state.random);
        const off = state.random.range(70, 110) * state.random.pick([-1, 1]);
        ped.target = {
          x: spot.x - Math.sin(spot.angle) * off,
          y: spot.y + Math.cos(spot.angle) * off,
        };
      }
      const a = angleTo(ped.x, ped.y, ped.target.x, ped.target.y);
      ped.angle = a;
      ped.x += Math.cos(a) * ped.speed * dt;
      ped.y += Math.sin(a) * ped.speed * dt;
    }
    ped.x = clamp(ped.x, 20, WORLD.width - 20);
    ped.y = clamp(ped.y, 20, CITY.beachY - 20);
    // A speeding player car that clips a pedestrian is a crime.
    if (playerCar && Math.abs(playerCar.speed) > 100 && dist(ped.x, ped.y, playerCar.x, playerCar.y) < 36) {
      ped.hp = 0;
      burst(state, ped.x, ped.y, PALETTE.blood, 10, 140);
      addWanted(state, WANTED.hitPed);
      setToast(state, 'You hit a pedestrian — witnesses called it in.');
    }
  }
  return EVENT_NONE;
}

function stepPolice(state, dt) {
  const p = state.player;
  // No heat, no police: the law goes home once the wanted level clears.
  if (state.wanted === 0) {
    state.cars = state.cars.filter((c) => c.kind !== 'police');
    state.peds = state.peds.filter((c) => c.kind !== 'officer');
    return EVENT_NONE;
  }
  // How many police cars and officers the heat calls for.
  const wantCars = Math.min(state.wanted, 3);
  const wantOfficers = state.wanted >= 2 ? Math.min(state.wanted - 1, 2) : 0;
  let cars = state.cars.filter((c) => c.kind === 'police');
  let officers = state.peds.filter((c) => c.kind === 'officer');
  while (cars.length < wantCars) {
    const a = state.random.range(0, TAU);
    const sx = clamp(p.x + Math.cos(a) * POLICE.spawnDistance, 60, WORLD.width - 60);
    const sy = clamp(p.y + Math.sin(a) * POLICE.spawnDistance, 60, CITY.beachY - 60);
    const car = makePoliceCar(state.random, `police-${state.time.toFixed(0)}-${cars.length}`, sx, sy);
    state.cars.push(car);
    cars.push(car);
  }
  while (officers.length < wantOfficers) {
    const a = state.random.range(0, TAU);
    const off = makeOfficer(state.random, `officer-${state.time.toFixed(0)}-${officers.length}`, p.x + Math.cos(a) * 300, p.y + Math.sin(a) * 300);
    state.peds.push(off);
    officers.push(off);
  }
  // Police cars pursue: steer toward the player, ram the player's car.
  for (const car of cars) {
    const target = p;
    const want = angleTo(car.x, car.y, target.x, target.y);
    const diff = angleDiff(want, car.angle);
    car.angle += clamp(diff, -POLICE.carTurn * dt, POLICE.carTurn * dt);
    const d = dist(car.x, car.y, target.x, target.y);
    const wantSpeed = d > 220 ? car.cruise : car.cruise * 0.7;
    car.speed = Math.min(wantSpeed, car.speed + 500 * dt);
    let nx = car.x + Math.cos(car.angle) * car.speed * dt;
    let ny = car.y + Math.sin(car.angle) * car.speed * dt;
    const fixed = resolveBuildings(state.city, nx, ny, 30);
    if (fixed.hit) car.speed *= 0.5;
    car.x = clamp(fixed.x, 20, WORLD.width - 20);
    car.y = clamp(fixed.y, 20, WORLD.height - 20);
    car.siren += dt;
    // Ram the player's car: one shove per cooldown, and the damage scales with
    // how hard the impact is — a police car cruising alongside at the same speed
    // shoves, it does not smash; a T-bone at full speed does.
    car.ramCd = Math.max(0, (car.ramCd || 0) - dt);
    const playerCar = p.inCar ? carById(state, p.inCar) : null;
    if (playerCar && car.ramCd <= 0 && dist(car.x, car.y, playerCar.x, playerCar.y) < 58) {
      car.ramCd = 1.2;
      const pushA = angleTo(car.x, car.y, playerCar.x, playerCar.y);
      const closing =
        (Math.cos(car.angle) * car.speed - Math.cos(playerCar.angle) * playerCar.speed) * Math.cos(pushA) +
        (Math.sin(car.angle) * car.speed - Math.sin(playerCar.angle) * playerCar.speed) * Math.sin(pushA);
      playerCar.hp -= Math.min(8, Math.max(0, (closing - 100) * 0.05));
      burst(state, playerCar.x, playerCar.y, PALETTE.smoke, 6, 110);
      const push = angleTo(car.x, car.y, playerCar.x, playerCar.y);
      playerCar.x += Math.cos(push) * 22;
      playerCar.y += Math.sin(push) * 22;
      car.speed *= 0.6;
      if (playerCar.hp <= 0) {
        return stepPlayerDriving(state, { throttle: 0, steer: 0, brake: false, interact: false }, dt);
      }
    }
    // Police cars keep their distance from each other instead of stacking.
    for (const other of cars) {
      if (other === car) continue;
      const d = dist(car.x, car.y, other.x, other.y);
      if (d > 0.01 && d < 80) {
        const push = angleTo(other.x, other.y, car.x, car.y);
        car.x += Math.cos(push) * (80 - d) * 0.5;
        car.y += Math.sin(push) * (80 - d) * 0.5;
      }
    }
    // A police car that touches the player on foot ends the run.
    if (!p.inCar && dist(car.x, car.y, p.x, p.y) < 40) {
      p.bustMeter += dt * 2;
      if (p.bustMeter >= POLICE.bustTime) return EVENT_BUSTED;
    }
  }
  // Heat fades once the player stays quiet and unseen.
  if (state.wanted > 0) {
    state.quietTime += dt;
    const nearest = Math.min(
      ...cars.map((c) => dist(c.x, c.y, p.x, p.y)),
      ...officers.map((o) => dist(o.x, o.y, p.x, p.y)),
      Infinity,
    );
    if (state.quietTime > WANTED.decayDelay && nearest > 500) {
      state.wanted -= 1;
      state.quietTime = 0;
      setToast(state, 'The heat is cooling off…');
    }
  }
  return EVENT_NONE;
}

function stepBullets(state, dt) {
  let events = EVENT_NONE;
  for (let i = state.bullets.length - 1; i >= 0; i -= 1) {
    const b = state.bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    let dead = b.life <= 0;
    if (!dead && insideBuilding(state.city, b.x, b.y)) {
      burst(state, b.x, b.y, '#ffd97a', 4, 80);
      dead = true;
    }
    if (!dead) {
      for (const ped of state.peds) {
        if (ped.hp <= 0) continue;
        if (dist(b.x, b.y, ped.x, ped.y) < 16) {
          ped.hp -= PLAYER.shotDamage;
          burst(state, ped.x, ped.y, PALETTE.blood, 8, 130);
          if (ped.kind === 'officer' && ped.hp <= 0) {
            state.pickups.push({ x: ped.x, y: ped.y, kind: 'cash', amount: 25 });
          }
          if (ped.kind === 'ped') addWanted(state, WANTED.hitPed);
          else addWanted(state, WANTED.shoot);
          dead = true;
          break;
        }
      }
    }
    if (!dead) {
      for (const car of state.cars) {
        if (car.driver === 'player') continue;
        if (dist(b.x, b.y, car.x, car.y) < 30) {
          car.hp -= PLAYER.shotDamage;
          burst(state, b.x, b.y, '#ffd97a', 5, 100);
          if (car.kind === 'police') addWanted(state, WANTED.shoot);
          if (car.hp <= 0 && car.kind === 'police') {
            burst(state, car.x, car.y, '#ff7a3d', 24, 240);
            state.pickups.push({ x: car.x, y: car.y, kind: 'cash', amount: 50 });
            state.cars.splice(state.cars.indexOf(car), 1);
          }
          dead = true;
          break;
        }
      }
    }
    if (dead) state.bullets.splice(i, 1);
  }
  return events;
}

function stepMissions(state, dt) {
  const rt = state.mission;
  if (rt.complete) return EVENT_NONE;
  const m = currentMission(rt);
  const p = state.player;
  // The clock runs on timed jobs.
  if (m.timeLimit > 0 && rt.timer > 0) {
    rt.timer -= dt;
    if (rt.timer <= 0) {
      rt.checkpoint = 0;
      rt.phase = 'go';
      rt.timer = m.timeLimit;
      setBanner(state, 'Lena: "Too slow — from the top. The clock is running."', 5);
      return EVENT_NONE;
    }
  }
  const target = targetFor(rt);
  if (!target) return EVENT_NONE;
  // Jobs that pay on a steal (Job 1) never pay for merely standing at the marker.
  if (m.completeOn === 'steal') return EVENT_NONE;
  const d = dist(p.x, p.y, target.x, target.y);
  if (m.checkpoints) {
    if (d < 70) {
      const pay = arrive(rt, 'checkpoint');
      if (pay > 0) {
        state.cash += pay;
        setBanner(state, `Lena: "Clean. $${pay} — the last job is the gold coupe, North Lot."`, 5);
        startTimer(rt);
        return EVENT_MISSION | EVENT_CASH;
      }
      setToast(state, `${target.label} done — ${m.checkpoints.length - rt.checkpoint} left`);
      return EVENT_MISSION;
    }
    return EVENT_NONE;
  }
  if (m.pickup && rt.phase === 'go') {
    if (d < 60) {
      arrive(rt, 'pickup');
      if (m.heatOnPickup) addWanted(state, m.heatOnPickup);
      setBanner(state, m.id === 'stash' ? 'Package grabbed — deliver it to the plaza.' : 'You have the coupe — get to the garage!', 5);
      return EVENT_MISSION;
    }
    return EVENT_NONE;
  }
  if (d < 70) {
    const pay = arrive(rt, 'deliver');
    if (pay > 0) {
      state.cash += pay;
      if (rt.complete) {
        state.over = 'complete';
        setBanner(state, 'All four jobs done. Solmar Bay is yours.', 6);
        return EVENT_MISSION | EVENT_CASH | EVENT_COMPLETE;
      }
      const next = currentMission(rt);
      setBanner(state, `Lena: " $${pay} in the pocket. Next: ${next.title}"`, 5);
      startTimer(rt);
      return EVENT_MISSION | EVENT_CASH;
    }
  }
  return EVENT_NONE;
}

function stepParticles(state, dt) {
  for (let i = state.particles.length - 1; i >= 0; i -= 1) {
    const pt = state.particles[i];
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.vx *= 1 - 2 * dt;
    pt.vy *= 1 - 2 * dt;
    pt.life -= dt;
    if (pt.life <= 0) state.particles.splice(i, 1);
  }
}

/** Advance the world one fixed step. `control` is null in attract mode. */
export function stepWorld(world, dt, control, demo) {
  const state = world.state;
  if (state.over) return EVENT_NONE;
  state.time += dt;
  let events = EVENT_NONE;
  if (!demo && control) {
    events |= state.player.inCar ? stepPlayerDriving(state, control, dt) : stepPlayerOnFoot(state, control, dt);
    if (state.over) return events;
  }
  events |= stepTraffic(state, dt);
  events |= stepPeds(state, dt);
  events |= stepPolice(state, dt);
  events |= stepBullets(state, dt);
  if (!demo) events |= stepMissions(state, dt);
  stepParticles(state, dt);
  if (state.player.health <= 0 && !state.over) {
    state.over = 'wasted';
    events |= EVENT_WASTED;
  }
  return events;
}

export { STEP, WORLD, PLACES };
