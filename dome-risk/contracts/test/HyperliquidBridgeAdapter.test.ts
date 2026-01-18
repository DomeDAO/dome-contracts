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

const encodeVaultTransferAction = (vault: string, isDeposit: boolean, amount: bigint) => {
  // Hyperliquid expects raw bytes: version (1) + actionId (3) + vault (20) + isDeposit (1) + usd (8)
  const versionByte = ethers.toBeHex(ACTION_VERSION, 1);
  const actionIdBytes = ethers.toBeHex(VAULT_TRANSFER_ACTION_ID, 3);
  const vaultBytes = vault.toLowerCase(); // address is 20 bytes
  const isDepositByte = isDeposit ? "0x01" : "0x00";
  const amountBytes = ethers.toBeHex(amount, 8); // uint64 is 8 bytes
  
  return ethers.concat([versionByte, actionIdBytes, vaultBytes, isDepositByte, amountBytes]);
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
  });

  describe("Staking", () => {
    it("stakes assets and tracks strategy shares", async () => {
      const { bridge, strategy, asset, coreDepositWallet } = await loadFixture(fixture);
      await bridge.setAuthorizedStrategy(strategy.address, true);

      const depositAmount = toUSDC("150");
      await asset.mint(strategy.address, depositAmount);
      await asset.connect(strategy).approve(await bridge.getAddress(), depositAmount);

      await bridge.connect(strategy).stake(depositAmount);

      const shares = await bridge.shareBalance(strategy.address);
      expect(shares).to.equal(depositAmount);
      
      // USDC goes to CoreDepositWallet (bridged to HyperCore)
      expect(await asset.balanceOf(await coreDepositWallet.getAddress())).to.equal(depositAmount);
      expect(await coreDepositWallet.totalDeposited()).to.equal(depositAmount);
      
      // totalAssets uses fallback tracking in test environment
      expect(await bridge.totalAssets(strategy.address)).to.equal(depositAmount);
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

    it("sends a CoreWriter vault transfer action on stake", async () => {
      const { bridge, strategy, asset, mockHyper, coreWriter } = await loadFixture(fixture);
      await bridge.setAuthorizedStrategy(strategy.address, true);

      const depositAmount = toUSDC("42");
      await asset.mint(strategy.address, depositAmount);
      await asset.connect(strategy).approve(await bridge.getAddress(), depositAmount);

      await bridge.connect(strategy).stake(depositAmount);

      const action = await coreWriter.lastAction();
      expect(action).to.equal(
        encodeVaultTransferAction(await mockHyper.getAddress(), true, depositAmount)
      );
      expect(await coreWriter.actionCount()).to.equal(1n);
    });

    it("reverts stake calls with zero assets", async () => {
      const { bridge, strategy } = await loadFixture(fixture);
      await bridge.setAuthorizedStrategy(strategy.address, true);
      await expect(bridge.connect(strategy).stake(0n)).to.be.revertedWithCustomError(bridge, "ZeroAssets");
    });

    it("reverts stake when amount exceeds uint64 capacity", async () => {
      const { bridge, strategy, asset } = await loadFixture(fixture);
      await bridge.setAuthorizedStrategy(strategy.address, true);

      const tooLarge = UINT64_MAX + 1n;
      await asset.mint(strategy.address, tooLarge);
      await asset.connect(strategy).approve(await bridge.getAddress(), tooLarge);

      await expect(bridge.connect(strategy).stake(tooLarge)).to.be.revertedWithCustomError(bridge, "AmountTooLarge");
    });

    it("calculates proportional shares on subsequent deposits", async () => {
      const { bridge, strategy, stranger, asset } = await loadFixture(fixture);
      await bridge.setAuthorizedStrategy(strategy.address, true);
      await bridge.setAuthorizedStrategy(stranger.address, true);

      // First deposit: 100 USDC -> 100 shares
      const firstDeposit = toUSDC("100");
      await asset.mint(strategy.address, firstDeposit);
      await asset.connect(strategy).approve(await bridge.getAddress(), firstDeposit);
      await bridge.connect(strategy).stake(firstDeposit);

      expect(await bridge.shareBalance(strategy.address)).to.equal(firstDeposit);
      expect(await bridge.totalShares()).to.equal(firstDeposit);

      // Second deposit: 50 USDC -> 50 shares (1:1 in test env with fallback)
      const secondDeposit = toUSDC("50");
      await asset.mint(stranger.address, secondDeposit);
      await asset.connect(stranger).approve(await bridge.getAddress(), secondDeposit);
      await bridge.connect(stranger).stake(secondDeposit);

      expect(await bridge.shareBalance(stranger.address)).to.equal(secondDeposit);
      expect(await bridge.totalShares()).to.equal(firstDeposit + secondDeposit);
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
      await asset.mint(strategy.address, toUSDC("1"));
      await asset.connect(strategy).approve(await bridge.getAddress(), toUSDC("1"));
      await bridge.connect(strategy).stake(toUSDC("1"));
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
      await asset.mint(strategy.address, depositAmount);
      await asset.connect(strategy).approve(await bridge.getAddress(), depositAmount);
      await bridge.connect(strategy).stake(depositAmount);

      // Simulate USDC returning from HyperCore
      await asset.mint(await bridge.getAddress(), depositAmount);

      const before = await asset.balanceOf(strategy.address);
      await bridge.connect(strategy)["unstake(uint256)"](depositAmount);
      const after = await asset.balanceOf(strategy.address);
      expect(after - before).to.equal(depositAmount);
      expect(await bridge.shareBalance(strategy.address)).to.equal(0n);
    });

    it("allows unstake at uint64 max boundary", async () => {
      const { bridge, strategy, asset } = await loadFixture(fixture);
      await bridge.setAuthorizedStrategy(strategy.address, true);

      // Stake at uint64 max boundary
      const depositAmount = UINT64_MAX;
      await asset.mint(strategy.address, depositAmount);
      await asset.connect(strategy).approve(await bridge.getAddress(), depositAmount);
      await bridge.connect(strategy).stake(depositAmount);

      // Simulate USDC returning from HyperCore
      await asset.mint(await bridge.getAddress(), depositAmount);

      // Should be able to unstake the same amount
      const before = await asset.balanceOf(strategy.address);
      await bridge.connect(strategy)["unstake(uint256)"](depositAmount);
      const after = await asset.balanceOf(strategy.address);
      expect(after - before).to.equal(depositAmount);
    });
  });

  describe("View Functions", () => {
    it("returns correct totalAssets for strategy", async () => {
      const { bridge, strategy, asset } = await loadFixture(fixture);
      await bridge.setAuthorizedStrategy(strategy.address, true);

      expect(await bridge.totalAssets(strategy.address)).to.equal(0n);

      const depositAmount = toUSDC("100");
      await asset.mint(strategy.address, depositAmount);
      await asset.connect(strategy).approve(await bridge.getAddress(), depositAmount);
      await bridge.connect(strategy).stake(depositAmount);

      expect(await bridge.totalAssets(strategy.address)).to.equal(depositAmount);
    });

    it("returns correct getTotalEquity", async () => {
      const { bridge, strategy, asset } = await loadFixture(fixture);
      await bridge.setAuthorizedStrategy(strategy.address, true);

      expect(await bridge.getTotalEquity()).to.equal(0n);

      const depositAmount = toUSDC("250");
      await asset.mint(strategy.address, depositAmount);
      await asset.connect(strategy).approve(await bridge.getAddress(), depositAmount);
      await bridge.connect(strategy).stake(depositAmount);

      // In test env, uses fallback tracking
      expect(await bridge.getTotalEquity()).to.equal(depositAmount);
    });

    it("getVaultEquity returns zeros in test environment", async () => {
      const { bridge } = await loadFixture(fixture);
      const [equity, lockedUntil] = await bridge.getVaultEquity();
      expect(equity).to.equal(0n);
      expect(lockedUntil).to.equal(0n);
    });
  });
});
