const { expect } = require("chai");
const { ethers } = require("hardhat");
const { POLYGON } = require("./constants");
const {
	loadFixture,
	time,
} = require("@nomicfoundation/hardhat-network-helpers");
const { approve, sushiSwap, getBalanceOf } = require("./utils");

describe("Donations", function () {
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

		const systemOwner = owner;

		const domeProtocol = await DomeProtocol.deploy(
			systemOwner.address,
			domeFactory.address,
			governanceFactory.address,
			wrappedVotingFactory.address,
			priceTracker.address,
			systemOwnerPercentage,
			domeCreationFee
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
			wallet: randomAccount.address,
			percent: 10000,
		};

		const beneficiariesInfo = [randomBeneficiary];

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
			bufferContract,
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

		const systemOwner = owner;

		const domeProtocol = await DomeProtocol.deploy(
			systemOwner.address,
			domeFactory.address,
			governanceFactory.address,
			wrappedVotingFactory.address,
			priceTracker.address,
			systemOwnerPercentage,
			domeCreationFee
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
			wallet: randomAccount.address,
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
			bufferContract,
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
		it("Should revert user donation if allowance was not granted", async function () {
			const { assetContract, domeInstance, otherAccount } =
				await loadFixture(deployDome);

			const swapAmount = ethers.utils.parseEther("50");
			const assetsReceived = await sushiSwap(
				otherAccount,
				POLYGON.ADDRESSES.WMATIC,
				assetContract.address,
				swapAmount
			);

			await expect(
				domeInstance
					.connect(otherAccount)
					.donate(assetContract.address, assetsReceived)
			).to.be.rejectedWith("ERC20: transfer amount exceeds allowance");
		});

		it("Should allow user donation if allowance was granted", async function () {
			const { assetContract, domeInstance, otherAccount } =
				await loadFixture(deployDome);

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
					.donate(assetContract.address, assetsReceived)
			).to.be.fulfilled;
		});

		describe("Non protocol share donations", async () => {
			it("Should change beneficiaries balances on user donation of underlying token for domes without buffer beneficiary", async function () {
				const { assetContract, domeInstance, otherAccount, beneficiariesInfo } =
					await loadFixture(deployDome);

				const swapAmount = ethers.utils.parseEther("50");
				const donationAmount = await sushiSwap(
					otherAccount,
					POLYGON.ADDRESSES.WMATIC,
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

			it("Should change beneficiaries balances on user donation of underlying token for domes with buffer beneficiary", async function () {
				const { assetContract, domeInstance, otherAccount, beneficiariesInfo } =
					await loadFixture(deployDomeWithBufferBeneficiary);

				const swapAmount = ethers.utils.parseEther("50");
				const donationAmount = await sushiSwap(
					otherAccount,
					POLYGON.ADDRESSES.WMATIC,
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

			it("Should change buffer reserve on user donation of underlying token", async function () {
				const {
					assetContract,
					domeInstance,
					otherAccount,
					beneficiariesInfo,
					bufferContract,
				} = await loadFixture(deployDomeWithBufferBeneficiary);

				const swapAmount = ethers.utils.parseEther("50");
				const donationAmount = await sushiSwap(
					otherAccount,
					POLYGON.ADDRESSES.WMATIC,
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

				const domeReserveBefore = await bufferContract.callStatic.domeReserves(
					domeInstance.address
				);

				const bufferIndex = beneficiaryAddresses.indexOf(
					bufferContract.address
				);
				const bufferAmount = beneficiaryAmounts[bufferIndex];

				await expect(
					domeInstance
						.connect(otherAccount)
						.donate(assetContract.address, donationAmount)
				).to.changeTokenBalances(
					assetContract,
					[otherAccount.address, ...beneficiaryAddresses],
					[donationAmount.mul(-1), ...beneficiaryAmounts]
				);

				expect(
					await bufferContract.callStatic.domeReserves(domeInstance.address)
				).to.be.eq(domeReserveBefore.add(bufferAmount));
			});

			it("Should change beneficiaries balances on user donation of non underlying token for domes with buffer beneficiary", async function () {
				const { domeInstance, otherAccount, beneficiariesInfo, bufferAddress } =
					await loadFixture(deployDomeWithBufferBeneficiary);

				const swapAmount = ethers.utils.parseEther("50");
				const donationToken = POLYGON.ADDRESSES.USDT;
				const donationAmount = await sushiSwap(
					otherAccount,
					POLYGON.ADDRESSES.WMATIC,
					donationToken,
					swapAmount
				);

				await approve(
					otherAccount,
					donationToken,
					domeInstance.address,
					donationAmount
				);

				const bufferPercent = beneficiariesInfo.find(
					(item) => item.wallet === bufferAddress
				).percent;

				const additionalPercent =
					bufferPercent / (beneficiariesInfo.length - 1);

				const beneficiaries = beneficiariesInfo.filter(
					(beneficiary) => beneficiary.wallet !== bufferAddress
				);

				const beneficiaryAddresses = beneficiaries.map(
					(beneficiary) => beneficiary.wallet
				);

				const beneficiaryAmounts = beneficiaries.map((beneficiary) =>
					donationAmount.mul(beneficiary.percent + additionalPercent).div(10000)
				);

				const donationTokenContract = await ethers.getContractAt(
					"IERC20",
					donationToken
				);

				await expect(
					domeInstance
						.connect(otherAccount)
						.donate(donationToken, donationAmount)
				).to.changeTokenBalances(
					donationTokenContract,
					[otherAccount.address, ...beneficiaryAddresses, bufferAddress],
					[donationAmount.mul(-1), ...beneficiaryAmounts, 0]
				);
			});

			it("Should not change buffer reserve on user donation of non underlying token", async function () {
				const {
					domeInstance,
					otherAccount,
					beneficiariesInfo,
					bufferContract,
					bufferAddress,
				} = await loadFixture(deployDomeWithBufferBeneficiary);

				const swapAmount = ethers.utils.parseEther("50");
				const donationToken = POLYGON.ADDRESSES.USDT;
				const donationTokenContract = await ethers.getContractAt(
					"IERC20",
					donationToken
				);
				const donationAmount = await sushiSwap(
					otherAccount,
					POLYGON.ADDRESSES.WMATIC,
					donationToken,
					swapAmount
				);

				await approve(
					otherAccount,
					donationToken,
					domeInstance.address,
					donationAmount
				);

				const bufferPercent = beneficiariesInfo.find(
					(item) => item.wallet === bufferAddress
				).percent;

				const additionalPercent =
					bufferPercent / (beneficiariesInfo.length - 1);

				const beneficiaries = beneficiariesInfo.filter(
					(beneficiary) => beneficiary.wallet !== bufferAddress
				);

				const beneficiaryAddresses = beneficiaries.map(
					(beneficiary) => beneficiary.wallet
				);

				const beneficiaryAmounts = beneficiaries.map((beneficiary) =>
					donationAmount.mul(beneficiary.percent + additionalPercent).div(10000)
				);
				const domeReserveBefore = await bufferContract.callStatic.domeReserves(
					domeInstance.address
				);

				await expect(
					domeInstance
						.connect(otherAccount)
						.donate(donationToken, donationAmount)
				).to.changeTokenBalances(
					donationTokenContract,
					[otherAccount.address, ...beneficiaryAddresses],
					[donationAmount.mul(-1), ...beneficiaryAmounts]
				);

				expect(
					await bufferContract.callStatic.domeReserves(domeInstance.address)
				).to.be.eq(domeReserveBefore);
			});

			it("Should change beneficiaries balances on user donation of non underlying token for domes without buffer beneficiary", async function () {
				const { domeInstance, otherAccount, beneficiariesInfo } =
					await loadFixture(deployDome);

				const swapAmount = ethers.utils.parseEther("50");
				const donationToken = POLYGON.ADDRESSES.USDT;
				const donationAmount = await sushiSwap(
					otherAccount,
					POLYGON.ADDRESSES.WMATIC,
					donationToken,
					swapAmount
				);

				await approve(
					otherAccount,
					donationToken,
					domeInstance.address,
					donationAmount
				);

				const beneficiaryAddresses = beneficiariesInfo.map(
					(beneficiary) => beneficiary.wallet
				);
				const beneficiaryAmounts = beneficiariesInfo.map((beneficiary) =>
					donationAmount.mul(beneficiary.percent).div(10000)
				);

				const donationTokenContract = await ethers.getContractAt(
					"IERC20",
					donationToken
				);

				await expect(
					domeInstance
						.connect(otherAccount)
						.donate(donationToken, donationAmount)
				).to.changeTokenBalances(
					donationTokenContract,
					[otherAccount.address, ...beneficiaryAddresses],
					[donationAmount.mul(-1), ...beneficiaryAmounts]
				);
			});
		});

		describe("Protocol share donations", async () => {
			it("Should change beneficiaries balances on user donation of protocol share token for domes without buffer beneficiary", async function () {
				const { assetContract, domeInstance, otherAccount, beneficiariesInfo } =
					await loadFixture(deployDome);

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
					domeInstance
						.connect(otherAccount)
						.donate(domeInstance.address, sharesReceived)
				).to.changeTokenBalances(
					assetContract,
					[...beneficiaryAddresses],
					[...beneficiaryAmounts]
				);
			});

			it("Should change beneficiaries balances on user donation of protocol share token for domes with buffer beneficiary", async function () {
				const { assetContract, domeInstance, otherAccount, beneficiariesInfo } =
					await loadFixture(deployDomeWithBufferBeneficiary);

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
					domeInstance
						.connect(otherAccount)
						.donate(domeInstance.address, sharesReceived)
				).to.changeTokenBalances(
					assetContract,
					[...beneficiaryAddresses],
					[...beneficiaryAmounts]
				);
			});

			it("Should change beneficiaries balances on user donation of protocol share token for domes with buffer beneficiary (Yield generated)", async function () {
				const { assetContract, domeInstance, otherAccount, beneficiariesInfo } =
					await loadFixture(deployDomeWithBufferBeneficiary);

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

				await domeInstance
					.connect(otherAccount)
					.deposit(assetsReceived, otherAccount.address);

				const ONE_DAY = 60 * 60 * 24;
				await time.increase(ONE_DAY * 60);

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
					domeInstance
						.connect(otherAccount)
						.donate(domeInstance.address, sharesReceived)
				).to.changeTokenBalances(
					assetContract,
					[...beneficiaryAddresses],
					[...beneficiaryAmounts]
				);
			});
		});
	});

	describe("Events", function () {
		it("Should emit Donate event on donation of protocol shares", async function () {
			const { assetContract, domeInstance, otherAccount } = await loadFixture(
				deployDomeWithBufferBeneficiary
			);

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

			await expect(
				domeInstance
					.connect(otherAccount)
					.donate(domeInstance.address, sharesReceived)
			)
				.to.emit(domeInstance, "Donate")
				.withArgs(otherAccount.address, domeInstance.address, sharesReceived);
		});

		it("Should emit Donate event on donation of non protocol token", async function () {
			const { domeInstance, otherAccount } = await loadFixture(
				deployDomeWithBufferBeneficiary
			);

			const swapAmount = ethers.utils.parseEther("50");
			const donationToken = POLYGON.ADDRESSES.USDT;
			const donationAmount = await sushiSwap(
				otherAccount,
				POLYGON.ADDRESSES.WMATIC,
				donationToken,
				swapAmount
			);

			await approve(
				otherAccount,
				donationToken,
				domeInstance.address,
				donationAmount
			);

			await expect(
				domeInstance.connect(otherAccount).donate(donationToken, donationAmount)
			)
				.to.emit(domeInstance, "Donate")
				.withArgs(otherAccount.address, donationToken, donationAmount);
		});
	});
});
