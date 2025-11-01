const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { convertDurationToBlocks } = require("../utils");
const {
	POLYGON: { MAINNET },
} = require("../constants");

describe("DomeProtocol", function () {
	async function deployDomeProtocol() {
		const [owner, otherAccount] = await ethers.getSigners();

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

	const providerTypeAave = await domeProtocol.YIELD_PROVIDER_TYPE_AAVE();

	await domeProtocol.configureYieldProviders([
		{
			provider: MAINNET.YIELD_PROTOCOLS.AAVE_POLYGON_USDC,
			providerType: providerTypeAave,
			enabled: true,
		},
	]);

		return {
			domeProtocol,
			domeCreationFee,
			systemOwnerPercentage,
			owner,
			otherAccount,
			priceTracker,
		};
	}

	describe("Deployment", function () {
		it("Should set right owner", async function () {
			const { domeProtocol, owner } = await loadFixture(deployDomeProtocol);

			expect(await domeProtocol.owner()).to.be.equal(owner.address);
		});

		it("Should set dome creation fee", async function () {
			const { domeProtocol, domeCreationFee } =
				await loadFixture(deployDomeProtocol);

			expect(await domeProtocol.domeCreationFee()).to.be.equal(domeCreationFee);
		});

		it("Should set system owner fee", async function () {
			const { domeProtocol, systemOwnerPercentage } =
				await loadFixture(deployDomeProtocol);

			expect(await domeProtocol.systemOwnerPercentage()).to.be.equal(
				systemOwnerPercentage
			);
		});
	});

	describe("Validations", function () {
		it("Should revert creation with the right error if fee is not payed ", async function () {
			const { domeProtocol, otherAccount } =
				await loadFixture(deployDomeProtocol);

			const domeInfo = {
				CID: "<DOME_CID>",
				tokenName: "<DOME_TOKEN_NAME>",
				tokenSymbol: "<DOME_TOKEN_SYMBOL>",
			};

			const beneficiaryCID = "beneficiary";
			const beneficiaryAddress = otherAccount.address;
			const beneficiaryPercent = 10000;

			const beneficiary = [
				beneficiaryCID,
				beneficiaryAddress,
				beneficiaryPercent,
			];

			const beneficiariesInfo = [beneficiary];

			const governanceSettings = {
				votingDelay: convertDurationToBlocks("0 min"),
				votingPeriod: convertDurationToBlocks("6 month"),
				proposalThreshold: 1,
			};

			const yieldProtocol = MAINNET.YIELD_PROTOCOLS.AAVE_POLYGON_USDC;
			const depositorYieldPercent = 1000;

			await expect(
				domeProtocol
					.connect(otherAccount)
					.createDome(
						domeInfo,
						beneficiariesInfo,
						governanceSettings,
						depositorYieldPercent,
						yieldProtocol
					)
			).to.be.revertedWithCustomError(domeProtocol, "UnpaidFee");
		});

		it("Should revert creation with the right error if fee is partly payed ", async function () {
			const { domeProtocol, otherAccount, domeCreationFee } =
				await loadFixture(deployDomeProtocol);

			const domeInfo = {
				CID: "<DOME_CID>",
				tokenName: "<DOME_TOKEN_NAME>",
				tokenSymbol: "<DOME_TOKEN_SYMBOL>",
			};

			const beneficiaryCID = "beneficiary";
			const beneficiaryAddress = otherAccount.address;
			const beneficiaryPercent = 10000;

			const beneficiary = [
				beneficiaryCID,
				beneficiaryAddress,
				beneficiaryPercent,
			];

			const beneficiariesInfo = [beneficiary];

			const governanceSettings = {
				votingDelay: convertDurationToBlocks("0 min"),
				votingPeriod: convertDurationToBlocks("6 month"),
				proposalThreshold: 1,
			};

			const yieldProtocol = MAINNET.YIELD_PROTOCOLS.AAVE_POLYGON_USDC;
			const depositorYieldPercent = 1000;

			await expect(
				domeProtocol
					.connect(otherAccount)
					.createDome(
						domeInfo,
						beneficiariesInfo,
						governanceSettings,
						depositorYieldPercent,
						yieldProtocol,
						{ value: domeCreationFee.div(2) }
					)
			).to.be.revertedWithCustomError(domeProtocol, "UnpaidFee");
		});

		it("Should allow creation if fee is payed ", async function () {
			const { domeProtocol, otherAccount, domeCreationFee } =
				await loadFixture(deployDomeProtocol);

			const domeInfo = {
				CID: "<DOME_CID>",
				tokenName: "<DOME_TOKEN_NAME>",
				tokenSymbol: "<DOME_TOKEN_SYMBOL>",
			};

			const beneficiaryCID = "beneficiary";
			const beneficiaryAddress = otherAccount.address;
			const beneficiaryPercent = 10000;

			const beneficiary = [
				beneficiaryCID,
				beneficiaryAddress,
				beneficiaryPercent,
			];

			const beneficiariesInfo = [beneficiary];

			const governanceSettings = {
				votingDelay: convertDurationToBlocks("0 min"),
				votingPeriod: convertDurationToBlocks("6 month"),
				proposalThreshold: 1,
			};

			const yieldProtocol = MAINNET.YIELD_PROTOCOLS.AAVE_POLYGON_USDC;
			const depositorYieldPercent = 1000;

			await expect(
				domeProtocol
					.connect(otherAccount)
					.createDome(
						domeInfo,
						beneficiariesInfo,
						governanceSettings,
						depositorYieldPercent,
						yieldProtocol,
						{ value: domeCreationFee }
					)
			).to.be.fulfilled;
		});

		it("Should change contract ballance after successful dome creation ", async function () {
			const { domeProtocol, otherAccount, domeCreationFee } =
				await loadFixture(deployDomeProtocol);

			const domeInfo = {
				CID: "<DOME_CID>",
				tokenName: "<DOME_TOKEN_NAME>",
				tokenSymbol: "<DOME_TOKEN_SYMBOL>",
			};

			const beneficiaryCID = "beneficiary";
			const beneficiaryAddress = otherAccount.address;
			const beneficiaryPercent = 10000;

			const beneficiary = [
				beneficiaryCID,
				beneficiaryAddress,
				beneficiaryPercent,
			];

			const beneficiariesInfo = [beneficiary];

			const governanceSettings = {
				votingDelay: convertDurationToBlocks("0 min"),
				votingPeriod: convertDurationToBlocks("6 month"),
				proposalThreshold: 1,
			};

			const yieldProtocol = MAINNET.YIELD_PROTOCOLS.AAVE_POLYGON_USDC;
			const depositorYieldPercent = 1000;

			await expect(
				domeProtocol
					.connect(otherAccount)
					.createDome(
						domeInfo,
						beneficiariesInfo,
						governanceSettings,
						depositorYieldPercent,
						yieldProtocol,
						{ value: domeCreationFee }
					)
			).to.changeEtherBalances(
				[otherAccount.address, domeProtocol.address],
				[domeCreationFee.mul(-1), domeCreationFee]
			);
		});
	});

	describe("Events", function () {
		it("Should emit a dome creation event dome creation", async function () {
			const { domeProtocol, otherAccount, domeCreationFee } =
				await loadFixture(deployDomeProtocol);

			const domeInfo = {
				CID: "<DOME_CID>",
				tokenName: "<DOME_TOKEN_NAME>",
				tokenSymbol: "<DOME_TOKEN_SYMBOL>",
			};

			const beneficiaryCID = "beneficiary";
			const beneficiaryAddress = otherAccount.address;
			const beneficiaryPercent = 10000;

			const beneficiary = [
				beneficiaryCID,
				beneficiaryAddress,
				beneficiaryPercent,
			];

			const beneficiariesInfo = [beneficiary];

			const governanceSettings = {
				votingDelay: convertDurationToBlocks("0 min"),
				votingPeriod: convertDurationToBlocks("6 month"),
				proposalThreshold: 1,
			};

			const yieldProtocol = MAINNET.YIELD_PROTOCOLS.AAVE_POLYGON_USDC;
			const depositorYieldPercent = 1000;

		const providerType = await domeProtocol.YIELD_PROVIDER_TYPE_AAVE();

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

			await expect(
				domeProtocol
					.connect(otherAccount)
					.createDome(
						domeInfo,
						beneficiariesInfo,
						governanceSettings,
						depositorYieldPercent,
						yieldProtocol,
						{ value: domeCreationFee }
					)
			)
				.to.emit(domeProtocol, "DomeCreated")
			.withArgs(
				otherAccount.address,
				domeAddress,
				yieldProtocol,
				providerType,
				domeInfo.CID
			);
		});
	});

	describe("Ownership", function () {
		it("Shouldn't allow another accounts to withdraw creation fees", async function () {
			const { domeProtocol, otherAccount, domeCreationFee } =
				await loadFixture(deployDomeProtocol);

			const domeInfo = {
				CID: "<DOME_CID>",
				tokenName: "<DOME_TOKEN_NAME>",
				tokenSymbol: "<DOME_TOKEN_SYMBOL>",
			};

			const beneficiaryCID = "beneficiary";
			const beneficiaryAddress = otherAccount.address;
			const beneficiaryPercent = 10000;

			const beneficiary = [
				beneficiaryCID,
				beneficiaryAddress,
				beneficiaryPercent,
			];

			const beneficiariesInfo = [beneficiary];

			const governanceSettings = {
				votingDelay: convertDurationToBlocks("0 min"),
				votingPeriod: convertDurationToBlocks("6 month"),
				proposalThreshold: 1,
			};

			const yieldProtocol = MAINNET.YIELD_PROTOCOLS.AAVE_POLYGON_USDC;
			const depositorYieldPercent = 1000;

			await expect(
				domeProtocol
					.connect(otherAccount)
					.createDome(
						domeInfo,
						beneficiariesInfo,
						governanceSettings,
						depositorYieldPercent,
						yieldProtocol,
						{ value: domeCreationFee }
					)
			).to.changeEtherBalances(
				[otherAccount.address, domeProtocol.address],
				[domeCreationFee.mul(-1), domeCreationFee]
			);

			await expect(
				domeProtocol.connect(otherAccount).withdraw(otherAccount.address)
			).to.be.revertedWith("Ownable: caller is not the owner");
		});

		it("Should allow contract owner to withdraw fees", async function () {
			const { owner, domeProtocol, otherAccount, domeCreationFee } =
				await loadFixture(deployDomeProtocol);

			const domeInfo = {
				CID: "<DOME_CID>",
				tokenName: "<DOME_TOKEN_NAME>",
				tokenSymbol: "<DOME_TOKEN_SYMBOL>",
			};

			const beneficiaryCID = "beneficiary";
			const beneficiaryAddress = otherAccount.address;
			const beneficiaryPercent = 10000;

			const beneficiary = [
				beneficiaryCID,
				beneficiaryAddress,
				beneficiaryPercent,
			];

			const beneficiariesInfo = [beneficiary];

			const governanceSettings = {
				votingDelay: convertDurationToBlocks("0 min"),
				votingPeriod: convertDurationToBlocks("6 month"),
				proposalThreshold: 1,
			};

			const yieldProtocol = MAINNET.YIELD_PROTOCOLS.AAVE_POLYGON_USDC;
			const depositorYieldPercent = 1000;

			await expect(
				domeProtocol
					.connect(otherAccount)
					.createDome(
						domeInfo,
						beneficiariesInfo,
						governanceSettings,
						depositorYieldPercent,
						yieldProtocol,
						{ value: domeCreationFee }
					)
			).to.changeEtherBalances(
				[otherAccount.address, domeProtocol.address],
				[domeCreationFee.mul(-1), domeCreationFee]
			);

			await expect(
				domeProtocol.connect(owner).withdraw(owner.address)
			).to.changeEtherBalances(
				[domeProtocol.address, owner.address],
				[domeCreationFee.mul(-1), domeCreationFee]
			);
		});

		it("Should allow contract owner to change system owner percentage", async function () {
			const { owner, domeProtocol } = await loadFixture(deployDomeProtocol);

			const newSystemOwnerPercentage = 2000;
			await expect(
				domeProtocol
					.connect(owner)
					.changeSystemOwnerPercentage(newSystemOwnerPercentage)
			).to.be.fulfilled;

			expect(await domeProtocol.systemOwnerPercentage()).to.be.equal(
				newSystemOwnerPercentage
			);
		});

	describe("Yield providers", function () {
		it("Should revert when creating dome with unapproved provider", async function () {
			const { domeProtocol, otherAccount, domeCreationFee } =
				await loadFixture(deployDomeProtocol);

			const domeInfo = {
				CID: "<DOME_CID>",
				tokenName: "<DOME_TOKEN_NAME>",
				tokenSymbol: "<DOME_TOKEN_SYMBOL>",
			};

			const beneficiary = [
				"beneficiary",
				otherAccount.address,
				10000,
			];

			const governanceSettings = {
				votingDelay: convertDurationToBlocks("0 min"),
				votingPeriod: convertDurationToBlocks("6 month"),
				proposalThreshold: 1,
			};

			const unapprovedProvider = ethers.Wallet.createRandom().address;

			await expect(
				domeProtocol
					.connect(otherAccount)
					.createDome(
						domeInfo,
						[beneficiary],
						governanceSettings,
						1000,
						unapprovedProvider,
						{ value: domeCreationFee }
					)
			).to.be.revertedWithCustomError(
				domeProtocol,
				"UnsupportedYieldProvider"
			).withArgs(unapprovedProvider);
		});

		it("Should configure hyperliquid provider and persist provider type", async function () {
			const { domeProtocol, otherAccount, domeCreationFee } =
				await loadFixture(deployDomeProtocol);

			const domeInfo = {
				CID: "<HL_DOME_CID>",
				tokenName: "<HL_DOME_TOKEN_NAME>",
				tokenSymbol: "<HL_DOME_TOKEN_SYMBOL>",
			};

			const beneficiary = [
				"beneficiary",
				otherAccount.address,
				10000,
			];

			const governanceSettings = {
				votingDelay: convertDurationToBlocks("0 min"),
				votingPeriod: convertDurationToBlocks("6 month"),
				proposalThreshold: 1,
			};

			const hyperliquidProvider =
				MAINNET.YIELD_PROTOCOLS.HYPERLIQUID_POLYGON_USDC;
			const providerType = await domeProtocol.YIELD_PROVIDER_TYPE_HYPERLIQUID();

			await expect(
				domeProtocol.configureYieldProviders([
					{
						provider: hyperliquidProvider,
						providerType,
						enabled: true,
					},
				])
			)
				.to.emit(domeProtocol, "YieldProviderConfigured")
				.withArgs(hyperliquidProvider, providerType, true);

			const domeAddress = await domeProtocol
				.connect(otherAccount)
				.callStatic.createDome(
					domeInfo,
					[beneficiary],
					governanceSettings,
					1000,
					hyperliquidProvider,
					{ value: domeCreationFee }
				);

			await expect(
				domeProtocol
					.connect(otherAccount)
					.createDome(
						domeInfo,
						[beneficiary],
						governanceSettings,
						1000,
						hyperliquidProvider,
						{ value: domeCreationFee }
					)
			)
				.to.emit(domeProtocol, "DomeCreated")
				.withArgs(
					otherAccount.address,
					domeAddress,
					hyperliquidProvider,
					providerType,
					domeInfo.CID
				);

			expect(await domeProtocol.domeYieldProviders(domeAddress)).to.be.equal(
				providerType
			);

			const domeInstance = await ethers.getContractAt("Dome", domeAddress);
			expect(await domeInstance.yieldProviderType()).to.be.equal(providerType);
		});

		it("Should restrict yield provider configuration to owner", async function () {
			const { domeProtocol, otherAccount } =
				await loadFixture(deployDomeProtocol);

			const providerType = await domeProtocol.YIELD_PROVIDER_TYPE_HYPERLIQUID();

			await expect(
				domeProtocol
					.connect(otherAccount)
					.configureYieldProviders([
						{
							provider: MAINNET.YIELD_PROTOCOLS.HYPERLIQUID_POLYGON_USDC,
							providerType,
							enabled: true,
						},
					])
			).to.be.revertedWith("Ownable: caller is not the owner");
		});

		it("Should reject enabling provider with unknown type", async function () {
			const { domeProtocol } = await loadFixture(deployDomeProtocol);

			const unknownType = await domeProtocol.YIELD_PROVIDER_TYPE_UNKNOWN();

			await expect(
				domeProtocol.configureYieldProviders([
					{
						provider: MAINNET.YIELD_PROTOCOLS.HYPERLIQUID_POLYGON_USDC,
						providerType: unknownType,
						enabled: true,
					},
				])
			).to.be.revertedWithCustomError(
				domeProtocol,
				"InvalidYieldProviderConfig"
			);
		});
	});
	});
});
