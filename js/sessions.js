'use strict';

function tzParts(tz, date = new Date()){
  const parts = new Intl.DateTimeFormat('en-US', {timeZone: tz, hour12: false, weekday: 'short', hour: '2-digit', minute: '2-digit'}).formatToParts(date);
  const getPart = partType => parts.find(part => part.type === partType).value;
  return {weekday: getPart('weekday'), hour: +getPart('hour') % 24, minute: +getPart('minute')};
}
function tzOffsetMin(tz){
  const nowDate = new Date();
  const localDate = new Date(nowDate.toLocaleString('en-US', {timeZone: tz}));
  const utcDate = new Date(nowDate.toLocaleString('en-US', {timeZone: 'UTC'}));
  return (localDate - utcDate) / 60000;
}
function isMktOpen(marketId){
  const marketConfig = MKT[marketId];
  if(!marketConfig) return true;
  const {weekday, hour, minute} = tzParts(marketConfig.tz);
  if(weekday === 'Sat' || weekday === 'Sun') return false;
  const nowMinutes = hour * 60 + minute;
  return marketConfig.spans.some(([openHour, openMin, closeHour, closeMin]) =>
    nowMinutes >= openHour * 60 + openMin && nowMinutes < closeHour * 60 + closeMin);
}

function moveSessionCursor(){
  const parts = tzParts('Asia/Tokyo');
  const cursorEl = document.getElementById('nowCursor');
  if(cursorEl) cursorEl.style.left = ((parts.hour + parts.minute / 60) / 24 * 100) + '%';
}
function buildSessions(){
  const track = document.getElementById('sessTrack');
  if(!track) return;
  track.textContent = '';

  const hourGridEl = el('div', 'hourgrid');
  for(let hour = 0; hour <= 24; hour += 3){
    const xPercent = hour / 24 * 100;
    const tickMark = el('span');
    tickMark.style.left = xPercent + '%';
    hourGridEl.appendChild(tickMark);
    const hourLabel = el('label', null, String(hour).padStart(2, '0'));
    hourLabel.style.left = xPercent + '%';
    hourGridEl.appendChild(hourLabel);
  }
  track.appendChild(hourGridEl);

  const jstOffsetMinutes = tzOffsetMin('Asia/Tokyo');
  SESS.forEach(session => {
    const shiftHours = (jstOffsetMinutes - tzOffsetMin(session.tz)) / 60;
    const openHour = (session.o + shiftHours + 24) % 24;
    const closeHour = (session.c + shiftHours + 24) % 24;
    const row = el('div', 'sess-row');
    row.style.top = (session.row * 15) + 'px';
    const addBar = (fromHour, toHour) => {
      const bar = el('div', 'sess-bar' + (isMktOpen(session.mkt) ? ' live' : ''));
      bar.style.left = (fromHour / 24 * 100) + '%';
      bar.style.width = ((toHour - fromHour) / 24 * 100) + '%';
      bar.appendChild(el('b', null, session.label));
      row.appendChild(bar);
    };
    if(openHour < closeHour) addBar(openHour, closeHour);
    else { addBar(openHour, 24); addBar(0, closeHour); }
    track.appendChild(row);
  });

  const cursorEl = el('div', 'now-cursor');
  cursorEl.id = 'nowCursor';
  track.appendChild(cursorEl);
  moveSessionCursor();
}

setInterval(moveSessionCursor, 30 * 1000);
setInterval(buildSessions, 5 * 60 * 1000);
