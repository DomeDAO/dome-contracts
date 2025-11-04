# Security Fixes Implementation Checklist

This checklist tracks the implementation status of security fixes identified in the security audit.

**Last Updated:** November 1, 2025  
**Total Issues:** 20  
**Completed:** 1

---

## 🔴 CRITICAL SEVERITY (3 issues)

### [C-1] Reentrancy Vulnerability in Withdrawal Functions

- [ ] Import `ReentrancyGuard` from OpenZeppelin
- [ ] Add `ReentrancyGuard` to Dome contract inheritance
- [ ] Add `nonReentrant` modifier to:
  - [ ] `deposit()`
  - [ ] `mint()`
  - [ ] `withdraw()`
  - [ ] `redeem()`
  - [ ] `claimYieldAndDistribute()`
  - [ ] `burn()`
  - [ ] `claim()`
- [ ] Test reentrancy protection
- [ ] Update gas benchmarks

**Files to modify:**

- `contracts/DomeCore.sol`

---

### [C-2] Integer Division Rounding Loss in Donation Distribution

- [ ] Implement remainder distribution logic
- [ ] Add tests for edge cases (various beneficiary counts)
- [ ] Verify no funds are lost
- [ ] Document precision handling

**Files to modify:**

- `contracts/DomeCore.sol` (line 564)

**Implementation options:**

- [ ] Option 1: Give remainder to last beneficiary
- [ ] Option 2: Use higher precision calculation

---

## 🟠 HIGH SEVERITY (4 issues)

### [H-1] Missing Access Control Validation on Protocol Withdrawal

- [ ] Implement timelock mechanism
- [ ] Add withdrawal request struct
- [ ] Add `initiateWithdrawal()` function
- [ ] Add `executeWithdrawal()` function
- [ ] Add address validation
- [ ] Add events for transparency
- [ ] Test timelock functionality

**Files to modify:**

- `contracts/DomeProtocol.sol` (lines 259-265)

---

### [H-2] Beneficiary DoS Attack Vector in Distribution

- [ ] Choose implementation strategy (pull vs try-catch)
- [ ] Implement pull-over-push pattern OR try-catch
- [ ] Add `claimDistribution()` function (if pull pattern)
- [ ] Add `pendingDistributions` mapping (if pull pattern)
- [ ] Add `failedDistributions` mapping (if try-catch)
- [ ] Add comprehensive tests
- [ ] Test malicious beneficiary scenarios

**Files to modify:**

- `contracts/DomeCore.sol` (lines 373-390, 553-591)

---

### [H-3] Reward System Double-Spend Vulnerability

- [ ] Design checkpoint system
- [ ] Implement `RewardCheckpoint` struct
- [ ] Add checkpoint array
- [ ] Implement `updateRewards()` function
- [ ] Modify `claim()` to use checkpoints
- [ ] Add `lastClaimCheckpoint` mapping
- [ ] Test depeg scenarios
- [ ] Test fair distribution

**Files to modify:**

- `contracts/DomeCore.sol` (lines 508-530)

---

### [H-4] Vote Weight Manipulation in Governance

- [ ] Fix `updateVotes()` to use snapshot block
- [ ] Use `proposalSnapshot()` instead of `block.number`
- [ ] Add tests for vote weight immutability
- [ ] Test flash loan attack scenarios
- [ ] Document snapshot mechanics

**Files to modify:**

- `contracts/Governance.sol` (lines 181-217)

---

## 🟡 MEDIUM SEVERITY (5 issues)

### [M-1] Front-Running Vulnerability in Dome Creation

- [ ] Design commit-reveal scheme
- [ ] Add `commitDomeCreation()` function
- [ ] Add `revealAndCreateDome()` function
- [ ] Add commitments mapping
- [ ] Add salt parameter
- [ ] Test front-running protection
- [ ] Update documentation

**Files to modify:**

- `contracts/DomeProtocol.sol` (lines 159-200)

---

### [M-2] Lack of Slippage Protection in Yield Operations

- [ ] Add `minShares` parameter to `deposit()`
- [ ] Add `maxShares` parameter to `withdraw()`
- [ ] Add `minAssets` parameter to `redeem()`
- [ ] Add `maxAssets` parameter to `mint()`
- [ ] Add slippage validation
- [ ] Update interface documentation
- [ ] Test slippage protection

**Files to modify:**

- `contracts/DomeCore.sol` (multiple functions)

---

### [M-3] Centralization Risk - Excessive Admin Powers

- [ ] Evaluate multi-sig requirements
- [ ] Implement `AccessControl` roles
- [ ] Add timelock for parameter changes
- [ ] Document admin powers
- [ ] Consider DAO governance transition plan

**Files to modify:**

- `contracts/DomeProtocol.sol`
- `contracts/DomeCore.sol`

**Options:**

- [ ] Implement multi-sig (Gnosis Safe)
- [ ] Add OpenZeppelin TimelockController
- [ ] Design DAO governance structure

---

### [M-4] Governance Gridlock - Single Winner Design

- [ ] Add quorum-based success criteria
- [ ] Define `QUORUM_PERCENTAGE` constant
- [ ] Modify `_voteSucceeded()` logic
- [ ] Allow multiple proposals to succeed
- [ ] Test concurrent proposal scenarios
- [ ] Document new governance rules

**Files to modify:**

- `contracts/Governance.sol` (lines 129-149)

---

### [M-5] Missing Input Validation

- [ ] Add zero amount checks to `deposit()`
- [ ] Add zero amount checks to `withdraw()`
- [ ] Add zero address checks to `deposit()`
- [ ] Add zero address checks to `withdraw()`
- [ ] Validate `_depositorYieldPercent <= 10000`
- [ ] Validate `_yieldProtocol != address(0)`
- [ ] Validate beneficiaries array not empty
- [ ] Add comprehensive error messages
- [ ] Test edge cases

**Files to modify:**

- `contracts/DomeCore.sol`
- `contracts/DomeProtocol.sol`
- `contracts/Buffer.sol`

---

## 🔵 LOW SEVERITY (5 issues)

### [L-1] Unbounded Loops Causing Gas Griefing

- [ ] Add pagination to `updateVotes()`
- [ ] Add `MAX_ACTIVE_VOTES` constant
- [ ] Implement range parameters
- [ ] Add pagination to `_getHighestVotedProposal()`
- [ ] Test gas limits
- [ ] Document limitations

**Files to modify:**

- `contracts/Governance.sol` (multiple functions)

---

### [L-2] ERC4626 Standard Deviation

- [ ] Add `owner` parameter to `previewWithdraw()`
- [ ] Create overloaded function
- [ ] Maintain backward compatibility
- [ ] Update tests
- [ ] Verify ERC4626 compliance

**Files to modify:**

- `contracts/DomeCore.sol` (lines 409-417)

---

### [L-3] Missing Events for Critical State Changes

- [ ] Add `SystemOwnerPercentageChanged` event
- [ ] Add `DomeCreationFeeChanged` event
- [ ] Add `RewardsPaused` event
- [ ] Add `RewardsUnpaused` event
- [ ] Emit events in all functions
- [ ] Update off-chain monitoring
- [ ] Add event indexing

**Files to modify:**

- `contracts/DomeProtocol.sol`
- `contracts/DomeCore.sol`

---

### [L-4] Precision Loss in Percentage Calculations

- [ ] Document precision limitations
- [ ] Add NatSpec comments about basis points
- [ ] Consider higher precision for critical paths
- [ ] Implement dust redistribution (optional)
- [ ] Add precision tests

**Files to modify:**

- All contracts using percentage calculations

---

### [L-5] Immutable Wrong DOME_PROTOCOL in WrappedVoting

- [ ] Rename `DOME_PROTOCOL` to `FACTORY_ADDRESS`
- [ ] Add `DOME_PROTOCOL_ADDRESS` variable
- [ ] Update constructor logic
- [ ] Update all references
- [ ] Test integration

**Files to modify:**

- `contracts/WrappedVoting.sol`

---

## ⚪ INFORMATIONAL (3 issues)

### [I-1] Inconsistent Solidity Version Pragma

- [x] Standardize all contracts to ^0.8.20
- [x] Update DomeBase.sol
- [x] Update Governor.sol
- [x] Update GovernorVotes.sol
- [x] Update IGovernor.sol
- [x] Update Buffer.sol
- [x] Update DomeCore.sol
- [x] Update DomeFactory.sol
- [x] Update DomeProtocol.sol
- [x] Update WrappedVoting.sol
- [x] Update GovernanceFactory.sol
- [x] Update WrappedVotingFactory.sol
- [x] Update Governance.sol
- [x] Update FakeERC20.sol
- [x] Update FakeERC4626.sol
- [ ] Verify compilation
- [ ] Run full test suite

**Status:** ✅ COMPLETED (See `VERSION_UPDATE_SUMMARY.md`)

---

### [I-2] Lack of Comprehensive NatSpec Documentation

- [ ] Add NatSpec to all public functions
- [ ] Add NatSpec to all external functions
- [ ] Add NatSpec to internal functions
- [ ] Document parameters
- [ ] Document return values
- [ ] Document edge cases
- [ ] Add security notes
- [ ] Generate documentation

**Estimated effort:** 2-3 days

---

### [I-3] Unused Code and Empty Overrides

- [ ] Review all override functions
- [ ] Remove unnecessary overrides
- [ ] Add comments to placeholder functions
- [ ] Clean up dead code
- [ ] Optimize bytecode

**Files to review:**

- `contracts/DomeCore.sol` (lines 612-627)

---

## Implementation Priority

### Week 1 - CRITICAL FIXES (Must have before any deployment)

1. **[C-3]** Fix uninitialized arrays (breaks contract completely)
2. **[C-1]** Add reentrancy guards (high risk)
3. **[C-2]** Fix donation rounding (fund loss)

### Week 2 - HIGH SEVERITY (Required for safe operation)

1. **[H-4]** Fix vote weight manipulation
2. **[H-2]** Fix beneficiary DoS
3. **[H-3]** Fix reward accounting
4. **[H-1]** Add withdrawal protections

### Week 3 - MEDIUM SEVERITY (Important for production)

1. **[M-5]** Add input validation
2. **[M-2]** Add slippage protection
3. **[M-4]** Fix governance gridlock
4. **[M-1]** Add front-run protection
5. **[M-3]** Improve access control

### Week 4 - LOW & INFORMATIONAL (Quality improvements)

1. **[L-1, L-2, L-3, L-4, L-5]** All low severity
2. **[I-2, I-3]** Documentation and cleanup
3. External security audit
4. Final testing

---

## Testing Requirements Per Fix

Each fix should include:

- [ ] Unit tests covering normal operation
- [ ] Unit tests covering edge cases
- [ ] Unit tests covering attack scenarios
- [ ] Integration tests
- [ ] Gas benchmarks
- [ ] Documentation updates

---

## Sign-off Requirements

Before marking any fix as complete:

1. [ ] Code implemented and reviewed
2. [ ] Tests written and passing
3. [ ] Gas impact assessed
4. [ ] Documentation updated
5. [ ] Peer review completed
6. [ ] Security review completed (for Critical/High)

---

## Progress Tracking

- **Total Issues:** 20
- **Completed:** 1 (5%)
- **In Progress:** 0 (0%)
- **Not Started:** 19 (95%)

**Target Completion Date:** TBD  
**Estimated Total Effort:** 4-6 weeks  
**Team Size Required:** 2-3 developers + 1 security reviewer

---

## Notes

- Update this checklist as work progresses
- Link pull requests to specific checklist items
- Track time spent on each fix for future estimation
- Document any blockers or dependencies
- Review and update priorities weekly

---

**Maintained By:** Development Team  
**Last Review:** November 1, 2025  
**Next Review:** TBD
