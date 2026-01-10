import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

import {
  HyperliquidBridgeAdapter,
  HyperliquidStrategyVault,
  MockCoreWriter,
  MockHyperliquidVault,
  MockUSDC,
} from "../typechain-types";

const toUSDC = (value: string) => ethers.parseUnits(value, 6);
const toWad = (value: string) => ethers.parseUnits(value, 18);

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

    const BridgeFactory = await ethers.getContractFactory("HyperliquidBridgeAdapter");
    const bridge = (await BridgeFactory.deploy(
      await asset.getAddress(),
      await mockHyper.getAddress(),
      await coreWriter.getAddress()
    )) as HyperliquidBridgeAdapter;
    await bridge.waitForDeployment();

    const StrategyFactory = await ethers.getContractFactory("HyperliquidStrategyVault");
    const strategy = (await StrategyFactory.deploy(
      await asset.getAddress(),
      await bridge.getAddress()
    )) as HyperliquidStrategyVault;
    await strategy.waitForDeployment();

    await bridge.setAuthorizedStrategy(await strategy.getAddress(), true);

    return { deployer, alice, asset, mockHyper, bridge, strategy };
  }

  it("reverts constructor when addresses are zero", async () => {
    const StrategyFactory = await ethers.getContractFactory("HyperliquidStrategyVault");
    const BridgeFactory = await ethers.getContractFactory("HyperliquidBridgeAdapter");
    const { asset } = await loadFixture(fixture);
    await expect(
      StrategyFactory.deploy(await asset.getAddress(), ethers.ZeroAddress)
    ).to.be.revertedWithCustomError(StrategyFactory, "ZeroAddress");

    await expect(
      BridgeFactory.deploy(ethers.ZeroAddress, ethers.ZeroAddress, ethers.ZeroAddress)
    ).to.be.revertedWithCustomError(BridgeFactory, "ZeroAddress");
  });

  it("reverts on zero deposit amount", async () => {
    const { strategy, alice } = await loadFixture(fixture);
    await expect(strategy.connect(alice).deposit(0n)).to.be.revertedWith("zero assets");
  });

  it("deposits assets via the bridge adapter", async () => {
    const { strategy, bridge, mockHyper, asset, alice } = await loadFixture(fixture);
    const amount = toUSDC("100");
    await asset.mint(alice.address, amount);
    await asset.connect(alice).approve(await strategy.getAddress(), amount);
    await strategy.connect(alice).deposit(amount);

    const strategyAddress = await strategy.getAddress();
    const sharesOnBridge = await bridge.shareBalance(strategyAddress);
    expect(sharesOnBridge).to.equal(amount);
    expect(await mockHyper.balanceOf(await bridge.getAddress())).to.equal(sharesOnBridge);
    expect(await asset.balanceOf(await mockHyper.getAddress())).to.equal(amount);
  });

  it("reverts on zero withdraw amount", async () => {
    const { strategy, alice } = await loadFixture(fixture);
    await expect(strategy.connect(alice).withdraw(0n)).to.be.revertedWith("zero assets");
  });

  it("reverts withdraw when strategy holds no shares", async () => {
    const { strategy, bridge, alice } = await loadFixture(fixture);
    await expect(strategy.connect(alice).withdraw(1n)).to.be.revertedWithCustomError(
      bridge,
      "InsufficientAssets"
    );
  });

  it("reverts withdraw when requested assets exceed holdings", async () => {
    const { strategy, bridge, mockHyper, asset, alice } = await loadFixture(fixture);
    await asset.mint(alice.address, toUSDC("50"));
    await asset.connect(alice).approve(await strategy.getAddress(), toUSDC("50"));
    await strategy.connect(alice).deposit(toUSDC("50"));

    await expect(strategy.connect(alice).withdraw(toUSDC("60"))).to.be.revertedWithCustomError(
      bridge,
      "InsufficientAssets"
    );

    expect(await mockHyper.balanceOf(await bridge.getAddress())).to.be.gt(0n);
  });

  it("withdraws assets using rounded-up share burns through the bridge", async () => {
    const { strategy, bridge, mockHyper, asset, alice } = await loadFixture(fixture);
    const depositAmount = toUSDC("100");
    await asset.mint(alice.address, depositAmount);
    await asset.connect(alice).approve(await strategy.getAddress(), depositAmount);
    await strategy.connect(alice).deposit(depositAmount);

    await mockHyper.setSharePrice(toWad("1.5"));
    const bridgeAddress = await bridge.getAddress();
    const expectedAssets = await mockHyper.convertToAssets(await mockHyper.balanceOf(bridgeAddress));
    const currentBalance = await asset.balanceOf(await mockHyper.getAddress());
    if (expectedAssets > currentBalance) {
      await asset.mint(await mockHyper.getAddress(), expectedAssets - currentBalance);
    }

    const withdrawAmount = toUSDC("101");
    const aliceBefore = await asset.balanceOf(alice.address);
    const sharesBurned = await strategy.connect(alice).withdraw.staticCall(withdrawAmount);
    expect(sharesBurned).to.be.gt(0n);
    await strategy.connect(alice).withdraw(withdrawAmount);
    const aliceAfter = await asset.balanceOf(alice.address);
    expect(aliceAfter - aliceBefore).to.be.gte(withdrawAmount);
  });

  it("reverts when hyper vault under-delivers assets", async () => {
    const { strategy, bridge, mockHyper, asset, alice } = await loadFixture(fixture);
    const amount = toUSDC("80");
    await asset.mint(alice.address, amount);
    await asset.connect(alice).approve(await strategy.getAddress(), amount);
    await strategy.connect(alice).deposit(amount);

    await mockHyper.setRedemptionSlippageBps(5_000);
    await expect(strategy.connect(alice).withdraw(toUSDC("10"))).to.be.revertedWithCustomError(
      bridge,
      "InsufficientAssets"
    );
  });

  it("reports total assets across zero and non-zero balances", async () => {
    const { strategy, bridge, mockHyper, asset, alice } = await loadFixture(fixture);
    expect(await strategy.totalAssets()).to.equal(0n);

    const depositAmount = toUSDC("40");
    await asset.mint(alice.address, depositAmount);
    await asset.connect(alice).approve(await strategy.getAddress(), depositAmount);
    await strategy.connect(alice).deposit(depositAmount);

    await mockHyper.setSharePrice(toWad("1.25"));
    const bridgeAddress = await bridge.getAddress();
    const expectedAssets = await mockHyper.convertToAssets(await mockHyper.balanceOf(bridgeAddress));
    const balance = await asset.balanceOf(await mockHyper.getAddress());
    if (expectedAssets > balance) {
      await asset.mint(await mockHyper.getAddress(), expectedAssets - balance);
    }

    expect(await strategy.totalAssets()).to.equal(expectedAssets);
  });
});


