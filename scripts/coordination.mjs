#!/usr/bin/env node
// No dependencies: Git performs atomic, fast-forward-only state publication.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync, openSync, closeSync, unlinkSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const REF = 'refs/heads/coordination';
const CACHE_REF = 'refs/trading-coordination/state';
const PROTECTED = ['main', 'coordination', 'project/decision-lab-completion'];
const MAX_RECENT = 20;
const json = x => JSON.stringify(x, null, 2) + '\n';
const now = () => new Date().toISOString();
const fail = message => { throw new Error(message); };
const required = (value, name) => typeof value === 'string' && value.trim() ? value.trim() : fail(`${name} is required`);
const safeId = value => /^[a-z0-9][a-z0-9._-]{0,79}$/i.test(value) ? value : fail('Use a short public-safe identifier');

export class Coordination {
  constructor(cwd = process.cwd(), { allowTestRemote = false } = {}) {
    this.cwd = resolve(cwd);
    this.root = this.git(['rev-parse', '--show-toplevel']).trim();
    this.common = resolve(this.cwd, this.git(['rev-parse', '--git-common-dir']).trim());
    this.meta = resolve(this.cwd, this.git(['rev-parse', '--git-path', 'trading-coordination']).trim());
    const url = this.git(['remote', 'get-url', 'origin']).trim();
    const pushUrl = this.git(['remote', 'get-url', '--push', 'origin']).trim();
    if (!allowTestRemote && !/^(https:\/\/github\.com\/|git@github\.com:)ClimbingBuddies\/Trading(?:\.git)?\/?$/i.test(url)) fail('Wrong origin: expected ClimbingBuddies/Trading');
    if (pushUrl !== url) fail('Different fetch and push destinations; inspect origin configuration before proceeding');
    this.remote = url;
  }
  git(args, { input, env = {}, ok = [0] } = {}) {
    const r = spawnSync('git', args, { cwd: this.cwd, encoding: 'utf8', input, timeout: 60000,
      maxBuffer: 8 * 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never', ...env } });
    if (r.error || !ok.includes(r.status)) fail(`Git ${args[0]} failed: ${(r.stderr || r.error?.message || `exit ${r.status}`).trim()}`);
    return r.stdout || '';
  }
  readLocal(name, fallback = null) { return existsSync(join(this.meta, name)) ? JSON.parse(readFileSync(join(this.meta, name), 'utf8')) : fallback; }
  saveLocal(name, data) { mkdirSync(this.meta, { recursive: true }); writeFileSync(join(this.meta, name), json(data)); }
  mutex(fn) {
    mkdirSync(this.common, { recursive: true });
    const path = join(this.common, 'trading-coordination-command.lock');
    let fd;
    try { fd = openSync(path, 'wx'); } catch { fail('Another coordination command or a crashed-command sentinel exists. Diagnose before removing the local sentinel; it is NOT the shared lock.'); }
    try { writeFileSync(fd, json({ pid: process.pid, at: now() })); return fn(); }
    finally { closeSync(fd); unlinkSync(path); }
  }
  validate(s) {
    if (s.protocol !== 1 || !Number.isInteger(s.revision) || !['held', 'free', 'handoff'].includes(s.status)) fail('Unknown or malformed coordination state; stop');
    if (s.status !== 'free' && (!s.ownerId || !s.cloneId || !s.acquisitionId || !s.branch || !s.taskId)) fail('Incomplete owner state; stop');
    if (!Array.isArray(s.journal)) fail('Malformed journal index');
    return s;
  }
  remoteState() {
    // An absent ref, network error, or rewritten history is an error, never "free".
    this.git(['fetch', '--quiet', '--no-tags', 'origin', `${REF}:${CACHE_REF}`]);
    const sha = this.git(['rev-parse', CACHE_REF]).trim();
    const state = this.validate(JSON.parse(this.git(['show', `${sha}:state.json`])));
    return { sha, state };
  }
  snapshot() {
    const branch = this.git(['symbolic-ref', '--quiet', '--short', 'HEAD'], { ok: [0, 1] }).trim();
    const head = this.git(['rev-parse', 'HEAD']).trim();
    const changes = this.git(['status', '--porcelain=v1', '--untracked-files=all']);
    return { branch, head, dirty: Boolean(changes), changes: changes.trim().split('\n').filter(Boolean),
      stashes: this.git(['stash', 'list', '--format=%gd']).trim().split('\n').filter(Boolean) };
  }
  identity() { return this.readLocal('identity.json') || fail('Enroll this clone first: init --owner NAME --id ID'); }
  pendingCheck() { if (this.readLocal('pending.json')) fail('Unresolved publication outcome. Run resolve before another mutation.'); }
  owned(remote, { branch = true } = {}) {
    const me = this.identity(), lease = this.readLocal('lease.json');
    if (!lease || remote.state.status !== 'held' || remote.state.ownerId !== me.ownerId || remote.state.cloneId !== me.cloneId || remote.state.acquisitionId !== lease.acquisitionId) fail(`NOT OWNER: ${remote.state.owner || 'unknown'} — ${remote.state.task || remote.state.status}`);
    const local = this.snapshot();
    if (branch && (local.branch !== remote.state.branch || PROTECTED.includes(local.branch))) fail('Wrong branch or protected integration branch; do not modify');
    return local;
  }
  warning(s) {
    const active = s.status !== 'free';
    return `# ${active ? 'ACTIVE DEVELOPMENT — DO NOT MODIFY' : 'DEVELOPMENT LOCK AVAILABLE'}\n\n` +
      `Status: ${s.status}\n\nOwner: ${s.owner || 'none'}\n\nTask: ${s.task || 'none'}\n\nStarted (UTC): ${s.startedAt || 'n/a'}\n\nHeartbeat (UTC): ${s.heartbeatAt || 'n/a'}\n\nBranch: ${s.branch || 'n/a'}\n\nLocal changes at last observation: ${s.localChanges}\n\nPublished commit: ${s.publishedCommit || 'none verified'}\n\nState revision: ${s.revision}\n\n` +
      'Read state.json before acting. A stale heartbeat is never permission to take over. This branch is authoritative; the issue is a display only. Do not merge this branch into application branches.\n';
  }
  candidate(parent, state, files = {}) {
    this.validate(state);
    mkdirSync(this.meta, { recursive: true });
    const dir = mkdtempSync(join(this.meta, 'index-'));
    const env = { GIT_INDEX_FILE: join(dir, 'index') };
    try {
      this.git(['read-tree', parent], { env });
      for (const [path, content] of Object.entries({ 'state.json': json(state), 'README.md': this.warning(state), ...files })) {
        const blob = this.git(['hash-object', '-w', '--stdin'], { input: content, env }).trim();
        this.git(['update-index', '--add', '--cacheinfo', `100644,${blob},${path}`], { env });
      }
      const tree = this.git(['write-tree'], { env }).trim();
      return this.git(['-c', 'user.name=Trading coordination', '-c', 'user.email=coordination@users.noreply.github.com',
        'commit-tree', tree, '-p', parent], { input: `coordination: ${state.status} revision ${state.revision}\n`, env }).trim();
    } finally {
      if (dirname(resolve(dir)) !== resolve(this.meta)) fail('Unsafe temporary index cleanup path');
      rmSync(dir, { recursive: true, force: true });
    }
  }
  transition(remote, patch, { files = {}, lease = undefined } = {}) {
    this.pendingCheck();
    const state = { ...remote.state, ...patch, revision: remote.state.revision + 1 };
    const commit = this.candidate(remote.sha, state, files);
    this.saveLocal('pending.json', { parent: remote.sha, commit, lease, acquisitionId: state.acquisitionId });
    try { this.git(['push', '--no-follow-tags', '--recurse-submodules=no', '--porcelain', 'origin', `${commit}:${REF}`], { env: { TRADING_COORDINATION_STATE_PUSH: '1' } }); }
    catch (e) { fail(`PUBLICATION UNKNOWN OR REJECTED; retain local work and run resolve. ${e.message}`); }
    return this.resolvePending();
  }
  isAncestor(a, b) {
    const r = spawnSync('git', ['merge-base', '--is-ancestor', a, b], { cwd: this.root, encoding: 'utf8' });
    if (![0, 1].includes(r.status)) fail('Cannot establish commit ancestry');
    return r.status === 0;
  }
  resolvePending(retry = false) {
    const pending = this.readLocal('pending.json');
    if (!pending) return { result: 'NO_PENDING_TRANSITION' };
    const remote = this.remoteState();
    if (this.isAncestor(pending.commit, remote.sha)) {
      if ('lease' in pending) this.saveLocal('lease.json', pending.lease);
      unlinkSync(join(this.meta, 'pending.json'));
      return { result: 'PUBLISHED', revision: remote.sha, status: remote.state.status, warningNeedsSync: true };
    }
    if (remote.sha === pending.parent) {
      if (!retry) fail('Outcome unresolved: remote still at parent. Diagnose transport, then resolve --retry to publish the SAME candidate; never generate a second acquisition.');
      this.git(['push', '--no-follow-tags', '--recurse-submodules=no', '--porcelain', 'origin', `${pending.commit}:${REF}`], { env: { TRADING_COORDINATION_STATE_PUSH: '1' } });
      return this.resolvePending(false);
    }
    unlinkSync(join(this.meta, 'pending.json'));
    fail('TRANSITION REJECTED: remote advanced to competing state. No automatic retry; inspect owner.');
  }
  init(owner, ownerId) {
    required(owner, 'owner'); safeId(required(ownerId, 'id'));
    const old = this.readLocal('identity.json');
    if (old && (old.owner !== owner || old.ownerId !== ownerId)) fail('Clone already enrolled with another identity; preserve its lease and investigate');
    if (!old) this.saveLocal('identity.json', { owner, ownerId, cloneId: randomUUID() });
    return { result: 'ENROLLED', ...this.identity(), hooks: 'Run install-hook separately; existing hooks are preserved.' };
  }
  acquire({ task, description, scope = [], branch }) {
    this.pendingCheck();
    const me = this.identity(), remote = this.remoteState(), local = this.snapshot();
    if (remote.state.status !== 'free') fail(`LOCKED by ${remote.state.owner}: ${remote.state.task}; stale heartbeat does not release ownership`);
    safeId(required(task, 'task')); required(description, 'description'); required(branch, 'branch');
    this.git(['check-ref-format', '--branch', branch]);
    if (PROTECTED.includes(branch)) fail('A dedicated feature branch is required');
    if (local.branch !== branch && local.dirty) fail('Dirty tree: do not switch branches. Preserve existing work and acquire for its existing feature branch or arrange a handoff.');
    const lease = { acquisitionId: randomUUID(), baseCommit: local.head, acquiredAt: now() };
    const result = this.transition(remote, { status: 'held', ...me, acquisitionId: lease.acquisitionId, taskId: task, task: description, scope,
      branch, startedAt: now(), heartbeatAt: now(), localChanges: local.dirty ? 'unpublished' : 'clean', publishedCommit: null,
      handoff: null, lastJournal: null, baseCommit: local.head }, { lease });
    // Failure here retains the shared lock. No hidden checkout/reset of existing work.
    if (local.branch !== branch) this.git(['switch', '-c', branch]);
    return { ...result, branch, next: 'status, inspect relevant changes, acknowledge, then begin before edits' };
  }
  guard() { this.pendingCheck(); const remote = this.remoteState(); this.owned(remote); return { result: 'OWNER_CONFIRMED', revision: remote.sha }; }
  heartbeat(begin = false) {
    this.pendingCheck(); const remote = this.remoteState(), local = this.owned(remote);
    return this.transition(remote, { heartbeatAt: now(), localChanges: begin ? 'unknown-editing' : local.dirty ? 'unpublished' : 'clean',
      localHead: local.head });
  }
  updateScope(scope, description) {
    this.pendingCheck(); const remote = this.remoteState(); this.owned(remote);
    if (!scope.length || scope.some(s => !s.trim())) fail('Provide a nonempty public-safe scope');
    return this.transition(remote, { scope, ...(description ? { task: required(description, 'description') } : {}), heartbeatAt: now() });
  }
  remoteHeads() {
    const lines = this.git(['ls-remote', '--heads', 'origin']).trim().split('\n').filter(Boolean);
    return Object.fromEntries(lines.map(line => { const [sha, ref] = line.split(/\s+/); return [ref.slice(11), sha]; }));
  }
  status() {
    const remote = this.remoteState(), local = this.snapshot(), heads = this.remoteHeads();
    const previous = this.readLocal('acknowledged.json');
    const relevantHeads = Object.fromEntries(['main', 'project/decision-lab-completion', local.branch].filter(Boolean).map(b => [b, heads[b] || null]));
    const recent = remote.state.journal || [];
    const newEntries = previous ? recent.filter(e => e.sequence > previous.journalSequence) : recent;
    const journalGap = Boolean(previous && recent.length && previous.journalSequence < recent[0].sequence - 1);
    const changedBranches = previous ? [...new Set([...Object.keys(heads), ...Object.keys(previous.allHeads || {})])].filter(b => b !== 'coordination' && heads[b] !== previous.allHeads?.[b]) : [];
    const changed = !previous || previous.head !== local.head || JSON.stringify(previous.heads) !== JSON.stringify(relevantHeads) || local.dirty || journalGap || newEntries.length > 0 || changedBranches.length > 0;
    const report = { result: changed ? 'REVIEW_REQUIRED' : 'CONTEXT_UNCHANGED', protocol: 1,
      lock: { revision: remote.sha, status: remote.state.status, owner: remote.state.owner, task: remote.state.task, branch: remote.state.branch,
        heartbeatAt: remote.state.heartbeatAt, stale: Date.now() - Date.parse(remote.state.heartbeatAt || 0) > 30 * 60000,
        localChanges: remote.state.localChanges, publishedCommit: remote.state.publishedCommit },
      local: { ...local, changes: local.changes.slice(0, 30), omittedChanges: Math.max(0, local.changes.length - 30) },
      heads: relevantHeads, changedRemoteBranches: changedBranches.slice(0, 30), omittedRemoteChanges: Math.max(0, changedBranches.length - 30),
      newJournalEntries: newEntries, journalGap, pendingTransition: Boolean(this.readLocal('pending.json')),
      checks: ['shared-lock', 'local-tree-and-stashes', 'remote-heads', 'acknowledged-checkpoint', 'journal-index'],
      next: journalGap ? 'Read missing journal history and relevant diffs; do not acknowledge from a truncated index.' : changed ? 'Read context if new session; inspect relevant journal entries and diffs, then acknowledge.' : 'Reuse available context. Hosted state is NOT certified unchanged.' };
    this.saveLocal('last-status.json', { head: local.head, heads: relevantHeads, allHeads: heads,
      journalSequence: recent.at(-1)?.sequence || 0, coordinationSha: remote.sha, inspectedAt: now() });
    return report;
  }
  acknowledge() {
    const seen = this.readLocal('last-status.json') || fail('Run status and review first');
    const local = this.snapshot(), heads = this.remoteHeads();
    if (seen.head !== local.head || [...new Set([...Object.keys(seen.allHeads), ...Object.keys(heads)])].some(b => b !== 'coordination' && heads[b] !== seen.allHeads[b])) fail('Git state changed since status; inspect again');
    const remote = this.remoteState();
    if ((remote.state.journal.at(-1)?.sequence || 0) !== seen.journalSequence) fail('Journal changed since status; inspect again');
    this.saveLocal('acknowledged.json', seen);
    return { result: 'ACKNOWLEDGED', head: local.head };
  }
  publish() {
    this.pendingCheck(); const remote = this.remoteState(), local = this.owned(remote);
    if (local.dirty) fail('Commit coherent work before publication; dirty working tree');
    this.git(['push', '--no-follow-tags', '--recurse-submodules=no', '--porcelain', 'origin', `HEAD:refs/heads/${local.branch}`]);
    if (this.remoteHeads()[local.branch] !== local.head) fail('Branch publication could not be verified; retain lock');
    const fresh = this.remoteState(); this.owned(fresh);
    return this.transition(fresh, { publishedCommit: local.head, heartbeatAt: now(), localChanges: 'clean' });
  }
  record(entry) {
    this.pendingCheck(); const remote = this.remoteState(), local = this.owned(remote);
    if (local.dirty) fail('Journal checkpoints describe committed work; commit first');
    for (const key of ['description', 'databaseAndApi', 'decisions', 'risks', 'tests', 'outstanding', 'recovery']) if (!(key in entry)) fail(`Journal missing ${key}`);
    if (!Array.isArray(entry.tests) || entry.tests.some(t => !t.command || !['passed', 'failed', 'not-run'].includes(t.result))) fail('Tests need command and passed/failed/not-run result');
    const sequence = (remote.state.journal.at(-1)?.sequence || 0) + 1;
    const path = `journal/${String(sequence).padStart(6, '0')}-${safeId(remote.state.taskId)}.json`;
    const base = remote.state.baseCommit || this.readLocal('lease.json')?.baseCommit || local.head;
    const files = this.git(['diff', '--name-only', base, local.head]).trim().split('\n').filter(Boolean);
    const published = this.remoteHeads()[local.branch] === local.head;
    const payload = { ...entry, sequence, timestamp: now(), author: remote.state.owner, taskId: remote.state.taskId,
      commit: local.head, baseCommit: base, branch: local.branch, files,
      checkpoints: { localWorking: local.head, locallyTested: entry.tests.length && entry.tests.every(t => t.result === 'passed') ? local.head : null,
        remotelyPublished: published ? local.head : null, approvedStableIntegration: remote.state.stableIntegration || null, production: remote.state.production || null },
      evidenceNote: 'Test results are explicit author attestations; stable integration requires separate approval and evidence.' };
    const index = [...remote.state.journal, { sequence, path, taskId: payload.taskId, commit: local.head, description: String(entry.description).slice(0, 180) }].slice(-MAX_RECENT);
    return this.transition(remote, { journal: index, lastJournal: { path, commit: local.head }, heartbeatAt: now() }, { files: { [path]: json(payload) } });
  }
  secured(remote) {
    const local = this.owned(remote);
    if (local.dirty || local.stashes.length) fail('Uncommitted or stashed work remains; retain lock or secure a verified handoff');
    if (this.remoteHeads()[local.branch] !== local.head) fail('Local HEAD is not verified on its remote branch; retain lock');
    if (remote.state.lastJournal?.commit !== local.head) fail('Record a journal entry for the final published commit before release/handoff');
    return local;
  }
  release(attestation) {
    this.pendingCheck(); const remote = this.remoteState(); this.secured(remote);
    if (attestation !== 'all-work-secured') fail('Explicit --attest all-work-secured required after inspecting other worktrees/branches and ignored working assets');
    return this.transition(remote, { status: 'free', owner: null, ownerId: null, cloneId: null, acquisitionId: null,
      releasedAt: now(), heartbeatAt: now(), localChanges: 'secured', lastOwner: remote.state.owner,
      task: null, taskId: null, branch: null, handoff: null }, { lease: null });
  }
  offerHandoff(target, attestation) {
    this.pendingCheck(); const remote = this.remoteState(); const local = this.secured(remote);
    if (attestation !== 'all-work-secured') fail('Explicit all-work-secured attestation required');
    return this.transition(remote, { status: 'handoff', handoff: { targetOwnerId: safeId(target), commit: local.head, branch: local.branch, offeredAt: now() }, heartbeatAt: now() });
  }
  acceptHandoff() {
    this.pendingCheck(); const me = this.identity(), remote = this.remoteState(), local = this.snapshot();
    if (remote.state.status !== 'handoff' || remote.state.handoff?.targetOwnerId !== me.ownerId) fail('No handoff offered to this owner');
    if (local.dirty || local.stashes.length || local.head !== remote.state.handoff.commit || local.branch !== remote.state.handoff.branch) fail('Verify the exact published handoff commit on its feature branch in a clean clone first');
    const lease = { acquisitionId: randomUUID(), baseCommit: local.head, acquiredAt: now() };
    return this.transition(remote, { ...me, status: 'held', acquisitionId: lease.acquisitionId, startedAt: now(), heartbeatAt: now(), localChanges: 'clean', handoff: null }, { lease });
  }
  takeover(approval) {
    this.pendingCheck(); const me = this.identity(), remote = this.remoteState(), local = this.snapshot();
    if (remote.state.status === 'free') fail('Use acquire for a free lock');
    for (const key of ['authorizedBy', 'authorizationReference', 'reason', 'remoteReview', 'localWorkDisposition', 'expectedRevision']) required(approval[key], key);
    if (approval.expectedRevision !== remote.sha) fail('Approval is for a different lock revision; re-review before takeover');
    if (approval.mode !== 'owner-confirmed' && approval.mode !== 'explicit-takeover') fail('Approval mode required');
    if (local.dirty || local.stashes.length || PROTECTED.includes(local.branch) || !local.branch) fail('Takeover requires a clean dedicated feature branch');
    const lease = { acquisitionId: randomUUID(), baseCommit: local.head, acquiredAt: now() };
    const path = `recovery/${randomUUID()}.json`;
    return this.transition(remote, { ...me, status: 'held', acquisitionId: lease.acquisitionId, branch: local.branch, baseCommit: local.head,
      startedAt: now(), heartbeatAt: now(), localChanges: 'unknown', publishedCommit: null, lastJournal: null, handoff: null,
      recovery: { path, priorOwner: remote.state.owner, priorAcquisition: remote.state.acquisitionId } }, { lease,
      files: { [path]: json({ ...approval, timestamp: now(), prior: remote.state, note: 'Old owner must stop and reconcile; remote evidence cannot establish safety of inaccessible local work.' }) } });
  }
  markStable(approval) {
    this.pendingCheck(); const remote = this.remoteState(); this.owned(remote);
    for (const key of ['approvedBy', 'approvalReference', 'commit', 'integrationBranch', 'recovery']) required(approval[key], key);
    if (!/^[0-9a-f]{40}$/.test(approval.commit)) fail('Stable checkpoint requires an exact commit SHA');
    if (!['main', 'project/decision-lab-completion'].includes(approval.integrationBranch)) fail('Stable integration must use a recognized integration branch');
    if (!Array.isArray(approval.tests) || !approval.tests.length || approval.tests.some(t => !t.command || t.result !== 'passed')) fail('Passing tests and scope are required; untested commits cannot be stable');
    if (this.remoteHeads()[approval.integrationBranch] !== approval.commit) fail('Stable checkpoint must match the inspected remote integration head');
    const path = `stable/${approval.commit}.json`;
    return this.transition(remote, { stableIntegration: { commit: approval.commit, branch: approval.integrationBranch, evidence: path, approvedBy: approval.approvedBy, at: now() } },
      { files: { [path]: json({ ...approval, at: now(), note: 'Explicit human approval and test evidence; does not imply database rollback or production deployment.' }) } });
  }
  journal(path) {
    if (!/^journal\/[0-9]{6,}-[a-z0-9._-]+\.json$/i.test(path || '')) fail('Use an exact journal path returned by status');
    const remote = this.remoteState();
    return JSON.parse(this.git(['show', `${remote.sha}:${path}`]));
  }
  warningPayload() {
    const remote = this.remoteState();
    return { issue: remote.state.warningIssue || 39, title: remote.state.status === 'free' ? 'DEVELOPMENT LOCK AVAILABLE — check authoritative state before starting' : `ACTIVE DEVELOPMENT — DO NOT MODIFY — ${remote.state.owner}`,
      body: this.warning(remote.state) + `\nAuthoritative revision: ${remote.sha}\n\n[Live state](https://github.com/ClimbingBuddies/Trading/blob/coordination/state.json)\n\nThis issue can lag. Always check live state; closing/editing this issue does not release the lock.\n` };
  }
  installHook() {
    const existing = this.git(['config', '--get', 'core.hooksPath'], { ok: [0, 1] }).trim();
    if (existing) fail('Existing core.hooksPath found. Integrate the guard manually; do not replace existing hooks.');
    const path = resolve(this.cwd, this.git(['rev-parse', '--git-path', 'hooks/pre-push']).trim());
    if (existsSync(path)) fail('Existing pre-push hook found. Preserve it and integrate the guard manually.');
    mkdirSync(resolve(path, '..'), { recursive: true });
    writeFileSync(path, '#!/bin/sh\nnode "$(git rev-parse --show-toplevel)/scripts/coordination.mjs" pre-push "$@"\n', { mode: 0o755 });
    return { result: 'PRE_PUSH_GUARD_INSTALLED', limitations: 'Hooks are local and bypassable; other clones must enroll.' };
  }
  prePush(remoteName, remoteUrl, input) {
    if (remoteName !== 'origin' || remoteUrl !== this.remote) fail('Push destination differs from enrolled origin');
    const lines = input.trim().split('\n').filter(Boolean).map(l => l.split(/\s+/));
    if (!lines.length) return { result: 'NO_UPDATES' };
    if (process.env.TRADING_COORDINATION_STATE_PUSH === '1') {
      const p = this.readLocal('pending.json') || fail('State push has no recorded pending transition');
      if (lines.length !== 1 || lines[0][2] !== REF || lines[0][1] !== p.commit) fail('Invalid state push');
      return { result: 'STATE_TRANSITION_ONLY' };
    }
    const remote = this.remoteState(), local = this.owned(remote);
    for (const [, sha, target, old] of lines) {
      if (target !== `refs/heads/${local.branch}` || /^0+$/.test(sha)) fail('Only the owned feature branch can be pushed; integration/deletion requires separate reviewed procedure');
      if (!/^0+$/.test(old) && !this.isAncestor(old, sha)) fail('History rewrite rejected');
    }
    return { result: 'PUSH_ALLOWED' };
  }
}

export function main(argv = process.argv.slice(2)) {
  const [command, ...rest] = argv;
  const opts = {};
  for (let i = 0; i < rest.length; i++) if (rest[i].startsWith('--')) opts[rest[i].slice(2)] = rest[i + 1]?.startsWith('--') || !rest[i + 1] ? true : rest[++i];
  const c = new Coordination();
  const read = path => JSON.parse(readFileSync(required(path, 'JSON file'), 'utf8'));
  // pre-push is called inside publish/transition: never attempt the command mutex twice.
  if (command === 'pre-push') return c.prePush(rest[0], rest[1], readFileSync(0, 'utf8'));
  return c.mutex(() => {
    switch (command) {
      case 'init': return c.init(opts.owner, opts.id);
      case 'status': return c.status();
      case 'acquire': return c.acquire({ ...opts, scope: String(opts.scope || '').split(',').filter(Boolean) });
      case 'guard': return c.guard();
      case 'begin': return c.heartbeat(true);
      case 'heartbeat': return c.heartbeat();
      case 'scope': return c.updateScope(String(opts.scope || '').split(',').filter(Boolean), opts.description);
      case 'acknowledge': return c.acknowledge();
      case 'publish': return c.publish();
      case 'record': return c.record(read(opts.file));
      case 'release': return c.release(opts.attest);
      case 'handoff': return c.offerHandoff(required(opts.to, 'to'), opts.attest);
      case 'accept': return c.acceptHandoff();
      case 'takeover': return c.takeover(read(opts.approval));
      case 'stable': return c.markStable(read(opts.approval));
      case 'journal': return c.journal(opts.path);
      case 'resolve': return c.resolvePending(Boolean(opts.retry));
      case 'warning': return c.warningPayload();
      case 'install-hook': return c.installHook();
      default: fail('Commands: init, status, acquire, guard, begin, heartbeat, scope, acknowledge, publish, record, release, handoff, accept, takeover, stable, journal, resolve, warning, install-hook');
    }
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(json(main())); }
  catch (e) { process.stderr.write(json({ result: 'STOP', reason: e.message })); process.exitCode = 1; }
}
