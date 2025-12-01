import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

import {
  NGOGovernance,
  NGOVault,
  NGOShare,
  MockStrategyVault,
  MockUSDC,
} from "../typechain-types";
import { deployVaultFixture, SHARE_SCALAR } from "./utils/fixtures";

const toUSDC = (value: string) => ethers.parseUnits(value, 6);
const toWad = (value: string) => ethers.parseUnits(value, 18);

async function deposit(
  vault: NGOVault,
  asset: MockUSDC,
  user: SignerWithAddress,
  amount: bigint,
  receiver?: string
) {
  await asset.connect(user).approve(await vault.getAddress(), amount);
  return vault.connect(user).deposit(amount, receiver ?? user.address);
}


async function syncStrategyHoldings(asset: MockUSDC, strategy: MockStrategyVault) {
  const strategyAddress = await strategy.getAddress();
  const expected = await strategy.totalAssets();
  const balance = await asset.balanceOf(strategyAddress);
  if (expected > balance) {
    await asset.mint(strategyAddress, expected - balance);
  } else if (balance > expected) {
    await asset.burn(strategyAddress, balance - expected);
  }
}

async function forceSetDonationBps(vault: NGOVault, newBps: number) {
  const slotKey = ethers.toBeHex(2, 32);
  const currentSlot = await ethers.provider.getStorage(await vault.getAddress(), slotKey);
  const governanceMask = (1n << 160n) - 1n;
  const currentValue = BigInt(currentSlot);
  const governanceBits = currentValue & governanceMask;
  const donationBits = BigInt(newBps) << 160n;
  const newSlotValue = ethers.zeroPadValue(ethers.toBeHex(donationBits | governanceBits), 32);
  await ethers.provider.send("hardhat_setStorageAt", [await vault.getAddress(), slotKey, newSlotValue]);
}

describe("NGOVault", () => {
  async function fixture() {
    return deployVaultFixture();
  }

  describe("deposit", () => {
    it("reverts on zero assets", async () => {
      const { vault, alice } = await loadFixture(fixture);
      await expect(vault.connect(alice).deposit(0n, alice.address)).to.be.revertedWith("Zero assets");
    });

    it("reverts on zero receiver", async () => {
      const { vault, alice, asset } = await loadFixture(fixture);
      await asset.connect(alice).approve(await vault.getAddress(), toUSDC("1"));
      await expect(
        vault.connect(alice).deposit(toUSDC("1"), ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid receiver");
    });

    it("mints scaled shares for initial deposit", async () => {
      const { vault, asset, share, alice } = await loadFixture(fixture);
      const amount = toUSDC("100");
      expect(await asset.decimals()).to.equal(6);
      await deposit(vault, asset, alice, amount);
      expect(await share.balanceOf(alice.address)).to.equal(amount * SHARE_SCALAR);
      expect(await vault.totalDeposited(alice.address)).to.equal(amount);
    });

    it("mints proportional shares after price appreciation", async () => {
      const { vault, asset, share, strategy, alice, bob } = await loadFixture(fixture);
      await deposit(vault, asset, alice, toUSDC("100"));
      await strategy.setSharePrice(toWad("1.5"));
      await syncStrategyHoldings(asset, strategy);
      await deposit(vault, asset, bob, toUSDC("50"));
      const bobShares = await share.balanceOf(bob.address);
      const expectedShares = (toUSDC("50") * (await share.totalSupply())) / (await vault.totalAssets());
      expect(bobShares).to.be.closeTo(expectedShares, 1_000_000_000_000n);
    });

    it("credits deposits to receiver", async () => {
      const { vault, asset, share, alice, bob } = await loadFixture(fixture);
      const amount = toUSDC("25");
      await deposit(vault, asset, alice, amount, bob.address);
      expect(await share.balanceOf(bob.address)).to.equal(amount * SHARE_SCALAR);
      expect(await vault.totalDeposited(bob.address)).to.equal(amount);
      expect(await share.balanceOf(alice.address)).to.equal(0n);
    });
  });

  describe("withdrawal queue", () => {
    it("blocks deposits for receivers with pending withdrawals", async () => {
      const { vault, asset, share, strategy, alice } = await loadFixture(fixture);
      await deposit(vault, asset, alice, toUSDC("25"));
      await strategy.setWithdrawalsEnabled(false);
      const shares = await share.balanceOf(alice.address);
      await vault.connect(alice).redeem(shares, alice.address);
      await asset.connect(alice).approve(await vault.getAddress(), toUSDC("1"));
      await expect(vault.connect(alice).deposit(toUSDC("1"), alice.address)).to.be.revertedWith(
        "Withdrawal pending"
      );
    });

    it("queues withdrawals when strategy is locked and processes later", async () => {
      const { vault, asset, share, strategy, governance, alice } = await loadFixture(fixture);
      await deposit(vault, asset, alice, toUSDC("50"));
      await strategy.setWithdrawalsEnabled(false);
      const shares = await share.balanceOf(alice.address);

      const tx = await vault.connect(alice).redeem(shares, alice.address);
      await expect(tx).to.emit(vault, "WithdrawalQueued").withArgs(alice.address, shares, toUSDC("50"));
      const request = await vault.queuedWithdrawals(alice.address);
      expect(request.shares).to.equal(shares);

      await expect(vault.connect(alice).redeem(1n, alice.address)).to.be.revertedWith("Withdrawal pending");

      await strategy.setWithdrawalsEnabled(true);
      const processTx = await vault.processQueuedWithdrawal(alice.address);
      await expect(processTx)
        .to.emit(vault, "WithdrawalProcessed")
        .withArgs(alice.address, alice.address, anyValue, anyValue);

      expect((await asset.balanceOf(alice.address)) > 0n).to.be.true;
      expect(await asset.balanceOf(await governance.getAddress())).to.be.gte(0n);
      const cleared = await vault.queuedWithdrawals(alice.address);
      expect(cleared.shares).to.equal(0n);
    });
  });

  describe("withdrawal queue", () => {
  });

  describe("redeem", () => {
    it("reverts on zero shares", async () => {
      const { vault, alice } = await loadFixture(fixture);
      await expect(vault.connect(alice).redeem(0n, alice.address)).to.be.revertedWith("Zero shares");
    });

    it("reverts on zero receiver", async () => {
      const { vault, asset, share, alice } = await loadFixture(fixture);
      await deposit(vault, asset, alice, toUSDC("1"));
      const balance = await share.balanceOf(alice.address);
      await expect(vault.connect(alice).redeem(balance, ethers.ZeroAddress)).to.be.revertedWith(
        "Invalid receiver"
      );
    });

    it("reverts when burning more shares than owned", async () => {
      const { vault, asset, share, alice } = await loadFixture(fixture);
      await deposit(vault, asset, alice, toUSDC("10"));
      const shares = (await share.balanceOf(alice.address)) + 1n;
      await expect(vault.connect(alice).redeem(shares, alice.address)).to.be.revertedWithCustomError(
        share,
        "ERC20InsufficientBalance"
      );
    });

    it("sends proceeds to receiver address", async () => {
      const { vault, asset, share, strategy, alice, bob } = await loadFixture(fixture);
      await deposit(vault, asset, alice, toUSDC("50"));
      await strategy.setSharePrice(toWad("1.2"));
      await syncStrategyHoldings(asset, strategy);
      const shares = await share.balanceOf(alice.address);
      const bobBalanceBefore = await asset.balanceOf(bob.address);
      await vault.connect(alice).redeem(shares, bob.address);
      const bobBalanceAfter = await asset.balanceOf(bob.address);
      expect(bobBalanceAfter).to.be.gt(bobBalanceBefore);
      expect(await share.balanceOf(alice.address)).to.equal(0n);
    });

    it("donates on profit only", async () => {
      const { vault, asset, share, strategy, governance, alice } = await loadFixture(fixture);
      await deposit(vault, asset, alice, toUSDC("100"));
      await strategy.setSharePrice(toWad("1.5"));
      await syncStrategyHoldings(asset, strategy);
      const shares = await share.balanceOf(alice.address);
      const [expectedNet, expectedDonation] = await vault
        .connect(alice)
        .redeem.staticCall(shares, alice.address);
      expect(expectedDonation).to.equal(toUSDC("5"));
      const aliceBalanceBefore = await asset.balanceOf(alice.address);
      await vault.connect(alice).redeem(shares, alice.address);
      const aliceBalanceAfter = await asset.balanceOf(alice.address);
      expect(aliceBalanceAfter - aliceBalanceBefore).to.equal(expectedNet);
      expect(await asset.balanceOf(await governance.getAddress())).to.equal(expectedDonation);
      expect(await vault.totalDonated(alice.address)).to.equal(expectedDonation);
      expect(await vault.totalWithdrawn(alice.address)).to.equal(expectedNet);
    });

    it("does not donate on pure losses", async () => {
      const { vault, asset, share, strategy, governance, alice } = await loadFixture(fixture);
      await deposit(vault, asset, alice, toUSDC("100"));
      await strategy.setSharePrice(toWad("0.4"));
      await syncStrategyHoldings(asset, strategy);
      const shares = await share.balanceOf(alice.address);
      const [, donation] = await vault.connect(alice).redeem.staticCall(shares, alice.address);
      expect(donation).to.equal(0n);
      await vault.connect(alice).redeem(shares, alice.address);
      expect(await asset.balanceOf(await governance.getAddress())).to.equal(0n);
      expect(await vault.totalDonated(alice.address)).to.equal(0n);
    });

    it("keeps donations zero for consecutive losses", async () => {
      const { vault, asset, share, strategy, alice } = await loadFixture(fixture);
      await deposit(vault, asset, alice, toUSDC("100"));
      await strategy.setSharePrice(toWad("0.5"));
      await syncStrategyHoldings(asset, strategy);
      const shares = await share.balanceOf(alice.address);
      const half = shares / 2n;
      await vault.connect(alice).redeem(half, alice.address);
      await strategy.setSharePrice(toWad("0.4"));
      await syncStrategyHoldings(asset, strategy);
      await vault.connect(alice).redeem(await share.balanceOf(alice.address), alice.address);
      expect(await vault.totalDonated(alice.address)).to.equal(0n);
    });

    it("donates only once user fully profitable after prior losses", async () => {
      const { vault, asset, share, strategy, governance, alice } = await loadFixture(fixture);
      await deposit(vault, asset, alice, toUSDC("100"));
      await strategy.setSharePrice(toWad("0.5"));
      await syncStrategyHoldings(asset, strategy);
      const shares = await share.balanceOf(alice.address);
      const slice = shares / 5n;
      await vault.connect(alice).redeem(slice, alice.address);
      await strategy.setSharePrice(toWad("1.5"));
      await syncStrategyHoldings(asset, strategy);
      const [net, donation] = await vault
        .connect(alice)
        .redeem.staticCall(await share.balanceOf(alice.address), alice.address);
      expect(donation).to.equal(toUSDC("3"));
      await vault.connect(alice).redeem(await share.balanceOf(alice.address), alice.address);
      expect(await asset.balanceOf(await governance.getAddress())).to.equal(donation);
      expect(await vault.totalWithdrawn(alice.address)).to.equal(net + toUSDC("10"));
      expect(await vault.totalDonated(alice.address)).to.equal(donation);
    });

    it("keeps accounting isolated per user", async () => {
      const { vault, asset, share, strategy, alice, bob } = await loadFixture(fixture);
      await deposit(vault, asset, alice, toUSDC("100"));
      await deposit(vault, asset, bob, toUSDC("150"));
      await strategy.setSharePrice(toWad("2"));
      await syncStrategyHoldings(asset, strategy);
      const aliceShares = await share.balanceOf(alice.address);
      await vault.connect(alice).redeem(aliceShares, alice.address);
      expect(await vault.totalWithdrawn(bob.address)).to.equal(0n);
      expect(await share.balanceOf(bob.address)).to.equal(toUSDC("150") * SHARE_SCALAR);
    });

    it("matches totalAssets with strategy valuation", async () => {
      const { vault, asset, strategy, alice } = await loadFixture(fixture);
      await deposit(vault, asset, alice, toUSDC("42"));
      await strategy.setSharePrice(toWad("1.1"));
      await syncStrategyHoldings(asset, strategy);
      expect(await vault.totalAssets()).to.equal(await strategy.totalAssets());
    });

    it("caps donation if misconfigured bps exceed 100%", async () => {
      const { vault, asset, share, strategy, governance, alice } = await loadFixture(fixture);
      await deposit(vault, asset, alice, toUSDC("100"));
      await strategy.setSharePrice(toWad("2"));
      await syncStrategyHoldings(asset, strategy);
      await forceSetDonationBps(vault, 20_000);
      const shares = await share.balanceOf(alice.address);
      const [net, donation] = await vault.connect(alice).redeem.staticCall(shares, alice.address);
      expect(net).to.equal(0n);
      expect(donation).to.equal(toUSDC("200"));
      await vault.connect(alice).redeem(shares, alice.address);
      expect(await vault.totalWithdrawn(alice.address)).to.equal(0n);
      expect(await asset.balanceOf(await governance.getAddress())).to.equal(toUSDC("200"));
    });

    it("caps donation when user already realized profits", async () => {
      const { vault, asset, share, strategy, governance, alice } = await loadFixture(fixture);
      await deposit(vault, asset, alice, toUSDC("100"));
      await strategy.setSharePrice(toWad("2"));
      await syncStrategyHoldings(asset, strategy);
      let shares = await share.balanceOf(alice.address);
      await vault.connect(alice).redeem(shares, alice.address);

      await deposit(vault, asset, alice, toUSDC("10"));
      await strategy.setSharePrice(toWad("2"));
      await syncStrategyHoldings(asset, strategy);
      await forceSetDonationBps(vault, 20_000);

      shares = await share.balanceOf(alice.address);
      const [net, donation] = await vault.connect(alice).redeem.staticCall(shares, alice.address);
      expect(net).to.equal(0n);
      expect(donation).to.equal(toUSDC("20"));
      await vault.connect(alice).redeem(shares, alice.address);

      expect(await vault.totalDonated(alice.address)).to.equal(toUSDC("30"));
      expect(await asset.balanceOf(await governance.getAddress())).to.equal(toUSDC("30"));
    });
  });

  describe("accounting + admin", () => {
    it("returns aggregated accounting", async () => {
      const { vault, asset, share, strategy, alice } = await loadFixture(fixture);
      await deposit(vault, asset, alice, toUSDC("100"));
      await strategy.setSharePrice(toWad("1.2"));
      await syncStrategyHoldings(asset, strategy);
      await vault.connect(alice).redeem(await share.balanceOf(alice.address), alice.address);
      const user = await vault.getUserAccounting(alice.address);
      expect(user.deposited).to.equal(toUSDC("100"));
      expect(user.withdrawn).to.be.gt(toUSDC("100"));
      expect(user.donated).to.be.gt(0n);
    });

    it("allows owner to update donation bps", async () => {
      const { vault, alice } = await loadFixture(fixture);
      await expect(vault.setDonationBps(5_000)).to.emit(vault, "DonationBpsUpdated").withArgs(5_000);
      await expect(vault.connect(alice).setDonationBps(1)).to.be.revertedWithCustomError(
        vault,
        "OwnableUnauthorizedAccount"
      );
      await expect(vault.setDonationBps(20_000)).to.be.revertedWith("donationBps too high");
    });

    it("allows owner to update governance target", async () => {
      const { vault, governance, alice, asset, share } = await loadFixture(fixture);
      const NGOGovernanceFactory = await ethers.getContractFactory("NGOGovernance");
      const newGovernance = (await NGOGovernanceFactory.deploy(
        await asset.getAddress(),
        await share.getAddress()
      )) as NGOGovernance;
      await newGovernance.waitForDeployment();

      await expect(vault.setGovernance(await newGovernance.getAddress()))
        .to.emit(vault, "GovernanceUpdated")
        .withArgs(await newGovernance.getAddress());

      await expect(
        vault.connect(alice).setGovernance(await newGovernance.getAddress())
      ).to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");

      await expect(vault.setGovernance(ethers.ZeroAddress)).to.be.revertedWith("governance zero");
    });
  });

  describe("share token", () => {
    it("restricts mint/burn to vault", async () => {
      const { share, alice } = await loadFixture(fixture);
      await expect(share.connect(alice).mint(alice.address, 1n)).to.be.revertedWithCustomError(
        share,
        "NotVault"
      );
      await expect(share.connect(alice).burn(alice.address, 1n)).to.be.revertedWithCustomError(
        share,
        "NotVault"
      );
      expect(await share.decimals()).to.equal(18);
    });
  });
});

