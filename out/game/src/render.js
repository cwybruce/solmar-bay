// Everything the player sees: the camera that follows Marco, the city, the cars
// and people in it, the HUD with its minimap, and the title, pause, busted,
// wasted and complete screens. Drawing only — no rules live here.

import { CITY, FONT, PALETTE, VIEW, WORLD } from './config.js';
import { objectiveFor, targetFor } from './missions.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_WASTED = 'wasted';
export const SCREEN_COMPLETE = 'complete';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawCar(ctx, x, y, angle, color, opts = {}) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  roundRect(ctx, -30, -14, 62, 34, 8);
  ctx.fill();
  ctx.fillStyle = color;
  roundRect(ctx, -32, -16, 64, 32, 9);
  ctx.fill();
  ctx.fillStyle = '#20262e';
  roundRect(ctx, -8, -14, 18, 28, 4);
  ctx.fill();
  ctx.fillStyle = 'rgba(180, 210, 235, 0.85)';
  roundRect(ctx, -4, -13, 10, 26, 3);
  ctx.fill();
  ctx.fillStyle = '#ffe9a8';
  ctx.fillRect(28, -13, 3, 6);
  ctx.fillRect(28, 7, 3, 6);
  ctx.fillStyle = '#e5534b';
  ctx.fillRect(-32, -13, 3, 6);
  ctx.fillRect(-32, 7, 3, 6);
  if (opts.police) {
    ctx.fillStyle = PALETTE.policeTrim;
    ctx.fillRect(-12, -16, 24, 5);
    ctx.fillRect(-12, 11, 24, 5);
    const flash = Math.floor(performance.now() / 280) % 2 === 0;
    ctx.fillStyle = flash ? '#ff3b30' : '#2f7bff';
    ctx.beginPath();
    ctx.arc(-6, 0, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = flash ? '#2f7bff' : '#ff3b30';
    ctx.beginPath();
    ctx.arc(6, 0, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  if (opts.gold) {
    ctx.strokeStyle = '#fff3b0';
    ctx.lineWidth = 2;
    roundRect(ctx, -32, -16, 64, 32, 9);
    ctx.stroke();
  }
  ctx.restore();
}

function drawPerson(ctx, x, y, angle, color, isPlayer) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.beginPath();
  ctx.ellipse(0, 4, 11, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(0, 0, isPlayer ? 13 : 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e8c39a';
  ctx.beginPath();
  ctx.arc(Math.cos(angle) * 4, Math.sin(angle) * 4, 6, 0, Math.PI * 2);
  ctx.fill();
  if (isPlayer) {
    ctx.strokeStyle = PALETTE.gold;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 0, 16, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const scale = { x: 1, y: 1 };
  let camX = 0;
  let camY = 0;

  function resize() {
    const w = canvas.clientWidth || VIEW.width;
    const h = canvas.clientHeight || VIEW.height;
    canvas.width = VIEW.width;
    canvas.height = VIEW.height;
    scale.x = w / VIEW.width;
    scale.y = h / VIEW.height;
  }

  function drawCity(state) {
    const city = state.city;
    // Ground: grass, then the beach and the water at the south edge.
    ctx.fillStyle = PALETTE.grass;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    const beachTop = CITY.beachY - camY;
    const waterTop = CITY.waterY - camY;
    ctx.fillStyle = PALETTE.sand;
    ctx.fillRect(0, beachTop, VIEW.width, VIEW.height - beachTop);
    ctx.fillStyle = PALETTE.water;
    ctx.fillRect(0, waterTop, VIEW.width, VIEW.height - waterTop);
    ctx.fillStyle = PALETTE.waterDeep;
    for (let i = 0; i < 8; i += 1) {
      const wx = ((i * 397 + 60) % WORLD.width) - camX;
      ctx.fillRect(wx, waterTop + 40 + (i % 3) * 22, 120, 5);
    }
    // Parks.
    for (const park of city.parks) {
      ctx.fillStyle = PALETTE.park;
      ctx.fillRect(park.x - camX, park.y - camY, park.w, park.h);
    }
    // Roads: asphalt, edge lines and centre dashes.
    ctx.fillStyle = PALETTE.road;
    for (const rx of CITY.roadAt) {
      ctx.fillRect(rx - CITY.roadWidth / 2 - camX, -camY, CITY.roadWidth, WORLD.height);
    }
    for (const ry of CITY.roadAt) {
      if (ry >= CITY.beachY) continue;
      ctx.fillRect(-camX, ry - CITY.roadWidth / 2 - camY, WORLD.width, CITY.roadWidth);
    }
    ctx.strokeStyle = PALETTE.roadLine;
    ctx.lineWidth = 3;
    ctx.setLineDash([26, 30]);
    ctx.beginPath();
    for (const rx of CITY.roadAt) {
      ctx.moveTo(rx - camX, -camY);
      ctx.lineTo(rx - camX, WORLD.height - camY);
    }
    for (const ry of CITY.roadAt) {
      if (ry >= CITY.beachY) continue;
      ctx.moveTo(-camX, ry - camY);
      ctx.lineTo(WORLD.width - camX, ry - camY);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    // Sidewalk edging around the roads.
    ctx.strokeStyle = PALETTE.sidewalk;
    ctx.lineWidth = 4;
    ctx.beginPath();
    for (const rx of CITY.roadAt) {
      ctx.moveTo(rx - CITY.roadWidth / 2 - camX, -camY);
      ctx.lineTo(rx - CITY.roadWidth / 2 - camX, WORLD.height - camY);
      ctx.moveTo(rx + CITY.roadWidth / 2 - camX, -camY);
      ctx.lineTo(rx + CITY.roadWidth / 2 - camX, WORLD.height - camY);
    }
    ctx.stroke();
    // Buildings with lit windows.
    for (const b of city.buildings) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.fillRect(b.x - camX + 5, b.y - camY + 6, b.w, b.h);
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x - camX, b.y - camY, b.w, b.h);
      ctx.fillStyle = PALETTE.buildingRoof;
      ctx.fillRect(b.x - camX + 5, b.y - camY + 5, b.w - 10, b.h - 10);
      const cols = Math.max(1, Math.floor(b.w / 26));
      const rows = Math.max(1, Math.floor(b.h / 26));
      for (let i = 0; i < cols; i += 1) {
        for (let j = 0; j < rows; j += 1) {
          ctx.fillStyle = b.lit && (i + j) % 3 !== 0 ? PALETTE.windowLit : PALETTE.windowDark;
          ctx.fillRect(b.x - camX + 12 + i * 26, b.y - camY + 12 + j * 26, 12, 14);
        }
      }
    }
    // Trees.
    for (const t of city.trees) {
      ctx.fillStyle = PALETTE.tree;
      ctx.beginPath();
      ctx.arc(t.x - camX, t.y - camY, t.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PALETTE.treeTop;
      ctx.beginPath();
      ctx.arc(t.x - camX - 3, t.y - camY - 3, t.r * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
    // The pier reaching into the water at the marina end.
    ctx.fillStyle = '#8a6a45';
    ctx.fillRect(2860 - camX, CITY.beachY - camY, 14, 190);
    ctx.fillRect(2790 - camX, CITY.waterY - 40 - camY, 160, 14);
  }

  function drawMarker(state) {
    const target = targetFor(state.mission);
    if (!target || state.over) return;
    const bob = Math.sin(state.time * 3) * 6;
    const x = target.x - camX;
    const y = target.y - camY + bob;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = PALETTE.gold;
    ctx.beginPath();
    ctx.moveTo(0, 10);
    ctx.lineTo(-13, -14);
    ctx.lineTo(13, -14);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#7a5b00';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = PALETTE.gold;
    ctx.font = `bold 15px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(target.label, x, y - 22);
  }

  function drawHud(state, screen) {
    const p = state.player;
    // Top-left panel: cash, health, ammo, wanted.
    ctx.fillStyle = PALETTE.hudPanel;
    roundRect(ctx, 14, 12, 330, 92, 10);
    ctx.fill();
    ctx.fillStyle = PALETTE.gold;
    ctx.font = `bold 26px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(`$${state.cash}`, 28, 44);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `15px ${FONT}`;
    ctx.fillText('CASH', 28, 64);
    // Health bar.
    ctx.fillStyle = '#3a2020';
    roundRect(ctx, 28, 74, 150, 12, 6);
    ctx.fill();
    ctx.fillStyle = p.health > 30 ? PALETTE.green : PALETTE.red;
    roundRect(ctx, 28, 74, Math.max(0, 150 * (p.health / 100)), 12, 6);
    ctx.fill();
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `13px ${FONT}`;
    ctx.fillText(`HP ${Math.ceil(p.health)}`, 186, 85);
    // Ammo.
    ctx.fillStyle = PALETTE.text;
    ctx.font = `bold 16px ${FONT}`;
    ctx.fillText(`AMMO ${p.ammo}`, 250, 84);
    // Wanted stars.
    for (let i = 0; i < 5; i += 1) {
      ctx.fillStyle = i < state.wanted ? PALETTE.gold : 'rgba(255, 255, 255, 0.18)';
      const sx = 250 + i * 18;
      ctx.beginPath();
      ctx.arc(sx, 36, 7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `12px ${FONT}`;
    ctx.fillText(state.wanted > 0 ? 'WANTED' : 'CLEAN', 250, 56);
    // Speed, when driving.
    if (p.inCar) {
      const car = state.cars.find((c) => c.id === p.inCar);
      ctx.fillStyle = PALETTE.hudPanel;
      roundRect(ctx, 14, 116, 150, 40, 10);
      ctx.fill();
      ctx.fillStyle = PALETTE.text;
      ctx.font = `bold 20px ${FONT}`;
      ctx.fillText(`${Math.round(Math.abs(car ? car.speed : 0) * 0.12)} mph`, 28, 143);
    }
    // Objective line under the top panel.
    const rt = state.mission;
    ctx.fillStyle = PALETTE.text;
    ctx.font = `bold 17px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(objectiveFor(rt), VIEW.width / 2, 34);
    if (rt.timer > 0) {
      ctx.fillStyle = rt.timer < 15 ? PALETTE.red : PALETTE.gold;
      ctx.font = `bold 22px ${FONT}`;
      ctx.fillText(`${Math.ceil(rt.timer)}s`, VIEW.width / 2, 62);
    }
    // Mission banner from Lena.
    if (state.time < state.banner.until) {
      ctx.fillStyle = 'rgba(20, 26, 38, 0.9)';
      roundRect(ctx, VIEW.width / 2 - 330, VIEW.height - 96, 660, 52, 10);
      ctx.fill();
      ctx.fillStyle = PALETTE.text;
      ctx.font = `15px ${FONT}`;
      ctx.fillText(state.banner.text, VIEW.width / 2, VIEW.height - 64);
    }
    if (state.time < state.toastUntil) {
      ctx.fillStyle = PALETTE.gold;
      ctx.font = `bold 15px ${FONT}`;
      ctx.fillText(state.toast, VIEW.width / 2, VIEW.height - 116);
    }
    // Minimap, top right.
    const mw = 230;
    const mh = 172;
    const mx = VIEW.width - mw - 14;
    const my = 12;
    const kx = mw / WORLD.width;
    const ky = mh / WORLD.height;
    ctx.fillStyle = PALETTE.hudPanel;
    roundRect(ctx, mx - 6, my - 6, mw + 12, mh + 12, 10);
    ctx.fill();
    ctx.fillStyle = '#1d2b1d';
    ctx.fillRect(mx, my, mw, mh);
    ctx.fillStyle = '#3a3f47';
    for (const rx of CITY.roadAt) ctx.fillRect(mx + rx * kx - 2, my, 4, mh);
    for (const ry of CITY.roadAt) {
      if (ry >= CITY.beachY) continue;
      ctx.fillRect(mx, my + ry * ky - 2, mw, 4);
    }
    ctx.fillStyle = '#c9a86a';
    ctx.fillRect(mx, my + CITY.beachY * ky, mw, mh - CITY.beachY * ky);
    ctx.fillStyle = '#1d5f7a';
    ctx.fillRect(mx, my + CITY.waterY * ky, mw, mh - CITY.waterY * ky);
    const target = targetFor(state.mission);
    if (target) {
      ctx.fillStyle = PALETTE.gold;
      ctx.beginPath();
      ctx.arc(mx + target.x * kx, my + target.y * ky, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#ff5a4e';
    for (const car of state.cars) {
      if (car.kind !== 'police') continue;
      ctx.beginPath();
      ctx.arc(mx + car.x * kx, my + car.y * ky, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(mx + p.x * kx, my + p.y * ky, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = PALETTE.gold;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(mx + p.x * kx, my + p.y * ky, 6.5, 0, Math.PI * 2);
    ctx.stroke();
    // Controls hint, bottom left.
    ctx.fillStyle = 'rgba(12, 16, 24, 0.7)';
    roundRect(ctx, 14, VIEW.height - 44, 560, 30, 8);
    ctx.fill();
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `13px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText('WASD move / drive · E enter car · Click shoot · F punch · P pause · G save · M mute', 26, VIEW.height - 24);
  }

  function drawScreen(state, screen, best) {
    const p = state.player;
    if (screen === SCREEN_TITLE) {
      ctx.fillStyle = 'rgba(8, 12, 20, 0.55)';
      ctx.fillRect(0, 0, VIEW.width, VIEW.height);
      ctx.textAlign = 'center';
      ctx.fillStyle = PALETTE.gold;
      ctx.font = `bold 84px ${FONT}`;
      ctx.fillText('SOLMAR BAY', VIEW.width / 2, 210);
      ctx.fillStyle = PALETTE.text;
      ctx.font = `26px ${FONT}`;
      ctx.fillText('An open-world crime story in the spirit of GTA 6', VIEW.width / 2, 258);
      ctx.fillStyle = PALETTE.muted;
      ctx.font = `18px ${FONT}`;
      ctx.fillText('Marco "Mars" Solis is back in town. Lena has four jobs — and the law is watching.', VIEW.width / 2, 296);
      ctx.fillStyle = '#0e1420';
      roundRect(ctx, VIEW.width / 2 - 170, 350, 340, 64, 12);
      ctx.fill();
      ctx.strokeStyle = PALETTE.gold;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = PALETTE.gold;
      ctx.font = `bold 26px ${FONT}`;
      ctx.fillText('ENTER — START', VIEW.width / 2, 391);
      ctx.fillStyle = PALETTE.muted;
      ctx.font = `16px ${FONT}`;
      ctx.fillText('WASD move · E steal & drive · Mouse aim, click to shoot · F punch · G save · L continue', VIEW.width / 2, 460);
      if (best > 0) {
        ctx.fillStyle = PALETTE.text;
        ctx.font = `18px ${FONT}`;
        ctx.fillText(`Best cash in one run: $${best}`, VIEW.width / 2, 500);
      }
      ctx.fillStyle = PALETTE.muted;
      ctx.font = `14px ${FONT}`;
      ctx.fillText('A fictional city. No real places, people or cars from any game.', VIEW.width / 2, 660);
      return;
    }
    if (screen === SCREEN_PAUSED) {
      ctx.fillStyle = 'rgba(8, 12, 20, 0.6)';
      ctx.fillRect(0, 0, VIEW.width, VIEW.height);
      ctx.fillStyle = PALETTE.text;
      ctx.font = `bold 56px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('PAUSED', VIEW.width / 2, 330);
      ctx.fillStyle = PALETTE.muted;
      ctx.font = `20px ${FONT}`;
      ctx.fillText('P or Enter — resume · G — save this run · M — mute', VIEW.width / 2, 380);
      return;
    }
    if (screen === SCREEN_BUSTED || screen === SCREEN_WASTED || screen === SCREEN_COMPLETE) {
      ctx.fillStyle = 'rgba(8, 12, 20, 0.72)';
      ctx.fillRect(0, 0, VIEW.width, VIEW.height);
      ctx.textAlign = 'center';
      const title = screen === SCREEN_BUSTED ? 'BUSTED' : screen === SCREEN_WASTED ? 'WASTED' : 'SOLMAR BAY IS YOURS';
      ctx.fillStyle = screen === SCREEN_COMPLETE ? PALETTE.gold : PALETTE.red;
      ctx.font = `bold 72px ${FONT}`;
      ctx.fillText(title, VIEW.width / 2, 300);
      ctx.fillStyle = PALETTE.text;
      ctx.font = `22px ${FONT}`;
      const line =
        screen === SCREEN_BUSTED
          ? 'The Solmar Bay police took Mars in. The jobs will wait — Lena always has more.'
          : screen === SCREEN_WASTED
            ? 'Mars went down in the streets of Solmar Bay.'
            : `All four jobs done. You leave with $${state.cash} — and the city remembers your name.`;
      ctx.fillText(line, VIEW.width / 2, 350);
      ctx.fillStyle = PALETTE.muted;
      ctx.font = `18px ${FONT}`;
      ctx.fillText(`Cash banked: $${state.cash} · Cars stolen: ${state.stats.stolen} · Shots fired: ${state.stats.shots}`, VIEW.width / 2, 400);
      ctx.fillStyle = PALETTE.gold;
      ctx.font = `bold 24px ${FONT}`;
      ctx.fillText('ENTER — PLAY AGAIN', VIEW.width / 2, 470);
    }
  }

  function draw(state, screen, best) {
    resize();
    const p = state.player;
    camX = Math.max(0, Math.min(WORLD.width - VIEW.width, p.x - VIEW.width / 2));
    camY = Math.max(0, Math.min(WORLD.height - VIEW.height, p.y - VIEW.height / 2));
    ctx.save();
    ctx.scale(canvas.width / VIEW.width, canvas.height / VIEW.height);
    drawCity(state);
    // Pickups.
    for (const pk of state.pickups) {
      const x = pk.x - camX;
      const y = pk.y - camY;
      ctx.fillStyle = pk.kind === 'health' ? '#ff6b6b' : pk.kind === 'ammo' ? '#ffd97a' : PALETTE.gold;
      ctx.beginPath();
      ctx.arc(x, y, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#10141c';
      ctx.font = `bold 13px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(pk.kind === 'health' ? '+' : pk.kind === 'ammo' ? 'A' : '$', x, y + 5);
    }
    // The job marker points the way during play; the title screen stays clean.
    if (screen !== SCREEN_TITLE) drawMarker(state);
    // Cars, then people, then bullets and particles.
    for (const car of state.cars) {
      drawCar(ctx, car.x - camX, car.y - camY, car.angle, car.color, {
        police: car.kind === 'police',
        gold: car.id === 'coupe',
      });
    }
    for (const ped of state.peds) {
      if (ped.hp <= 0) continue;
      drawPerson(ctx, ped.x - camX, ped.y - camY, ped.angle, ped.color, false);
    }
    if (!p.inCar) drawPerson(ctx, p.x - camX, p.y - camY, p.angle, PALETTE.playerJacket, true);
    for (const b of state.bullets) {
      ctx.fillStyle = PALETTE.bullet;
      ctx.beginPath();
      ctx.arc(b.x - camX, b.y - camY, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const pt of state.particles) {
      ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x - camX, pt.y - camY, pt.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (screen !== SCREEN_TITLE) drawHud(state, screen);
    drawScreen(state, screen, best);
    ctx.restore();
  }

  return { draw, resize };
}
