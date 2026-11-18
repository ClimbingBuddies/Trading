import assert from 'node:assert/strict'
import {test} from 'node:test'
import {supportsConvergence} from '../lib/convergence-method.ts'
test('ASX and original convergence remain venue-specific, unknown versions fail closed',()=>{
  assert.equal(supportsConvergence('market-convergence-asx-v1','ASX'),true)
  assert.equal(supportsConvergence('market-convergence-v1','NYSE'),true)
  assert.equal(supportsConvergence('market-convergence-v1','ASX'),false)
  assert.equal(supportsConvergence('market-convergence-asx-v1','NYSE'),false)
  assert.equal(supportsConvergence('future-version','ASX'),false)
  assert.equal(supportsConvergence('market-convergence-v1',null),true)
  assert.equal(supportsConvergence('market-convergence-asx-v1',null),false)
})
