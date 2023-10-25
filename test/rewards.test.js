const { expect } = require("chai");
const { ethers } = require("hardhat");
const { POLYGON } = require("./constants");
const {
	loadFixture,
	time,
} = require("@nomicfoundation/hardhat-network-helpers");
const { approve, sushiSwap } = require("./utils");

describe("Rewards", function () {
	async function deployDome() {
		const [owner, otherAccount, anotherAccount, randomAccount] =
			await ethers.getSigners();

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

		const UNISWAP_ROUTER = POLYGON.ADDRESSES.SUSHI_ROUTER02;
		const USDC = POLYGON.ADDRESSES.USDC;

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
			domeCreationFee
		);

		const bufferAddress = await domeProtocol.callStatic.BUFFER();

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

		const yieldProtocol = POLYGON.YIELD_PROTOCOLS.AAVE_POLYGON_USDC;
		const depositorYieldPercent = 1000;

		const domeAddress = await domeProtocol
			.connect(otherAccount)
			.callStatic.createDome(
				domeInfo,
				beneficiariesInfo,
				depositorYieldPercent,
				yieldProtocol,
				{ value: domeCreationFee }
			);

		await domeProtocol
			.connect(otherAccount)
			.createDome(
				domeInfo,
				beneficiariesInfo,
				depositorYieldPercent,
				yieldProtocol,
				{ value: domeCreationFee }
			);

		const domeCreator = otherAccount;
		const domeInstance = await ethers.getContractAt("Dome", domeAddress);

		const assetAddress = await domeInstance.asset();
		const assetContract = await ethers.getContractAt("IERC20", assetAddress);

		const rewardTokenAddress = await domeProtocol.REWARD_TOKEN();
		const rewardTokenContract = await ethers.getContractAt(
			"RewardToken",
			rewardTokenAddress
		);

		return {
			priceTracker,
			rewardTokenContract,
			randomAccount,
			domeCreator,
			asset: assetAddress,
			assetContract,
			domeFactory,
			domeCreationFee,
			systemOwnerPercentage,
			owner,
			otherAccount,
			anotherAccount,
			domeInstance,
			depositorYieldPercent,
			yieldProtocol,
			beneficiariesInfo,
			domeInfo,
		};
	}

	describe("Validations", function () {
		it("Should allow staker to claim reward token if yield was generated", async function () {
			const {
				assetContract,
				domeInstance,
				otherAccount,
				depositorYieldPercent,
				systemOwnerPercentage,
				priceTracker,
				rewardTokenContract,
			} = await loadFixture(deployDome);

			const swapAmount = ethers.utils.parseEther("50");
			const assetsReceived = await sushiSwap(
				otherAccount,
				POLYGON.ADDRESSES.WMATIC,
				assetContract.address,
				swapAmount
			);

			await approve(
				otherAccount,
				assetContract.address,
				domeInstance.address,
				assetsReceived
			);

			await expect(
				domeInstance
					.connect(otherAccount)
					.deposit(assetsReceived, otherAccount.address)
			).to.be.fulfilled;

			const ONE_DAY = 60 * 60 * 24;
			await time.increase(ONE_DAY * 60);

			const generatedYield = await domeInstance.callStatic.generatedYieldOf(
				otherAccount.address
			);

			const depositorsYieldPortion = generatedYield
				.mul(depositorYieldPercent)
				.div(10000);

			const systemOwnerPortion = generatedYield
				.sub(depositorsYieldPortion)
				.mul(systemOwnerPercentage)
				.div(10000);

			const rewardInAssetAmount = generatedYield
				.sub(systemOwnerPortion)
				.sub(depositorsYieldPortion);

			const rewardAmount = await priceTracker.convertToUSDC(
				assetContract.address,
				rewardInAssetAmount
			);

			await expect(
				domeInstance.connect(otherAccount).claim()
			).to.changeTokenBalance(rewardTokenContract, otherAccount, rewardAmount);
		});

		it("Should not transfer more tokens on double claim if yield was not generated", async function () {
			const {
				assetContract,
				domeInstance,
				otherAccount,
				depositorYieldPercent,
				systemOwnerPercentage,
				priceTracker,
				rewardTokenContract,
			} = await loadFixture(deployDome);

			const swapAmount = ethers.utils.parseEther("50");
			const assetsReceived = await sushiSwap(
				otherAccount,
				POLYGON.ADDRESSES.WMATIC,
				assetContract.address,
				swapAmount
			);

			await approve(
				otherAccount,
				assetContract.address,
				domeInstance.address,
				assetsReceived
			);

			await expect(
				domeInstance
					.connect(otherAccount)
					.deposit(assetsReceived, otherAccount.address)
			).to.be.fulfilled;

			const ONE_DAY = 60 * 60 * 24;
			await time.increase(ONE_DAY * 60);

			const generatedYield = await domeInstance.callStatic.generatedYieldOf(
				otherAccount.address
			);

			const depositorsYieldPortion = generatedYield
				.mul(depositorYieldPercent)
				.div(10000);

			const systemOwnerPortion = generatedYield
				.sub(depositorsYieldPortion)
				.mul(systemOwnerPercentage)
				.div(10000);

			const rewardInAssetAmount = generatedYield
				.sub(systemOwnerPortion)
				.sub(depositorsYieldPortion);

			const rewardAmount = await priceTracker.convertToUSDC(
				assetContract.address,
				rewardInAssetAmount
			);

			await expect(
				domeInstance.connect(otherAccount).claim()
			).to.changeTokenBalance(rewardTokenContract, otherAccount, rewardAmount);

			await expect(
				domeInstance.connect(otherAccount).claim()
			).to.changeTokenBalance(rewardTokenContract, otherAccount, 0);
		});

		it("Should allow staker to claim reward token after withdraw and deposit if yield was generated", async function () {
			const {
				assetContract,
				domeInstance,
				otherAccount,
				depositorYieldPercent,
				systemOwnerPercentage,
				priceTracker,
				rewardTokenContract,
			} = await loadFixture(deployDome);

			const ONE_DAY = 60 * 60 * 24;
			{
				const swapAmount = ethers.utils.parseEther("50");
				const assetsReceived = await sushiSwap(
					otherAccount,
					POLYGON.ADDRESSES.WMATIC,
					assetContract.address,
					swapAmount
				);

				await approve(
					otherAccount,
					assetContract.address,
					domeInstance.address,
					assetsReceived
				);

				await expect(
					domeInstance
						.connect(otherAccount)
						.deposit(assetsReceived, otherAccount.address)
				).to.be.fulfilled;

				await time.increase(ONE_DAY * 60);

				const [generatedYield, maxWithdraw] = await Promise.all([
					domeInstance.callStatic.generatedYieldOf(otherAccount.address),
					domeInstance
						.connect(otherAccount)
						.callStatic.maxWithdraw(otherAccount.address),
				]);

				const depositorsYieldPortion = generatedYield
					.mul(depositorYieldPercent)
					.div(10000);

				const systemOwnerPortion = generatedYield
					.sub(depositorsYieldPortion)
					.mul(systemOwnerPercentage)
					.div(10000);

				const rewardInAssetAmount = generatedYield
					.sub(systemOwnerPortion)
					.sub(depositorsYieldPortion);

				const rewardAmount = await priceTracker.convertToUSDC(
					assetContract.address,
					rewardInAssetAmount
				);

				await expect(
					domeInstance.connect(otherAccount).claim()
				).to.changeTokenBalance(
					rewardTokenContract,
					otherAccount,
					rewardAmount
				);

				await expect(
					domeInstance.connect(otherAccount).claim()
				).to.changeTokenBalance(rewardTokenContract, otherAccount, 0);

				await expect(
					domeInstance
						.connect(otherAccount)
						.withdraw(maxWithdraw, otherAccount.address, otherAccount.address)
				).to.changeTokenBalance(
					assetContract,
					otherAccount,
					assetsReceived.add(depositorsYieldPortion)
				);

				await expect(
					domeInstance.connect(otherAccount).claim()
				).to.changeTokenBalance(rewardTokenContract, otherAccount, 0);
			}

			const swapAmount = ethers.utils.parseEther("50");
			const assetsReceived = await sushiSwap(
				otherAccount,
				POLYGON.ADDRESSES.WMATIC,
				assetContract.address,
				swapAmount
			);

			await approve(
				otherAccount,
				assetContract.address,
				domeInstance.address,
				assetsReceived
			);

			await expect(
				domeInstance
					.connect(otherAccount)
					.deposit(assetsReceived, otherAccount.address)
			).to.be.fulfilled;

			await time.increase(ONE_DAY * 30);

			const generatedYield = await domeInstance.callStatic.generatedYieldOf(
				otherAccount.address
			);

			const depositorsYieldPortion = generatedYield
				.mul(depositorYieldPercent)
				.div(10000);

			const systemOwnerPortion = generatedYield
				.sub(depositorsYieldPortion)
				.mul(systemOwnerPercentage)
				.div(10000);

			const rewardInAssetAmount = generatedYield
				.sub(systemOwnerPortion)
				.sub(depositorsYieldPortion);

			const rewardAmount = await priceTracker.convertToUSDC(
				assetContract.address,
				rewardInAssetAmount
			);

			await expect(
				domeInstance.connect(otherAccount).claim()
			).to.changeTokenBalance(rewardTokenContract, otherAccount, rewardAmount);

			await expect(
				domeInstance.connect(otherAccount).claim()
			).to.changeTokenBalance(rewardTokenContract, otherAccount, 0);
		});
	});

	describe("Events", function () {
		it("Should emit RewardClaimed event on claim", async function () {
			const {
				assetContract,
				domeInstance,
				otherAccount,
				depositorYieldPercent,
				systemOwnerPercentage,
				priceTracker,
				rewardTokenContract,
			} = await loadFixture(deployDome);

			const swapAmount = ethers.utils.parseEther("50");
			const assetsReceived = await sushiSwap(
				otherAccount,
				POLYGON.ADDRESSES.WMATIC,
				assetContract.address,
				swapAmount
			);

			await approve(
				otherAccount,
				assetContract.address,
				domeInstance.address,
				assetsReceived
			);

			await expect(
				domeInstance
					.connect(otherAccount)
					.deposit(assetsReceived, otherAccount.address)
			).to.be.fulfilled;

			const ONE_DAY = 60 * 60 * 24;
			await time.increase(ONE_DAY * 60);

			const generatedYield = await domeInstance.callStatic.generatedYieldOf(
				otherAccount.address
			);

			const depositorsYieldPortion = generatedYield
				.mul(depositorYieldPercent)
				.div(10000);

			const systemOwnerPortion = generatedYield
				.sub(depositorsYieldPortion)
				.mul(systemOwnerPercentage)
				.div(10000);

			const rewardInAssetAmount = generatedYield
				.sub(systemOwnerPortion)
				.sub(depositorsYieldPortion);

			const rewardAmount = await priceTracker.convertToUSDC(
				assetContract.address,
				rewardInAssetAmount
			);

			await expect(domeInstance.connect(otherAccount).claim())
				.to.emit(rewardTokenContract, "RewardClaimed")
				.withArgs(otherAccount.address, rewardAmount);

			await expect(domeInstance.connect(otherAccount).claim())
				.to.emit(rewardTokenContract, "RewardClaimed")
				.withArgs(otherAccount.address, 0);
		});
	});
});
