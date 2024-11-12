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
	approve,
	swap,
	getBalanceOf,
	convertDurationToBlocks,
} = require("../utils");

describe("Burning", function () {
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

		const systemOwner = owner;

		const domeProtocol = await DomeProtocol.deploy(
			systemOwner.address,
			domeFactory.address,
			governanceFactory.address,
			wrappedVotingFactory.address,
			priceTracker.address,
			systemOwnerPercentage,
			domeCreationFee,
			USDC
		);

		const bufferAddress = await domeProtocol.callStatic.BUFFER();

		const domeInfo = {
			CID: "<DOME_CID>",
			tokenName: "<DOME_TOKEN_NAME>",
			tokenSymbol: "<DOME_TOKEN_SYMBOL>",
		};

		const randomBeneficiary = {
			beneficiaryCID: "beneficiary",
			wallet: randomAccount.address,
			percent: 10000,
		};

		const beneficiariesInfo = [randomBeneficiary];

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
				{ value: domeCreationFee }
			);

		await domeProtocol
			.connect(otherAccount)
			.createDome(
				domeInfo,
				beneficiariesInfo,
				governanceSettings,
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
			bufferAddress,
			systemOwner,
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

	async function deployDomeWithBufferBeneficiary() {
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

		const systemOwner = owner;

		const domeProtocol = await DomeProtocol.deploy(
			systemOwner.address,
			domeFactory.address,
			governanceFactory.address,
			wrappedVotingFactory.address,
			priceTracker.address,
			systemOwnerPercentage,
			domeCreationFee,
			USDC
		);

		const bufferAddress = await domeProtocol.callStatic.BUFFER();

		const domeInfo = {
			CID: "<DOME_CID>",
			tokenName: "<DOME_TOKEN_NAME>",
			tokenSymbol: "<DOME_TOKEN_SYMBOL>",
		};

		const randomBeneficiary = {
			beneficiaryCID: "beneficiary",
			wallet: randomAccount.address,
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
				{ value: domeCreationFee }
			);

		await domeProtocol
			.connect(otherAccount)
			.createDome(
				domeInfo,
				beneficiariesInfo,
				governanceSettings,
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
			bufferBeneficiary,
			bufferAddress,
			systemOwner,
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
		it("Should burn user funds", async function () {
			const { assetContract, domeInstance, otherAccount } =
				await loadFixture(deployDome);

			const swapAmount = ethers.utils.parseEther("50");
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

			const sharesReceived = await getBalanceOf(
				domeInstance.address,
				otherAccount.address
			);

			await expect(domeInstance.connect(otherAccount).burn(sharesReceived)).to
				.be.fulfilled;
		});

		it("Should burn user funds, unwrap them and transfer underlying to beneficiaries", async function () {
			const { assetContract, domeInstance, otherAccount, beneficiariesInfo } =
				await loadFixture(deployDome);

			const swapAmount = ethers.utils.parseEther("50");
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

			const sharesReceived = await getBalanceOf(
				domeInstance.address,
				otherAccount.address
			);

			const assetsOnWithdraw = await domeInstance
				.connect(otherAccount)
				.callStatic.redeem(
					sharesReceived,
					domeInstance.address,
					otherAccount.address
				);

			const beneficiaryAddresses = beneficiariesInfo.map(
				(beneficiary) => beneficiary.wallet
			);
			const beneficiaryAmounts = beneficiariesInfo.map((beneficiary) =>
				assetsOnWithdraw.mul(beneficiary.percent).div(10000)
			);

			await expect(
				domeInstance.connect(otherAccount).burn(sharesReceived)
			).to.changeTokenBalances(
				assetContract,
				[...beneficiaryAddresses],
				[...beneficiaryAmounts]
			);
		});

		it("Should burn user funds, unwrap them and transfer underlying to beneficiaries (Yield generated)", async function () {
			it("Should change beneficiaries balances on user donation of underlying token for domes with buffer beneficiary", async function () {
				const { assetContract, domeInstance, otherAccount, beneficiariesInfo } =
					await loadFixture(deployDomeWithBufferBeneficiary);

				const swapAmount = ethers.utils.parseEther("50");
				const donationAmount = await swap(
					otherAccount,
					MAINNET.ADDRESSES.WMATIC,
					assetContract.address,
					swapAmount
				);

				await approve(
					otherAccount,
					assetContract.address,
					domeInstance.address,
					donationAmount
				);

				const beneficiaryAddresses = beneficiariesInfo.map(
					(beneficiary) => beneficiary.wallet
				);
				const beneficiaryAmounts = beneficiariesInfo.map((beneficiary) =>
					donationAmount.mul(beneficiary.percent).div(10000)
				);

				await expect(
					domeInstance
						.connect(otherAccount)
						.donate(assetContract.address, donationAmount)
				).to.changeTokenBalances(
					assetContract,
					[otherAccount.address, ...beneficiaryAddresses],
					[donationAmount.mul(-1), ...beneficiaryAmounts]
				);
			});
			const { assetContract, domeInstance, otherAccount, beneficiariesInfo } =
				await loadFixture(deployDome);

			const swapAmount = ethers.utils.parseEther("50");
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

			const sharesReceived = await getBalanceOf(
				domeInstance.address,
				otherAccount.address
			);

			const assetsOnWithdraw = await domeInstance
				.connect(otherAccount)
				.callStatic.redeem(
					sharesReceived,
					domeInstance.address,
					otherAccount.address
				);

			const beneficiaryAddresses = beneficiariesInfo.map(
				(beneficiary) => beneficiary.wallet
			);
			const beneficiaryAmounts = beneficiariesInfo.map((beneficiary) =>
				assetsOnWithdraw.mul(beneficiary.percent).div(10000)
			);

			await expect(
				domeInstance.connect(otherAccount).burn(sharesReceived)
			).to.changeTokenBalances(
				assetContract,
				[...beneficiaryAddresses],
				[...beneficiaryAmounts]
			);
		});
	});

	describe("Events", function () {
		it("Should emit Burn event on burn of protocol shares", async function () {
			const { assetContract, domeInstance, otherAccount } = await loadFixture(
				deployDomeWithBufferBeneficiary
			);

			const swapAmount = ethers.utils.parseEther("50");
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

			const sharesReceived = await getBalanceOf(
				domeInstance.address,
				otherAccount.address
			);

			await approve(
				otherAccount,
				domeInstance.address,
				domeInstance.address,
				sharesReceived
			);

			await expect(domeInstance.connect(otherAccount).burn(sharesReceived))
				.to.emit(domeInstance, "Burn")
				.withArgs(otherAccount.address, sharesReceived);
		});
	});
});
