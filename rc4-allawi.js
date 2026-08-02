'use strict';

/*
 * ALBAZ MoonCalc Web RC4 — independent Allawi map engine.
 * Fixes the blank/non-drawing RC3 map by avoiding the full four-criterion
 * computeSite pipeline for every grid node and drawing the base immediately.
 */
const ALBAZ_RC4 = 'v0.10.8 Web RC4';
const rc4BaseComputeSite = computeSite;
const rc4BaseGenerateMap = generateMap;
const rc4BaseDrawMap = drawMap;
const rc4BaseRenderSiteResult = renderSiteResult;

const RC4_PLOT = Object.freeze({
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

function rc4Finite(value) {
  return Number.isFinite(Number(value));
}

function rc4AllawiClass(code, score = NaN) {
  return criterionResult('allawi', code, score);
}

function rc4FindMoonset(observer, sunset) {
  let moonset = null;
  try {
    const next = Astronomy.SearchRiseSet('Moon', observer, -1, new Date(sunset.getTime() + 60000), 2.0);
    if (next) moonset = astroDate(next);
  } catch (_) {}

  let lagMinutes = moonset ? (moonset - sunset) / 60000 : NaN;
  if (rc4Finite(lagMinutes) && lagMinutes > 720) {
    try {
      const previous = Astronomy.SearchRiseSet('Moon', observer, -1, sunset, -2.0);
      const previousDate = previous ? astroDate(previous) : null;
      if (previousDate) {
        moonset = previousDate;
        lagMinutes = (moonset - sunset) / 60000;
      }
    } catch (_) {}
  }
  return { moonset, lagMinutes };
}

function rc4AllawiNode(site, centralConjunction = null) {
  const observer = new Astronomy.Observer(site.latitude, site.longitude, site.elevation || 0);
  const [year, month, day] = String(site.date).split('-').map(Number);
  const utcNoon = Date.UTC(year, month - 1, day, 12, 0, 0) - site.offset * 3600000;
  const searchStart = new Date(utcNoon - 6 * 3600000);

  let sunset = null;
  try {
    const event = Astronomy.SearchRiseSet('Sun', observer, -1, searchStart, 1.5);
    if (event) sunset = astroDate(event);
  } catch (_) {}
  if (!sunset || !Number.isFinite(sunset.getTime())) {
    return { ok: false, code: '?', score: NaN, color: null, reason: 'sunset unavailable' };
  }

  const { moonset, lagMinutes } = rc4FindMoonset(observer, sunset);
  if (!rc4Finite(lagMinutes)) {
    return { ok: false, code: '?', score: NaN, color: null, sunset, moonset, lagMinutes, reason: 'moonset unavailable' };
  }
  if (lagMinutes <= 0) {
    const c = rc4AllawiClass('X');
    return { ok: true, ...c, sunset, moonset, lagMinutes, reason: 'non-positive lunar lag' };
  }
  if (lagMinutes > 720) {
    return { ok: false, code: '?', score: NaN, color: null, sunset, moonset, lagMinutes, reason: 'invalid lunar lag' };
  }

  const central = centralConjunction instanceof Date
    ? centralConjunction
    : nearestConjunction(sunset);
  if (!(central instanceof Date) || !Number.isFinite(central.getTime())) {
    return { ok: false, code: '?', score: NaN, color: null, sunset, moonset, lagMinutes, reason: 'conjunction unavailable' };
  }
  if (central > sunset) {
    const c = rc4AllawiClass('X');
    return { ok: true, ...c, sunset, moonset, lagMinutes, central, reason: 'central conjunction after sunset' };
  }

  const observationTime = new Date(sunset.getTime() + (4 / 9) * lagMinutes * 60000);
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
    if (!rc4Finite(arcl)) arcl = angularSeparationHorizontal(sun, moon);

    const moonDistanceKm = Number(moonEq.dist) * AU_KM;
    const semidiameterArcmin = Math.asin(clamp(MOON_RADIUS_KM / moonDistanceKm, -1, 1)) / DEG * 60;
    const widthArcmin = semidiameterArcmin * (1 - Math.cos(arcl * DEG));
    const qA = widthArcmin + arcv / 6 - 1.25;

    if (![arcv, arcl, semidiameterArcmin, widthArcmin, qA].every(rc4Finite) || widthArcmin < 0) {
      return { ok: false, code: '?', score: NaN, color: null, sunset, moonset, lagMinutes, central, observationTime, reason: 'geometry unavailable' };
    }

    const code = arcl < 4.5 ? 'D' : qA >= 1 ? 'A' : qA >= 0 ? 'B' : qA >= -0.25 ? 'C' : 'D';
    const classified = rc4AllawiClass(code, qA);
    return {
      ok: true,
      ...classified,
      sunset,
      moonset,
      lagMinutes,
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
      ageAtSunsetHours: (sunset - central) / 3600000
    };
  } catch (error) {
    return { ok: false, code: '?', score: NaN, color: null, sunset, moonset, lagMinutes, central, observationTime, reason: error?.message || String(error) };
  }
}

computeSite = function(site) {
  const result = rc4BaseComputeSite(site);
  if (!result?.ok) return result;
  if (state.mapRunning && state.criterion !== 'allawi') return result;

  const central = site.conjunction instanceof Date
    ? site.conjunction
    : result.conjunction instanceof Date
      ? result.conjunction
      : nearestConjunction(result.sunset);
  const a = rc4AllawiNode(site, central);
  result.criteria.allawi = rc4AllawiClass(a.code, a.score);
  result.allawiObservationTime = a.observationTime || result.bestTime;
  result.allawiConjunction = a.central || central || null;
  result.allawiArcv = a.arcv;
  result.allawiArcl = a.arcl;
  result.allawiWidth = a.widthArcmin;
  result.allawiSemidiameter = a.semidiameterArcmin;
  result.allawiMoonAltitude = a.moonAltitude;
  result.allawiMoonAzimuth = a.moonAzimuth;
  result.allawiSunAltitude = a.sunAltitude;
  result.allawiSunAzimuth = a.sunAzimuth;
  result.allawiAgeAtSunsetHours = a.ageAtSunsetHours;
  result.allawiReason = a.reason || '';
  result.calculationModel = 'Astronomy Engine JS; independent source-locked Allawi engine RC4';
  return result;
};

renderSiteResult = function() {
  rc4BaseRenderSiteResult();
  if (state.criterion !== 'allawi' || !state.siteResult?.ok || !el.metricGrid) return;
  const values = el.metricGrid.querySelectorAll('.metric b');
  if (values.length < 11) return;
  const r = state.siteResult;
  if (r.allawiObservationTime instanceof Date) values[2].textContent = formatLocalTime(r.allawiObservationTime, r.site.offset);
  if (rc4Finite(r.allawiArcv)) values[6].textContent = `${formatNumber(r.allawiArcv, 3)}°`;
  if (rc4Finite(r.allawiArcl)) values[7].textContent = `${formatNumber(r.allawiArcl, 3)}°`;
  if (rc4Finite(r.allawiWidth)) values[8].textContent = `${formatNumber(r.allawiWidth, 3)}′`;
  if (rc4Finite(r.allawiMoonAltitude)) values[9].textContent = `${formatNumber(r.allawiMoonAltitude, 3)}°`;
  if (rc4Finite(r.allawiMoonAzimuth)) values[10].textContent = `${formatNumber(r.allawiMoonAzimuth, 3)}°`;
};

async function rc4GenerateAllawiMap() {
  if (!window.Astronomy || typeof Astronomy.SearchRiseSet !== 'function') {
    return showError(tr('astronomyMissing'));
  }
  if (state.mapRunning) return;

  let baseSite;
  try {
    baseSite = inputSite();
  } catch (error) {
    return showError(error.message);
  }

  const step = Number(el.qualitySelect.value);
  if (![2, 5, 10].includes(step)) return showError('Invalid Allawi map grid step.');
  const cacheKey = `RC4|${baseSite.date}|allawi|${step}`;
  const cached = state.mapCache.get(cacheKey);
  if (cached?.length) {
    state.mapResults = cached.slice();
    state.mapStep = step;
    drawMap();
    drawGlobe();
    setProgress(100, tr('mapComplete'));
    setTimeout(hideProgress, 900);
    return;
  }

  state.mapRunning = true;
  state.cancelMap = false;
  state.mapStep = step;
  state.mapResults = [];
  el.progressBox.classList.remove('hidden');
  setButtonBusy(el.mapBtn, true, tr('mapCalculating'));

  drawMap();
  await nextFrame();

  const [year, month, day] = baseSite.date.split('-').map(Number);
  const reference = new Date(Date.UTC(year, month - 1, day, 12));
  const central = nearestConjunction(reference);
  const jobs = [];
  for (let lat = -60 + step / 2; lat < 60; lat += step) {
    for (let lon = -180 + step / 2; lon < 180; lon += step) jobs.push({ lat, lon });
  }

  try {
    for (let index = 0; index < jobs.length; index++) {
      if (state.cancelMap) break;
      const node = jobs[index];
      const site = {
        date: baseSite.date,
        latitude: node.lat,
        longitude: node.lon,
        elevation: 0,
        offset: node.lon / 15,
        name: `${node.lat.toFixed(1)}, ${node.lon.toFixed(1)}`
      };
      const a = rc4AllawiNode(site, central);
      const code = a.code || '?';
      state.mapResults.push({
        lat: node.lat,
        lon: node.lon,
        step,
        code,
        color: a.color ?? CRITERIA.allawi.colors[code] ?? null,
        score: finiteOrNull(a.score)
      });

      const done = index + 1;
      if (done === 1 || done % 24 === 0 || done === jobs.length) {
        setProgress((done / jobs.length) * 100, `${tr('mapCalculating')} — ${done}/${jobs.length}`);
      }
      if (done === 1 || done % Math.max(24, Math.round(jobs.length / 100)) === 0 || done === jobs.length) {
        drawMap();
      }
      if (done % 8 === 0) await nextFrame();
    }

    if (!state.cancelMap) {
      state.mapCache.set(cacheKey, state.mapResults.slice());
      const colored = state.mapResults.filter(cell => cell.color).length;
      setProgress(100, colored ? tr('mapComplete') : 'Allawi: no classified cells — check calculation diagnostics');
      drawMap();
      drawGlobe();
      if (!colored) showError('تعذر تصنيف عقد خريطة علاوي. لم تُرجع الحسابات أي خلية ملونة.');
      setTimeout(hideProgress, colored ? 1400 : 4000);
    } else {
      setProgress((state.mapResults.length / jobs.length) * 100, tr('cancelled'));
      drawMap();
      drawGlobe();
      setTimeout(hideProgress, 1200);
    }
  } catch (error) {
    console.error('Allawi RC4 map:', error);
    drawMap();
    showError(error?.message || tr('noSolution'));
    setProgress((state.mapResults.length / Math.max(1, jobs.length)) * 100, 'Allawi map error');
  } finally {
    state.mapRunning = false;
    setButtonBusy(el.mapBtn, false);
  }
}

generateMap = function() {
  return state.criterion === 'allawi' ? rc4GenerateAllawiMap() : rc4BaseGenerateMap();
};

function rc4Project(lon, lat, width, height) {
  const p = RC4_PLOT;
  const sx = width / p.imageWidth;
  const sy = height / p.imageHeight;
  const left = p.left * sx;
  const right = p.right * sx;
  const top = p.top * sy;
  const bottom = p.bottom * sy;
  return [
    left + (normalizeLon(lon) - p.lonMin) / (p.lonMax - p.lonMin) * (right - left),
    top + (p.latMax - clamp(lat, p.latMin, p.latMax)) / (p.latMax - p.latMin) * (bottom - top)
  ];
}

function rc4DrawBase(ctx, width, height) {
  const [left, top] = rc4Project(-180, 80, width, height);
  const [right, bottom] = rc4Project(180, -80, width, height);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#b9dbea';
  ctx.fillRect(left, top, right - left, bottom - top);

  ctx.strokeStyle = 'rgba(50,70,80,.28)';
  ctx.lineWidth = 0.8;
  for (let lon = -180; lon <= 180; lon += 30) {
    const [x] = rc4Project(lon, 0, width, height);
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.stroke();
  }
  for (let lat = -80; lat <= 80; lat += 20) {
    const [, y] = rc4Project(0, lat, width, height);
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
    ctx.stroke();
  }

  if (state.world) {
    const project = (lon, lat, w, h) => rc4Project(lon, lat, w, h);
    drawWorldGeometry(ctx, width, height, '#f1e5c5', 'rgba(60,67,70,.66)', project);
  }
  ctx.strokeStyle = '#243846';
  ctx.lineWidth = 1.25;
  ctx.strokeRect(left, top, right - left, bottom - top);
}

function rc4DrawCells(ctx, width, height) {
  ctx.save();
  ctx.globalAlpha = 0.82;
  for (const cell of state.mapResults) {
    if (!cell.color || cell.lat < -60 || cell.lat > 60) continue;
    const [x1, y1] = rc4Project(cell.lon - cell.step / 2, cell.lat + cell.step / 2, width, height);
    const [x2, y2] = rc4Project(cell.lon + cell.step / 2, cell.lat - cell.step / 2, width, height);
    const cw = Math.abs(x2 - x1);
    const ch = Math.abs(y2 - y1);
    const gap = clamp(cw * 0.11, 0.7, 1.5);
    ctx.fillStyle = cell.color;
    ctx.fillRect(Math.min(x1, x2) + gap / 2, Math.min(y1, y2) + gap / 2, Math.max(0, cw - gap), Math.max(0, ch - gap));
  }
  ctx.restore();
}

function rc4DrawMarker(ctx, width, height) {
  const lat = Number(el.latInput?.value);
  const lon = Number(el.lonInput?.value);
  if (!rc4Finite(lat) || !rc4Finite(lon) || lat < -80 || lat > 80) return;
  const [x, y] = rc4Project(lon, lat, width, height);
  ctx.save();
  ctx.shadowColor = '#d71920';
  ctx.shadowBlur = 14;
  ctx.fillStyle = '#d71920';
  ctx.beginPath();
  ctx.arc(x, y, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, 9, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function rc4DrawAllawiMap() {
  if (!el.mapCanvas) return;
  const canvas = el.mapCanvas;
  const width = 1440;
  const height = Math.round(width * RC4_PLOT.imageHeight / RC4_PLOT.imageWidth);
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, width, height);
  rc4DrawBase(ctx, width, height);
  rc4DrawCells(ctx, width, height);
  if (state.world) {
    const project = (lon, lat, w, h) => rc4Project(lon, lat, w, h);
    drawWorldGeometry(ctx, width, height, 'transparent', 'rgba(45,49,52,.82)', project, true);
  }
  rc4DrawMarker(ctx, width, height);
  ctx.fillStyle = '#27333a';
  ctx.textAlign = 'center';
  ctx.font = 'bold 14px Segoe UI, Arial';
  const progress = state.mapRunning ? ` — ${state.mapResults.length}` : '';
  ctx.fillText(`Allawi — ${el.dateInput?.value || ''} — ${ALBAZ_RC4}${progress}`, width / 2, height - 7);
  renderLegend();
}

drawMap = function() {
  if (state.criterion === 'allawi') return rc4DrawAllawiMap();
  if (el.mapCanvas && (el.mapCanvas.width !== 1440 || el.mapCanvas.height !== 720)) {
    el.mapCanvas.width = 1440;
    el.mapCanvas.height = 720;
  }
  return rc4BaseDrawMap();
};

document.addEventListener('DOMContentLoaded', () => {
  document.title = 'ALBAZ MoonCalc Web RC4';
  if (state?.mapCache) state.mapCache.clear();
  const note = document.querySelector('#aboutDialog .audit-note');
  if (note) {
    note.textContent = 'RC4: محرك مستقل لخريطة علاوي؛ يرسم إطار الخريطة فورًا، يحسب الخلايا تدريجيًا، ويحافظ على اختيار دقة 10° أو 5° أو 2°.';
  }
});
