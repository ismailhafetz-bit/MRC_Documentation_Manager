/* Drafts.gs - every draft is one small file in YOUR Google Drive, folder "Programme App Drafts".
   Share = Drive sharing, so people you add open it with their own Google account. */
var KINDS_ = { proposal: 'Proposal', finreport: 'Financial report', cashflow: 'Cash flow' };
var QS_ = { proposal: '?', finreport: '?page=Financial&', cashflow: '?page=ProgrameCashFLow&' };
var EXT_ = '.pgdraft';

/* used by the Cash Flow page to stamp who made each entry */
function whoAmI() { return me_(); }
function me_() { return String(Session.getActiveUser().getEmail() || '').toLowerCase(); }
function base_() { return ScriptApp.getService().getUrl(); }

function folder_() {
  var p = PropertiesService.getUserProperties(), id = p.getProperty('drafts_folder'), f;
  if (id) { try { f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) {} }
  var it = DriveApp.getFoldersByName('Programme App Drafts');
  f = it.hasNext() ? it.next() : DriveApp.createFolder('Programme App Drafts');
  p.setProperty('drafts_folder', f.getId());
  return f;
}
function meta_(f) {
  try { var m = JSON.parse(f.getDescription() || ''); return m && KINDS_[m.kind] ? m : null; } catch (e) { return null; }
}
function ownerEmail_(f) { try { var o = f.getOwner(); return o ? String(o.getEmail() || '') : ''; } catch (e) { return ''; } }
function isOwner_(f) { var o = ownerEmail_(f).toLowerCase(); return !!o && o === me_(); }
function canEdit_(f) {
  if (isOwner_(f)) return true;
  try {
    var a = f.getAccess(me_()), P = DriveApp.Permission;
    return a === P.EDIT || a === P.OWNER || a === P.ORGANIZER || a === P.FILE_ORGANIZER;
  } catch (e) { return false; }
}
function get_(id) {
  var f;
  try { f = DriveApp.getFileById(String(id)); } catch (e) { throw new Error('Draft not found, or you do not have access.'); }
  var m = meta_(f);
  if (!m) throw new Error('Draft not found.');
  return { f: f, m: m };
}
function pub_(f, m) {
  var oe = ownerEmail_(f), id = f.getId();
  return {
    id: id, name: m.name, updated: f.getLastUpdated().getTime(),
    shared: !!oe && oe.toLowerCase() !== me_(), owner: oe,
    status: m.status || 'draft', kind: m.kind, kindLabel: KINDS_[m.kind],
    url: base_() + (QS_[m.kind] || '?') + 'draft=' + id
  };
}
function all_() {
  var out = {}, fl = folder_().getFiles(), f, m;
  while (fl.hasNext()) { f = fl.next(); m = meta_(f); if (m) out[f.getId()] = pub_(f, m); }
  try {
    var sh = DriveApp.searchFiles("sharedWithMe and trashed = false and title contains '" + EXT_ + "'");
    while (sh.hasNext()) { f = sh.next(); if (out[f.getId()]) continue; m = meta_(f); if (m) out[f.getId()] = pub_(f, m); }
  } catch (e) {}
  return Object.keys(out).map(function (k) { return out[k]; }).sort(function (a, b) { return b.updated - a.updated; });
}

function listDrafts(kind) { kind = kind || 'proposal'; return all_().filter(function (d) { return d.kind === kind; }); }
function listDashboard() { return all_(); }

/* base (optional, used by the Cash Flow page): the "updated" time the caller last saw.
   If someone else saved after that, nothing is written and { conflict: true, json, updated } is returned
   so the page can combine both sets of changes and save again. */
function saveDraft(id, name, json, kind, status, base) {
  kind = kind || 'proposal';
  if (!KINDS_[kind]) throw new Error('Unknown document type.');
  name = String(name || 'Untitled').trim().substring(0, 120) || 'Untitled';
  json = String(json || '');
  var f, m, lock = null;
  if (id && base) { lock = LockService.getScriptLock(); try { lock.waitLock(10000); } catch (e) { lock = null; } }
  try {
    if (id) {
      var g = get_(id); f = g.f; m = g.m;
      if (m.kind !== kind) throw new Error('This is a ' + KINDS_[m.kind].toLowerCase() + ' draft. Open it from the ' + KINDS_[m.kind] + ' page.');
      if (!canEdit_(f)) throw new Error('VIEW_ONLY');
      if (base && f.getLastUpdated().getTime() > Number(base) + 500) {
        return { conflict: true, id: f.getId(), name: m.name, updated: f.getLastUpdated().getTime(),
                 json: f.getBlob().getDataAsString(), status: m.status || 'draft' };
      }
      f.setContent(json);
    } else {
      f = folder_().createFile('draft' + EXT_, json, MimeType.PLAIN_TEXT);
      m = { kind: kind, status: 'draft' };
    }
    m.name = name; if (status) m.status = status;
    f.setName(name + ' (' + KINDS_[kind] + ')' + EXT_);
    f.setDescription(JSON.stringify(m));
    return { id: f.getId(), name: name, updated: f.getLastUpdated().getTime(), status: m.status };
  } finally { if (lock) { try { lock.releaseLock(); } catch (e) {} } }
}

function openDraft(id, kind) {
  var g = get_(id); kind = kind || 'proposal';
  if (g.m.kind !== kind) throw new Error('This is a ' + KINDS_[g.m.kind].toLowerCase() + ' draft. Open it from the ' + KINDS_[g.m.kind] + ' page.');
  return { id: g.f.getId(), name: g.m.name, updated: g.f.getLastUpdated().getTime(), json: g.f.getBlob().getDataAsString(),
           canEdit: canEdit_(g.f), owner: ownerEmail_(g.f), status: g.m.status || 'draft' };
}

function setDraftStatus(id, status) {
  var g = get_(id);
  if (!canEdit_(g.f)) throw new Error('VIEW_ONLY');
  g.m.status = status === 'completed' ? 'completed' : 'draft';
  g.f.setDescription(JSON.stringify(g.m));
  return { id: id, status: g.m.status };
}

function deleteDraft(id) {
  var g = get_(id);
  if (!isOwner_(g.f)) throw new Error('Only the owner can delete this draft.');
  g.f.setTrashed(true);   /* goes to the Drive bin, so it can still be restored */
  return true;
}

/* ---- sharing (Drive permissions) ---- */
function getDraftAccess(id) {
  var g = get_(id), oe = ownerEmail_(g.f), seen = {}, people = [];
  g.f.getEditors().forEach(function (u) { var e = u.getEmail(); if (e && e !== oe) { seen[e] = 1; people.push({ email: e, role: 'edit' }); } });
  g.f.getViewers().forEach(function (u) { var e = u.getEmail(); if (e && e !== oe && !seen[e]) people.push({ email: e, role: 'view' }); });
  return { isOwner: isOwner_(g.f), owner: oe, people: people };
}
function shareDraft(id, emails, role, notify) {
  var g = get_(id);
  if (!isOwner_(g.f)) throw new Error('Only the owner can change sharing.');
  var list = String(emails || '').split(/[\s,;]+/).filter(Boolean);
  if (!list.length) throw new Error('Enter at least one email address.');
  list.forEach(function (e) { if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw new Error('Not a valid email: ' + e); });
  list.forEach(function (e) { if (role === 'edit') g.f.addEditor(e); else g.f.addViewer(e); });
  return getDraftAccess(id);
}
function unshareDraft(id, email) {
  var g = get_(id);
  if (!isOwner_(g.f)) throw new Error('Only the owner can change sharing.');
  try { g.f.removeEditor(email); } catch (e) {}
  try { g.f.removeViewer(email); } catch (e) {}
  return getDraftAccess(id);
}

/* ---- email a document (Financial report page) ---- */
function sendDocument(o) {
  o = o || {};
  var to = String(o.to || '').replace(/;/g, ',').trim();
  if (!/^[^@\s,]+@[^@\s,]+\.[^@\s,]+(\s*,\s*[^@\s,]+@[^@\s,]+\.[^@\s,]+)*$/.test(to)) throw new Error('Enter a valid email address.');
  var title = String(o.title || 'Document').substring(0, 150);
  var html = '<html><head><meta charset="UTF-8"></head><body>' + String(o.html || '') + '</body></html>';
  var opt = { to: to, subject: title, body: String(o.message || ''), name: 'Programme app' }, pdf = false;
  try { opt.attachments = [Utilities.newBlob(html, 'text/html', title + '.html').getAs('application/pdf').setName(title + '.pdf')]; pdf = true; } catch (e) {}
  MailApp.sendEmail(opt);
  return { pdf: pdf };
}