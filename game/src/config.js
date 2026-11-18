// Every tuning number, colour and mission beat in one place. The playfield is a
// fixed 1280x720 logical area; the renderer scales it to the window, and the world
// itself is a 3200x2400 city the camera roams over.

export const VIEW = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

export const WORLD = { width: 3200, height: 2400 };

/** Road centrelines, road width, and where the beach takes over at the south edge. */
export const CITY = {
  roadAt: [200, 600, 1000, 1400, 1800, 2200, 2600, 3000],
  roadWidth: 96,
  beachY: 2100,
  waterY: 2280,
};

/** Named places the missions and the HUD point at. */
export const PLACES = {
  garage: { x: 320, y: 1920, name: 'Sunset Garage' },
  marina: { x: 2900, y: 1950, name: 'Marina' },
  plaza: { x: 1600, y: 1000, name: 'Solmar Plaza' },
  northLot: { x: 1600, y: 320, name: 'North Lot' },
  lenas: { x: 600, y: 600, name: "Lena's" },
};

export const PLAYER = {
  radius: 13,
  walkSpeed: 230,
  runSpeed: 330,
  health: 100,
  ammo: 24,
  maxAmmo: 48,
  punchRange: 34,
  punchDamage: 20,
  punchCooldown: 0.45,
  shotCooldown: 0.22,
  shotDamage: 34,
  shotRange: 520,
};

export const CAR = {
  length: 64,
  width: 32,
  maxSpeed: 520,
  accel: 420,
  brake: 700,
  reverseMax: 160,
  turnRate: 2.6,
  health: 100,
};

export const TRAFFIC = { count: 14, speed: 150, gap: 260 };

export const PEDS = { count: 22, speed: 55 };

export const POLICE = {
  carSpeed: 560,
  carTurn: 3.1,
  officerSpeed: 250,
  bustTime: 1.1,
  spawnDistance: 900,
};

export const WANTED = {
  max: 5,
  decayDelay: 9,
  decayEvery: 4,
  stealParked: 1,
  stealTraffic: 2,
  hitPed: 1,
  shoot: 1,
};

/** The four jobs, in order. Each pays cash and unlocks the next. */
export const MISSIONS = [
  {
    id: 'wheels',
    title: 'Job 1 — First Wheels',
    brief: 'Lena: "Need wheels. Take the blue sedan by the garage — nobody will miss it."',
    target: PLACES.garage,
    targetLabel: 'Steal the sedan',
    reward: 150,
    timeLimit: 0,
    // This job pays when the sedan is stolen, not when the player merely
    // reaches the garage (the player spawns right beside it).
    completeOn: 'steal',
  },
  {
    id: 'stash',
    title: 'Job 2 — Hot Stash',
    brief: 'Lena: "Package is at the marina. Bring it to the plaza — and keep it quiet."',
    pickup: PLACES.marina,
    pickupLabel: 'Grab the package',
    target: PLACES.plaza,
    targetLabel: 'Deliver to the plaza',
    reward: 300,
    timeLimit: 0,
    heatOnPickup: 1,
  },
  {
    id: 'getaway',
    title: 'Job 3 — Getaway',
    brief: 'Lena: "Three drops, one clock. Seventy-five seconds. Drive like you mean it."',
    checkpoints: [
      { x: 600, y: 1800, label: 'Drop 1' },
      { x: 2600, y: 600, label: 'Drop 2' },
      { x: 2600, y: 1800, label: 'Drop 3' },
    ],
    reward: 500,
    timeLimit: 75,
    startHeat: 2,
  },
  {
    id: 'lastjob',
    title: 'Job 4 — The Last Job',
    brief: 'Lena: "The gold coupe in the North Lot. Take it, lose the law, bring it home."',
    pickup: PLACES.northLot,
    pickupLabel: 'Take the gold coupe',
    target: PLACES.garage,
    targetLabel: 'Reach Sunset Garage',
    reward: 1000,
    timeLimit: 90,
    heatOnPickup: 3,
  },
];

export const SAVE_KEY = 'solmar-bay.save.v1';
export const BEST_KEY = 'solmar-bay.best.v1';

export const PALETTE = {
  sky: '#0e1420',
  grass: '#2c4a2e',
  grassAlt: '#33552f',
  park: '#3d6b35',
  sand: '#c9a86a',
  water: '#1d5f7a',
  waterDeep: '#155a75',
  road: '#33373f',
  roadEdge: '#4a4f58',
  roadLine: '#d8c95a',
  sidewalk: '#565b63',
  building: '#7a6a58',
  buildingAlt: '#6b7a8c',
  buildingRoof: '#4c4438',
  windowLit: '#ffd97a',
  windowDark: '#2c3440',
  tree: '#2e6b2f',
  treeTop: '#3f8a3c',
  player: '#ffcf3f',
  playerJacket: '#e85d3d',
  ped: '#c9d4e0',
  policeCar: '#e8ecf2',
  policeTrim: '#1d4fd7',
  police: '#1d4fd7',
  traffic: ['#b8443a', '#3a6bb8', '#4a9e5c', '#c9a13a', '#7a4a9e', '#c9c9c9'],
  bullet: '#ffe9a8',
  blood: '#a83232',
  smoke: '#9aa0a8',
  hud: '#10141c',
  hudPanel: 'rgba(12, 16, 24, 0.82)',
  text: '#f2f4f6',
  muted: '#9aa3ad',
  gold: '#ffcf3f',
  red: '#e5534b',
  green: '#58c96b',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
