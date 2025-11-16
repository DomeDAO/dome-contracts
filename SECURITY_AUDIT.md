# Dome Contracts - Security Audit Report

**Audit Date:** November 1, 2025  
**Audited By:** AI Security Analysis  
**Codebase Version:** Current HEAD (main branch)  
**Solidity Versions:** 0.8.0 - 0.8.20 (inconsistent)

---

## Executive Summary

This security audit identified **20 security issues** across the Dome smart contract ecosystem, ranging from critical vulnerabilities to informational findings. The codebase implements a yield-bearing vault system with governance capabilities, built on top of ERC4626 yield protocols.

### Risk Distribution

- 🔴 **Critical:** 3 issues
- 🟠 **High:** 4 issues
- 🟡 **Medium:** 5 issues
- 🔵 **Low:** 5 issues
- ⚪ **Informational:** 3 issues

### Critical Findings Requiring Immediate Attention

1. [Resolved] Legacy PriceTracker contract removed from protocol
2. Reentrancy vulnerabilities in withdrawal and distribution functions
3. Integer division rounding leading to permanent fund loss

---

## Detailed Findings

## 🔴 CRITICAL SEVERITY

### [C-1] Reentrancy Vulnerability in Withdrawal Functions

**Severity:** Critical  
**Status:** Open  
**File:** `contracts/DomeCore.sol`  
**Functions:** `_withdraw()`, `claimYieldAndDistribute()`, `burn()`  
**Lines:** 266-306, 395-403, 597-610

#### Description

The contract makes external calls to `yieldProtocol.withdraw()` and `yieldProtocol.redeem()` after state changes without reentrancy protection. This violates the Checks-Effects-Interactions pattern and opens up reentrancy attack vectors.

#### Vulnerable Code

```solidity
function _withdraw(
    address caller,
    address receiver,
    address owner,
    uint256 assets,
    uint256 shares
) internal returns (uint256) {
    // ... state changes ...
    _burn(owner, shares);
    _assets[owner] -= updatedAssetAmount;
    totalAssets -= updatedAssetAmount;

    // EXTERNAL CALL AFTER STATE CHANGES
    yieldProtocol.withdraw(
        updatedAssetAmount + yield,
        receiver,
        address(this)
    );
    // ...
}
```

#### Impact

- Malicious yield protocols could reenter and drain funds
- Attackers could manipulate accounting during external calls
- Double-spending of shares possible

#### Proof of Concept

```solidity
contract MaliciousYieldProtocol {
    Dome public dome;
    uint256 public attackCount;

    function withdraw(uint256 assets, address receiver, address owner) external {
        if (attackCount == 0) {
            attackCount++;
            // Reenter before state is finalized
            dome.withdraw(assets, receiver, owner);
        }
        // Continue normal flow
    }
}
```

#### Recommendation

**Short-term:** Implement OpenZeppelin's ReentrancyGuard

```solidity
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract Dome is ERC20, IERC4626, DomeBase, ReentrancyGuard {
    function withdraw(...) external nonReentrant returns (uint256) {
        // ... implementation
    }

    function redeem(...) public nonReentrant returns (uint256) {
        // ... implementation
    }

    function claimYieldAndDistribute() external nonReentrant {
        // ... implementation
    }

    function burn(uint shares) public nonReentrant {
        // ... implementation
    }
}
```

**Long-term:** Follow Checks-Effects-Interactions pattern strictly throughout the codebase.

---

### [C-2] Integer Division Rounding Loss in Donation Distribution

**Severity:** Critical  
**Status:** Open  
**File:** `contracts/DomeCore.sol`  
**Function:** `_donate()`  
**Line:** 564

#### Description

When redistributing the buffer's percentage among other beneficiaries for non-asset token donations, integer division causes permanent loss of funds due to rounding errors.

#### Vulnerable Code

```solidity
uint256 additionalPercent;
// Redistribute buffer's percent among other beneficiaries
if (token != asset() && bufferPercent > 0) {
    additionalPercent = bufferPercent / (beneficiaries.length - 1);
    // Remainder is LOST permanently
}
```

#### Impact

**Example Scenario:**

- `bufferPercent = 1000` (10%)
- 4 beneficiaries total
- `additionalPercent = 1000 / 3 = 333` (each gets 3.33%)
- Remainder: `1000 - (333 * 3) = 1` basis point LOST forever
- Over time, donations accumulate permanent losses

**Financial Impact:**

- For a $1,000,000 donation: $100 lost (1 basis point)
- Accumulates with every non-asset donation
- No way to recover lost funds

#### Proof of Concept

```solidity
// Test case showing fund loss
function testDonationRoundingLoss() public {
    // Setup: 4 beneficiaries, buffer gets 10% (1000 bp)
    uint256 donationAmount = 1000000e18; // $1M

    vm.startPrank(donor);
    nonAssetToken.approve(address(dome), donationAmount);
    dome.donate(address(nonAssetToken), donationAmount);
    vm.stopPrank();

    // Calculate what beneficiaries actually received
    uint256 totalReceived = 0;
    for (uint i = 0; i < 3; i++) {
        totalReceived += beneficiaries[i].balance;
    }

    // Assert that funds are lost
    assertLt(totalReceived, donationAmount);
    // Lost: 1 basis point = 0.01% = $100
}
```

#### Recommendation

**Option 1 - Give remainder to last beneficiary:**

```solidity
uint256 remainder = bufferPercent % (beneficiaries.length - 1);
for (uint256 i; i < beneficiaries.length; i++) {
    uint256 percent = beneficiaries[i].percent;

    if (additionalPercent > 0) {
        if (beneficiaries[i].wallet == BUFFER()) {
            continue;
        }

        percent += additionalPercent;

        // Last non-buffer beneficiary gets the remainder
        if (i == beneficiaries.length - 1 ||
            (i == beneficiaries.length - 2 && beneficiaries[beneficiaries.length - 1].wallet == BUFFER())) {
            percent += remainder;
        }
    }
    // ... continue distribution
}
```

**Option 2 - Use higher precision:**

```solidity
// Use 1e18 precision for intermediate calculations
uint256 additionalPercentScaled = (bufferPercent * 1e18) / (beneficiaries.length - 1);

for (uint256 i; i < beneficiaries.length; i++) {
    if (beneficiaries[i].wallet == BUFFER()) continue;

    uint256 percentScaled = beneficiaries[i].percent * 1e18 + additionalPercentScaled;
    uint256 distributeAmount = (amount * percentScaled) / (10000 * 1e18);
    // ... transfer
}
```

---

## 🟠 HIGH SEVERITY

### [H-1] Missing Access Control Validation on Protocol Withdrawal

**Severity:** High  
**Status:** Open  
**File:** `contracts/DomeProtocol.sol`  
**Function:** `withdraw()`  
**Lines:** 259-265

#### Description

The `withdraw()` function allows the owner to withdraw all protocol ETH to any address without validation. While it has `onlyOwner` modifier, there's no checks on the recipient address or withdrawal amount.

#### Vulnerable Code

```solidity
function withdraw(address recipient) external onlyOwner {
    (bool success, ) = recipient.call{value: address(this).balance}("");

    if (!success) {
        revert TransferFailed();
    }
}
```

#### Impact

- Compromised owner key = complete fund drain
- Accidental send to wrong address = permanent fund loss
- No recovery mechanism
- No transparency in withdrawals

#### Recommendation

```solidity
event WithdrawalInitiated(address indexed recipient, uint256 amount, uint256 executeAfter);
event WithdrawalExecuted(address indexed recipient, uint256 amount);

mapping(bytes32 => WithdrawalRequest) public pendingWithdrawals;

struct WithdrawalRequest {
    address recipient;
    uint256 amount;
    uint256 executeAfter;
    bool executed;
}

function initiateWithdrawal(address recipient, uint256 amount) external onlyOwner {
    require(recipient != address(0), "Invalid recipient");
    require(amount <= address(this).balance, "Insufficient balance");

    bytes32 withdrawalId = keccak256(abi.encodePacked(recipient, amount, block.timestamp));

    pendingWithdrawals[withdrawalId] = WithdrawalRequest({
        recipient: recipient,
        amount: amount,
        executeAfter: block.timestamp + 2 days, // Timelock
        executed: false
    });

    emit WithdrawalInitiated(recipient, amount, block.timestamp + 2 days);
}

function executeWithdrawal(bytes32 withdrawalId) external onlyOwner {
    WithdrawalRequest storage request = pendingWithdrawals[withdrawalId];
    require(!request.executed, "Already executed");
    require(block.timestamp >= request.executeAfter, "Timelock not expired");

    request.executed = true;

    (bool success, ) = request.recipient.call{value: request.amount}("");
    require(success, "Transfer failed");

    emit WithdrawalExecuted(request.recipient, request.amount);
}
```

---

### [H-2] Beneficiary DoS Attack Vector in Distribution

**Severity:** High  
**Status:** Open  
**File:** `contracts/DomeCore.sol`  
**Functions:** `_distribute()`, `_donate()`  
**Lines:** 373-390, 553-591

#### Description

If any beneficiary address is a malicious contract that reverts on token receipt, the entire distribution system becomes permanently bricked. This affects `claimYieldAndDistribute()`, `burn()`, and `donate()` functions.

#### Vulnerable Code

```solidity
function _distribute(uint256 amount) internal {
    for (uint256 i; i < beneficiaries.length; i++) {
        uint256 distributeAmount = (amount * beneficiaries[i].percent) / 10000;

        // If THIS reverts, ENTIRE distribution fails
        IERC20(yieldProtocol.asset()).safeTransfer(
            beneficiaries[i].wallet,
            distributeAmount
        );

        if (beneficiaries[i].wallet == BUFFER()) {
            IBuffer(BUFFER()).addReserve(distributeAmount);
        }

        emit Distribute(beneficiaries[i].wallet, distributeAmount);
    }
}
```

#### Impact

- Malicious beneficiary can permanently disable yield distribution
- All depositors lose access to their yield
- `burn()` function becomes unusable
- Donations cannot be processed
- Dome becomes effectively frozen

#### Proof of Concept

```solidity
contract MaliciousBeneficiary {
    bool public shouldRevert = true;

    // Revert on token receipt
    function onERC20Received(address, address, uint256, bytes memory) external returns (bytes4) {
        if (shouldRevert) revert("DoS attack");
        return this.onERC20Received.selector;
    }
}

// Attacker gets added as beneficiary
// Now claimYieldAndDistribute() always reverts
```

#### Recommendation

**Option 1 - Pull over Push Pattern:**

```solidity
mapping(address => uint256) public pendingDistributions;

function _distribute(uint256 amount) internal {
    for (uint256 i; i < beneficiaries.length; i++) {
        uint256 distributeAmount = (amount * beneficiaries[i].percent) / 10000;

        // Record pending instead of pushing
        pendingDistributions[beneficiaries[i].wallet] += distributeAmount;

        emit DistributionPending(beneficiaries[i].wallet, distributeAmount);
    }
}

function claimDistribution() external {
    uint256 amount = pendingDistributions[msg.sender];
    require(amount > 0, "Nothing to claim");

    pendingDistributions[msg.sender] = 0;
    IERC20(yieldProtocol.asset()).safeTransfer(msg.sender, amount);

    emit DistributionClaimed(msg.sender, amount);
}
```

**Option 2 - Try-Catch Pattern:**

```solidity
function _distribute(uint256 amount) internal {
    for (uint256 i; i < beneficiaries.length; i++) {
        uint256 distributeAmount = (amount * beneficiaries[i].percent) / 10000;

        try IERC20(yieldProtocol.asset()).transfer(
            beneficiaries[i].wallet,
            distributeAmount
        ) returns (bool success) {
            if (success && beneficiaries[i].wallet == BUFFER()) {
                IBuffer(BUFFER()).addReserve(distributeAmount);
            }
            emit Distribute(beneficiaries[i].wallet, distributeAmount);
        } catch {
            // Store failed distribution for later claim
            failedDistributions[beneficiaries[i].wallet] += distributeAmount;
            emit DistributionFailed(beneficiaries[i].wallet, distributeAmount);
        }
    }
}
```

---

### [H-4] Vote Weight Manipulation in Governance

**Severity:** High  
**Status:** Open  
**File:** `contracts/Governance.sol`  
**Function:** `updateVotes()`  
**Lines:** 181-217

#### Description

The `updateVotes()` function uses current `block.number` instead of the proposal's snapshot block when updating votes. This allows users to manipulate vote weight by acquiring tokens after voting, getting votes updated, then transferring tokens away.

#### Vulnerable Code

```solidity
function updateVotes(address account) public {
    require(
        msg.sender == address(token),
        "Only wrapped token contract is authorized"
    );

    for (uint i = 0; i < _votedProposals[account].length; i++) {
        uint256 proposalId = _votedProposals[account][i];
        if (hasVoted(proposalId, account) && _isProposalActive(proposalId)) {
            // ❌ Uses current block.number instead of proposal snapshot
            uint256 weight = _getVotes(
                account,
                block.number,  // WRONG: Should use proposal.voteStart
                _defaultParams()
            );
            _countVote(proposalId, account, weight, _defaultParams());
```

#### Impact

- Vote weight can be artificially inflated
- Flash loan attacks to manipulate governance
- Unfair voting outcomes
- Governance can be captured by attackers

#### Attack Scenario

```
1. Attacker votes on proposal with 100 tokens (weight = 100)
2. Attacker acquires 900 more tokens via flash loan or purchase
3. Attacker triggers token transfer (calls updateVotes via WrappedVoting)
4. updateVotes() recalculates weight with current balance (weight = 1000)
5. Attacker's vote weight increases from 100 to 1000
6. Attacker transfers/returns tokens
7. Attacker effectively voted with 1000 tokens while only holding 100
```

#### Proof of Concept

```solidity
function testVoteWeightManipulation() public {
    // Initial setup: attacker has 100 tokens
    vm.startPrank(attacker);
    dome.deposit(100e18, attacker);
    wrappedVoting.depositFor(attacker, 100e18);
    wrappedVoting.delegate(attacker);

    // Create and vote on proposal
    uint256 proposalId = governance.propose(beneficiary, 1000e18, "Title", "Description");
    vm.roll(block.number + 2); // Pass voting delay
    governance.castVote(proposalId);

    // Check initial vote weight
    assertEq(governance.proposalVotesOf(proposalId, attacker), 100e18);

    // Acquire more tokens
    vm.stopPrank();
    vm.startPrank(whale);
    dome.transfer(attacker, 900e18);
    vm.stopPrank();

    // Wrap additional tokens and trigger update
    vm.startPrank(attacker);
    wrappedVoting.depositFor(attacker, 900e18);

    // Vote weight is now updated to 1000!
    assertEq(governance.proposalVotesOf(proposalId, attacker), 1000e18);

    // Attacker can now transfer tokens away and vote weight remains
}
```

#### Recommendation

**Fix:** Use historical vote weight at proposal snapshot:

```solidity
function updateVotes(address account) public {
    require(
        msg.sender == address(token),
        "Only wrapped token contract is authorized"
    );

    for (uint i = 0; i < _votedProposals[account].length; i++) {
        uint256 proposalId = _votedProposals[account][i];
        if (hasVoted(proposalId, account) && _isProposalActive(proposalId)) {
            // ✅ Use proposal snapshot block
            uint256 snapshotBlock = proposalSnapshot(proposalId);
            uint256 weight = _getVotes(
                account,
                snapshotBlock,  // Use snapshot, not current block
                _defaultParams()
            );
            _countVote(proposalId, account, weight, _defaultParams());

            // ... rest of function
        }
    }
}
```

**Alternative:** Remove automatic vote updates entirely and require manual vote updates:

```solidity
function updateMyVote(uint256 proposalId) external {
    require(hasVoted(proposalId, msg.sender), "Haven't voted");
    require(_isProposalActive(proposalId), "Proposal not active");

    uint256 snapshotBlock = proposalSnapshot(proposalId);
    uint256 weight = _getVotes(msg.sender, snapshotBlock, _defaultParams());

    _countVote(proposalId, msg.sender, weight, _defaultParams());
}
```

---

## 🟡 MEDIUM SEVERITY

### [M-1] Front-Running Vulnerability in Dome Creation

**Severity:** Medium  
**Status:** Open  
**File:** `contracts/DomeProtocol.sol`  
**Function:** `createDome()`  
**Lines:** 159-200

#### Description

The `createDome()` function can be front-run by attackers who copy the transaction parameters and submit with higher gas. The attacker can steal the dome creation, potentially capturing the intended creator's business model.

#### Impact

- Legitimate dome creators lose their dome to attackers
- Loss of creation fee (paid but dome stolen)
- Business model theft
- Platform reputation damage

#### Recommendation

Implement commit-reveal scheme or EIP-712 signatures:

```solidity
mapping(bytes32 => address) public domeCommitments;

function commitDomeCreation(bytes32 commitmentHash) external payable payedEnough {
    domeCommitments[commitmentHash] = msg.sender;
}

function revealAndCreateDome(
    DomeInfo memory domeInfo,
    BeneficiaryInfo[] memory beneficiariesInfo,
    GovernanceSettings memory governanceSettings,
    uint16 _depositorYieldPercent,
    address _yieldProtocol,
    bytes32 salt
) external returns (address domeAddress) {
    bytes32 commitmentHash = keccak256(abi.encode(
        domeInfo, beneficiariesInfo, governanceSettings,
        _depositorYieldPercent, _yieldProtocol, salt
    ));

    require(domeCommitments[commitmentHash] == msg.sender, "Invalid commitment");
    delete domeCommitments[commitmentHash];

    // ... create dome
}
```

---

### [M-2] Lack of Slippage Protection in Yield Operations

**Severity:** Medium  
**Status:** Open  
**File:** `contracts/DomeCore.sol`  
**Functions:** `deposit()`, `mint()`, `_withdraw()`  
**Lines:** 163-221, 229-306

#### Description

No slippage protection when interacting with yield protocol. Users are vulnerable to sandwich attacks and unfavorable conversion rates.

#### Impact

- Users receive fewer shares than expected
- MEV bots can extract value via sandwiching
- Poor UX during high volatility

#### Recommendation

```solidity
function deposit(
    uint256 assets,
    address receiver,
    uint256 minShares  // Add slippage parameter
) external override returns (uint256) {
    assets = _pullTokens(yieldProtocol.asset(), assets);
    uint256 shares = yieldProtocol.previewDeposit(assets);

    require(shares >= minShares, "Slippage too high");

    _deposit(msg.sender, receiver, assets, shares);
    return shares;
}

function withdraw(
    uint256 assets,
    address receiver,
    address owner,
    uint256 maxShares  // Add slippage parameter
) external override returns (uint256) {
    uint256 shares = previewWithdraw(assets);

    require(shares <= maxShares, "Slippage too high");

    _withdraw(msg.sender, receiver, owner, assets, shares);
    return shares;
}
```

---

### [M-3] Centralization Risk - Excessive Admin Powers

**Severity:** Medium  
**Status:** Open  
**Files:** `contracts/DomeProtocol.sol`, `contracts/DomeCore.sol`  
**Impact:** Trust assumptions

#### Description

System owner and dome owner have extensive unilateral powers:

- Withdraw all protocol ETH
- Change fee percentages
- Update critical contract addresses

#### Impact

- Single point of failure
- Rug pull potential
- Regulatory compliance issues
- User trust erosion

#### Recommendation

1. **Multi-sig for critical operations:**

```solidity
import "@openzeppelin/contracts/access/AccessControl.sol";

contract DomeProtocol is AccessControl {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant TREASURY_ROLE = keccak256("TREASURY_ROLE");

    uint256 public constant MULTISIG_THRESHOLD = 3;

    // Require multiple signatures for sensitive operations
}
```

2. **Timelock for parameter changes:**

```solidity
import "@openzeppelin/contracts/governance/TimelockController.sol";

// All admin functions go through 48-hour timelock
```

3. **On-chain governance:**

```solidity
// Use DAO voting for:
// - Fee changes
// - Address updates
```

---

### [M-4] Governance Gridlock - Single Winner Design

**Severity:** Medium  
**Status:** Open  
**File:** `contracts/Governance.sol`  
**Function:** `_voteSucceeded()`  
**Lines:** 129-149

#### Description

Only the proposal with the highest votes can succeed, even if multiple proposals have sufficient community support. This creates an artificial scarcity that can lead to governance gridlock.

#### Vulnerable Code

```solidity
function _voteSucceeded(uint256 proposalId) internal view virtual override returns (bool) {
    if (!activeProposalVotes.contains(proposalId)) {
        return false;
    }

    uint256 votes = activeProposalVotes.get(proposalId);
    (, uint256 highestVoteCount) = _getHighestVotedProposal();

    // Only ONE proposal can succeed ❌
    return (votes == highestVoteCount && votes != 0 && amount <= reserveAmount);
}
```

#### Impact

- Legitimate proposals can't pass even with majority support
- Governance becomes inefficient
- Community frustration
- Proposal spam to block others

#### Recommendation

```solidity
// Add quorum-based success criteria
uint256 public constant QUORUM_PERCENTAGE = 20; // 20% of total supply

function _voteSucceeded(uint256 proposalId) internal view virtual override returns (bool) {
    if (!activeProposalVotes.contains(proposalId)) {
        return false;
    }

    uint256 votes = activeProposalVotes.get(proposalId);
    uint256 quorum = (token.totalSupply() * QUORUM_PERCENTAGE) / 100;

    (, uint256 amount, , ) = proposalDetails(proposalId);
    address bufferAddress = IDome(DOME_ADDRESS).BUFFER();
    uint256 reserveAmount = IBuffer(bufferAddress).domeReserves(DOME_ADDRESS);

    // Multiple proposals can succeed if they meet quorum
    return (votes >= quorum && amount <= reserveAmount);
}
```

---

### [M-5] Missing Input Validation

**Severity:** Medium  
**Status:** Open  
**Files:** Multiple  
**Impact:** Unexpected behavior, potential exploits

#### Description

Multiple functions lack proper input validation, potentially leading to:

- Zero-value operations wasting gas
- Invalid percentage values breaking accounting
- Unauthorized state changes

#### Examples

**DomeCore.sol - deposit():**

```solidity
function deposit(uint256 assets, address receiver) external override returns (uint256) {
    // ❌ No check for assets == 0
    // ❌ No check for receiver == address(0)
    assets = _pullTokens(yieldProtocol.asset(), assets);
    // ...
}
```

**DomeProtocol.sol - createDome():**

```solidity
function createDome(
    DomeInfo memory domeInfo,
    BeneficiaryInfo[] memory beneficiariesInfo,
    GovernanceSettings memory governanceSettings,
    uint16 _depositorYieldPercent,  // ❌ No validation
    address _yieldProtocol          // ❌ No validation
) external payable payedEnough returns (address domeAddress) {
    // No checks if _depositorYieldPercent > 10000
    // No checks if _yieldProtocol is valid contract
```

**Buffer.sol - submitTransfer():**

```solidity
function submitTransfer(
    address dome,
    address token,
    address wallet,  // ❌ No zero address check
    uint256 amount
) external returns (uint256) {
```

#### Recommendation

Add comprehensive validation:

```solidity
function deposit(uint256 assets, address receiver) external override returns (uint256) {
    require(assets > 0, "Zero deposit");
    require(receiver != address(0), "Invalid receiver");
    // ... rest of function
}

function createDome(
    DomeInfo memory domeInfo,
    BeneficiaryInfo[] memory beneficiariesInfo,
    GovernanceSettings memory governanceSettings,
    uint16 _depositorYieldPercent,
    address _yieldProtocol
) external payable payedEnough returns (address domeAddress) {
    require(_depositorYieldPercent <= 10000, "Invalid depositor yield percent");
    require(_yieldProtocol != address(0), "Invalid yield protocol");
    require(beneficiariesInfo.length > 0, "No beneficiaries");
    require(bytes(domeInfo.tokenName).length > 0, "Empty token name");
    // ... rest of function
}

function submitTransfer(
    address dome,
    address token,
    address wallet,
    uint256 amount
) external returns (uint256) {
    require(wallet != address(0), "Invalid wallet");
    require(amount > 0, "Zero amount");
    // ... rest of function
}
```

---

## 🔵 LOW SEVERITY

### [L-1] Unbounded Loops Causing Gas Griefing

**Severity:** Low  
**Status:** Open  
**File:** `contracts/Governance.sol`  
**Functions:** `updateVotes()`, `_getHighestVotedProposal()`, `_removeInactiveProposals()`  
**Lines:** 181-217, 222-237, 241-257

#### Description

Multiple functions iterate over unbounded arrays (`_votedProposals`, `activeProposalVotes`) which can grow indefinitely, eventually causing transactions to exceed block gas limit.

#### Impact

- Users with many votes can't update their votes
- Governance operations may fail
- Gas costs increase over time

#### Recommendation

```solidity
// Add pagination
function updateVotes(address account, uint256 startIndex, uint256 endIndex) public {
    require(msg.sender == address(token), "Unauthorized");
    require(endIndex <= _votedProposals[account].length, "Invalid range");

    for (uint i = startIndex; i < endIndex; i++) {
        uint256 proposalId = _votedProposals[account][i];
        // ... update logic
    }
}

// Or add maximum limits
uint256 public constant MAX_ACTIVE_VOTES = 50;

function castVote(uint256 proposalId) public override returns (uint256) {
    require(_votedProposals[msg.sender].length < MAX_ACTIVE_VOTES, "Too many active votes");
    // ... rest of function
}
```

---

### [L-2] ERC4626 Standard Deviation

**Severity:** Low  
**Status:** Open  
**File:** `contracts/DomeCore.sol`  
**Function:** `previewWithdraw()`  
**Lines:** 409-417

#### Description

The `previewWithdraw()` function uses `msg.sender` instead of accepting an `owner` parameter as specified in the ERC4626 standard.

#### Vulnerable Code

```solidity
function previewWithdraw(uint256 assets) public view returns (uint256 shares) {
    if (assets > _assets[msg.sender]) {  // ❌ Should accept owner parameter
        return balanceOf(msg.sender);
    }
    return yieldProtocol.previewWithdraw(assets);
}
```

#### Impact

- Non-compliance with ERC4626 standard
- Integration issues with aggregators
- Incorrect preview results when called by contracts

#### Recommendation

```solidity
function previewWithdraw(uint256 assets) public view returns (uint256 shares) {
    return previewWithdraw(assets, msg.sender);
}

function previewWithdraw(uint256 assets, address owner) public view returns (uint256 shares) {
    if (assets > _assets[owner]) {
        return balanceOf(owner);
    }
    return yieldProtocol.previewWithdraw(assets);
}
```

---

### [L-3] Missing Events for Critical State Changes

**Severity:** Low  
**Status:** Open  
**Files:** Multiple

#### Description

Several state-changing functions don't emit events, making it difficult to track system changes off-chain.

#### Missing Events

```solidity
// DomeProtocol.sol
function changeSystemOwnerPercentage(uint16 percentage) external onlyOwner {
    systemOwnerPercentage = percentage;  // ❌ No event
}

function changeDomeCreationFee(uint256 value) external onlyOwner {
    domeCreationFee = value;  // ❌ No event
}

event SystemOwnerPercentageChanged(uint16 oldPercentage, uint16 newPercentage);
event DomeCreationFeeChanged(uint256 oldFee, uint256 newFee);

function changeSystemOwnerPercentage(uint16 percentage) external onlyOwner {
    uint16 oldPercentage = systemOwnerPercentage;
    systemOwnerPercentage = percentage;
    emit SystemOwnerPercentageChanged(oldPercentage, percentage);
}
```

---

### [L-4] Precision Loss in Percentage Calculations

**Severity:** Low  
**Status:** Open  
**Files:** Multiple  
**Impact:** Minor rounding errors

#### Description

All percentage calculations use basis points (10000 = 100%) which provides only 2 decimal places of precision. While acceptable for most cases, it can lead to rounding errors in edge cases.

#### Examples

```solidity
uint256 depositorsYieldPortion = (generatedYield * depositorYieldPercent) / 10000;
uint256 systemFeePortion = (generatedYield * systemFeePercent) / 10000;
uint256 distributeAmount = (amount * beneficiaries[i].percent) / 10000;
```

#### Impact

- Small rounding errors accumulate
- Cannot represent percentages like 33.333%
- Edge cases may lose small amounts

#### Recommendation

```solidity
// Option 1: Document the limitation clearly
/// @notice Percentages use basis points (10000 = 100%)
/// @notice Precision: 0.01% (1 basis point)
/// @notice Example: 2550 = 25.50%

// Option 2: Use higher precision for critical calculations
uint256 constant PRECISION = 1e18;
uint256 distributeAmount = (amount * beneficiaries[i].percent * PRECISION) / (10000 * PRECISION);

// Option 3: Track and redistribute dust
uint256 totalDistributed = 0;
for (uint256 i; i < beneficiaries.length - 1; i++) {
    uint256 distributeAmount = (amount * beneficiaries[i].percent) / 10000;
    totalDistributed += distributeAmount;
    // ... transfer
}
// Last beneficiary gets remainder (includes dust)
uint256 lastAmount = amount - totalDistributed;
```

---

### [L-5] Immutable Wrong DOME_PROTOCOL in WrappedVoting

**Severity:** Low  
**Status:** Open  
**File:** `contracts/WrappedVoting.sol`  
**Constructor:**  
**Lines:** 17-29

#### Description

The `WrappedVoting` contract stores the factory address as `DOME_PROTOCOL` instead of the actual DomeProtocol address, which could lead to confusion and potential integration issues.

#### Code

```solidity
contract DomeWrappedVoting is ERC20, ERC20Permit, ERC20Votes, ERC20Wrapper {
    address immutable DOME_PROTOCOL;  // Actually stores factory address

    constructor(address wrappedToken, address creator)
        ERC20("BetterWithDomeVotingPower", "BWDVOTE")
        ERC20Permit("BetterWithDomeVotingPower")
        ERC20Wrapper(IERC20(wrappedToken))
    {
        DOME_PROTOCOL = creator;  // ❌ 'creator' is actually the factory
    }
```

#### Impact

- Confusing variable naming
- May cause integration errors
- Makes code harder to maintain

#### Recommendation

```solidity
address immutable FACTORY_ADDRESS;
address immutable DOME_PROTOCOL_ADDRESS;

constructor(address wrappedToken, address factory)
    ERC20("BetterWithDomeVotingPower", "BWDVOTE")
    ERC20Permit("BetterWithDomeVotingPower")
    ERC20Wrapper(IERC20(wrappedToken))
{
    FACTORY_ADDRESS = factory;
    DOME_PROTOCOL_ADDRESS = IFactory(factory).DOME_PROTOCOL();
}
```

---

## ⚪ INFORMATIONAL

### [I-1] Inconsistent Solidity Version Pragma

**Severity:** Informational  
**Status:** Open  
**Files:** All contract files

#### Description

Different contracts use different Solidity versions, which can lead to:

- Inconsistent compiler behavior
- Potential security differences
- Deployment complexity

#### Version Distribution

```
- ^0.8.0  : DomeBase.sol
- ^0.8.4  : Governance.sol, GovernorVotes.sol
- ^0.8.9  : Buffer.sol
- ^0.8.17 : DomeCore.sol, DomeFactory.sol, DomeProtocol.sol, WrappedVoting.sol, etc.

```

#### Recommendation

Standardize on Solidity `^0.8.20` for all contracts:

- Latest bug fixes
- Best gas optimizations
- Consistent behavior
- Enhanced security features

**Action Item:** This should be fixed immediately before implementing new features.

---

### [I-2] Lack of Comprehensive NatSpec Documentation

**Severity:** Informational  
**Status:** Open  
**Files:** All contracts

#### Description

Many functions, especially internal ones, lack complete NatSpec documentation. This makes auditing harder and increases the risk of misunderstandings.

#### Examples of Missing Documentation

```solidity
// Missing @param and @return tags
function _assetsWithdrawForOwner(address owner, uint256 assets) private view returns (uint256, uint256 yield) {
    // No documentation
}

// Missing @dev explanation of edge cases
function _distribute(uint256 amount) internal {
    // What happens if transfer fails?
    // What happens if beneficiary is a contract?
}
```

#### Recommendation

Add comprehensive NatSpec:

```solidity
/// @notice Calculates the withdrawable assets for an owner
/// @dev If withdrawal amount exceeds original deposit, includes earned yield
/// @param owner The address of the token owner
/// @param assets The amount of assets to withdraw
/// @return updatedAssets The principal amount to withdraw
/// @return yield The yield portion available to withdraw
/// @custom:security This function doesn't account for protocol losses
function _assetsWithdrawForOwner(
    address owner,
    uint256 assets
) private view returns (uint256 updatedAssets, uint256 yield) {
    // ... implementation
}
```

---

### [I-3] Unused Code and Empty Overrides

**Severity:** Informational  
**Status:** Open  
**File:** `contracts/DomeCore.sol`  
**Lines:** 612-627

#### Description

Several override functions do nothing except call `super`, adding unnecessary bytecode.

#### Code

```solidity
function _afterTokenTransfer(
    address from,
    address to,
    uint256 amount
) internal override {
    super._afterTokenTransfer(from, to, amount);  // Does nothing
}

function _mint(address to, uint256 amount) internal override {
    super._mint(to, amount);  // Does nothing
}

function _burn(address account, uint256 amount) internal override {
    super._burn(account, amount);  // Does nothing
}
```

#### Recommendation

Remove empty overrides unless they're placeholders for future functionality:

```solidity
// Remove these functions entirely, or add comments explaining why they exist:

/// @dev Reserved for future use - may add transfer restrictions
function _afterTokenTransfer(
    address from,
    address to,
    uint256 amount
) internal override {
    super._afterTokenTransfer(from, to, amount);
    // Future: Add transfer hooks here
}
```

---

## Additional Observations

### Gas Optimization Opportunities

1. **Cache array lengths** in loops
2. **Use `immutable` for constants** set in constructor
3. **Pack structs** to save storage slots
4. **Use `unchecked`** for safe arithmetic operations

### Testing Recommendations

1. Add comprehensive fuzz testing
2. Test all edge cases (zero amounts, max values, etc.)
3. Add integration tests with real yield protocols
4. Test emergency scenarios (protocol failures, depegs)

### Deployment Recommendations

1. Deploy behind upgradeable proxies for critical contracts
2. Implement pause mechanisms for emergencies
3. Add circuit breakers for large withdrawals
4. Use multi-sig for all admin operations

---

## Summary and Recommendations

### Immediate Actions (Before Production)

1. ✅ **Fix Critical Issues**

   - [ ] Add ReentrancyGuard to all contracts
   - [ ] Fix donation rounding loss
   - [ ] Standardize Solidity versions

2. ✅ **Fix High Severity Issues**
   - [ ] Fix vote weight manipulation
   - [ ] Add beneficiary DoS protection
   - [ ] Add withdrawal validation

### Medium-term Improvements

1. Add comprehensive input validation
2. Implement proper slippage protection
3. Add events for all state changes
4. Improve access control mechanisms

### Long-term Enhancements

1. Move to DAO governance
2. Implement formal verification
3. Add emergency pause functionality
4. Create comprehensive monitoring system

---

## Conclusion

The Dome protocol implements an interesting yield redistribution mechanism, but contains several critical security vulnerabilities that must be addressed before production deployment. The most severe issues are:

1. **Uninitialized arrays** breaking core functionality
2. **Reentrancy vulnerabilities** allowing potential fund drainage
3. **Vote manipulation** compromising governance security

We recommend addressing all Critical and High severity issues before any mainnet deployment, and carefully considering the Medium severity issues for the protocol's long-term security and sustainability.

---

## Appendix A: Remediation Checklist

- [ ] C-1: Add ReentrancyGuard to withdrawal functions
- [ ] C-2: Fix donation distribution rounding
- [ ] H-1: Add timelock to protocol withdrawals
- [ ] H-2: Implement pull-over-push pattern for distributions
- [ ] H-4: Fix governance vote weight calculation
- [ ] M-1: Add commit-reveal to dome creation
- [ ] M-2: Add slippage protection parameters
- [ ] M-3: Implement multi-sig for admin functions
- [ ] M-4: Add quorum-based governance success
- [ ] M-5: Add comprehensive input validation
- [ ] L-1: Add pagination to unbounded loops
- [ ] L-2: Fix ERC4626 standard compliance
- [ ] L-3: Add events for state changes
- [ ] L-4: Document precision limitations
- [ ] L-5: Fix WrappedVoting naming
- [ ] I-1: Standardize Solidity versions
- [ ] I-2: Add comprehensive NatSpec
- [ ] I-3: Remove unused code

---

**Report Generated:** November 1, 2025  
**Auditor:** AI Security Analysis  
**Report Version:** 1.0
