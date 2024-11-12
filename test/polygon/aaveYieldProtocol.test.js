const { expect } = require("chai");
const { ethers } = require("hardhat");
const {
	POLYGON: { MAINNET },
} = require("../constants");
const {
	loadFixture,
	time,
} = require("@nomicfoundation/hardhat-network-helpers");
const {
	getBalanceOf,
	approve,
	swap,
	convertDurationToBlocks,
} = require("../utils");

describe("AAVE Yield Protocol", function () {
	async function deployDomeWithAAVE() {
		const [owner, otherAccount, anotherAccount] = await ethers.getSigners();

		const [
			DomeFactory,
			GovernanceFactory,
			WrappedVotingFactory,
			PriceTrackerFactory,
			DomeProtocol,
		] = await Promise.all([
			ethers.getContractFactory("DomeFactory"),
			ethers.getContractFactory("GovernanceFactory"),
			ethers.getContractFactory("WrappedVotingFactory"),
			ethers.getContractFactory("PriceTracker"),
			ethers.getContractFactory("DomeProtocol"),
		]);

		const UNISWAP_ROUTER = MAINNET.ADDRESSES.SUSHI_ROUTER_02;
		const USDC = MAINNET.ADDRESSES.USDC;

		const [domeFactory, governanceFactory, wrappedVotingFactory, priceTracker] =
			await Promise.all([
				DomeFactory.deploy(),
				GovernanceFactory.deploy(),
				WrappedVotingFactory.deploy(),
				PriceTrackerFactory.deploy(UNISWAP_ROUTER, USDC),
			]);

		const domeCreationFee = ethers.utils.parseEther("1");
		const systemOwnerPercentage = 1000;

		const domeProtocol = await DomeProtocol.deploy(
			owner.address,
			domeFactory.address,
			governanceFactory.address,
			wrappedVotingFactory.address,
			priceTracker.address,
			systemOwnerPercentage,
			domeCreationFee,
			USDC
		);

		const bufferAddress = await domeProtocol.callStatic.BUFFER();
		const bufferContract = await ethers.getContractAt("Buffer", bufferAddress);

		const domeInfo = {
			CID: "<DOME_CID>",
			tokenName: "<DOME_TOKEN_NAME>",
			tokenSymbol: "<DOME_TOKEN_SYMBOL>",
		};

		const randomBeneficiary = {
			beneficiaryCID: "beneficiary",
			wallet: otherAccount.address,
			percent: 1000,
		};

		const bufferBeneficiary = {
			beneficiaryCID: "BUFFER",
			wallet: bufferAddress,
			percent: 9000,
		};

		const beneficiariesInfo = [randomBeneficiary, bufferBeneficiary];

		const governanceSettings = {
			votingDelay: convertDurationToBlocks("1 week"),
			votingPeriod: convertDurationToBlocks("6 month"),
			proposalThreshold: 1,
		};

		const yieldProtocol = MAINNET.YIELD_PROTOCOLS.AAVE_POLYGON_USDC;
		const depositorYieldPercent = 1000;

		const domeAddress = await domeProtocol
			.connect(otherAccount)
			.callStatic.createDome(
				domeInfo,
				beneficiariesInfo,
				governanceSettings,
				depositorYieldPercent,
				yieldProtocol,
				{
					value: domeCreationFee,
				}
			);

		await domeProtocol
			.connect(otherAccount)
			.createDome(
				domeInfo,
				beneficiariesInfo,
				governanceSettings,
				depositorYieldPercent,
				yieldProtocol,
				{
					value: domeCreationFee,
				}
			);

		const domeInstance = await ethers.getContractAt("Dome", domeAddress);
		const assetAddress = await domeInstance.asset();
		const assetContract = await ethers.getContractAt("IERC20", assetAddress);

		const governanceAddress = await domeProtocol.callStatic.domeGovernance(
			domeInstance.address
		);
		const governanceContract = await ethers.getContractAt(
			"DomeGovernor",
			governanceAddress
		);

		const votingAddress = await governanceContract.token();
		const votingContract = await ethers.getContractAt(
			"DomeWrappedVoting",
			votingAddress
		);

		return {
			votingContract,
			governanceContract,
			bufferContract,
			domeProtocol,
			domeCreationFee,
			systemOwnerPercentage,
			systemOwner: owner,
			owner,
			otherAccount,
			anotherAccount,
			domeInstance,
			depositorYieldPercent,
			yieldProtocol,
			beneficiariesInfo,
			domeInfo,
			assetContract,
			asset: assetAddress,
		};
	}

	describe("Validations", function () {
		it("Should allow claiming and distributing available yield after withdraw", async function () {
			const { domeInstance, otherAccount, anotherAccount, assetContract } =
				await loadFixture(deployDomeWithAAVE);

			const swapAmount = ethers.utils.parseEther("100");
			const assetsReceived = await swap(
				otherAccount,
				MAINNET.ADDRESSES.WMATIC,
				assetContract.address,
				swapAmount
			);

			await approve(
				otherAccount,
				assetContract.address,
				domeInstance.address,
				assetsReceived
			);

			await domeInstance
				.connect(otherAccount)
				.deposit(assetsReceived, otherAccount.address);

			const ONE_DAY = 60 * 60 * 24;
			await time.increase(ONE_DAY * 60);

			const [maxWithdraw, initialTotalAssets] = await Promise.all([
				domeInstance.maxWithdraw(otherAccount.address),
				domeInstance.totalAssets(),
			]);

			const receiver = otherAccount.address;
			const owner = otherAccount.address;

			await expect(
				domeInstance
					.connect(otherAccount)
					.withdraw(maxWithdraw, receiver, owner)
			).to.changeTokenBalance(assetContract, otherAccount.address, maxWithdraw);

			expect(await domeInstance.totalAssets()).to.be.equal(
				initialTotalAssets.sub(assetsReceived)
			);

			await expect(
				domeInstance.connect(anotherAccount).claimYieldAndDistribute()
			).to.be.fulfilled;
		});

		it("Should allow claiming and distributing available yield before withdraw", async function () {
			const { domeInstance, otherAccount, anotherAccount, assetContract } =
				await loadFixture(deployDomeWithAAVE);

			const swapAmount = ethers.utils.parseEther("100");
			const assetsReceived = await swap(
				otherAccount,
				MAINNET.ADDRESSES.WMATIC,
				assetContract.address,
				swapAmount
			);

			await approve(
				otherAccount,
				assetContract.address,
				domeInstance.address,
				assetsReceived
			);

			await domeInstance
				.connect(otherAccount)
				.deposit(assetsReceived, otherAccount.address);

			const ONE_DAY = 60 * 60 * 24;
			await time.increase(ONE_DAY * 60);

			await expect(
				domeInstance.connect(anotherAccount).claimYieldAndDistribute()
			).to.be.fulfilled;

			const maxWithdraw = await domeInstance.maxWithdraw(otherAccount.address);

			const receiver = otherAccount.address;
			const owner = otherAccount.address;

			await expect(
				domeInstance
					.connect(otherAccount)
					.withdraw(maxWithdraw, receiver, owner)
			).to.be.fulfilled;
		});

		it("Should allow claiming and distributing available yield before multiple withdraw", async function () {
			const { domeInstance, otherAccount, anotherAccount, assetContract } =
				await loadFixture(deployDomeWithAAVE);

			for (let i = 0; i < 1; i++) {
				const swapAmount1 = ethers.utils.parseEther("100");
				const swapAmount2 = ethers.utils.parseEther("50");

				await Promise.all([
					swap(
						otherAccount,
						MAINNET.ADDRESSES.WMATIC,
						assetContract.address,
						swapAmount1,
						otherAccount.address
					),
					swap(
						anotherAccount,
						MAINNET.ADDRESSES.WMATIC,
						assetContract.address,
						swapAmount2,
						anotherAccount.address
					),
				]);

				const [assetsReceived1, assetsReceived2] = await Promise.all([
					getBalanceOf(assetContract.address, otherAccount.address),

					getBalanceOf(assetContract.address, anotherAccount.address),
				]);

				await Promise.all([
					approve(
						otherAccount,
						assetContract.address,
						domeInstance.address,
						assetsReceived1
					),
					approve(
						anotherAccount,
						assetContract.address,
						domeInstance.address,
						assetsReceived2
					),
				]);

				await Promise.all([
					domeInstance
						.connect(otherAccount)
						.deposit(assetsReceived1, otherAccount.address),

					domeInstance
						.connect(anotherAccount)
						.deposit(assetsReceived2, anotherAccount.address),
				]);
			}

			const ONE_DAY = 60 * 60 * 24;
			await time.increase(ONE_DAY * 60);

			await expect(
				domeInstance.connect(anotherAccount).claimYieldAndDistribute()
			).to.be.fulfilled;

			const maxWithdraw1 = await domeInstance.callStatic.maxWithdraw(
				otherAccount.address
			);

			await expect(
				domeInstance
					.connect(otherAccount)
					.withdraw(maxWithdraw1, otherAccount.address, otherAccount.address)
			).to.changeTokenBalance(assetContract, otherAccount, maxWithdraw1);

			const maxWithdraw2 = await domeInstance.callStatic.maxWithdraw(
				anotherAccount.address
			);

			await expect(
				domeInstance
					.connect(anotherAccount)
					.withdraw(
						maxWithdraw2,
						anotherAccount.address,
						anotherAccount.address
					)
			).to.changeTokenBalance(assetContract, anotherAccount, maxWithdraw2);

			for (let i = 0; i < 4; i++) {
				const swapAmount3 = ethers.utils.parseEther("57");
				const swapAmount4 = ethers.utils.parseEther("35");

				await Promise.all([
					swap(
						otherAccount,
						MAINNET.ADDRESSES.WMATIC,
						assetContract.address,
						swapAmount3,
						otherAccount.address
					),
					swap(
						anotherAccount,
						MAINNET.ADDRESSES.WMATIC,
						assetContract.address,
						swapAmount4,
						anotherAccount.address
					),
				]);

				const [assetsReceived3, assetsReceived4] = await Promise.all([
					getBalanceOf(assetContract.address, otherAccount.address),

					getBalanceOf(assetContract.address, anotherAccount.address),
				]);

				await Promise.all([
					approve(
						otherAccount,
						assetContract.address,
						domeInstance.address,
						assetsReceived3
					),
					approve(
						anotherAccount,
						assetContract.address,
						domeInstance.address,
						assetsReceived4
					),
				]);

				await Promise.all([
					domeInstance
						.connect(otherAccount)
						.deposit(assetsReceived3, otherAccount.address),

					domeInstance
						.connect(anotherAccount)
						.deposit(assetsReceived4, anotherAccount.address),
				]);
			}

			await time.increase(ONE_DAY * 60);

			await expect(domeInstance.connect(otherAccount).claimYieldAndDistribute())
				.to.be.fulfilled;
			const avYield = await domeInstance.availableYield();
			expect(avYield[0]).to.be.eq(0);
		});

		it("Should transfer system owners fees after claim and distribute", async function () {
			const {
				domeInstance,
				otherAccount,
				anotherAccount,
				systemOwnerPercentage,
				systemOwner,
				assetContract,
			} = await loadFixture(deployDomeWithAAVE);

			const swapAmount = ethers.utils.parseEther("100");
			const assetsReceived = await swap(
				otherAccount,
				MAINNET.ADDRESSES.WMATIC,
				assetContract.address,
				swapAmount
			);

			await approve(
				otherAccount,
				assetContract.address,
				domeInstance.address,
				assetsReceived
			);

			await domeInstance
				.connect(otherAccount)
				.deposit(assetsReceived, otherAccount.address);

			const ONE_DAY = 60 * 60 * 24;
			await time.increase(ONE_DAY * 60);

			const maxWithdraw = await domeInstance.maxWithdraw(otherAccount.address);

			const initialTotalAssets = await domeInstance.totalAssets();

			const receiver = otherAccount.address;
			const owner = otherAccount.address;

			await expect(
				domeInstance
					.connect(otherAccount)
					.withdraw(maxWithdraw, receiver, owner)
			).to.changeTokenBalance(assetContract, otherAccount.address, maxWithdraw);

			expect(await domeInstance.totalAssets()).to.be.equal(
				initialTotalAssets.sub(assetsReceived)
			);

			const availableYieldToClaim = (await domeInstance.availableYield())
				.assets;

			const systemOwnerPortion = availableYieldToClaim
				.mul(systemOwnerPercentage)
				.div(10000);

			await expect(
				domeInstance.connect(anotherAccount).claimYieldAndDistribute()
			).to.changeTokenBalance(
				assetContract,
				systemOwner.address,
				systemOwnerPortion
			);
		});

		it("Should transfer beneficiaries fees after claim and distribute", async function () {
			const {
				domeInstance,
				otherAccount,
				anotherAccount,
				systemOwnerPercentage,
				beneficiariesInfo,
				assetContract,
			} = await loadFixture(deployDomeWithAAVE);

			const swapAmount = ethers.utils.parseEther("100");
			const assetsReceived = await swap(
				otherAccount,
				MAINNET.ADDRESSES.WMATIC,
				assetContract.address,
				swapAmount
			);
			await approve(
				otherAccount,
				assetContract.address,
				domeInstance.address,
				assetsReceived
			);

			await domeInstance
				.connect(otherAccount)
				.deposit(assetsReceived, otherAccount.address);

			const ONE_DAY = 60 * 60 * 24;
			await time.increase(ONE_DAY * 60);

			const [
				{ assets: availableYieldToClaim },
				maxWithdraw,
				initialTotalAssets,
			] = await Promise.all([
				domeInstance.availableYield(),
				domeInstance.maxWithdraw(otherAccount.address),
				domeInstance.totalAssets(),
			]);

			const receiver = otherAccount.address;
			const owner = otherAccount.address;

			await expect(
				domeInstance
					.connect(otherAccount)
					.withdraw(maxWithdraw, receiver, owner)
			).to.changeTokenBalance(assetContract, otherAccount.address, maxWithdraw);

			expect(await domeInstance.totalAssets()).to.be.equal(
				initialTotalAssets.sub(assetsReceived)
			);

			const systemOwnerPortion = availableYieldToClaim
				.mul(systemOwnerPercentage)
				.div(10000);
			const beneficiariesPortion =
				availableYieldToClaim.sub(systemOwnerPortion);

			const beneficiaryAddresses = beneficiariesInfo.map(
				(beneficiary) => beneficiary.wallet
			);

			const beneficiaryAmounts = beneficiariesInfo.map((beneficiary) =>
				beneficiariesPortion.mul(beneficiary.percent).div(10000)
			);

			await expect(
				domeInstance.connect(anotherAccount).claimYieldAndDistribute()
			).to.changeTokenBalances(
				assetContract,
				[...beneficiaryAddresses],
				[...beneficiaryAmounts]
			);
		});

		it("Should update contracts total asset balance to 0 after full withdraw and distribute", async function () {
			const {
				domeInstance,
				otherAccount,
				anotherAccount,
				systemOwnerPercentage,
				systemOwner,
				beneficiariesInfo,
				assetContract,
			} = await loadFixture(deployDomeWithAAVE);

			const swapAmount = ethers.utils.parseEther("100");
			const assetsReceived = await swap(
				otherAccount,
				MAINNET.ADDRESSES.WMATIC,
				assetContract.address,
				swapAmount
			);

			await approve(
				otherAccount,
				assetContract.address,
				domeInstance.address,
				assetsReceived
			);

			await domeInstance
				.connect(otherAccount)
				.deposit(assetsReceived, otherAccount.address);

			const ONE_DAY = 60 * 60 * 24;
			await time.increase(ONE_DAY * 60);

			const availableYieldToClaim = (await domeInstance.availableYield())
				.assets;

			const maxWithdraw = await domeInstance.maxWithdraw(otherAccount.address);

			const initialTotalAssets = await domeInstance.totalAssets();

			const receiver = otherAccount.address;
			const owner = otherAccount.address;

			await expect(
				domeInstance
					.connect(otherAccount)
					.withdraw(maxWithdraw, receiver, owner)
			).to.changeTokenBalance(assetContract, otherAccount.address, maxWithdraw);

			expect(await domeInstance.totalAssets()).to.be.equal(
				initialTotalAssets.sub(assetsReceived)
			);

			const systemOwnerPortion = availableYieldToClaim
				.mul(systemOwnerPercentage)
				.div(10000);
			const beneficiariesPortion =
				availableYieldToClaim.sub(systemOwnerPortion);

			const beneficiaryAddresses = beneficiariesInfo.map(
				(beneficiary) => beneficiary.wallet
			);

			const beneficiaryAmounts = beneficiariesInfo.map((beneficiary) =>
				beneficiariesPortion.mul(beneficiary.percent).div(10000)
			);

			await expect(
				domeInstance.connect(anotherAccount).claimYieldAndDistribute()
			).to.changeTokenBalances(
				assetContract,
				[systemOwner.address, ...beneficiaryAddresses],
				[systemOwnerPortion, ...beneficiaryAmounts]
			);

			expect(await domeInstance.totalAssets()).to.be.equal(0);
		});

		it("Should update contracts share balance to 0 after full withdraw and distribute", async function () {
			const {
				domeInstance,
				otherAccount,
				anotherAccount,
				systemOwnerPercentage,
				systemOwner,
				beneficiariesInfo,
				assetContract,
			} = await loadFixture(deployDomeWithAAVE);

			const swapAmount = ethers.utils.parseEther("100");
			const assetsReceived = await swap(
				otherAccount,
				MAINNET.ADDRESSES.WMATIC,
				assetContract.address,
				swapAmount
			);

			await approve(
				otherAccount,
				assetContract.address,
				domeInstance.address,
				assetsReceived
			);

			await domeInstance
				.connect(otherAccount)
				.deposit(assetsReceived, otherAccount.address);

			const ONE_DAY = 60 * 60 * 24;
			await time.increase(ONE_DAY * 60);

			const maxWithdraw = await domeInstance.maxWithdraw(otherAccount.address);

			const initialTotalAssets = await domeInstance.totalAssets();

			const receiver = otherAccount.address;
			const owner = otherAccount.address;

			await expect(
				domeInstance
					.connect(otherAccount)
					.withdraw(maxWithdraw, receiver, owner)
			).to.changeTokenBalance(assetContract, otherAccount.address, maxWithdraw);

			const availableYieldToClaim = (await domeInstance.availableYield())
				.assets;

			expect(await domeInstance.totalAssets()).to.be.equal(
				initialTotalAssets.sub(assetsReceived)
			);

			const systemOwnerPortion = availableYieldToClaim
				.mul(systemOwnerPercentage)
				.div(10000);
			const beneficiariesPortion =
				availableYieldToClaim.sub(systemOwnerPortion);

			const beneficiaryAddresses = beneficiariesInfo.map(
				(beneficiary) => beneficiary.wallet
			);

			const beneficiaryAmounts = beneficiariesInfo.map((beneficiary) =>
				beneficiariesPortion.mul(beneficiary.percent).div(10000)
			);

			await expect(
				domeInstance.connect(anotherAccount).claimYieldAndDistribute()
			).to.changeTokenBalances(
				assetContract,
				[systemOwner.address, ...beneficiaryAddresses],
				[systemOwnerPortion, ...beneficiaryAmounts]
			);

			expect(await domeInstance.totalSupply()).to.be.equal(0);
		});
	});

	describe("Events", function () {
		it("Should emit an YieldClaim event on claim and distribute", async function () {
			const {
				domeInstance,
				otherAccount,
				anotherAccount,
				yieldProtocol,
				systemOwnerPercentage,
				assetContract,
			} = await loadFixture(deployDomeWithAAVE);

			const swapAmount = ethers.utils.parseEther("100");
			const assetsReceived = await swap(
				otherAccount,
				MAINNET.ADDRESSES.WMATIC,
				assetContract.address,
				swapAmount
			);

			await approve(
				otherAccount,
				assetContract.address,
				domeInstance.address,
				assetsReceived
			);

			await domeInstance
				.connect(otherAccount)
				.deposit(assetsReceived, otherAccount.address);

			const ONE_DAY = 60 * 60 * 24;
			await time.increase(ONE_DAY * 60);

			const availableYieldToClaim = (await domeInstance.availableYield())
				.assets;

			const systemOwnerPortion = availableYieldToClaim
				.mul(systemOwnerPercentage)
				.div(10000);
			await expect(
				domeInstance.connect(anotherAccount).claimYieldAndDistribute()
			)
				.to.emit(domeInstance, "YieldClaimed")
				.withArgs(yieldProtocol, availableYieldToClaim.sub(systemOwnerPortion));
		});

		it("Should emit a SystemFeeClaimed event on claim and distribute", async function () {
			const {
				domeInstance,
				otherAccount,
				anotherAccount,
				systemOwnerPercentage,
				assetContract,
			} = await loadFixture(deployDomeWithAAVE);

			const swapAmount = ethers.utils.parseEther("100");
			const assetsReceived = await swap(
				otherAccount,
				MAINNET.ADDRESSES.WMATIC,
				assetContract.address,
				swapAmount
			);

			await approve(
				otherAccount,
				assetContract.address,
				domeInstance.address,
				assetsReceived
			);

			await domeInstance
				.connect(otherAccount)
				.deposit(assetsReceived, otherAccount.address);

			const ONE_DAY = 60 * 60 * 24;
			await time.increase(ONE_DAY * 60);

			const availableYieldToClaim = (await domeInstance.availableYield())
				.assets;

			const systemOwnerPortion = availableYieldToClaim
				.mul(systemOwnerPercentage)
				.div(10000);

			await expect(
				domeInstance.connect(anotherAccount).claimYieldAndDistribute()
			)
				.to.emit(domeInstance, "SystemFeeClaimed")
				.withArgs(systemOwnerPortion);
		});

		it("Should emit a Distribute event on claim and distribute on first beneficiary", async function () {
			const {
				domeInstance,
				otherAccount,
				anotherAccount,
				systemOwnerPercentage,
				beneficiariesInfo,
				assetContract,
			} = await loadFixture(deployDomeWithAAVE);

			const swapAmount = ethers.utils.parseEther("100");
			const assetsReceived = await swap(
				otherAccount,
				MAINNET.ADDRESSES.WMATIC,
				assetContract.address,
				swapAmount
			);
			await approve(
				otherAccount,
				assetContract.address,
				domeInstance.address,
				assetsReceived
			);

			await domeInstance
				.connect(otherAccount)
				.deposit(assetsReceived, otherAccount.address);

			const ONE_DAY = 60 * 60 * 24;
			await time.increase(ONE_DAY * 60);

			const availableYieldToClaim = (await domeInstance.availableYield())
				.assets;

			const systemOwnerPortion = availableYieldToClaim
				.mul(systemOwnerPercentage)
				.div(10000);

			const beneficiariesPortion =
				availableYieldToClaim.sub(systemOwnerPortion);

			const beneficiaryAddresses = beneficiariesInfo.map(
				(beneficiary) => beneficiary.wallet
			);

			const beneficiaryAmounts = beneficiariesInfo.map((beneficiary) =>
				beneficiariesPortion.mul(beneficiary.percent).div(10000)
			);

			await expect(
				domeInstance.connect(anotherAccount).claimYieldAndDistribute()
			)
				.to.emit(domeInstance, "Distribute")
				.withArgs(beneficiaryAddresses[0], beneficiaryAmounts[0]);
		});
	});
});
