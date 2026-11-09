import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync, spawn } from 'node:child_process';
import { Coordination, REF } from '../scripts/coordination.mjs';

const git = (cwd, ...args) => {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' } });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
};
const evidence = { description: 'Synthetic coordination test', databaseAndApi: 'none', decisions: [], risks: [], tests: [{ command: 'isolated fixture', result: 'passed' }], outstanding: [], recovery: 'Revert feature commit; no database changes' };
function setup() {
  const root = mkdtempSync(join(tmpdir(), 'trading-coordination-test-'));
  const bare = join(root, 'remote.git');
  git(root, 'init', '--bare', '--initial-branch=main', bare);
  const seed = join(root, 'seed'); mkdirSync(seed);
  git(seed, 'init', '--initial-branch=main');
  git(seed, 'config', 'user.name', 'Fixture'); git(seed, 'config', 'user.email', 'fixture@example.invalid');
  writeFileSync(join(seed, 'fixture.txt'), 'base\n'); git(seed, 'add', '.'); git(seed, 'commit', '-m', 'fixture');
  git(seed, 'remote', 'add', 'origin', bare); git(seed, 'push', 'origin', 'main');
  git(seed, 'switch', '-c', 'coordination');
  writeFileSync(join(seed, 'state.json'), JSON.stringify({ protocol: 1, revision: 1, status: 'free', journal: [], stableIntegration: null }));
  git(seed, 'add', 'state.json'); git(seed, 'commit', '-m', 'state'); git(seed, 'push', 'origin', 'coordination');
  const clones = ['alice', 'bob'].map(owner => {
    const path = join(root, owner); git(root, 'clone', bare, path);
    git(path, 'config', 'user.name', owner); git(path, 'config', 'user.email', `${owner}@example.invalid`);
    const c = new Coordination(path, { allowTestRemote: true }); c.init(owner, owner); return c;
  });
  return { root, bare, a: clones[0], b: clones[1] };
}
const acquire = (c, branch = 'feature/test') => c.acquire({ task: 'test', description: 'Test fixture', scope: ['fixture'], branch });
const finish = c => { c.publish(); c.record(evidence); };

test('two contenders using the same free revision cannot both publish acquisition', async () => {
  const { a, b } = setup();
  const ra = a.remoteState(), rb = b.remoteState(); assert.equal(ra.sha, rb.sha);
  const candidate = (c, r) => c.candidate(r.sha, { ...r.state, revision: 2, status: 'held', ...c.identity(), acquisitionId: c.identity().ownerId,
    taskId: 'race', task: 'Race', branch: 'feature/race', journal: [] });
  const ca = candidate(a, ra), cb = candidate(b, rb);
  const push = (c, sha) => new Promise(resolve => {
    const p = spawn('git', ['push', 'origin', `${sha}:${REF}`], { cwd: c.root, stdio: 'ignore' }); p.on('exit', code => resolve(code));
  });
  const outcomes = await Promise.all([push(a, ca), push(b, cb)]);
  assert.equal(outcomes.filter(c => c === 0).length, 1);
  assert.equal(a.remoteState().state.status, 'held');
});
test('held and stale locks reject competitors and remain held across a new process', () => {
  const { a, b } = setup(); acquire(a);
  const r = a.remoteState(); a.transition(r, { heartbeatAt: '2000-01-01T00:00:00Z' });
  assert.throws(() => acquire(b), /LOCKED/);
  const resumed = new Coordination(a.root, { allowTestRemote: true });
  assert.equal(resumed.guard().result, 'OWNER_CONFIRMED');
  assert.equal(resumed.status().lock.stale, true);
});
test('dirty files, stashes, unpublished commits, absent journal and absent attestation block release', () => {
  const { a } = setup(); acquire(a);
  writeFileSync(join(a.root, 'new.txt'), 'work');
  assert.throws(() => a.release('all-work-secured'), /Uncommitted/);
  git(a.root, 'stash', 'push', '-u', '-m', 'keep work');
  assert.throws(() => a.release('all-work-secured'), /stashed/);
  git(a.root, 'stash', 'pop'); git(a.root, 'add', 'new.txt'); git(a.root, 'commit', '-m', 'work');
  assert.throws(() => a.release('all-work-secured'), /not verified/);
  a.publish(); assert.throws(() => a.release('all-work-secured'), /journal/);
  a.record(evidence); assert.throws(() => a.release(), /attest/);
  a.release('all-work-secured'); assert.equal(a.remoteState().state.status, 'free');
});
test('a lost response preserves a pending candidate and resolves without duplicate acquisition', () => {
  const { a } = setup(); const original = a.git.bind(a); let lose = true;
  a.git = (args, opts) => {
    const result = original(args, opts);
    if (args[0] === 'push' && lose) { lose = false; throw new Error('response lost after acceptance'); }
    return result;
  };
  assert.throws(() => acquire(a), /PUBLICATION UNKNOWN/);
  assert.ok(a.readLocal('pending.json')); assert.throws(() => a.heartbeat(), /Unresolved/);
  assert.equal(a.resolvePending().result, 'PUBLISHED');
  assert.equal(a.remoteState().state.revision, 2);
  // Checkout is a separate step after acquisition; a crashed process must explicitly resume it.
  git(a.root, 'switch', '-c', 'feature/test'); assert.equal(a.guard().result, 'OWNER_CONFIRMED');
});
test('a failed transport does not free the lock and retries only the exact candidate on explicit resolve', () => {
  const { a } = setup(); acquire(a); const original = a.git.bind(a);
  a.git = (args, opts) => { if (args[0] === 'push') throw new Error('offline'); return original(args, opts); };
  assert.throws(() => a.heartbeat(), /UNKNOWN/); const candidate = a.readLocal('pending.json').commit;
  a.git = original;
  assert.throws(() => a.resolvePending(), /remote still at parent/);
  a.resolvePending(true);
  assert.equal(a.remoteState().sha, candidate); assert.equal(a.remoteState().state.status, 'held');
});
test('a racing transition rejection never rebases an acquisition over another owner', () => {
  const { a, b } = setup(); const stale = b.remoteState(); acquire(a);
  const lease = { acquisitionId: 'bob-rejected' };
  assert.throws(() => b.transition(stale, { status: 'held', ...b.identity(), acquisitionId: lease.acquisitionId, taskId: 'race', branch: 'feature/bob' }, { lease }), /REJECTED/);
  assert.throws(() => b.resolvePending(), /TRANSITION REJECTED/);
  assert.equal(b.readLocal('lease.json'), null); assert.equal(b.remoteState().state.owner, 'alice');
});
test('handoff reserves ownership until exact-commit recipient acceptance and invalidates old owner', () => {
  const { a, b } = setup(); acquire(a); finish(a);
  a.offerHandoff('bob', 'all-work-secured'); assert.throws(() => acquire(b), /LOCKED/);
  assert.throws(() => b.acceptHandoff(), /exact published/);
  git(b.root, 'fetch', 'origin', 'feature/test'); git(b.root, 'switch', '-c', 'feature/test', 'FETCH_HEAD');
  b.acceptHandoff(); assert.equal(b.guard().result, 'OWNER_CONFIRMED');
  assert.throws(() => a.heartbeat(), /NOT OWNER/); assert.throws(() => a.release('all-work-secured'), /NOT OWNER/);
});
test('takeover requires explicit evidence bound to current revision and fences old owner', () => {
  const { a, b } = setup(); acquire(a); git(b.root, 'switch', '-c', 'feature/recovery');
  assert.throws(() => b.takeover({}), /authorizedBy/);
  const approval = { authorizedBy: 'Fixture owner', authorizationReference: 'isolated test authorization', reason: 'owner unavailable',
    remoteReview: 'fixture refs inspected', localWorkDisposition: 'unavailable work explicitly preserved as unknown', mode: 'explicit-takeover', expectedRevision: a.remoteState().sha };
  a.heartbeat(); assert.throws(() => b.takeover(approval), /different lock revision/);
  approval.expectedRevision = a.remoteState().sha; b.takeover(approval);
  assert.throws(() => a.guard(), /NOT OWNER/); assert.equal(b.guard().result, 'OWNER_CONFIRMED');
});
test('status is bounded, detects out-of-band branches, and rejects acknowledgment after remote movement', () => {
  const { a, b } = setup(); a.status(); a.acknowledge(); assert.equal(a.status().result, 'CONTEXT_UNCHANGED');
  git(b.root, 'switch', '-c', 'feature/manual'); git(b.root, 'push', 'origin', 'feature/manual');
  assert.throws(() => a.acknowledge(), /Git state changed/);
  const status = a.status(); assert.equal(status.result, 'REVIEW_REQUIRED'); assert.ok(status.changedRemoteBranches.includes('feature/manual'));
});
test('missing state, malformed state and unavailable network fail closed', () => {
  const { a, bare } = setup();
  git(bare, 'update-ref', '-d', REF); assert.throws(() => a.remoteState(), /Git fetch failed/);
  assert.throws(() => a.validate({ protocol: 999 }), /malformed/);
  git(a.root, 'remote', 'set-url', 'origin', join(a.root, 'nonexistent.git')); assert.throws(() => a.status(), /Git fetch failed/);
});
test('warning output never acquires ownership and local command mutex never auto-expires', () => {
  const { a } = setup(); const before = a.remoteState().sha;
  a.warningPayload(); assert.equal(a.remoteState().sha, before);
  writeFileSync(join(a.common, 'trading-coordination-command.lock'), 'crashed process');
  assert.throws(() => a.mutex(() => a.status()), /crashed-command/);
});
test('guard rejects protected branches and hook rejects deletions, foreign destinations and invalid state pushes', () => {
  const { a } = setup(); assert.throws(() => acquire(a, 'main'), /feature branch/); acquire(a);
  const head = a.snapshot().head;
  assert.throws(() => a.prePush('other', a.remote, `x ${head} refs/heads/feature/test ${'0'.repeat(40)}`), /destination/);
  assert.throws(() => a.prePush('origin', a.remote, `x ${head} refs/heads/main ${head}`), /Only the owned/);
  assert.throws(() => a.prePush('origin', a.remote, `x ${'0'.repeat(40)} refs/heads/feature/test ${head}`), /Only the owned/);
  assert.equal(a.prePush('origin', a.remote, `x ${head} refs/heads/feature/test ${'0'.repeat(40)}`).result, 'PUSH_ALLOWED');
  a.installHook(); assert.ok(readFileSync(join(a.common, 'hooks/pre-push'), 'utf8').includes('coordination.mjs'));
  assert.throws(() => a.installHook(), /Existing pre-push/);
});
test('journal distinguishes checkpoints, bounds its index, and stable designation needs approval and passing tests', () => {
  const { a } = setup(); acquire(a); a.publish();
  a.record({ ...evidence, tests: [{ command: 'not executed', result: 'not-run' }] });
  let r = a.remoteState(); const entry = a.journal(r.state.lastJournal.path);
  assert.equal(entry.checkpoints.locallyTested, null);
  assert.equal(entry.checkpoints.remotelyPublished, a.snapshot().head);
  assert.equal(entry.checkpoints.approvedStableIntegration, null);
  assert.throws(() => a.markStable({}), /approvedBy/);
  const approval = { approvedBy: 'fixture reviewer', approvalReference: 'test-only approval', commit: a.snapshot().head, integrationBranch: 'main', recovery: 'fixture restore', tests: [] };
  assert.throws(() => a.markStable(approval), /Passing tests/);
  approval.tests = evidence.tests; a.markStable(approval);
  assert.equal(a.remoteState().state.stableIntegration.commit, approval.commit);
  r = a.remoteState();
  a.transition(r, { journal: Array.from({ length: 20 }, (_, n) => ({ sequence: n + 20, path: 'fixture', commit: approval.commit })) });
  a.record(evidence); assert.equal(a.remoteState().state.journal.length, 20);
  a.saveLocal('acknowledged.json', { head: a.snapshot().head, heads: {}, allHeads: {}, journalSequence: 1 });
  assert.equal(a.status().journalGap, true);
});
test('scope changes require ownership and stale owner release cannot clear a new acquisition', () => {
  const { a, b } = setup(); acquire(a); a.updateScope(['scripts', 'docs'], 'Updated scope');
  assert.deepEqual(a.remoteState().state.scope, ['scripts', 'docs']);
  assert.throws(() => b.updateScope(['other'], 'Invalid scope'), /NOT OWNER/);
  finish(a); a.release('all-work-secured'); acquire(b, 'feature/other');
  assert.throws(() => a.release('all-work-secured'), /NOT OWNER/);
  assert.equal(b.remoteState().state.owner, 'bob');
});
test('nested directories resolve the same clone identity and alternate push destinations are refused', () => {
  const { a, bare } = setup(); mkdirSync(join(a.root, 'nested'));
  const nested = new Coordination(join(a.root, 'nested'), { allowTestRemote: true });
  assert.equal(nested.meta, a.meta); assert.equal(nested.identity().cloneId, a.identity().cloneId);
  git(a.root, 'remote', 'set-url', '--push', 'origin', bare + '-other');
  assert.throws(() => new Coordination(a.root, { allowTestRemote: true }), /Different fetch and push/);
});
