import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

import {
  MockHyperliquidVault,
  MockStrategyVault,
  MockUSDC,
} from "../typechain-types";

const toUSDC = (value: string) => ethers.parseUnits(value, 6);
const toWad = (value: string) => ethers.parseUnits(value, 18);

describe("Mock contracts", () => {
  describe("MockHyperliquidVault", () => {
    async function hyperFixture() {
      const [deployer, user] = await ethers.getSigners();
      const AssetFactory = await ethers.getContractFactory("MockUSDC");
      const asset = (await AssetFactory.deploy()) as MockUSDC;
      await asset.waitForDeployment();

      const HyperFactory = await ethers.getContractFactory("MockHyperliquidVault");
      const hyper = (await HyperFactory.deploy(await asset.getAddress())) as MockHyperliquidVault;
      await hyper.waitForDeployment();

      return { deployer, user, asset, hyper, HyperFactory };
    }

    it("reverts constructor on zero asset", async () => {
      const HyperFactory = await ethers.getContractFactory("MockHyperliquidVault");
      await expect(HyperFactory.deploy(ethers.ZeroAddress)).to.be.revertedWithCustomError(
        HyperFactory,
        "ZeroAddress"
      );
    });

    it("reverts deposit on zero amount", async () => {
      const { hyper, user } = await loadFixture(hyperFixture);
      await expect(hyper.connect(user).deposit(0n, user.address)).to.be.revertedWithCustomError(
        hyper,
        "ZeroAmount"
      );
    });

    it("reverts deposit on zero receiver", async () => {
      const { hyper, asset, deployer } = await loadFixture(hyperFixture);
      const amount = toUSDC("1");
      await asset.mint(deployer.address, amount);
      await asset.connect(deployer).approve(await hyper.getAddress(), amount);
      await expect(
        hyper.connect(deployer).deposit(amount, ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(hyper, "ZeroAddress");
    });

    it("reverts deposit when share price forces zero shares", async () => {
      const { hyper, asset, deployer } = await loadFixture(hyperFixture);
      await hyper.setSharePrice(toWad("1000000"));
      const amount = 1n;
      await asset.mint(deployer.address, amount);
      await asset.connect(deployer).approve(await hyper.getAddress(), amount);
      await expect(hyper.connect(deployer).deposit(amount, deployer.address)).to.be.revertedWithCustomError(
        hyper,
        "InsufficientShares"
      );
    });

    it("reverts when setting share price to zero", async () => {
      const { hyper } = await loadFixture(hyperFixture);
      await expect(hyper.setSharePrice(0n)).to.be.revertedWithCustomError(hyper, "ZeroAmount");
    });

    it("reverts when setting excessive slippage", async () => {
      const { hyper } = await loadFixture(hyperFixture);
      await expect(hyper.setRedemptionSlippageBps(20_000)).to.be.revertedWith("slippage too high");
    });

    it("reverts redeem on zero amount", async () => {
      const { hyper, deployer } = await loadFixture(hyperFixture);
      await expect(
        hyper.redeem(0n, deployer.address, deployer.address)
      ).to.be.revertedWithCustomError(hyper, "ZeroAmount");
    });

    it("reverts redeem on zero receiver", async () => {
      const { hyper, asset, deployer } = await loadFixture(hyperFixture);
      const amount = toUSDC("5");
      await asset.mint(deployer.address, amount);
      await asset.connect(deployer).approve(await hyper.getAddress(), amount);
      await hyper.connect(deployer).deposit(amount, deployer.address);
      const shares = await hyper.balanceOf(deployer.address);
      await expect(
        hyper.redeem(shares, ethers.ZeroAddress, deployer.address)
      ).to.be.revertedWithCustomError(hyper, "ZeroAddress");
    });

    it("reverts redeem when burning more shares than owned", async () => {
      const { hyper, asset, deployer } = await loadFixture(hyperFixture);
      const amount = toUSDC("3");
      await asset.mint(deployer.address, amount);
      await asset.connect(deployer).approve(await hyper.getAddress(), amount);
      await hyper.connect(deployer).deposit(amount, deployer.address);
      const shares = (await hyper.balanceOf(deployer.address)) + 1n;
      await expect(
        hyper.redeem(shares, deployer.address, deployer.address)
      ).to.be.revertedWithCustomError(hyper, "InsufficientShares");
    });
  });

  describe("MockStrategyVault", () => {
    async function strategyFixture() {
      const [deployer] = await ethers.getSigners();
      const AssetFactory = await ethers.getContractFactory("MockUSDC");
      const asset = (await AssetFactory.deploy()) as MockUSDC;
      await asset.waitForDeployment();

      const StrategyFactory = await ethers.getContractFactory("MockStrategyVault");
      const strategy = (await StrategyFactory.deploy(await asset.getAddress())) as MockStrategyVault;
      await strategy.waitForDeployment();

      return { deployer, asset, strategy, StrategyFactory };
    }

    it("reverts constructor on zero asset", async () => {
      const StrategyFactory = await ethers.getContractFactory("MockStrategyVault");
      await expect(StrategyFactory.deploy(ethers.ZeroAddress)).to.be.revertedWith("asset is zero");
    });

    it("reverts share price updates to zero", async () => {
      const { strategy } = await loadFixture(strategyFixture);
      await expect(strategy.setSharePrice(0n)).to.be.revertedWith("price zero");
    });

    it("reverts deposit on zero assets", async () => {
      const { strategy } = await loadFixture(strategyFixture);
      await expect(strategy.deposit(0n)).to.be.revertedWith("zero assets");
    });

    it("reverts withdraw on zero assets", async () => {
      const { strategy } = await loadFixture(strategyFixture);
      await expect(strategy.withdraw(0n)).to.be.revertedWith("zero assets");
    });

    it("reverts withdraw when insufficient shares remain", async () => {
      const { strategy, asset, deployer } = await loadFixture(strategyFixture);
      const amount = toUSDC("5");
      await asset.mint(deployer.address, amount);
      await asset.connect(deployer).approve(await strategy.getAddress(), amount);
      await strategy.connect(deployer).deposit(amount);
      await expect(strategy.connect(deployer).withdraw(toUSDC("6"))).to.be.revertedWith("insufficient shares");
    });
  });
});

