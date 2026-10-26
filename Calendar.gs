/* Calendar.gs - add to the Apps Script project next to Drafts.gs. Stores the calendar JSON in the user's properties (chunked). */
function getCalendar() {
  var p = PropertiesService.getUserProperties(), n = Number(p.getProperty('cal_n')) || 0, s = '';
  for (var i = 0; i < n; i++) s += p.getProperty('cal_' + i) || '';
  return s;
}
function saveCalendar(json) {
  var p = PropertiesService.getUserProperties(), old = Number(p.getProperty('cal_n')) || 0, parts = [];
  for (var i = 0; i < json.length; i += 8000) parts.push(json.substr(i, 8000));
  parts.forEach(function (t, k) { p.setProperty('cal_' + k, t); });
  for (var j = parts.length; j < old; j++) p.deleteProperty('cal_' + j);
  p.setProperty('cal_n', String(parts.length));
  return true;
}

/* Hand a new proposal its name/date from a calendar event (used when the app is deployed). */
function setPrefill(json) { PropertiesService.getUserProperties().setProperty('cal_prefill', json); return true; }
function takePrefill() {
  var p = PropertiesService.getUserProperties(), s = p.getProperty('cal_prefill') || '';
  if (s) p.deleteProperty('cal_prefill');
  return s;
}