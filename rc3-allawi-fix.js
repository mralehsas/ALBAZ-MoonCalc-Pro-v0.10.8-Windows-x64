'use strict';

/*
 * ALBAZ MoonCalc Web RC3 — source-locked Allawi correction.
 *
 * Implements the contract in ALLAWI_SOURCE_LOCK_v0.10.8.json:
 *   local sunset + 4/9 lunar lag;
 *   airless topocentric Sun/Moon centre geometry;
 *   ARCV = h(Moon) - h(Sun);
 *   ARCL = centre-to-centre separation;
 *   W' = lunar semidiameter * (1 - cos ARCL);
 *   qA = W' + ARCV/6 - 1.25;
 *   minimum elongation 4.5 degrees;
 *   X only when central conjunction is after local sunset or lag <= 0.
 */

const ALBAZ_RC3 = 'v0.10.8 Web RC3';
const rc3BaseComputeSite = computeSite;
const rc3BaseRenderSiteResult = renderSiteResult;
const rc3BaseGenerateMap = generateMap;
const rc3BaseDrawMap = drawMap;

const RC3_ALLAWI_PLOT = Object.freeze({
  imageWidth: 2048,
  imageHeight: 950,
  left: 88,
  right: 1960,
  top: 59,
  bottom: 891,
  lonMin: -180,
  lonMax: 180,
  latMin: -80,
  latMax: 80,
  colorLatMin: -60,
  colorLatMax: 60
});

const rc3AllawiBasemap = new Image();
rc3AllawiBasemap.decoding = 'async';
rc3AllawiBasemap.src = 'allawi_reference_basemap.png?v=20260802-rc3';
rc3AllawiBasemap.addEventListener('load', () => {
  if (typeof state !== 'undefined' && state.criterion === 'allawi') drawMap();
});

function rc3Finite(value) {
  return Number.isFinite(Number(value));
}

function rc3AllawiGeometry(site, result) {
  const lagValid = rc3Finite(result.lagMinutes) && result.lagMinutes > 0 && result.lagMinutes <= 720;
  const central = site.conjunction instanceof Date
    ? site.conjunction
    : result.conjunction instanceof Date
      ? result.conjunction
      : nearestConjunction(result.sunset);

  if (!lagValid) {
    return { code: 'X', score: NaN, color: CRITERIA.allawi.colors.X, central, reason: 'non-positive lag' };
  }
  if (!central) {
    return { code: '?', score: NaN, color: null, central, reason: 'conjunction unavailable' };
  }
  if (central > result.sunset) {
    return { code: 'X', score: NaN, color: CRITERIA.allawi.colors.X, central, reason: 'central conjunction after sunset' };
  }

  const observer = new Astronomy.Observer(site.latitude, site.longitude, site.elevation || 0);
  const observationTime = new Date(result.sunset.getTime() + (4 / 9) * result.lagMinutes * 60000);

  try {
    const sunEq = Astronomy.Equator('Sun', observationTime, observer, true, true);
    const moonEq = Astronomy.Equator('Moon', observationTime, observer, true, true);
    const sunHor = Astronomy.Horizon(observationTime, observer, sunEq.ra, sunEq.dec, null);
    const moonHor = Astronomy.Horizon(observationTime, observer, moonEq.ra, moonEq.dec, null);

    const sun = { altitude: Number(sunHor.altitude), azimuth: Number(sunHor.azimuth) };
    const moon = { altitude: Number(moonHor.altitude), azimuth: Number(moonHor.azimuth) };
    const arcv = moon.altitude - sun.altitude;

    let arcl = NaN;
    if (typeof Astronomy.AngleBetween === 'function' && sunEq.vec && moonEq.vec) {
      arcl = Number(Astronomy.AngleBetween(sunEq.vec, moonEq.vec));
    }
    if (!rc3Finite(arcl)) arcl = angularSeparationHorizontal(sun, moon);

    const moonDistanceKm = Number(moonEq.dist) * AU_KM;
    const semidiameterArcmin = Math.asin(clamp(MOON_RADIUS_KM / moonDistanceKm, -1, 1)) / DEG * 60;
    const widthArcmin = semidiameterArcmin * (1 - Math.cos(arcl * DEG));
    const qA = widthArcmin + arcv / 6 - 1.25;

    if (![arcv, arcl, semidiameterArcmin, widthArcmin, qA].every(rc3Finite) || widthArcmin < 0) {
      return { code: '?', score: NaN, color: null, central, observationTime, reason: 'geometry unavailable' };
    }

    const code = arcl < 4.5 ? 'D' : qA >= 1 ? 'A' : qA >= 0 ? 'B' : qA >= -0.25 ? 'C' : 'D';
    return {
      code,
      score: qA,
      color: CRITERIA.allawi.colors[code] ?? null,
      central,
      observationTime,
      arcv,
      arcl,
      widthArcmin,
      semidiameterArcmin,
      moonAltitude: moon.altitude,
      moonAzimuth: moon.azimuth,
      sunAltitude: sun.altitude,
      sunAzimuth: sun.azimuth,
      ageAtSunsetHours: (result.sunset - central) / 3600000
    };
  } catch (error) {
    console.warn('Allawi RC3 geometry:', error);
    return { code: '?', score: NaN, color: null, central, observationTime, reason: String(error) };
  }
}

computeSite = function(site) {
  const result = rc3BaseComputeSite(site);
  if (!result?.ok) return result;

  const allawi = rc3AllawiGeometry(site, result);
  result.criteria.allawi = criterionResult('allawi', allawi.code, allawi.score);
  result.allawiConjunction = allawi.central || null;
  result.allawiObservationTime = allawi.observationTime || result.bestTime;
  result.allawiArcv = allawi.arcv;
  result.allawiArcl = allawi.arcl;
  result.allawiWidth = allawi.widthArcmin;
  result.allawiSemidiameter = allawi.semidiameterArcmin;
  result.allawiMoonAltitude = allawi.moonAltitude;
  result.allawiMoonAzimuth = allawi.moonAzimuth;
  result.allawiSunAltitude = allawi.sunAltitude;
  result.allawiSunAzimuth = allawi.sunAzimuth;
  result.allawiAgeAtSunsetHours = allawi.ageAtSunsetHours;
  result.allawiReason = allawi.reason || '';
  result.calculationModel = 'Astronomy Engine JS; source-locked Allawi centre geometry RC3';
  return result;
};

renderSiteResult = function() {
  rc3BaseRenderSiteResult();
  if (state.criterion !== 'allawi' || !state.siteResult?.ok || !el.metricGrid) return;
  const values = el.metricGrid.querySelectorAll('.metric b');
  if (values.length < 12) return;
  values[2].textContent = formatLocalTime(state.siteResult.allawiObservationTime || state.siteResult.bestTime, state.siteResult.site.offset);
  values[6].textContent = formatNumber(state.siteResult.allawiArcv, 3) + '°';
  values[7].textContent = formatNumber(state.siteResult.allawiArcl, 3) + '°';
  values[8].textContent = formatNumber(state.siteResult.allawiWidth, 3) + '′';
  values[9].textContent = formatNumber(state.siteResult.allawiMoonAltitude, 3) + '°';
  values[10].textContent = formatNumber(state.siteResult.allawiMoonAzimuth, 3) + '°';
};

generateMap = async function() {
  if (state.criterion === 'allawi' && el.qualitySelect) {
    el.qualitySelect.value = '2';
    state.mapStep = 2;
  }
  return rc3BaseGenerateMap();
};

function rc3AllawiCanvasSize(canvas) {
  const width = 1440;
  const height = Math.round(width * RC3_ALLAWI_PLOT.imageHeight / RC3_ALLAWI_PLOT.imageWidth);
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  return { width, height };
}

function rc3AllawiProject(lon, lat, width, height) {
  const p = RC3_ALLAWI_PLOT;
  const sx = width / p.imageWidth;
  const sy = height / p.imageHeight;
  const left = p.left * sx;
  const right = p.right * sx;
  const top = p.top * sy;
  const bottom = p.bottom * sy;
  const x = left + (normalizeLon(lon) - p.lonMin) / (p.lonMax - p.lonMin) * (right - left);
  const y = top + (p.latMax - clamp(lat, p.latMin, p.latMax)) / (p.latMax - p.latMin) * (bottom - top);
  return [x, y];
}

function rc3DrawAllawiMarker(ctx, width, height) {
  const lat = Number(el.latInput?.value);
  const lon = Number(el.lonInput?.value);
  if (!rc3Finite(lat) || !rc3Finite(lon) || lat < -80 || lat > 80) return;
  const [x, y] = rc3AllawiProject(lon, lat, width, height);
  const label = el.siteTitle?.textContent || `${lat.toFixed(2)}, ${lon.toFixed(2)}`;

  ctx.save();
  ctx.shadowColor = '#d71920';
  ctx.shadowBlur = 16;
  ctx.fillStyle = 'rgba(215,25,32,.36)';
  ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#d71920'; ctx.lineWidth = 2.2;
  ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(x, y, 3.2, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#d71920'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(x - 15, y); ctx.lineTo(x + 15, y); ctx.moveTo(x, y - 15); ctx.lineTo(x, y + 15); ctx.stroke();

  const rightSide = x < width * .68;
  const lx = rightSide ? x + 34 : x - 34;
  const ly = Math.max(28, y - 24);
  ctx.beginPath(); ctx.moveTo(x + (rightSide ? 10 : -10), y - 7); ctx.lineTo(lx, ly + 6); ctx.stroke();
  ctx.font = 'bold 14px Segoe UI, Arial';
  const tw = Math.min(300, ctx.measureText(label).width + 18);
  ctx.fillStyle = 'rgba(32,39,43,.92)';
  const bx = rightSide ? lx : lx - tw;
  ctx.fillRect(bx, ly - 12, tw, 25);
  ctx.fillStyle = '#fff'; ctx.textAlign = rightSide ? 'left' : 'right';
  ctx.fillText(label, rightSide ? bx + 9 : bx + tw - 9, ly + 5);
  ctx.restore();
}

function rc3DrawAllawiFallbackBasemap(ctx, width, height) {
  const p = RC3_ALLAWI_PLOT;
  const [left, top] = rc3AllawiProject(-180, 80, width, height);
  const [right, bottom] = rc3AllawiProject(180, -80, width, height);
  ctx.save();
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#d9edf8'; ctx.fillRect(left, top, right-left, bottom-top);
  ctx.strokeStyle = '#243846'; ctx.lineWidth = 1.25; ctx.strokeRect(left, top, right-left, bottom-top);
  ctx.strokeStyle = 'rgba(77,104,120,.27)'; ctx.lineWidth = .8;
  for (let lon=-180; lon<=180; lon+=30) {
    const [x] = rc3AllawiProject(lon, 0, width, height);
    ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke();
  }
  for (let lat=-80; lat<=80; lat+=20) {
    const [,y] = rc3AllawiProject(0, lat, width, height);
    ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke();
  }
  if (state.world) {
    const project = (lon,lat,w,h) => rc3AllawiProject(lon,lat,w,h);
    drawWorldGeometry(ctx,width,height,'#f4e9cb','#46545b',project);
  }
  ctx.fillStyle='#1f2b33'; ctx.font='bold 12px Segoe UI, Arial'; ctx.textAlign='center';
  for (let lon=-180; lon<=180; lon+=30) {
    const [x] = rc3AllawiProject(lon,0,width,height);
    const label=lon===0?'0°':`${Math.abs(lon)}°${lon<0?'W':'E'}`;
    ctx.fillText(label,x,top-10); ctx.fillText(label,x,bottom+20);
  }
  ctx.textAlign='right';
  for (let lat=-80; lat<=80; lat+=20) {
    const [,y] = rc3AllawiProject(0,lat,width,height);
    const label=lat===0?'0°':`${Math.abs(lat)}°${lat<0?'S':'N'}`;
    ctx.fillText(label,left-12,y+4);
    ctx.textAlign='left'; ctx.fillText(label,right+12,y+4); ctx.textAlign='right';
  }
  ctx.restore();
}

function rc3DrawAllawiMap() {
  if (!el.mapCanvas) return;
  const canvas = el.mapCanvas;
  const ctx = canvas.getContext('2d');
  const { width, height } = rc3AllawiCanvasSize(canvas);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, height);

  if (rc3AllawiBasemap.complete && rc3AllawiBasemap.naturalWidth) {
    ctx.drawImage(rc3AllawiBasemap, 0, 0, width, height);
  } else {
    rc3DrawAllawiFallbackBasemap(ctx, width, height);
  }

  ctx.save();
  for (const cell of state.mapResults) {
    if (!cell.color || cell.lat < -60 || cell.lat > 60) continue;
    const [x1, y1] = rc3AllawiProject(cell.lon - cell.step / 2, cell.lat + cell.step / 2, width, height);
    const [x2, y2] = rc3AllawiProject(cell.lon + cell.step / 2, cell.lat - cell.step / 2, width, height);
    const cellWidth = Math.abs(x2 - x1);
    const gap = clamp(cellWidth * .11, .7, 1.5);
    ctx.globalAlpha = .82;
    ctx.fillStyle = cell.color;
    ctx.fillRect(Math.min(x1, x2) + gap / 2, Math.min(y1, y2) + gap / 2,
      Math.max(0, cellWidth - gap), Math.max(0, Math.abs(y2 - y1) - gap));
  }
  ctx.restore();

  rc3DrawAllawiMarker(ctx, width, height);
  ctx.save();
  ctx.font = 'bold 14px Segoe UI, Arial';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(26,34,39,.92)';
  ctx.fillText(`Allawi — ${el.dateInput?.value || ''} — ${ALBAZ_RC3}`, width / 2, height - 7);
  ctx.restore();
  renderLegend();
}

drawMap = function() {
  if (state.criterion !== 'allawi') {
    if (el.mapCanvas && (el.mapCanvas.width !== 1440 || el.mapCanvas.height !== 720)) {
      el.mapCanvas.width = 1440;
      el.mapCanvas.height = 720;
    }
    return rc3BaseDrawMap();
  }
  rc3DrawAllawiMap();
};

document.addEventListener('DOMContentLoaded', () => {
  document.title = 'ALBAZ MoonCalc Web RC3';
  if (state?.mapCache) state.mapCache.clear();
  document.querySelectorAll('.criterion[data-criterion="allawi"], [data-summary-criterion="allawi"]').forEach(node => {
    node.addEventListener('click', () => {
      if (el.qualitySelect) el.qualitySelect.value = '2';
      state.mapStep = 2;
    });
  });
  const note = document.querySelector('#aboutDialog .audit-note');
  if (note) note.textContent = 'RC3: تمت إعادة بناء معيار علاوي وفق المصدر المقفول: هندسة مركزية طبوغرافية بلا انكسار، وقت 4/9 من المكث، اقتران مركزي محلي، وشبكة مرجعية 2°.';
});
