'use strict';

/* RC2: correct the criterion impossibility gates used by the RC1 web build. */
const ALBAZ_RC2 = 'v0.10.8 Web RC2';
const rc1ComputeSite = computeSite;

function rc2Normalize360(value) { return ((value % 360) + 360) % 360; }
function rc2SignedDifference(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return NaN;
  let d = rc2Normalize360(a - b);
  if (d > 180) d -= 360;
  return d;
}
function rc2JulianDate(date) { return date.getTime() / 86400000 + 2440587.5; }
function rc2MeanObliquity(date) {
  const t = (rc2JulianDate(date) - 2451545) / 36525;
  return 23 + 26/60 + (21.448 - 46.815*t - 0.00059*t*t + 0.001813*t*t*t)/3600;
}
function rc2TopocentricLongitude(body, date, observer) {
  try {
    const eq = Astronomy.Equator(body, date, observer, true, true);
    const time = typeof Astronomy.MakeTime === 'function' ? Astronomy.MakeTime(date) : date;
    const tilt = typeof Astronomy.e_tilt === 'function' ? Astronomy.e_tilt(time) : null;
    const eps = Number(tilt?.tobl ?? tilt?.mobl ?? rc2MeanObliquity(date)) * DEG;
    const ra = Number(eq.ra) * 15 * DEG;
    const dec = Number(eq.dec) * DEG;
    const x = Math.cos(dec) * Math.cos(ra);
    const y = Math.cos(dec) * Math.sin(ra);
    const z = Math.sin(dec);
    return rc2Normalize360(Math.atan2(y*Math.cos(eps) + z*Math.sin(eps), x) / DEG);
  } catch (_) { return NaN; }
}
function rc2PreviousNewMoon(reference) {
  if (typeof Astronomy.SearchMoonPhase !== 'function') return null;
  try {
    const event = Astronomy.SearchMoonPhase(0, new Date(reference.getTime() - 35*86400000), 35);
    const date = event ? astroDate(event) : null;
    return date && date <= reference ? date : null;
  } catch (_) { return null; }
}
function rc2SaaoUpper(daz) {
  const x = Math.abs(Number(daz));
  if (!Number.isFinite(x) || x > 21) return NaN;
  const index = x / 0.5;
  const lo = Math.floor(index), hi = Math.min(SAAO_DALT2.length - 1, Math.ceil(index));
  if (lo === hi) return SAAO_DALT2[lo];
  const f = index - lo;
  return SAAO_DALT2[lo]*(1-f) + SAAO_DALT2[hi]*f;
}
function rc2Classify(result, generalImpossible, allawiImpossible) {
  let yallop, odeh, saao, allawi;
  if (generalImpossible) yallop = criterionResult('yallop','X',NaN);
  else if (![result.geocentricArcv,result.widthGeo].every(Number.isFinite)) yallop = criterionResult('yallop','?',NaN);
  else {
    const w=result.widthGeo;
    const q=(result.geocentricArcv-(11.8371-6.3226*w+0.7319*w*w-0.1018*w*w*w))/10;
    const code=q>=0.216?'A':q>-0.014?'B':q>=-0.160?'C':q>-0.232?'D':q>-0.293?'E':'F';
    yallop=criterionResult('yallop',code,q);
  }
  if (generalImpossible) odeh=criterionResult('odeh','X',NaN);
  else if (![result.topocentricArcv,result.widthTopo].every(Number.isFinite)) odeh=criterionResult('odeh','?',NaN);
  else {
    const w=result.widthTopo;
    const v=result.topocentricArcv-(-0.1018*w*w*w+0.7319*w*w-6.3226*w+7.1651);
    odeh=criterionResult('odeh',v>=5.65?'A':v>=2?'B':v>=-0.96?'C':'D',v);
  }
  if (generalImpossible) saao=criterionResult('saao','X',NaN);
  else {
    const upper=rc2SaaoUpper(result.daz);
    if (![result.moonLowerLimb,upper].every(Number.isFinite)) saao=criterionResult('saao','?',NaN);
    else {
      const margin=result.moonLowerLimb-upper;
      saao=criterionResult('saao',margin>=0?'P':margin>=-1.9?'I':'N',margin);
    }
  }
  if (allawiImpossible) allawi=criterionResult('allawi','X',NaN);
  else if (![result.topocentricArcv,result.topocentricArcl,result.widthTopo].every(Number.isFinite)) allawi=criterionResult('allawi','?',NaN);
  else {
    const q=result.widthTopo+result.topocentricArcv/6-1.25;
    const code=result.topocentricArcl<4.5?'D':q>=1?'A':q>=0?'B':q>=-0.25?'C':'D';
    allawi=criterionResult('allawi',code,q);
  }
  return {yallop,odeh,saao,allawi};
}

computeSite = function(site) {
  const result = rc1ComputeSite(site);
  if (!result?.ok) return result;
  const observer = new Astronomy.Observer(site.latitude, site.longitude, site.elevation || 0);
  const sunLon = rc2TopocentricLongitude('Sun', result.sunset, observer);
  const moonLon = rc2TopocentricLongitude('Moon', result.sunset, observer);
  let longitudeDifference = rc2SignedDifference(moonLon, sunLon);
  if (!Number.isFinite(longitudeDifference) && typeof Astronomy.MoonPhase === 'function') {
    const phase=Number(Astronomy.MoonPhase(result.sunset));
    longitudeDifference=Number.isFinite(phase)?(phase>180?phase-360:phase):NaN;
  }
  const lagValid=Number.isFinite(result.lagMinutes)&&result.lagMinutes>0&&result.lagMinutes<=720;
  const generalImpossible=!lagValid||(Number.isFinite(longitudeDifference)&&longitudeDifference<=0);
  const central=result.conjunction instanceof Date?result.conjunction:null;
  const allawiAgeAtSunset=central?(result.sunset-central)/3600000:NaN;
  const allawiImpossible=!lagValid||(central&&central>result.sunset)||(Number.isFinite(allawiAgeAtSunset)&&allawiAgeAtSunset<=0);
  const previous=rc2PreviousNewMoon(result.bestTime);
  if (previous) result.ageHours=(result.bestTime-previous)/3600000;
  result.topocentricLongitudeDifferenceDeg=longitudeDifference;
  result.conjunctionBeforeSunset=Number.isFinite(longitudeDifference)?longitudeDifference>0:null;
  result.criteria=rc2Classify(result,generalImpossible,allawiImpossible);
  result.calculationModel='Astronomy Engine JS; corrected topocentric conjunction gate (RC2)';
  return result;
};

const rc1DrawMapLabels = drawMapLabels;
drawMapLabels = function(ctx,w,h,allawi) {
  rc1DrawMapLabels(ctx,w,h,allawi);
  ctx.save(); ctx.fillStyle=allawi?'#27333a':'rgba(235,243,255,.88)';
  ctx.textAlign='center'; ctx.font='13px Segoe UI, Arial';
  ctx.fillText(ALBAZ_RC2,w/2,h-14); ctx.restore();
};

document.addEventListener('DOMContentLoaded',()=>{
  document.title='ALBAZ MoonCalc Web RC2';
  document.querySelectorAll('small,#aboutDialog span').forEach(node=>{
    if(node.textContent.includes('Web RC1')) node.textContent=node.textContent.replace('Web RC1','Web RC2');
  });
  const note=document.querySelector('#aboutDialog .audit-note');
  if(note) note.textContent='RC2: تم تصحيح شرط الاقتران الطبوغرافي وفصل استحالة علاوي عن بقية المعايير.';
});
