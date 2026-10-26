/* Code.gs - serves ONE shell page (Index.html): a fixed left menu + in-app tabs.
   Dashboard / Proposal / Financial report / Programme Cash Flow open as tabs inside the app, never as new browser tabs.
   Old links still work:  ?draft=<id> (proposal)  |  ?page=Financial&draft=<id>  |  ?page=Dashboard  |  ?page=ProgrameCashFLow[&draft=<id>] */
var PAGES_ = { Proposal: 'Working Paper & Budget Proposal', Financial: 'Financial Report', Dashboard: 'Dashboard', ProgrameCashFLow: 'Programme Cash Flow' };

function doGet(e) {
  var p = (e && e.parameter) || {};
  var t = HtmlService.createTemplateFromFile('Index');
  /* both values are whitelisted / sanitised, so the JSON is safe to print unescaped */
  t.boot = JSON.stringify({
    page: PAGES_[p.page] ? p.page : '',
    draft: String(p.draft || '').replace(/[^\w-]/g, '')
  });
  return t.evaluate()
    .setTitle('Programme app')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/* The shell loads each page's HTML through this and runs it inside a tab. */
function getPageHtml(name) {
  if (!PAGES_[name]) throw new Error('Unknown page.');
  var html = HtmlService.createHtmlOutputFromFile(name).getContent();
  /* Proposal and Financial get phone-fit + pinch/button zoom (Zoom.html) */
  if (name === 'Proposal' || name === 'Financial') {
    var z = HtmlService.createHtmlOutputFromFile('Zoom').getContent(), i = html.lastIndexOf('</body>');
    html = i < 0 ? html + z : html.slice(0, i) + z + html.slice(i);
  }
  return html;
}

/* Used by the pages' "copy link" buttons. */
function getPageUrl(name) {
  var base = ScriptApp.getService().getUrl();
  return name === 'Proposal' ? base : base + '?page=' + encodeURIComponent(name);
}