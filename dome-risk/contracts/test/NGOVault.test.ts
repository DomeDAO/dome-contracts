import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

import {
  Governance,
  GovernanceBuffer,
  Vault,
  Share,
  MockStrategyVault,
  MockUSDC,
} from "../typechain-types";
import { deployVaultFixture, SHARE_SCALAR } from "./utils/fixtures";

const toUSDC = (value: string) => ethers.parseUnits(value, 6);
const toWad = (value: string) => ethers.parseUnits(value, 18);

async function deposit(
  vault: Vault,
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

async function forceSetDonationBps(vault: Vault, newBps: number) {
  // Storage layout (Solidity packs smaller types):
  // Slot 0: Ownable._owner (20 bytes)
  // Slot 1: ReentrancyGuard._status (32 bytes)
  // Slot 2: governance (20 bytes)
  // Slot 3: governanceBuffer (20 bytes) + donationBps (2 bytes) - PACKED!
  // 
  // In slot 3: [12 bytes padding][donationBps: 2 bytes][governanceBuffer: 20 bytes]
  // donationBps is at bytes 20-21 (after the address)
  const slotKey = ethers.toBeHex(3, 32);
  const currentSlot = await ethers.provider.getStorage(await vault.getAddress(), slotKey);
  const currentValue = BigInt(currentSlot);
  
  // governanceBuffer is in the lower 160 bits (20 bytes)
  const addressMask = (1n << 160n) - 1n;
  const governanceBufferBits = currentValue & addressMask;
  
  // donationBps goes in bits 160-175 (2 bytes = 16 bits after the address)
  const donationBits = BigInt(newBps) << 160n;
  
  const newSlotValue = ethers.zeroPadValue(ethers.toBeHex(donationBits | governanceBufferBits), 32);
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
    const TWENTY_FOUR_HOURS = 24 * 60 * 60;

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

    it("queues withdrawals when strategy is locked and processes after 24h", async () => {
      const { vault, asset, share, strategy, governanceBuffer, alice } = await loadFixture(fixture);
      await deposit(vault, asset, alice, toUSDC("50"));
      await strategy.setWithdrawalsEnabled(false);
      const shares = await share.balanceOf(alice.address);

      const tx = await vault.connect(alice).redeem(shares, alice.address);
      await expect(tx).to.emit(vault, "WithdrawalQueued").withArgs(alice.address, shares, toUSDC("50"));
      const request = await vault.queuedWithdrawals(alice.address);
      expect(request.shares).to.equal(shares);

      await expect(vault.connect(alice).redeem(1n, alice.address)).to.be.revertedWith("Withdrawal pending");

      // Enable strategy withdrawals but still within 24h window
      await strategy.setWithdrawalsEnabled(true);
      
      // Should fail - 24h delay not met
      await expect(vault.processQueuedWithdrawal(alice.address)).to.be.revertedWith(
        "Withdrawal delay not met"
      );

      // Advance time past 24h
      await time.increase(TWENTY_FOUR_HOURS);

      // Now it should work
      const processTx = await vault.processQueuedWithdrawal(alice.address);
      await expect(processTx)
        .to.emit(vault, "WithdrawalProcessed")
        .withArgs(alice.address, alice.address, anyValue, anyValue);

      expect((await asset.balanceOf(alice.address)) > 0n).to.be.true;
      expect(await asset.balanceOf(await governanceBuffer.getAddress())).to.be.gte(0n);
      const cleared = await vault.queuedWithdrawals(alice.address);
      expect(cleared.shares).to.equal(0n);
    });

    it("enforces 24h minimum wait time even when strategy is ready", async () => {
      const { vault, asset, share, strategy, alice } = await loadFixture(fixture);
      await deposit(vault, asset, alice, toUSDC("100"));
      await strategy.setWithdrawalsEnabled(false);
      const shares = await share.balanceOf(alice.address);
      await vault.connect(alice).redeem(shares, alice.address);

      // Strategy is immediately ready
      await strategy.setWithdrawalsEnabled(true);

      // But 24h hasn't passed
      await expect(vault.processQueuedWithdrawal(alice.address)).to.be.revertedWith(
        "Withdrawal delay not met"
      );

      // Advance 12 hours - still not enough
      await time.increase(12 * 60 * 60);
      await expect(vault.processQueuedWithdrawal(alice.address)).to.be.revertedWith(
        "Withdrawal delay not met"
      );

      // Advance another 12 hours (total 24h)
      await time.increase(12 * 60 * 60);
      
      // Now it works
      await vault.processQueuedWithdrawal(alice.address);
      const cleared = await vault.queuedWithdrawals(alice.address);
      expect(cleared.shares).to.equal(0n);
    });

    it("requires both 24h delay AND strategy availability", async () => {
      const { vault, asset, share, strategy, alice } = await loadFixture(fixture);
      await deposit(vault, asset, alice, toUSDC("100"));
      await strategy.setWithdrawalsEnabled(false);
      const shares = await share.balanceOf(alice.address);
      await vault.connect(alice).redeem(shares, alice.address);

      // Advance 24h but strategy still locked
      await time.increase(TWENTY_FOUR_HOURS);
      await expect(vault.processQueuedWithdrawal(alice.address)).to.be.revertedWith(
        "Withdrawal locked"
      );

      // Enable strategy - now both conditions met
      await strategy.setWithdrawalsEnabled(true);
      await vault.processQueuedWithdrawal(alice.address);
      expect((await vault.queuedWithdrawals(alice.address)).shares).to.equal(0n);
    });

    it("returns correct withdrawalUnlockTime", async () => {
      const { vault, asset, share, strategy, alice, bob } = await loadFixture(fixture);
      
      // No queued withdrawal - returns 0
      expect(await vault.withdrawalUnlockTime(alice.address)).to.equal(0n);

      await deposit(vault, asset, alice, toUSDC("100"));
      await strategy.setWithdrawalsEnabled(false);
      const shares = await share.balanceOf(alice.address);
      
      const txReceipt = await (await vault.connect(alice).redeem(shares, alice.address)).wait();
      const block = await ethers.provider.getBlock(txReceipt!.blockNumber);
      const queuedTimestamp = block!.timestamp;

      const unlockTime = await vault.withdrawalUnlockTime(alice.address);
      expect(unlockTime).to.equal(queuedTimestamp + TWENTY_FOUR_HOURS);

      // Bob has no withdrawal queued
      expect(await vault.withdrawalUnlockTime(bob.address)).to.equal(0n);
    });

    it("returns correct canProcessWithdrawal status", async () => {
      const { vault, asset, share, strategy, alice, bob } = await loadFixture(fixture);
      
      // No queued withdrawal - returns false
      expect(await vault.canProcessWithdrawal(alice.address)).to.equal(false);

      await deposit(vault, asset, alice, toUSDC("100"));
      await strategy.setWithdrawalsEnabled(false);
      const shares = await share.balanceOf(alice.address);
      await vault.connect(alice).redeem(shares, alice.address);

      // Just queued - can't process yet
      expect(await vault.canProcessWithdrawal(alice.address)).to.equal(false);

      // Advance 12h - still can't process
      await time.increase(12 * 60 * 60);
      expect(await vault.canProcessWithdrawal(alice.address)).to.equal(false);

      // Advance to exactly 24h
      await time.increase(12 * 60 * 60);
      expect(await vault.canProcessWithdrawal(alice.address)).to.equal(true);

      // Bob still has no withdrawal
      expect(await vault.canProcessWithdrawal(bob.address)).to.equal(false);
    });

    it("processes withdrawal at exactly 24h mark", async () => {
      const { vault, asset, share, strategy, alice } = await loadFixture(fixture);
      await deposit(vault, asset, alice, toUSDC("100"));
      await strategy.setWithdrawalsEnabled(false);
      const shares = await share.balanceOf(alice.address);
      await vault.connect(alice).redeem(shares, alice.address);

      await strategy.setWithdrawalsEnabled(true);

      // Get the queued timestamp
      const request = await vault.queuedWithdrawals(alice.address);
      const unlockTime = request.timestamp + BigInt(TWENTY_FOUR_HOURS);

      // Set time to just before unlock
      await time.setNextBlockTimestamp(unlockTime - 1n);
      await expect(vault.processQueuedWithdrawal(alice.address)).to.be.revertedWith(
        "Withdrawal delay not met"
      );

      // Set time to exactly at unlock
      await time.setNextBlockTimestamp(unlockTime);
      await vault.processQueuedWithdrawal(alice.address);
      expect((await vault.queuedWithdrawals(alice.address)).shares).to.equal(0n);
    });
  });

  describe("withdrawal queue with profit/loss scenarios", () => {
    const TWENTY_FOUR_HOURS = 24 * 60 * 60;

    it("processes queued withdrawal with profit (positive performance)", async () => {
      const { vault, asset, share, strategy, governanceBuffer, alice } = await loadFixture(fixture);
      await deposit(vault, asset, alice, toUSDC("100"));
      
      // 50% profit
      await strategy.setSharePrice(toWad("1.5"));
      await syncStrategyHoldings(asset, strategy);
      
      await strategy.setWithdrawalsEnabled(false);
      const shares = await share.balanceOf(alice.address);
      await vault.connect(alice).redeem(shares, alice.address);

      await strategy.setWithdrawalsEnabled(true);
      await time.increase(TWENTY_FOUR_HOURS);

      const aliceBalanceBefore = await asset.balanceOf(alice.address);
      await vault.processQueuedWithdrawal(alice.address);
      const aliceBalanceAfter = await asset.balanceOf(alice.address);

      // Should receive ~$145 (150 - 10% of 50 profit = 150 - 5 = 145)
      expect(aliceBalanceAfter - aliceBalanceBefore).to.equal(toUSDC("145"));
      expect(await asset.balanceOf(await governanceBuffer.getAddress())).to.equal(toUSDC("5"));
    });

    it("processes queued withdrawal with loss (negative performance)", async () => {
      const { vault, asset, share, strategy, governanceBuffer, alice } = await loadFixture(fixture);
      await deposit(vault, asset, alice, toUSDC("100"));
      
      // 50% loss
      await strategy.setSharePrice(toWad("0.5"));
      await syncStrategyHoldings(asset, strategy);
      
      await strategy.setWithdrawalsEnabled(false);
      const shares = await share.balanceOf(alice.address);
      await vault.connect(alice).redeem(shares, alice.address);

      await strategy.setWithdrawalsEnabled(true);
      await time.increase(TWENTY_FOUR_HOURS);

      const aliceBalanceBefore = await asset.balanceOf(alice.address);
      await vault.processQueuedWithdrawal(alice.address);
      const aliceBalanceAfter = await asset.balanceOf(alice.address);

      // Should receive $50 (no donation on loss)
      expect(aliceBalanceAfter - aliceBalanceBefore).to.equal(toUSDC("50"));
      expect(await asset.balanceOf(await governanceBuffer.getAddress())).to.equal(0n);
    });

    it("processes queued withdrawal with break-even (no change)", async () => {
      const { vault, asset, share, strategy, governanceBuffer, alice } = await loadFixture(fixture);
      await deposit(vault, asset, alice, toUSDC("100"));
      
      // No price change (break-even)
      await strategy.setWithdrawalsEnabled(false);
      const shares = await share.balanceOf(alice.address);
      await vault.connect(alice).redeem(shares, alice.address);

      await strategy.setWithdrawalsEnabled(true);
      await time.increase(TWENTY_FOUR_HOURS);

      const aliceBalanceBefore = await asset.balanceOf(alice.address);
      await vault.processQueuedWithdrawal(alice.address);
      const aliceBalanceAfter = await asset.balanceOf(alice.address);

      // Should receive $100 (no profit, no donation)
      expect(aliceBalanceAfter - aliceBalanceBefore).to.equal(toUSDC("100"));
      expect(await asset.balanceOf(await governanceBuffer.getAddress())).to.equal(0n);
    });
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
      const { vault, asset, share, strategy, governanceBuffer, alice } = await loadFixture(fixture);
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
      expect(await asset.balanceOf(await governanceBuffer.getAddress())).to.equal(expectedDonation);
      expect(await vault.totalDonated(alice.address)).to.equal(expectedDonation);
      expect(await vault.totalWithdrawn(alice.address)).to.equal(expectedNet);
    });

    it("does not donate on pure losses", async () => {
      const { vault, asset, share, strategy, governanceBuffer, alice } = await loadFixture(fixture);
      await deposit(vault, asset, alice, toUSDC("100"));
      await strategy.setSharePrice(toWad("0.4"));
      await syncStrategyHoldings(asset, strategy);
      const shares = await share.balanceOf(alice.address);
      const [, donation] = await vault.connect(alice).redeem.staticCall(shares, alice.address);
      expect(donation).to.equal(0n);
      await vault.connect(alice).redeem(shares, alice.address);
      expect(await asset.balanceOf(await governanceBuffer.getAddress())).to.equal(0n);
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
      const { vault, asset, share, strategy, governanceBuffer, alice } = await loadFixture(fixture);
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
      expect(await asset.balanceOf(await governanceBuffer.getAddress())).to.equal(donation);
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
      const { vault, asset, share, strategy, governanceBuffer, alice } = await loadFixture(fixture);
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
      expect(await asset.balanceOf(await governanceBuffer.getAddress())).to.equal(toUSDC("200"));
    });

    it("caps donation when user already realized profits", async () => {
      const { vault, asset, share, strategy, governanceBuffer, alice } = await loadFixture(fixture);
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
      expect(await asset.balanceOf(await governanceBuffer.getAddress())).to.equal(toUSDC("30"));
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
      const { vault, governance, governanceBuffer, alice, asset, share } = await loadFixture(fixture);
      const GovernanceFactory = await ethers.getContractFactory("Governance");
      const newGovernance = (await GovernanceFactory.deploy(
        await asset.getAddress(),
        await share.getAddress(),
        await governanceBuffer.getAddress()
      )) as Governance;
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

