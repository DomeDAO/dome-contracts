import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

import {
  HyperliquidBridgeAdapter,
  MockCoreWriter,
  MockHyperliquidVault,
  MockUSDC,
} from "../typechain-types";

const toUSDC = (value: string) => ethers.parseUnits(value, 6);
const toWad = (value: string) => ethers.parseUnits(value, 18);
const ACTION_VERSION = 0x01;
const VAULT_TRANSFER_ACTION_ID = 0x000002;
const UINT64_MAX = (1n << 64n) - 1n;

const encodeVaultTransferAction = (vault: string, isDeposit: boolean, amount: bigint) => {
  const encodedAction = ethers.AbiCoder.defaultAbiCoder().encode(["address", "bool", "uint64"], [vault, isDeposit, amount]);
  const versionBytes = ethers.getBytes(ethers.toBeHex(ACTION_VERSION));
  const actionIdBytes = ethers.getBytes(ethers.zeroPadValue(ethers.toBeHex(VAULT_TRANSFER_ACTION_ID), 3));
  const header = ethers.concat([versionBytes, actionIdBytes]);
  return ethers.concat([header, encodedAction]);
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

    const BridgeFactory = await ethers.getContractFactory("HyperliquidBridgeAdapter");
    const bridge = (await BridgeFactory.deploy(
      await asset.getAddress(),
      await mockHyper.getAddress(),
      await coreWriter.getAddress()
    )) as HyperliquidBridgeAdapter;
    await bridge.waitForDeployment();

    return { deployer, strategy, stranger, asset, mockHyper, bridge, coreWriter };
  }

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

  it("stakes assets and tracks strategy shares", async () => {
    const { bridge, strategy, asset, mockHyper } = await loadFixture(fixture);
    await bridge.setAuthorizedStrategy(strategy.address, true);

    const depositAmount = toUSDC("150");
    await asset.mint(strategy.address, depositAmount);
    await asset.connect(strategy).approve(await bridge.getAddress(), depositAmount);

    await bridge.connect(strategy).stake(depositAmount);

    const shares = await bridge.shareBalance(strategy.address);
    expect(shares).to.equal(depositAmount);
    expect(await mockHyper.balanceOf(await bridge.getAddress())).to.equal(shares);
    expect(await bridge.totalAssets(strategy.address)).to.equal(depositAmount);
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

  it("unstakes assets with rounding and transfers funds back to the strategy", async () => {
    const { bridge, strategy, asset, mockHyper } = await loadFixture(fixture);
    await bridge.setAuthorizedStrategy(strategy.address, true);

    const depositAmount = toUSDC("200");
    await asset.mint(strategy.address, depositAmount);
    await asset.connect(strategy).approve(await bridge.getAddress(), depositAmount);
    await bridge.connect(strategy).stake(depositAmount);

    await mockHyper.setSharePrice(toWad("1.2"));
    const bridgeAddress = await bridge.getAddress();
    const expectedAssets = await mockHyper.convertToAssets(await mockHyper.balanceOf(bridgeAddress));
    const balance = await asset.balanceOf(await mockHyper.getAddress());
    if (expectedAssets > balance) {
      await asset.mint(await mockHyper.getAddress(), expectedAssets - balance);
    }

    const withdrawAmount = toUSDC("80");
    const before = await asset.balanceOf(strategy.address);
    const [sharesBurned, assetsReceived] = await bridge.connect(strategy).unstake.staticCall(withdrawAmount);
    expect(sharesBurned).to.be.gt(0n);
    await bridge.connect(strategy).unstake(withdrawAmount);
    const after = await asset.balanceOf(strategy.address);
    expect(after - before).to.equal(withdrawAmount);
    expect(assetsReceived).to.equal(withdrawAmount);
  });

  it("sends a CoreWriter vault transfer action on unstake", async () => {
    const { bridge, strategy, asset, mockHyper, coreWriter } = await loadFixture(fixture);
    await bridge.setAuthorizedStrategy(strategy.address, true);

    const depositAmount = toUSDC("120");
    await asset.mint(strategy.address, depositAmount);
    await asset.connect(strategy).approve(await bridge.getAddress(), depositAmount);
    await bridge.connect(strategy).stake(depositAmount);

    await mockHyper.setSharePrice(toWad("0.9"));
    const withdrawAmount = toUSDC("60");
    const bridgeAddress = await bridge.getAddress();
    const expectedAssets = await mockHyper.convertToAssets(await mockHyper.balanceOf(bridgeAddress));
    const balance = await asset.balanceOf(await mockHyper.getAddress());
    if (expectedAssets > balance) {
      await asset.mint(await mockHyper.getAddress(), expectedAssets - balance);
    }

    await bridge.connect(strategy).unstake(withdrawAmount);
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
    await expect(bridge.connect(strategy).unstake(0n)).to.be.revertedWithCustomError(bridge, "ZeroAssets");
  });

  it("reverts unstake when strategy holds no shares", async () => {
    const { bridge, strategy } = await loadFixture(fixture);
    await bridge.setAuthorizedStrategy(strategy.address, true);
    await expect(bridge.connect(strategy).unstake(1n)).to.be.revertedWithCustomError(bridge, "InsufficientAssets");
  });

  it("reverts unstake when strategy requests more than holdings or vault slippage hits", async () => {
    const { bridge, strategy, asset, mockHyper } = await loadFixture(fixture);
    await bridge.setAuthorizedStrategy(strategy.address, true);

    const depositAmount = toUSDC("50");
    await asset.mint(strategy.address, depositAmount);
    await asset.connect(strategy).approve(await bridge.getAddress(), depositAmount);
    await bridge.connect(strategy).stake(depositAmount);

    await expect(bridge.connect(strategy).unstake(toUSDC("60"))).to.be.revertedWithCustomError(
      bridge,
      "InsufficientAssets"
    );

    await mockHyper.setRedemptionSlippageBps(5_000);
    await expect(bridge.connect(strategy).unstake(toUSDC("10"))).to.be.revertedWithCustomError(
      bridge,
      "InsufficientAssets"
    );
  });

  it("reverts unstake when redemption amount would overflow uint64", async () => {
    const { bridge, strategy, asset, mockHyper } = await loadFixture(fixture);
    await bridge.setAuthorizedStrategy(strategy.address, true);

    const depositAmount = UINT64_MAX;
    await asset.mint(strategy.address, depositAmount);
    await asset.connect(strategy).approve(await bridge.getAddress(), depositAmount);
    await bridge.connect(strategy).stake(depositAmount);

    await mockHyper.setSharePrice(toWad("2"));
    const bridgeAddress = await bridge.getAddress();
    const expectedAssets = await mockHyper.convertToAssets(await mockHyper.balanceOf(bridgeAddress));
    const balance = await asset.balanceOf(await mockHyper.getAddress());
    if (expectedAssets > balance) {
      await asset.mint(await mockHyper.getAddress(), expectedAssets - balance);
    }

    await expect(bridge.connect(strategy).unstake(depositAmount)).to.be.revertedWithCustomError(
      bridge,
      "AmountTooLarge"
    );
  });
});


