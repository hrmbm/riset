import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const sw = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const manifest = JSON.parse(fs.readFileSync(new URL('../manifest.webmanifest', import.meta.url), 'utf8'));

function extractScripts(sourceHtml) {
  const scripts = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(sourceHtml)) !== null) {
    const attrs = m[1] || '';
    const body = m[2] || '';
    if (!/\bsrc\s*=/.test(attrs) && body.trim()) {
      scripts.push({ attrs, body });
    }
  }
  return scripts;
}

function loadPureHelpersFromHtml() {
  const fnMatch = html.match(
    /function rhShouldShowRemainingLeave[\s\S]*?function rhApplyWorkRuleRowMutation[\s\S]*?\n\}/
  );
  assert.ok(fnMatch, 'Pure helper functions should exist in index.html');
  const ctx = {
    RH_STANDARD_AREAS: [
      { value: 'Area 1', code: 'A1', defaultLabel: 'Area 1', standbyOk: true, sickOk: true },
      { value: 'Area 2', code: 'A2', defaultLabel: 'Area 2', standbyOk: true, sickOk: true },
      { value: 'Area 3', code: 'A3', defaultLabel: 'Area 3', standbyOk: true, sickOk: true },
      { value: 'Area 4', code: 'A4', defaultLabel: 'Area 4', standbyOk: true, sickOk: true },
      { value: 'Area lainnya', code: 'AX', defaultLabel: 'Area Lain', standbyOk: true, sickOk: true },
      { value: 'Area Sekitar', code: 'SBY', defaultLabel: 'Area Sekitar', standbyOk: false, sickOk: false }
    ]
  };
  vm.createContext(ctx);
  vm.runInContext(fnMatch[0], ctx);
  return ctx;
}

test('inline script blocks in index.html parse cleanly', () => {
  const scripts = extractScripts(html);
  assert.ok(scripts.length >= 2, 'Expected multiple inline script blocks');
  scripts.forEach((s, idx) => {
    const isModule = /type\s*=\s*["']module["']/i.test(s.attrs);
    if (isModule) {
      const stripped = s.body
        .replace(/^\s*import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
        .replace(/^\s*import\s+['"][^'"]+['"];?\s*$/gm, '');
      assert.doesNotThrow(() => new vm.Script(stripped, { filename: `inline-${idx}.mjs` }));
    } else {
      assert.doesNotThrow(() => new vm.Script(s.body, { filename: `inline-${idx}.js` }));
    }
  });
});

test('release markers, manifest, and service worker stay synchronized and standalone', () => {
  const metaReholz = html.match(/<meta name="reholz-release" content="([^"]+)">/);
  const metaApp = html.match(/<meta name="app-release" content="([^"]+)">/);
  const swExpected = sw.match(/RH_EXPECTED_HTML_RELEASE\s*=\s*'([^']+)'/);
  assert.ok(metaReholz && metaApp && swExpected);
  assert.equal(metaReholz[1], metaApp[1]);
  assert.equal(swExpected[1], metaReholz[1]);

  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
  assert.ok(!/ai\.studio|aistudio/i.test(html), 'No AI Studio coupling in index.html');
  assert.ok(!/REHOLZ WORKFORCE OVERVIEW/.test(html), 'Removed REHOLZ WORKFORCE OVERVIEW header');
  assert.ok(!/data:image\/svg\+xml/.test(html), 'Removed SVG data URI card patterns');
});

test('rhShouldShowRemainingLeave shows only when remaining leave is 0', () => {
  const { rhShouldShowRemainingLeave } = loadPureHelpersFromHtml();
  assert.equal(rhShouldShowRemainingLeave(0), true);
  assert.equal(rhShouldShowRemainingLeave('0'), true);
  assert.equal(rhShouldShowRemainingLeave(1), false);
  assert.equal(rhShouldShowRemainingLeave(12), false);
  assert.equal(rhShouldShowRemainingLeave(null), false);
  assert.equal(rhShouldShowRemainingLeave(undefined), false);
  assert.equal(rhShouldShowRemainingLeave(''), false);
  assert.equal(rhShouldShowRemainingLeave(NaN), false);
});

test('rhNormalizeDeactivateReason trims whitespace and enforces >= 3 chars', () => {
  const { rhNormalizeDeactivateReason } = loadPureHelpersFromHtml();
  assert.equal(rhNormalizeDeactivateReason('').ok, false);
  assert.equal(rhNormalizeDeactivateReason('  ab  ').ok, false);
  const valid = rhNormalizeDeactivateReason('  Mengundurkan   diri  per  akhir bulan ');
  assert.equal(valid.ok, true);
  assert.equal(valid.reason, 'Mengundurkan diri per akhir bulan');
});

test('rhApplyWorkRuleRowMutation handles area toggles and Izinkan Semua correctly', () => {
  const { rhApplyWorkRuleRowMutation } = loadPureHelpersFromHtml();
  const allAreas = ['Area 1', 'Area 2', 'Area 3', 'Area 4', 'Area lainnya', 'Area Sekitar'];
  const plain = (v) => JSON.parse(JSON.stringify(v));

  let rules = rhApplyWorkRuleRowMutation({}, '1001', 'Area 2', false, false, allAreas);
  assert.deepEqual(plain(rules['1001']), {
    mode: 'RESTRICTED',
    allowedAreas: ['Area 1', 'Area 3', 'Area 4', 'Area lainnya', 'Area Sekitar']
  });

  rules = rhApplyWorkRuleRowMutation(rules, '1001', 'Area 2', true, false, allAreas);
  assert.equal(rules['1001'], undefined);

  rules = rhApplyWorkRuleRowMutation(rules, '1001', '', false, true, allAreas);
  assert.deepEqual(plain(rules['1001']), { mode: 'RESTRICTED', allowedAreas: [] });

  rules = rhApplyWorkRuleRowMutation(rules, '1001', '', true, true, allAreas);
  assert.equal(rules['1001'], undefined);
});
