const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("HyperliquidVault", function () {
	const ACTION_SEND_ASSET = 13;
	const DAY = 24 * 60 * 60;
	let deployer;
	let systemOwner;
	let depositor;
	let stranger;
	let usdc;
	let coreWriter;
	let vault;
	let buffer;

	async function advanceTime(seconds = DAY) {
		await ethers.provider.send("evm_increaseTime", [seconds]);
		await ethers.provider.send("evm_mine");
	}

	async function deployFixture() {
		[deployer, systemOwner, depositor, stranger] = await ethers.getSigners();

		const MockERC20 = await ethers.getContractFactory("MockERC20");
		usdc = await MockERC20.deploy("USD Coin", "USDC", 6);
		await usdc.deployed();

		const MockCoreWriter = await ethers.getContractFactory("MockCoreWriter");
		coreWriter = await MockCoreWriter.deploy();
		await coreWriter.deployed();

		const HyperliquidBuffer =
			await ethers.getContractFactory("HyperliquidBuffer");
		buffer = await HyperliquidBuffer.deploy();
		await buffer.deployed();

		const HyperliquidVault =
			await ethers.getContractFactory("HyperliquidVault");
		vault = await HyperliquidVault.deploy(
			usdc.address,
			coreWriter.address,
			deployer.address,
			systemOwner.address,
			buffer.address,
			500, // 5% buffer fee
			500, // 5% owner fee
			"Hyperliquid IOU",
			"hlIOU"
		);
		await vault.deployed();

		await buffer.registerVault(
			vault.address,
			ethers.constants.AddressZero,
			usdc.address
		);

		await vault
			.connect(systemOwner)
			.updateAutoDeployConfig(true, ACTION_SEND_ASSET, buffer.address);
	}

	beforeEach(async function () {
		await deployFixture();
	});

	async function deposit(amount, receiver = depositor) {
		await usdc.mint(receiver.address, amount);
		await usdc.connect(receiver).approve(vault.address, amount);
		await vault.connect(receiver).deposit(amount, receiver.address);
	}

	async function setDeployedValue(value) {
		await vault.connect(deployer).reportDeployedValue(value);
	}

	async function settleFromHyperliquid(
		principal,
		profit,
		options = { skipCooldown: false }
	) {
		if (!options.skipCooldown) {
			await advanceTime();
		}
		const total = principal.add(profit);
		await usdc.mint(vault.address, total);
		return vault.connect(deployer).reconcileFromHyperliquid(principal, profit);
	}

	it("tracks total assets across idle and deployed capital", async function () {
		const amount = ethers.utils.parseUnits("1000", 6);
		await deposit(amount);

		expect(await vault.totalAssets()).to.equal(amount);

		expect(await vault.totalAssets()).to.equal(amount);
		expect(await vault.deployedAssets()).to.equal(amount);
		expect(await usdc.balanceOf(deployer.address)).to.equal(amount);

		const payload = await coreWriter.lastPayload();
		expect(payload.slice(0, 10)).to.equal("0x0100000d"); // version 1 + action id 13
	});

	it("blocks reconciliation until the 24h cooldown elapses", async function () {
		const depositAmount = ethers.utils.parseUnits("1000", 6);
		const profit = ethers.utils.parseUnits("100", 6);
		await deposit(depositAmount);
		await setDeployedValue(depositAmount.add(profit));

		await expect(
			settleFromHyperliquid(depositAmount, profit, { skipCooldown: true })
		).to.be.revertedWithCustomError(vault, "WithdrawalCooldownActive");

		await advanceTime();

		await expect(
			settleFromHyperliquid(depositAmount, profit, { skipCooldown: true })
		).to.emit(vault, "AssetsReconciled");
	});

	it("reconciles capital and distributes profit", async function () {
		const depositAmount = ethers.utils.parseUnits("1000", 6);
		const profit = ethers.utils.parseUnits("100", 6);
		await deposit(depositAmount);
		await setDeployedValue(depositAmount.add(profit));

		await expect(settleFromHyperliquid(depositAmount, profit))
			.to.emit(vault, "ProfitDistributed")
			.withArgs(profit, profit.mul(500).div(10000), profit.mul(500).div(10000));

		const reserveBalance = await buffer.vaultReserves(vault.address);
		expect(reserveBalance).to.equal(profit.mul(500).div(10000));
		expect(await vault.deployedAssets()).to.equal(0);
		expect(await usdc.balanceOf(buffer.address)).to.equal(
			profit.mul(500).div(10000)
		);
		expect(await usdc.balanceOf(systemOwner.address)).to.equal(
			profit.mul(500).div(10000)
		);
	});

	it("allows buffer to record losses", async function () {
		const depositAmount = ethers.utils.parseUnits("500", 6);
		await deposit(depositAmount);
		await setDeployedValue(depositAmount);

		await expect(vault.connect(deployer).recordLoss(depositAmount))
			.to.emit(vault, "LossRecorded")
			.withArgs(depositAmount);

		expect(await vault.deployedAssets()).to.equal(0);
	});

	it("restricts privileged calls to the buffer", async function () {
		await expect(
			vault.connect(systemOwner).deployToHyperliquid(1, ACTION_SEND_ASSET, "0x")
		).to.be.revertedWithCustomError(vault, "NotBuffer");

		await expect(
			vault.connect(systemOwner).bufferSetOwner(systemOwner.address)
		).to.be.revertedWithCustomError(vault, "NotBuffer");
	});

	it("allows buffer to update owner and buffer address", async function () {
		await vault.connect(deployer).bufferSetOwner(deployer.address);
		expect(await vault.owner()).to.equal(deployer.address);

		await expect(vault.connect(deployer).updateBuffer(stranger.address))
			.to.emit(vault, "BufferUpdated")
			.withArgs(deployer.address, stranger.address);
		expect(await vault.buffer()).to.equal(stranger.address);
	});

	it("allows owner to update treasury contract", async function () {
		const HyperliquidBuffer =
			await ethers.getContractFactory("HyperliquidBuffer");
		const newBuffer = await HyperliquidBuffer.deploy();
		await newBuffer.deployed();
		await expect(vault.connect(systemOwner).updateTreasury(newBuffer.address))
			.to.emit(vault, "TreasuryUpdated")
			.withArgs(buffer.address, newBuffer.address);
	});

	it("forwards arbitrary Hyperliquid actions", async function () {
		const payload = ethers.utils.defaultAbiCoder.encode(
			["address", "uint64"],
			[stranger.address, 1]
		);

		await expect(
			vault.connect(deployer).sendHyperliquidAction(12, payload)
		).to.emit(vault, "HyperliquidActionForwarded");

		const storedPayload = await coreWriter.lastPayload();
		expect(storedPayload.slice(0, 10)).to.equal("0x0100000c");
	});

	it("mints IOU voting power equal to shares", async function () {
		const amount = ethers.utils.parseUnits("250", 6);
		const shares = await vault.previewDeposit(amount);

		await deposit(amount, depositor);
		await vault.connect(depositor).delegate(depositor.address);
		expect(await vault.getVotes(depositor.address)).to.equal(shares);

		await usdc.mint(deployer.address, amount);
		await usdc.connect(deployer).transfer(vault.address, amount);
		await advanceTime();
		await vault.connect(deployer).reconcileFromHyperliquid(amount, 0);

		await vault
			.connect(depositor)
			.redeem(shares, depositor.address, depositor.address);
		expect(await vault.getVotes(depositor.address)).to.equal(0);
	});

	it("splits reserves proportionally across multiple stakers", async function () {
		const alice = depositor;
		const bob = stranger;

		const aliceAmount = ethers.utils.parseUnits("1000", 6);
		const bobAmount = ethers.utils.parseUnits("500", 6);

		await deposit(aliceAmount, alice);
		await deposit(bobAmount, bob);

		const profit = ethers.utils.parseUnits("300", 6);
		await usdc.mint(deployer.address, profit.add(aliceAmount).add(bobAmount));
		await usdc
			.connect(deployer)
			.transfer(vault.address, aliceAmount.add(bobAmount).add(profit));
		await advanceTime();
		await vault
			.connect(deployer)
			.reconcileFromHyperliquid(aliceAmount.add(bobAmount), profit);

		const bufferShare = profit.mul(500).div(10000);
		const depositorShare = profit.sub(bufferShare.mul(2)); // buffer + owner

		expect(await buffer.vaultReserves(vault.address)).to.equal(bufferShare);

		const aliceShares = await vault.balanceOf(alice.address);
		const bobShares = await vault.balanceOf(bob.address);

		const aliceAssets = await vault.convertToAssets(aliceShares);
		const bobAssets = await vault.convertToAssets(bobShares);

		const expectedAlice = aliceAmount.add(
			depositorShare.mul(aliceAmount).div(aliceAmount.add(bobAmount))
		);
		const expectedBob = bobAmount.add(
			depositorShare.mul(bobAmount).div(aliceAmount.add(bobAmount))
		);

		expect(aliceAssets.sub(expectedAlice).abs()).to.lte(1);
		expect(bobAssets.sub(expectedBob).abs()).to.lte(1);
	});

	it("reflects losses and reduces withdrawable assets", async function () {
		const amount = ethers.utils.parseUnits("800", 6);
		await deposit(amount);

		const loss = ethers.utils.parseUnits("200", 6);
		await vault.connect(deployer).recordLoss(loss);

		const remaining = amount.sub(loss);
		await usdc.mint(deployer.address, remaining);
		await usdc.connect(deployer).transfer(vault.address, remaining);
		await advanceTime();
		await vault.connect(deployer).reconcileFromHyperliquid(remaining, 0);

		const withdrawAssets = await vault.previewRedeem(
			await vault.balanceOf(depositor.address)
		);
		expect(withdrawAssets).to.equal(remaining);

		await vault
			.connect(depositor)
			.redeem(
				await vault.balanceOf(depositor.address),
				depositor.address,
				depositor.address
			);

		expect(await usdc.balanceOf(depositor.address)).to.equal(remaining);
		expect(await buffer.vaultReserves(vault.address)).to.equal(0);
	});

	it("allows stakers to redeem principal after profits without touching reserves", async function () {
		const stake = ethers.utils.parseUnits("600", 6);
		await deposit(stake, depositor);

		const profit = ethers.utils.parseUnits("150", 6);
		await setDeployedValue(stake.add(profit));
		await settleFromHyperliquid(stake, profit);

		const bufferShare = profit.mul(500).div(10000);
		const ownerShare = bufferShare;
		const expectedAssets = stake.add(profit.sub(bufferShare).sub(ownerShare));

		await vault
			.connect(depositor)
			.redeem(
				await vault.balanceOf(depositor.address),
				depositor.address,
				depositor.address
			);

		const redeemed = await usdc.balanceOf(depositor.address);
		expect(redeemed.sub(expectedAssets).abs()).to.lte(1);
		expect(await buffer.vaultReserves(vault.address)).to.equal(bufferShare);
	});

	it("tracks IOU ratios after gain and loss across multiple stakers", async function () {
		const priceTolerance = ethers.utils.parseUnits("1", 9); // 1e-9 precision
		const alice = depositor;
		const bob = stranger;

		const aliceAmount = ethers.utils.parseUnits("1000", 6);
		const bobAmount = ethers.utils.parseUnits("500", 6);

		await deposit(aliceAmount, alice);
		await deposit(bobAmount, bob);

		const profit = ethers.utils.parseUnits("300", 6);
		await setDeployedValue(aliceAmount.add(bobAmount).add(profit));

		const aliceAssetsAfterGain = await vault.convertToAssets(
			await vault.balanceOf(alice.address)
		);
		const bobAssetsAfterGain = await vault.convertToAssets(
			await vault.balanceOf(bob.address)
		);
		expect(aliceAssetsAfterGain).to.be.gt(aliceAmount);
		expect(bobAssetsAfterGain).to.be.gt(bobAmount);

		const loss = ethers.utils.parseUnits("400", 6);
		const recovered = aliceAmount.add(bobAmount).add(profit).sub(loss);
		await setDeployedValue(recovered);

		const aliceAssetsAfterLoss = await vault.convertToAssets(
			await vault.balanceOf(alice.address)
		);
		const bobAssetsAfterLoss = await vault.convertToAssets(
			await vault.balanceOf(bob.address)
		);

		expect(aliceAssetsAfterLoss).to.be.lt(aliceAssetsAfterGain);
		expect(bobAssetsAfterLoss).to.be.lt(bobAssetsAfterGain);

		const aliceShares = await vault.balanceOf(alice.address);
		const bobShares = await vault.balanceOf(bob.address);
		const priceAlice = aliceAssetsAfterLoss
			.mul(ethers.constants.WeiPerEther)
			.div(aliceShares);
		const priceBob = bobAssetsAfterLoss
			.mul(ethers.constants.WeiPerEther)
			.div(bobShares);
		expect(priceAlice.sub(priceBob).abs()).to.lte(priceTolerance);
	});

	it("mints fewer shares when vault NAV increases", async function () {
		const firstDeposit = ethers.utils.parseUnits("1000", 6);
		await deposit(firstDeposit, depositor);
		const profit = ethers.utils.parseUnits("200", 6);
		await setDeployedValue(firstDeposit.add(profit));

		const secondDeposit = ethers.utils.parseUnits("1000", 6);
		await usdc.mint(stranger.address, secondDeposit);
		await usdc.connect(stranger).approve(vault.address, secondDeposit);
		const minted = await vault
			.connect(stranger)
			.callStatic.deposit(secondDeposit, stranger.address);

		expect(minted).to.be.lt(secondDeposit);
	});
});
