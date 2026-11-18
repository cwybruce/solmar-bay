// The city itself: a road grid, the blocks between the roads, the buildings and
// trees that fill them, and the helpers that say whether a point is on a road or
// inside a building. Built once from the seeded random source, then read-only.

import { CITY, PALETTE, PLACES, WORLD } from './config.js';

const HALF_ROAD = CITY.roadWidth / 2;

/** True when (x, y) lies on any road (roads run the full width/height of the city). */
export function onRoad(x, y) {
  for (const rx of CITY.roadAt) {
    if (Math.abs(x - rx) <= HALF_ROAD) return true;
  }
  for (const ry of CITY.roadAt) {
    if (ry >= CITY.beachY) continue;
    if (Math.abs(y - ry) <= HALF_ROAD) return true;
  }
  return false;
}

/** True when (x, y) is inside a building rectangle. */
export function insideBuilding(city, x, y) {
  for (const b of city.buildings) {
    if (x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h) return true;
  }
  return false;
}

/** The nearest point on the road network to (x, y): used to snap spawned cars. */
export function nearestRoadPoint(x, y) {
  let bestX = CITY.roadAt[0];
  let bestD = Infinity;
  for (const rx of CITY.roadAt) {
    const d = Math.abs(x - rx);
    if (d < bestD) {
      bestD = d;
      bestX = rx;
    }
  }
  let bestY = CITY.roadAt[0];
  bestD = Infinity;
  for (const ry of CITY.roadAt) {
    if (ry >= CITY.beachY) continue;
    const d = Math.abs(y - ry);
    if (d < bestD) {
      bestD = d;
      bestY = ry;
    }
  }
  if (Math.abs(x - bestX) <= Math.abs(y - bestY)) return { x: bestX, y };
  return { x, y: bestY };
}

/** The road direction (0 = east, PI/2 = south) of the road nearest to (x, y). */
export function roadAngle(x, y) {
  let bestX = CITY.roadAt[0];
  let bestD = Infinity;
  for (const rx of CITY.roadAt) {
    const d = Math.abs(x - rx);
    if (d < bestD) {
      bestD = d;
      bestX = rx;
    }
  }
  let bestY = CITY.roadAt[0];
  bestD = Infinity;
  for (const ry of CITY.roadAt) {
    if (ry >= CITY.beachY) continue;
    const d = Math.abs(y - ry);
    if (d < bestD) {
      bestD = d;
      bestY = ry;
    }
  }
  return Math.abs(x - bestX) <= Math.abs(y - bestY) ? Math.PI / 2 : 0;
}

function buildBlocks(random) {
  const blocks = [];
  const xs = [0, ...CITY.roadAt, WORLD.width];
  const ys = [0, ...CITY.roadAt.filter((y) => y < CITY.beachY), CITY.beachY, WORLD.height];
  for (let i = 0; i < xs.length - 1; i += 1) {
    for (let j = 0; j < ys.length - 1; j += 1) {
      const x0 = xs[i] + (i === 0 ? 0 : HALF_ROAD + 14);
      const x1 = xs[i + 1] - (i + 1 >= xs.length - 1 ? 0 : HALF_ROAD + 14);
      const y0 = ys[j] + (j === 0 ? 0 : HALF_ROAD + 14);
      const y1 = ys[j + 1] - (j + 1 >= ys.length - 1 ? 0 : HALF_ROAD + 14);
      if (x1 - x0 < 60 || y1 - y0 < 60) continue;
      blocks.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0, beach: y0 >= CITY.beachY });
    }
  }
  return blocks;
}

export function createCity(random) {
  const blocks = buildBlocks(random);
  const buildings = [];
  const trees = [];
  const parks = [];
  for (const block of blocks) {
    if (block.beach) continue;
    if (random.chance(0.22)) {
      parks.push({ ...block });
      const count = Math.floor(random.range(3, 7));
      for (let i = 0; i < count; i += 1) {
        trees.push({
          x: random.range(block.x + 16, block.x + block.w - 16),
          y: random.range(block.y + 16, block.y + block.h - 16),
          r: random.range(9, 15),
        });
      }
      continue;
    }
    const cols = block.w > 240 ? 2 : 1;
    const rows = block.h > 240 ? 2 : 1;
    for (let c = 0; c < cols; c += 1) {
      for (let r = 0; r < rows; r += 1) {
        const bw = block.w / cols - 36;
        const bh = block.h / rows - 36;
        if (bw < 50 || bh < 50) continue;
        const bx = block.x + 18 + c * (block.w / cols);
        const by = block.y + 18 + r * (block.h / rows);
        buildings.push({
          x: bx,
          y: by,
          w: bw,
          h: bh,
          color: random.pick([PALETTE.building, PALETTE.buildingAlt, '#8c6a4a', '#5d6b7a']),
          floors: random.int(2, 6),
          lit: random.chance(0.55),
        });
      }
    }
    if (random.chance(0.5)) {
      trees.push({
        x: random.range(block.x + 12, block.x + block.w - 12),
        y: random.range(block.y + 12, block.y + block.h - 12),
        r: random.range(8, 13),
      });
    }
  }
  // Keep the mission places clear of buildings.
  const clear = (px, py, radius) => {
    for (let i = buildings.length - 1; i >= 0; i -= 1) {
      const b = buildings[i];
      const cx = Math.max(b.x, Math.min(px, b.x + b.w));
      const cy = Math.max(b.y, Math.min(py, b.y + b.h));
      if ((cx - px) ** 2 + (cy - py) ** 2 < radius * radius) buildings.splice(i, 1);
    }
  };
  clear(PLACES.garage.x, PLACES.garage.y, 170);
  clear(PLACES.marina.x, PLACES.marina.y, 170);
  clear(PLACES.plaza.x, PLACES.plaza.y, 200);
  clear(PLACES.northLot.x, PLACES.northLot.y, 170);
  clear(PLACES.lenas.x, PLACES.lenas.y, 150);
  return { blocks, buildings, trees, parks };
}
