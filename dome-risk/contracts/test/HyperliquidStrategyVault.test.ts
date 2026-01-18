import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

import {
  HyperliquidBridgeAdapter,
  HyperliquidStrategyVault,
  MockCoreWriter,
  MockCoreDepositWallet,
  MockHyperliquidVault,
  MockUSDC,
} from "../typechain-types";

const toUSDC = (value: string) => ethers.parseUnits(value, 6);

describe("HyperliquidStrategyVault", () => {
  async function fixture() {
    const [deployer, alice] = await ethers.getSigners();

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

    const StrategyFactory = await ethers.getContractFactory("HyperliquidStrategyVault");
    const strategy = (await StrategyFactory.deploy(
      await asset.getAddress(),
      await bridge.getAddress()
    )) as HyperliquidStrategyVault;
    await strategy.waitForDeployment();

    await bridge.setAuthorizedStrategy(await strategy.getAddress(), true);

    return { deployer, alice, asset, mockHyper, bridge, strategy, coreDepositWallet };
  }

  it("reverts constructor when addresses are zero", async () => {
    const StrategyFactory = await ethers.getContractFactory("HyperliquidStrategyVault");
    const BridgeFactory = await ethers.getContractFactory("HyperliquidBridgeAdapter");
    const { asset } = await loadFixture(fixture);
    await expect(
      StrategyFactory.deploy(await asset.getAddress(), ethers.ZeroAddress)
    ).to.be.revertedWithCustomError(StrategyFactory, "ZeroAddress");

    await expect(
      BridgeFactory.deploy(ethers.ZeroAddress, ethers.ZeroAddress, ethers.ZeroAddress, ethers.ZeroAddress)
    ).to.be.revertedWithCustomError(BridgeFactory, "ZeroAddress");
  });

  it("reverts on zero deposit amount", async () => {
    const { strategy, alice } = await loadFixture(fixture);
    await expect(strategy.connect(alice).deposit(0n)).to.be.revertedWith("zero assets");
  });

  it("deposits assets via the bridge adapter", async () => {
    const { strategy, bridge, asset, alice, coreDepositWallet } = await loadFixture(fixture);
    const amount = toUSDC("100");
    await asset.mint(alice.address, amount);
    await asset.connect(alice).approve(await strategy.getAddress(), amount);
    await strategy.connect(alice).deposit(amount);

    const strategyAddress = await strategy.getAddress();
    const sharesOnBridge = await bridge.shareBalance(strategyAddress);
    expect(sharesOnBridge).to.equal(amount);
    
    // USDC goes to CoreDepositWallet (bridged to HyperCore)
    expect(await asset.balanceOf(await coreDepositWallet.getAddress())).to.equal(amount);
  });

  it("reverts on zero withdraw amount", async () => {
    const { strategy, alice } = await loadFixture(fixture);
    await expect(strategy.connect(alice).withdraw(0n)).to.be.revertedWith("zero assets");
  });

  it("reverts withdraw when strategy holds no shares", async () => {
    const { strategy, bridge, alice } = await loadFixture(fixture);
    await expect(strategy.connect(alice).withdraw(1n)).to.be.revertedWithCustomError(
      bridge,
      "InsufficientShares"
    );
  });

  it("reverts withdraw when requested assets exceed holdings", async () => {
    const { strategy, bridge, asset, alice, coreDepositWallet } = await loadFixture(fixture);
    await asset.mint(alice.address, toUSDC("50"));
    await asset.connect(alice).approve(await strategy.getAddress(), toUSDC("50"));
    await strategy.connect(alice).deposit(toUSDC("50"));

    await expect(strategy.connect(alice).withdraw(toUSDC("60"))).to.be.revertedWithCustomError(
      bridge,
      "InsufficientShares"
    );

    // USDC is held by CoreDepositWallet
    expect(await asset.balanceOf(await coreDepositWallet.getAddress())).to.be.gt(0n);
  });

  it("withdraws assets through the bridge", async () => {
    const { strategy, bridge, asset, alice } = await loadFixture(fixture);
    const depositAmount = toUSDC("100");
    await asset.mint(alice.address, depositAmount);
    await asset.connect(alice).approve(await strategy.getAddress(), depositAmount);
    await strategy.connect(alice).deposit(depositAmount);

    // Simulate USDC returning from HyperCore (mint to bridge)
    await asset.mint(await bridge.getAddress(), depositAmount);

    // With fallback tracking, withdraw the deposited amount
    const withdrawAmount = toUSDC("50");
    const aliceBefore = await asset.balanceOf(alice.address);
    const sharesBurned = await strategy.connect(alice).withdraw.staticCall(withdrawAmount);
    expect(sharesBurned).to.equal(withdrawAmount); // 1:1 shares in test env
    await strategy.connect(alice).withdraw(withdrawAmount);
    const aliceAfter = await asset.balanceOf(alice.address);
    expect(aliceAfter - aliceBefore).to.equal(withdrawAmount);
  });

  it("reverts when withdrawing more than total deposited", async () => {
    const { strategy, bridge, asset, alice } = await loadFixture(fixture);
    const amount = toUSDC("80");
    await asset.mint(alice.address, amount);
    await asset.connect(alice).approve(await strategy.getAddress(), amount);
    await strategy.connect(alice).deposit(amount);

    // With fallback tracking, can only withdraw what was deposited
    await expect(strategy.connect(alice).withdraw(toUSDC("100"))).to.be.revertedWithCustomError(
      bridge,
      "InsufficientShares"
    );
  });

  it("reports total assets across zero and non-zero balances", async () => {
    const { strategy, asset, alice } = await loadFixture(fixture);
    expect(await strategy.totalAssets()).to.equal(0n);

    const depositAmount = toUSDC("40");
    await asset.mint(alice.address, depositAmount);
    await asset.connect(alice).approve(await strategy.getAddress(), depositAmount);
    await strategy.connect(alice).deposit(depositAmount);

    // With fallback tracking, totalAssets equals deposited amount
    expect(await strategy.totalAssets()).to.equal(depositAmount);
  });
});
