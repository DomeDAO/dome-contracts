import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

import {
  HyperliquidBridgeAdapter,
  MockCoreWriter,
  MockCoreDepositWallet,
  MockHyperliquidVault,
  MockUSDC,
} from "../typechain-types";

const toUSDC = (value: string) => ethers.parseUnits(value, 6);
const ACTION_VERSION = 0x01;
const VAULT_TRANSFER_ACTION_ID = 0x000002;
const UINT64_MAX = (1n << 64n) - 1n;
const DESTINATION_PERPS = 0;
const NEW_CORE_ACCOUNT_FEE = toUSDC("1"); // 1 USDC fee on first deposit
const MIN_VAULT_DEPOSIT = toUSDC("5"); // 5 USDC minimum for vault deposits
const MIN_FIRST_DEPOSIT = toUSDC("6"); // 6 USDC minimum for first deposit (5 + 1 fee)

const encodeVaultTransferAction = (vault: string, isDeposit: boolean, amount: bigint) => {
  // Hyperliquid expects: version (1) + actionId (3) + ABI-encoded(vault, isDeposit, usd)
  // Per https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/hyperevm/interacting-with-hypercore
  // Vault transfer usd parameter uses 6 decimals (perp format, not wei)
  const versionByte = ethers.toBeHex(ACTION_VERSION, 1);
  const actionIdBytes = ethers.toBeHex(VAULT_TRANSFER_ACTION_ID, 3);
  
  // ABI encode the action data (each value padded to 32 bytes)
  const actionData = ethers.AbiCoder.defaultAbiCoder().encode(
    ["address", "bool", "uint64"],
    [vault, isDeposit, amount]
  );
  
  return ethers.concat([versionByte, actionIdBytes, actionData]);
};

describe("HyperliquidBridgeAdapter", () => {
  async function fixture() {
    const [deployer, strategy, stranger] = await ethers.getSigners();

    const MockUSDCFactory = await ethers.getContractFactory("MockUSDC");
    const asset = (await MockUSDCFactory.deploy()) as MockUSDC;
    await asset.waitForDeployment();

    const MockHyperliquidVaultFactory = await ethers.getContractFactory("MockHyperliquidVault");
    const mockHyper = (await MockHyperliquidVaultFactory.deploy(
      await asset.getAddress()
    )) as MockHyperliquidVault;
    await mockHyper.waitForDeployment();

    const MockCoreWriterFactory = await ethers.getContractFactory("MockCoreWriter");
    const coreWriter = (await MockCoreWriterFactory.deploy()) as MockCoreWriter;
    await coreWriter.waitForDeployment();

    const MockCoreDepositWalletFactory = await ethers.getContractFactory("MockCoreDepositWallet");
    const coreDepositWallet = (await MockCoreDepositWalletFactory.deploy(
      await asset.getAddress()
    )) as MockCoreDepositWallet;
    await coreDepositWallet.waitForDeployment();

    const BridgeFactory = await ethers.getContractFactory("HyperliquidBridgeAdapter");
    const bridge = (await BridgeFactory.deploy(
      await asset.getAddress(),
      await mockHyper.getAddress(),
      await coreWriter.getAddress(),
      await coreDepositWallet.getAddress()
    )) as HyperliquidBridgeAdapter;
    await bridge.waitForDeployment();

    return { deployer, strategy, stranger, asset, mockHyper, bridge, coreWriter, coreDepositWallet };
  }

  describe("Constructor", () => {
    it("reverts when asset is zero address", async () => {
      const [deployer] = await ethers.getSigners();
      const MockCoreWriterFactory = await ethers.getContractFactory("MockCoreWriter");
      const coreWriter = await MockCoreWriterFactory.deploy();
      const MockCoreDepositWalletFactory = await ethers.getContractFactory("MockCoreDepositWallet");
      const MockUSDCFactory = await ethers.getContractFactory("MockUSDC");
      const asset = await MockUSDCFactory.deploy();
      const coreDepositWallet = await MockCoreDepositWalletFactory.deploy(await asset.getAddress());

      const BridgeFactory = await ethers.getContractFactory("HyperliquidBridgeAdapter");
      await expect(
        BridgeFactory.deploy(
          ethers.ZeroAddress,
          deployer.address,
          await coreWriter.getAddress(),
          await coreDepositWallet.getAddress()
        )
      ).to.be.revertedWithCustomError(BridgeFactory, "ZeroAddress");
    });

    it("reverts when hyperVault is zero address", async () => {
      const MockCoreWriterFactory = await ethers.getContractFactory("MockCoreWriter");
      const coreWriter = await MockCoreWriterFactory.deploy();
      const MockCoreDepositWalletFactory = await ethers.getContractFactory("MockCoreDepositWallet");
      const MockUSDCFactory = await ethers.getContractFactory("MockUSDC");
      const asset = await MockUSDCFactory.deploy();
      const coreDepositWallet = await MockCoreDepositWalletFactory.deploy(await asset.getAddress());

      const BridgeFactory = await ethers.getContractFactory("HyperliquidBridgeAdapter");
      await expect(
        BridgeFactory.deploy(
          await asset.getAddress(),
          ethers.ZeroAddress,
          await coreWriter.getAddress(),
          await coreDepositWallet.getAddress()
        )
      ).to.be.revertedWithCustomError(BridgeFactory, "ZeroAddress");
    });

    it("reverts when coreWriter is zero address", async () => {
      const [deployer] = await ethers.getSigners();
      const MockCoreDepositWalletFactory = await ethers.getContractFactory("MockCoreDepositWallet");
      const MockUSDCFactory = await ethers.getContractFactory("MockUSDC");
      const asset = await MockUSDCFactory.deploy();
      const coreDepositWallet = await MockCoreDepositWalletFactory.deploy(await asset.getAddress());

      const BridgeFactory = await ethers.getContractFactory("HyperliquidBridgeAdapter");
      await expect(
        BridgeFactory.deploy(
          await asset.getAddress(),
          deployer.address,
          ethers.ZeroAddress,
          await coreDepositWallet.getAddress()
        )
      ).to.be.revertedWithCustomError(BridgeFactory, "ZeroAddress");
    });

    it("reverts when coreDepositWallet is zero address", async () => {
      const [deployer] = await ethers.getSigners();
      const MockCoreWriterFactory = await ethers.getContractFactory("MockCoreWriter");
      const coreWriter = await MockCoreWriterFactory.deploy();
      const MockUSDCFactory = await ethers.getContractFactory("MockUSDC");
      const asset = await MockUSDCFactory.deploy();

      const BridgeFactory = await ethers.getContractFactory("HyperliquidBridgeAdapter");
      await expect(
        BridgeFactory.deploy(
          await asset.getAddress(),
          deployer.address,
          await coreWriter.getAddress(),
          ethers.ZeroAddress
        )
      ).to.be.revertedWithCustomError(BridgeFactory, "ZeroAddress");
    });

    it("sets immutable variables correctly", async () => {
      const { bridge, asset, mockHyper, coreWriter, coreDepositWallet } = await loadFixture(fixture);
      expect(await bridge.asset()).to.equal(await asset.getAddress());
      expect(await bridge.hyperVault()).to.equal(await mockHyper.getAddress());
      expect(await bridge.coreWriter()).to.equal(await coreWriter.getAddress());
      expect(await bridge.coreDepositWallet()).to.equal(await coreDepositWallet.getAddress());
    });
  });

  describe("Authorization", () => {
    it("allows the owner to authorize strategies", async () => {
      const { bridge, strategy, stranger } = await loadFixture(fixture);
      await expect(
        bridge.connect(stranger).setAuthorizedStrategy(strategy.address, true)
      ).to.be.revertedWithCustomError(bridge, "OwnableUnauthorizedAccount");

      await bridge.setAuthorizedStrategy(strategy.address, true);
      expect(await bridge.authorizedStrategy(strategy.address)).to.equal(true);
    });

    it("reverts when authorizing the zero address", async () => {
      const { bridge } = await loadFixture(fixture);
      await expect(bridge.setAuthorizedStrategy(ethers.ZeroAddress, true)).to.be.revertedWithCustomError(
        bridge,
        "ZeroAddress"
      );
    });

    it("reverts stake calls from unauthorized accounts", async () => {
      const { bridge, stranger } = await loadFixture(fixture);
      await expect(bridge.connect(stranger).stake(1n)).to.be.revertedWithCustomError(bridge, "NotAuthorized");
    });

    it("reverts unstake calls from unauthorized accounts", async () => {
      const { bridge, stranger } = await loadFixture(fixture);
      await expect(bridge.connect(stranger)["unstake(uint256)"](1n)).to.be.revertedWithCustomError(bridge, "NotAuthorized");
    });

    it("emits StrategyAuthorizationUpdated event", async () => {
      const { bridge, strategy } = await loadFixture(fixture);
      await expect(bridge.setAuthorizedStrategy(strategy.address, true))
        .to.emit(bridge, "StrategyAuthorizationUpdated")
        .withArgs(strategy.address, true);

      await expect(bridge.setAuthorizedStrategy(strategy.address, false))
        .to.emit(bridge, "StrategyAuthorizationUpdated")
        .withArgs(strategy.address, false);
    });

    it("allows deauthorizing a strategy", async () => {
      const { bridge, strategy } = await loadFixture(fixture);
      await bridge.setAuthorizedStrategy(strategy.address, true);
      expect(await bridge.authorizedStrategy(strategy.address)).to.equal(true);

      await bridge.setAuthorizedStrategy(strategy.address, false);
      expect(await bridge.authorizedStrategy(strategy.address)).to.equal(false);
    });
  });

  describe("Staking", () => {
    it("stakes assets and tracks strategy shares", async () => {
      const { bridge, strategy, asset, coreDepositWallet } = await loadFixture(fixture);
      await bridge.setAuthorizedStrategy(strategy.address, true);

      const depositAmount = toUSDC("150");
      const effectiveAssets = depositAmount - NEW_CORE_ACCOUNT_FEE; // First deposit has 1 USDC fee
      await asset.mint(strategy.address, depositAmount);
      await asset.connect(strategy).approve(await bridge.getAddress(), depositAmount);

      await bridge.connect(strategy).stake(depositAmount);

      // Shares based on effective assets (after fee)
      const shares = await bridge.shareBalance(strategy.address);
      expect(shares).to.equal(effectiveAssets);
      
      // Full USDC goes to CoreDepositWallet (fee is deducted by Hyperliquid during bridge)
      expect(await asset.balanceOf(await coreDepositWallet.getAddress())).to.equal(depositAmount);
      expect(await coreDepositWallet.totalDeposited()).to.equal(depositAmount);
      
      // totalAssets uses fallback tracking in test environment (effective amount)
      expect(await bridge.totalAssets(strategy.address)).to.equal(effectiveAssets);
    });

    it("bridges USDC via CoreDepositWallet on stake", async () => {
      const { bridge, strategy, asset, coreDepositWallet } = await loadFixture(fixture);
      await bridge.setAuthorizedStrategy(strategy.address, true);

      const depositAmount = toUSDC("100");
      await asset.mint(strategy.address, depositAmount);
      await asset.connect(strategy).approve(await bridge.getAddress(), depositAmount);

      await bridge.connect(strategy).stake(depositAmount);

      expect(await coreDepositWallet.depositCount()).to.equal(1n);
      const deposit = await coreDepositWallet.lastDeposit();
      expect(deposit.sender).to.equal(await bridge.getAddress());
      expect(deposit.amount).to.equal(depositAmount);
      expect(deposit.destination).to.equal(DESTINATION_PERPS);
    });

    it("first stake does NOT send vault transfer (needs activation)", async () => {
      const { bridge, strategy, asset, coreWriter } = await loadFixture(fixture);
      await bridge.setAuthorizedStrategy(strategy.address, true);

      const depositAmount = toUSDC("42"); // Above 6 USDC minimum
      const effectiveAssets = depositAmount - NEW_CORE_ACCOUNT_FEE;
      await asset.mint(strategy.address, depositAmount);
      await asset.connect(strategy).approve(await bridge.getAddress(), depositAmount);

      await bridge.connect(strategy).stake(depositAmount);

      // First stake should NOT send vault transfer (account not yet activated)
      expect(await coreWriter.actionCount()).to.equal(0n);
      
      // Should have pending deposit
      expect(await bridge.pendingVaultDeposit()).to.equal(effectiveAssets);
      expect(await bridge.isHyperCoreActivated()).to.equal(false);
    });

    it("sends vault transfer on completeActivation", async () => {
      const { bridge, strategy, asset, mockHyper, coreWriter } = await loadFixture(fixture);
      await bridge.setAuthorizedStrategy(strategy.address, true);

      const depositAmount = toUSDC("42");
      const effectiveAssets = depositAmount - NEW_CORE_ACCOUNT_FEE;
      await asset.mint(strategy.address, depositAmount);
      await asset.connect(strategy).approve(await bridge.getAddress(), depositAmount);

      await bridge.connect(strategy).stake(depositAmount);
      
      // Complete activation
      await bridge.completeActivation();

      // Now CoreWriter should have the action
      const action = await coreWriter.lastAction();
      expect(action).to.equal(
        encodeVaultTransferAction(await mockHyper.getAddress(), true, effectiveAssets)
      );
      expect(await coreWriter.actionCount()).to.equal(1n);
      
      // Pending should be cleared
      expect(await bridge.pendingVaultDeposit()).to.equal(0n);
      expect(await bridge.isHyperCoreActivated()).to.equal(true);
    });

    it("subsequent stakes send vault transfer immediately (after activation)", async () => {
      const { bridge, strategy, asset, mockHyper, coreWriter } = await loadFixture(fixture);
      await bridge.setAuthorizedStrategy(strategy.address, true);

      // First stake + activation
      const firstDeposit = toUSDC("10");
      await asset.mint(strategy.address, firstDeposit);
      await asset.connect(strategy).approve(await bridge.getAddress(), firstDeposit);
      await bridge.connect(strategy).stake(firstDeposit);
      await bridge.completeActivation();

      // Second stake
      const secondDeposit = toUSDC("20");
      await asset.mint(strategy.address, secondDeposit);
      await asset.connect(strategy).approve(await bridge.getAddress(), secondDeposit);
      await bridge.connect(strategy).stake(secondDeposit);

      // Should have sent vault transfer immediately
      expect(await coreWriter.actionCount()).to.equal(2n);
      const action = await coreWriter.lastAction();
      expect(action).to.equal(
        encodeVaultTransferAction(await mockHyper.getAddress(), true, secondDeposit)
      );
    });

    it("reverts stake calls with zero assets", async () => {
      const { bridge, strategy } = await loadFixture(fixture);
      await bridge.setAuthorizedStrategy(strategy.address, true);
      await expect(bridge.connect(strategy).stake(0n)).to.be.revertedWithCustomError(bridge, "ZeroAssets");
    });

    it("reverts first deposit below 6 USDC minimum", async () => {
      const { bridge, strategy, asset } = await loadFixture(fixture);
      await bridge.setAuthorizedStrategy(strategy.address, true);

      const belowMinimum = toUSDC("5"); // 5 USDC, but first deposit needs 6
      await asset.mint(strategy.address, belowMinimum);
      await asset.connect(strategy).approve(await bridge.getAddress(), belowMinimum);

      await expect(bridge.connect(strategy).stake(belowMinimum))
        .to.be.revertedWithCustomError(bridge, "DepositBelowMinimum")
        .withArgs(belowMinimum, MIN_FIRST_DEPOSIT, true);
    });

    it("reverts subsequent deposit if not activated", async () => {
      const { bridge, strategy, asset } = await loadFixture(fixture);
      await bridge.setAuthorizedStrategy(strategy.address, true);

      // First deposit (6 USDC minimum)
      const firstDeposit = toUSDC("10");
      await asset.mint(strategy.address, firstDeposit);
      await asset.connect(strategy).approve(await bridge.getAddress(), firstDeposit);
      await bridge.connect(strategy).stake(firstDeposit);

      // Don't call completeActivation - try second deposit
      const secondDeposit = toUSDC("10");
      await asset.mint(strategy.address, secondDeposit);
      await asset.connect(strategy).approve(await bridge.getAddress(), secondDeposit);

      await expect(bridge.connect(strategy).stake(secondDeposit))
        .to.be.revertedWithCustomError(bridge, "NotActivated");
    });

    it("reverts subsequent deposit below 5 USDC minimum", async () => {
      const { bridge, strategy, asset } = await loadFixture(fixture);
      await bridge.setAuthorizedStrategy(strategy.address, true);

      // First deposit + activation
      const firstDeposit = toUSDC("10");
      await asset.mint(strategy.address, firstDeposit);
      await asset.connect(strategy).approve(await bridge.getAddress(), firstDeposit);
      await bridge.connect(strategy).stake(firstDeposit);
      await bridge.completeActivation();

      // Second deposit below minimum
      const belowMinimum = toUSDC("4"); // 4 USDC, but needs 5
      await asset.mint(strategy.address, belowMinimum);
      await asset.connect(strategy).approve(await bridge.getAddress(), belowMinimum);

      await expect(bridge.connect(strategy).stake(belowMinimum))
        .to.be.revertedWithCustomError(bridge, "DepositBelowMinimum")
        .withArgs(belowMinimum, MIN_VAULT_DEPOSIT, false);
    });

    it("accepts exactly 6 USDC on first deposit", async () => {
      const { bridge, strategy, asset } = await loadFixture(fixture);
      await bridge.setAuthorizedStrategy(strategy.address, true);

      const exactMinimum = MIN_FIRST_DEPOSIT;
      const effectiveAssets = exactMinimum - NEW_CORE_ACCOUNT_FEE;
      await asset.mint(strategy.address, exactMinimum);
      await asset.connect(strategy).approve(await bridge.getAddress(), exactMinimum);

      await bridge.connect(strategy).stake(exactMinimum);
      expect(await bridge.shareBalance(strategy.address)).to.equal(effectiveAssets);
    });

    it("accepts exactly 5 USDC on subsequent deposits", async () => {
      const { bridge, strategy, asset } = await loadFixture(fixture);
      await bridge.setAuthorizedStrategy(strategy.address, true);

      // First deposit + activation
      const firstDeposit = toUSDC("10");
      await asset.mint(strategy.address, firstDeposit);
      await asset.connect(strategy).approve(await bridge.getAddress(), firstDeposit);
      await bridge.connect(strategy).stake(firstDeposit);
      await bridge.completeActivation();

      const firstShares = firstDeposit - NEW_CORE_ACCOUNT_FEE;

      // Second deposit at exact minimum
      const exactMinimum = MIN_VAULT_DEPOSIT;
      await asset.mint(strategy.address, exactMinimum);
      await asset.connect(strategy).approve(await bridge.getAddress(), exactMinimum);
      await bridge.connect(strategy).stake(exactMinimum);

      expect(await bridge.shareBalance(strategy.address)).to.equal(firstShares + exactMinimum);
    });

    it("reverts stake when amount exceeds uint64 capacity", async () => {
      const { bridge, strategy, asset } = await loadFixture(fixture);
      await bridge.setAuthorizedStrategy(strategy.address, true);

      // First make a small deposit + activation
      const initialDeposit = toUSDC("10");
      await asset.mint(strategy.address, initialDeposit);
      await asset.connect(strategy).approve(await bridge.getAddress(), initialDeposit);
      await bridge.connect(strategy).stake(initialDeposit);
      await bridge.completeActivation();

      // Amount that exceeds uint64
      const tooLarge = UINT64_MAX + 1n;
      await asset.mint(strategy.address, tooLarge);
      await asset.connect(strategy).approve(await bridge.getAddress(), tooLarge);

      await expect(bridge.connect(strategy).stake(tooLarge)).to.be.revertedWithCustomError(bridge, "AmountTooLarge");
    });

    it("calculates proportional shares on subsequent deposits", async () => {
      const { bridge, strategy, stranger, asset } = await loadFixture(fixture);
      await bridge.setAuthorizedStrategy(strategy.address, true);
      await bridge.setAuthorizedStrategy(stranger.address, true);

      // First deposit: 100 USDC -> 99 shares (1 USDC fee on first deposit)
      const firstDeposit = toUSDC("100");
      const firstEffective = firstDeposit - NEW_CORE_ACCOUNT_FEE;
      await asset.mint(strategy.address, firstDeposit);
      await asset.connect(strategy).approve(await bridge.getAddress(), firstDeposit);
      await bridge.connect(strategy).stake(firstDeposit);
      await bridge.completeActivation();

      expect(await bridge.shareBalance(strategy.address)).to.equal(firstEffective);
      expect(await bridge.totalShares()).to.equal(firstEffective);

      // Second deposit: 50 USDC -> 50 shares (no fee, 1:1 in test env with fallback)
      const secondDeposit = toUSDC("50");
      await asset.mint(stranger.address, secondDeposit);
      await asset.connect(stranger).approve(await bridge.getAddress(), secondDeposit);
      await bridge.connect(stranger).stake(secondDeposit);

      expect(await bridge.shareBalance(stranger.address)).to.equal(secondDeposit);
      expect(await bridge.totalShares()).to.equal(firstEffective + secondDeposit);
    });

    it("emits Staked event with correct values", async () => {
      const { bridge, strategy, asset } = await loadFixture(fixture);
      await bridge.setAuthorizedStrategy(strategy.address, true);

      const depositAmount = toUSDC("10");
      const effectiveAssets = depositAmount - NEW_CORE_ACCOUNT_FEE;
      await asset.mint(strategy.address, depositAmount);
      await asset.connect(strategy).approve(await bridge.getAddress(), depositAmount);

      await expect(bridge.connect(strategy).stake(depositAmount))
        .to.emit(bridge, "Staked")
        .withArgs(strategy.address, effectiveAssets, effectiveAssets);
    });

    it("emits Staked event on subsequent deposits", async () => {
      const { bridge, strategy, asset } = await loadFixture(fixture);
      await bridge.setAuthorizedStrategy(strategy.address, true);

      // First deposit + activation
      const firstDeposit = toUSDC("10");
      await asset.mint(strategy.address, firstDeposit);
      await asset.connect(strategy).approve(await bridge.getAddress(), firstDeposit);
      await bridge.connect(strategy).stake(firstDeposit);
      await bridge.completeActivation();

      // Second deposit
      const secondDeposit = toUSDC("20");
      await asset.mint(strategy.address, secondDeposit);
      await asset.connect(strategy).approve(await bridge.getAddress(), secondDeposit);

      await expect(bridge.connect(strategy).stake(secondDeposit))
        .to.emit(bridge, "Staked")
        .withArgs(strategy.address, secondDeposit, secondDeposit);
    });
  });

  describe("Activation", () => {
    it("reverts completeActivation when no pending deposit", async () => {
      const { bridge } = await loadFixture(fixture);
      await expect(bridge.completeActivation())
        .to.be.revertedWithCustomError(bridge, "NoPendingDeposit");
    });

    it("reverts completeActivation when already activated", async () => {
      const { bridge, strategy, asset } = await loadFixture(fixture);
      await bridge.setAuthorizedStrategy(strategy.address, true);

      const depositAmount = toUSDC("10");
      await asset.mint(strategy.address, depositAmount);
      await asset.connect(strategy).approve(await bridge.getAddress(), depositAmount);
      await bridge.connect(strategy).stake(depositAmount);
      await bridge.completeActivation();

      // Try to activate again
      await expect(bridge.completeActivation())
        .to.be.revertedWithCustomError(bridge, "NoPendingDeposit");
    });

    it("allows anyone to call completeActivation", async () => {
      const { bridge, strategy, stranger, asset } = await loadFixture(fixture);
      await bridge.setAuthorizedStrategy(strategy.address, true);

      const depositAmount = toUSDC("10");
      await asset.mint(strategy.address, depositAmount);
      await asset.connect(strategy).approve(await bridge.getAddress(), depositAmount);
      await bridge.connect(strategy).stake(depositAmount);

      // Stranger can complete activation
      await bridge.connect(stranger).completeActivation();
      expect(await bridge.isHyperCoreActivated()).to.equal(true);
    });

    it("emits HyperCoreActivated on first stake", async () => {
      const { bridge, strategy, asset } = await loadFixture(fixture);
      await bridge.setAuthorizedStrategy(strategy.address, true);

      const depositAmount = toUSDC("10");
      const effectiveAssets = depositAmount - NEW_CORE_ACCOUNT_FEE;
      await asset.mint(strategy.address, depositAmount);
      await asset.connect(strategy).approve(await bridge.getAddress(), depositAmount);

      await expect(bridge.connect(strategy).stake(depositAmount))
        .to.emit(bridge, "HyperCoreActivated")
        .withArgs(effectiveAssets);
    });

    it("emits PendingVaultDepositCompleted on completeActivation", async () => {
      const { bridge, strategy, asset } = await loadFixture(fixture);
      await bridge.setAuthorizedStrategy(strategy.address, true);

      const depositAmount = toUSDC("10");
      const effectiveAssets = depositAmount - NEW_CORE_ACCOUNT_FEE;
      await asset.mint(strategy.address, depositAmount);
      await asset.connect(strategy).approve(await bridge.getAddress(), depositAmount);
      await bridge.connect(strategy).stake(depositAmount);

      await expect(bridge.completeActivation())
        .to.emit(bridge, "PendingVaultDepositCompleted")
        .withArgs(effectiveAssets);
    });
  });

  describe("Unstaking", () => {
    it("unstakes assets and returns funds to strategy", async () => {
      const { bridge, strategy, asset, coreDepositWallet } = await loadFixture(fixture);
      await bridge.setAuthorizedStrategy(strategy.address, true);

      const depositAmount = toUSDC("200");
      await asset.mint(strategy.address, depositAmount);
      await asset.connect(strategy).approve(await bridge.getAddress(), depositAmount);
      await bridge.connect(strategy).stake(depositAmount);
      await bridge.completeActivation();

      // Simulate USDC returning from HyperCore (in real scenario, bridge would receive it)
      // For test, mint to bridge since CoreDepositWallet holds the bridged funds
      await asset.mint(await bridge.getAddress(), depositAmount);

      const withdrawAmount = toUSDC("80");
      const before = await asset.balanceOf(strategy.address);
      await bridge.connect(strategy)["unstake(uint256)"](withdrawAmount);
      const after = await asset.balanceOf(strategy.address);
      
      expect(after - before).to.equal(withdrawAmount);
    });

    it("sends a CoreWriter vault transfer action on unstake", async () => {
      const { bridge, strategy, asset, mockHyper, coreWriter } = await loadFixture(fixture);
      await bridge.setAuthorizedStrategy(strategy.address, true);

      const depositAmount = toUSDC("120");
      await asset.mint(strategy.address, depositAmount);
      await asset.connect(strategy).approve(await bridge.getAddress(), depositAmount);
      await bridge.connect(strategy).stake(depositAmount);
      await bridge.completeActivation();

      // Simulate USDC returning from HyperCore
      await asset.mint(await bridge.getAddress(), depositAmount);

      const withdrawAmount = toUSDC("60");
      await bridge.connect(strategy)["unstake(uint256)"](withdrawAmount);
      
      const action = await coreWriter.lastAction();
      expect(action).to.equal(
        encodeVaultTransferAction(await mockHyper.getAddress(), false, withdrawAmount)
      );
    });

    it("reverts unstake calls with zero assets", async () => {
      const { bridge, strategy, asset } = await loadFixture(fixture);
      await bridge.setAuthorizedStrategy(strategy.address, true);
      // Need to deposit more than 1 USDC fee
      await asset.mint(strategy.address, toUSDC("10"));
      await asset.connect(strategy).approve(await bridge.getAddress(), toUSDC("10"));
      await bridge.connect(strategy).stake(toUSDC("10"));
      await bridge.completeActivation();
      await expect(bridge.connect(strategy)["unstake(uint256)"](0n)).to.be.revertedWithCustomError(bridge, "ZeroAssets");
    });

    it("reverts unstake when strategy holds insufficient shares", async () => {
      const { bridge, strategy } = await loadFixture(fixture);
      await bridge.setAuthorizedStrategy(strategy.address, true);
      await expect(bridge.connect(strategy)["unstake(uint256)"](1n)).to.be.revertedWithCustomError(bridge, "InsufficientShares");
    });

    it("reverts unstake when strategy requests more than holdings", async () => {
      const { bridge, strategy, asset } = await loadFixture(fixture);
      await bridge.setAuthorizedStrategy(strategy.address, true);

      const depositAmount = toUSDC("50");
      await asset.mint(strategy.address, depositAmount);
      await asset.connect(strategy).approve(await bridge.getAddress(), depositAmount);
      await bridge.connect(strategy).stake(depositAmount);
      await bridge.completeActivation();

      // Requesting more than staked should revert
      await expect(bridge.connect(strategy)["unstake(uint256)"](toUSDC("60"))).to.be.revertedWithCustomError(
        bridge,
        "InsufficientShares"
      );
    });

    it("allows full unstake of deposited amount", async () => {
      const { bridge, strategy, asset } = await loadFixture(fixture);
      await bridge.setAuthorizedStrategy(strategy.address, true);

      const depositAmount = toUSDC("50");
      const effectiveAssets = depositAmount - NEW_CORE_ACCOUNT_FEE; // First deposit has fee
      await asset.mint(strategy.address, depositAmount);
      await asset.connect(strategy).approve(await bridge.getAddress(), depositAmount);
      await bridge.connect(strategy).stake(depositAmount);
      await bridge.completeActivation();

      // Simulate USDC returning from HyperCore (only effective amount available)
      await asset.mint(await bridge.getAddress(), effectiveAssets);

      const before = await asset.balanceOf(strategy.address);
      // Can only unstake the effective amount (shares = effectiveAssets)
      await bridge.connect(strategy)["unstake(uint256)"](effectiveAssets);
      const after = await asset.balanceOf(strategy.address);
      expect(after - before).to.equal(effectiveAssets);
      expect(await bridge.shareBalance(strategy.address)).to.equal(0n);
    });

    it("allows unstake at uint64 max boundary", async () => {
      const { bridge, strategy, asset } = await loadFixture(fixture);
      await bridge.setAuthorizedStrategy(strategy.address, true);

      // Stake at uint64 max boundary
      const depositAmount = UINT64_MAX;
      const effectiveAssets = depositAmount - NEW_CORE_ACCOUNT_FEE; // First deposit has fee
      await asset.mint(strategy.address, depositAmount);
      await asset.connect(strategy).approve(await bridge.getAddress(), depositAmount);
      await bridge.connect(strategy).stake(depositAmount);
      await bridge.completeActivation();

      // Simulate USDC returning from HyperCore (only effective amount)
      await asset.mint(await bridge.getAddress(), effectiveAssets);

      // Should be able to unstake the effective amount
      const before = await asset.balanceOf(strategy.address);
      await bridge.connect(strategy)["unstake(uint256)"](effectiveAssets);
      const after = await asset.balanceOf(strategy.address);
      expect(after - before).to.equal(effectiveAssets);
    });

    it("does not transfer when contract balance is insufficient", async () => {
      const { bridge, strategy, asset, coreWriter, mockHyper } = await loadFixture(fixture);
      await bridge.setAuthorizedStrategy(strategy.address, true);

      const depositAmount = toUSDC("50");
      const effectiveAssets = depositAmount - NEW_CORE_ACCOUNT_FEE;
      await asset.mint(strategy.address, depositAmount);
      await asset.connect(strategy).approve(await bridge.getAddress(), depositAmount);
      await bridge.connect(strategy).stake(depositAmount);
      await bridge.completeActivation();

      // Do NOT mint USDC to bridge (simulate funds still in HyperCore)
      const withdrawAmount = toUSDC("20");
      const before = await asset.balanceOf(strategy.address);
      await bridge.connect(strategy)["unstake(uint256)"](withdrawAmount);
      const after = await asset.balanceOf(strategy.address);

      // No transfer should happen
      expect(after - before).to.equal(0n);
      
      // But vault transfer action should still be sent
      const action = await coreWriter.lastAction();
      expect(action).to.equal(
        encodeVaultTransferAction(await mockHyper.getAddress(), false, withdrawAmount)
      );
    });

    it("emits Unstaked event with correct values", async () => {
      const { bridge, strategy, asset } = await loadFixture(fixture);
      await bridge.setAuthorizedStrategy(strategy.address, true);

      const depositAmount = toUSDC("50");
      const effectiveAssets = depositAmount - NEW_CORE_ACCOUNT_FEE;
      await asset.mint(strategy.address, depositAmount);
      await asset.connect(strategy).approve(await bridge.getAddress(), depositAmount);
      await bridge.connect(strategy).stake(depositAmount);
      await bridge.completeActivation();

      await asset.mint(await bridge.getAddress(), effectiveAssets);

      const withdrawAmount = toUSDC("20");
      await expect(bridge.connect(strategy)["unstake(uint256)"](withdrawAmount))
        .to.emit(bridge, "Unstaked")
        .withArgs(strategy.address, withdrawAmount, withdrawAmount);
    });

    it("handles totalDepositedFallback underflow gracefully", async () => {
      const { bridge, strategy, asset } = await loadFixture(fixture);
      await bridge.setAuthorizedStrategy(strategy.address, true);

      const depositAmount = toUSDC("10");
      const effectiveAssets = depositAmount - NEW_CORE_ACCOUNT_FEE;
      await asset.mint(strategy.address, depositAmount);
      await asset.connect(strategy).approve(await bridge.getAddress(), depositAmount);
      await bridge.connect(strategy).stake(depositAmount);
      await bridge.completeActivation();

      // Simulate USDC in bridge
      await asset.mint(await bridge.getAddress(), effectiveAssets);

      // Unstake the full effective amount - this should set totalDepositedFallback to 0
      await bridge.connect(strategy)["unstake(uint256)"](effectiveAssets);
      
      // getTotalEquity should return 0
      expect(await bridge.getTotalEquity()).to.equal(0n);
      expect(await bridge.totalShares()).to.equal(0n);
    });
  });

  describe("View Functions", () => {
    it("returns correct totalAssets for strategy", async () => {
      const { bridge, strategy, asset } = await loadFixture(fixture);
      await bridge.setAuthorizedStrategy(strategy.address, true);

      expect(await bridge.totalAssets(strategy.address)).to.equal(0n);

      const depositAmount = toUSDC("100");
      const effectiveAssets = depositAmount - NEW_CORE_ACCOUNT_FEE; // First deposit has fee
      await asset.mint(strategy.address, depositAmount);
      await asset.connect(strategy).approve(await bridge.getAddress(), depositAmount);
      await bridge.connect(strategy).stake(depositAmount);
      await bridge.completeActivation();

      // totalAssets reflects effective amount (after fee)
      expect(await bridge.totalAssets(strategy.address)).to.equal(effectiveAssets);
    });

    it("returns correct getTotalEquity", async () => {
      const { bridge, strategy, asset } = await loadFixture(fixture);
      await bridge.setAuthorizedStrategy(strategy.address, true);

      expect(await bridge.getTotalEquity()).to.equal(0n);

      const depositAmount = toUSDC("250");
      const effectiveAssets = depositAmount - NEW_CORE_ACCOUNT_FEE; // First deposit has fee
      await asset.mint(strategy.address, depositAmount);
      await asset.connect(strategy).approve(await bridge.getAddress(), depositAmount);
      await bridge.connect(strategy).stake(depositAmount);
      await bridge.completeActivation();

      // In test env, uses fallback tracking (effective amount after fee)
      expect(await bridge.getTotalEquity()).to.equal(effectiveAssets);
    });

    it("getVaultEquity returns zeros in test environment", async () => {
      const { bridge } = await loadFixture(fixture);
      const [equity, lockedUntil] = await bridge.getVaultEquity();
      expect(equity).to.equal(0n);
      expect(lockedUntil).to.equal(0n);
    });

    it("returns correct isHyperCoreActivated and pendingVaultDeposit", async () => {
      const { bridge, strategy, asset } = await loadFixture(fixture);
      await bridge.setAuthorizedStrategy(strategy.address, true);

      // Before first deposit
      expect(await bridge.isHyperCoreActivated()).to.equal(false);
      expect(await bridge.pendingVaultDeposit()).to.equal(0n);

      // After first deposit
      const depositAmount = toUSDC("10");
      const effectiveAssets = depositAmount - NEW_CORE_ACCOUNT_FEE;
      await asset.mint(strategy.address, depositAmount);
      await asset.connect(strategy).approve(await bridge.getAddress(), depositAmount);
      await bridge.connect(strategy).stake(depositAmount);

      expect(await bridge.isHyperCoreActivated()).to.equal(false);
      expect(await bridge.pendingVaultDeposit()).to.equal(effectiveAssets);

      // After activation
      await bridge.completeActivation();
      expect(await bridge.isHyperCoreActivated()).to.equal(true);
      expect(await bridge.pendingVaultDeposit()).to.equal(0n);
    });

    it("returns zero shareBalance for address with no shares", async () => {
      const { bridge, stranger } = await loadFixture(fixture);
      expect(await bridge.shareBalance(stranger.address)).to.equal(0n);
    });

    it("returns zero totalAssets for strategy with no shares", async () => {
      const { bridge, strategy, stranger, asset } = await loadFixture(fixture);
      await bridge.setAuthorizedStrategy(strategy.address, true);

      // Strategy deposits
      const depositAmount = toUSDC("100");
      await asset.mint(strategy.address, depositAmount);
      await asset.connect(strategy).approve(await bridge.getAddress(), depositAmount);
      await bridge.connect(strategy).stake(depositAmount);
      await bridge.completeActivation();

      // Stranger has no shares
      expect(await bridge.totalAssets(stranger.address)).to.equal(0n);
    });

    it("returns correct constants", async () => {
      const { bridge } = await loadFixture(fixture);
      expect(await bridge.NEW_CORE_ACCOUNT_FEE()).to.equal(NEW_CORE_ACCOUNT_FEE);
      expect(await bridge.MIN_VAULT_DEPOSIT()).to.equal(MIN_VAULT_DEPOSIT);
      expect(await bridge.MIN_FIRST_DEPOSIT()).to.equal(MIN_FIRST_DEPOSIT);
      expect(await bridge.VAULT_EQUITY_PRECOMPILE()).to.equal("0x0000000000000000000000000000000000000802");
    });

    it("returns totalShares correctly", async () => {
      const { bridge, strategy, asset } = await loadFixture(fixture);
      await bridge.setAuthorizedStrategy(strategy.address, true);

      expect(await bridge.totalShares()).to.equal(0n);

      const depositAmount = toUSDC("100");
      const effectiveAssets = depositAmount - NEW_CORE_ACCOUNT_FEE;
      await asset.mint(strategy.address, depositAmount);
      await asset.connect(strategy).approve(await bridge.getAddress(), depositAmount);
      await bridge.connect(strategy).stake(depositAmount);

      expect(await bridge.totalShares()).to.equal(effectiveAssets);
    });
  });
});
