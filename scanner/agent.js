// Scanner agent-facing output format — mirrors Website Watcher src/agent.js.
// Takes a scanner.js scanFile result and returns a compact, fixed-schema
// object an AI agent can parse and act on without reading the whole report.
// Fixed schema: same fields every time, no surprises.
// Static only: this file never executes the scanned content.
function agentFormat(result) {
  const verdict = result.verdict || 'clean';
  const score = result.score || 0;
  const action = result.action || (score >= 50 ? 'block' : score >= 25 ? 'review' : 'allow');

  let confidence = 'high';
  if (!result.findings || result.findings.length === 0) confidence = 'high';
  if (verdict === 'error') confidence = 'low';

  const summary = buildSummary(result);
  const topFindings = (result.findings || []).slice(0, 5).map((f) => ({
    trait: f.trait,
    name: f.name,
    weight: f.weight,
    confidence: f.confidence,
    detail: f.detail,
  }));

  const categories = {
    loader: categoryScore(result, ['Code after config export', 'Long single-line']),
    marker: categoryScore(result, ['marker', 'Confirmed marker', 'Shai-Hulud', 'C2 contract']),
    obfuscation: categoryScore(result, ['deobfuscator', 'decoder']),
    execution: categoryScore(result, ['eval', 'Require smuggling', 'Detached node', 'install hook']),
    exfiltration: categoryScore(result, ['Blockchain RPC', 'Wallet', 'Portable-Python', 'InvisibleFerret']),
    extension: categoryScore(result, ['Fake Rabby', 'manifest']),
  };

  return {
    file: result.file,
    verdict,
    score,
    confidence,
    action,
    summary,
    malware: result.attribution || { family: null, confidence: null, campaign: null, basis: [] },
    topFindings,
    categories,
    facts: {
      traitsFound: (result.findings || []).map((f) => f.trait),
      traitCount: (result.findings || []).length,
      highestWeight: (result.findings || []).reduce((m, f) => Math.max(m, f.weight), 0),
    },
    details: result,
  };
}

function categoryScore(result, keywords) {
  return (result.findings || [])
    .filter((f) => keywords.some((k) => f.name.includes(k)))
    .reduce((s, f) => s + f.weight, 0);
}

function attributionPhrase(result) {
  const a = result.attribution;
  if (!a || !a.family || a.family === 'Unknown') return null;
  if (a.confidence === 'high') return `likely infected with ${a.family} (${a.campaign} campaign)`;
  return `consistent with ${a.family} (${a.campaign} campaign)`;
}

function buildSummary(result) {
  const name = result.file ? result.file.split('/').pop() : 'file';
  const attr = attributionPhrase(result);
  if (result.verdict === 'dangerous') {
    const what = attr ? `${name} is ${attr} (score ${result.score}/100)` : `${name} is dangerous (score ${result.score}/100)`;
    return `${what}: ${(result.findings || []).map((f) => f.trait).join(', ')}. Block it — do not install, build, or run it.`;
  }
  if (result.verdict === 'suspicious') {
    const what = attr ? `${name} is ${attr} (score ${result.score}/100)` : `${name} is suspicious (score ${result.score}/100)`;
    return `${what}: ${(result.findings || []).map((f) => f.trait).join(', ')}. Review it by hand before installing, building, or running it.`;
  }
  return `${name} is clean (score ${result.score}/100): no PolinRider traits found.`;
}

// Repo scan output: same fixed shape as agentFormat, but for a whole
// repo (working tree + history). Takes the --json outputs of scanner.js
// ({ scanned, results }) and scan-history.js
// ({ commitsScanned, blobsScanned, flagged }) and combines them.
// Verdict/score are the worst of tree and history.
function repoFormat({ repoUrl, tree, history }) {
  const treeResults = (tree && tree.results) || [];
  const flaggedBlobs = (history && history.flagged) || [];
  const worstTree = treeResults.reduce((m, r) => Math.max(m, r.score || 0), 0);
  const worstHist = flaggedBlobs.reduce((m, f) => Math.max(m, f.score || 0), 0);
  const score = Math.max(worstTree, worstHist);
  const verdict = score >= 50 ? 'dangerous' : score >= 25 ? 'suspicious' : 'clean';
  const action = score >= 50 ? 'block' : score >= 25 ? 'review' : 'allow';

  const allFindings = [];
  for (const r of treeResults) {
    for (const f of r.findings || []) allFindings.push({ file: r.file, ...f });
  }
  for (const b of flaggedBlobs) {
    for (const f of b.findings || []) allFindings.push({ file: `history:${b.paths[0]}`, commits: b.commits, ...f });
  }
  allFindings.sort((a, b) => b.weight - a.weight);
  const topFindings = allFindings.slice(0, 5).map((f) => ({
    trait: f.trait, name: f.name, weight: f.weight,
    confidence: f.confidence, detail: f.detail, file: f.file,
    ...(f.commits ? { commits: f.commits } : {}),
  }));

  // Attribution of the worst-scoring result (tree file or history blob).
  const worstResult = [...treeResults, ...flaggedBlobs].sort((a, b) => (b.score || 0) - (a.score || 0))[0];
  const malware = (worstResult && worstResult.attribution) || { family: null, confidence: null, campaign: null, basis: [] };
  const attr = malware.family && malware.family !== 'Unknown'
    ? (malware.confidence === 'high' ? `likely infected with ${malware.family} (${malware.campaign} campaign)` : `consistent with ${malware.family} (${malware.campaign} campaign)`)
    : null;

  const name = String(repoUrl).replace(/\/$/, '').split('/').slice(-2).join('/');
  const summary = verdict === 'dangerous'
    ? `${name} is ${attr || `dangerous (score ${score}/100)`}${attr ? ` (score ${score}/100)` : ''}: ${allFindings.map((f) => f.trait).join(', ')}. Block it — do not clone it for use, do not install, build, or run it.`
    : verdict === 'suspicious'
      ? `${name} is ${attr || `suspicious (score ${score}/100)`}${attr ? ` (score ${score}/100)` : ''}: ${allFindings.map((f) => f.trait).join(', ')}. Review the flagged files by hand before installing, building, or running it.`
      : `${name} is clean (score ${score}/100): no PolinRider traits found in the working tree or in history.`;

  return {
    repo: repoUrl,
    verdict,
    score,
    confidence: 'high',
    action,
    summary,
    malware,
    topFindings,
    facts: {
      filesScanned: (tree && tree.scanned) || 0,
      commitsScanned: (history && history.commitsScanned) || 0,
      blobsScanned: (history && history.blobsScanned) || 0,
      flaggedFiles: treeResults.filter((r) => (r.findings || []).length).length,
      flaggedBlobs: flaggedBlobs.length,
      historyTruncated: (history && history.commitsScanned) >= 1000,
    },
    details: { tree: treeResults, history: flaggedBlobs },
  };
}

// Batch folder scan output: one verdict for a whole folder of files,
// scanned in memory. Takes [{ filename, content }] plus the per-file
// scanContent results. Verdict/score are the worst file's.
function batchFormat(files, results) {
  const score = results.reduce((m, r) => Math.max(m, r.score || 0), 0);
  const verdict = score >= 50 ? 'dangerous' : score >= 25 ? 'suspicious' : 'clean';
  const action = score >= 50 ? 'block' : score >= 25 ? 'review' : 'allow';

  const allFindings = [];
  for (const r of results) {
    for (const f of r.findings || []) allFindings.push({ file: r.file, ...f });
  }
  allFindings.sort((a, b) => b.weight - a.weight);
  const topFindings = allFindings.slice(0, 5).map((f) => ({
    trait: f.trait, name: f.name, weight: f.weight,
    confidence: f.confidence, detail: f.detail, file: f.file,
  }));

  const flagged = results.filter((r) => (r.findings || []).length);
  const worstResult = [...results].sort((a, b) => (b.score || 0) - (a.score || 0))[0];
  const malware = (worstResult && worstResult.attribution) || { family: null, confidence: null, campaign: null, basis: [] };
  const attr = malware.family && malware.family !== 'Unknown'
    ? (malware.confidence === 'high' ? `likely infected with ${malware.family} (${malware.campaign} campaign)` : `consistent with ${malware.family} (${malware.campaign} campaign)`)
    : null;
  const summary = verdict === 'dangerous'
    ? `Folder is ${attr || `dangerous (score ${score}/100)`}${attr ? ` (score ${score}/100)` : ''}: ${flagged.map((r) => `${r.file} (${r.score})`).join(', ')}. Block it — do not install, build, or run anything in it.`
    : verdict === 'suspicious'
      ? `Folder is ${attr || `suspicious (score ${score}/100)`}${attr ? ` (score ${score}/100)` : ''}: ${flagged.map((r) => `${r.file} (${r.score})`).join(', ')}. Review the flagged files by hand before installing, building, or running anything in it.`
      : `Folder is clean (score ${score}/100): no PolinRider traits found in ${results.length} files.`;

  return {
    verdict,
    score,
    confidence: 'high',
    action,
    summary,
    malware,
    topFindings,
    facts: {
      filesScanned: results.length,
      flaggedFiles: flagged.length,
      flaggedFileNames: flagged.map((r) => r.file),
    },
    details: results,
  };
}

module.exports = { agentFormat, repoFormat, batchFormat };
