const { expect } = require("chai");
const { ethers } = require("hardhat");
const { POLYGON } = require("./constants");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

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
			const yieldProtocol = POLYGON.YIELD_PROTOCOLS.AAVE_POLYGON_USDC2;
			const depositorYieldPercent = 1000;

			await expect(
				domeProtocol
					.connect(otherAccount)
					.createDome(
						domeInfo,
						beneficiariesInfo,
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
			const yieldProtocol = POLYGON.YIELD_PROTOCOLS.AAVE_POLYGON_USDC2;
			const depositorYieldPercent = 1000;

			await expect(
				domeProtocol
					.connect(otherAccount)
					.createDome(
						domeInfo,
						beneficiariesInfo,
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
			const yieldProtocol = POLYGON.YIELD_PROTOCOLS.AAVE_POLYGON_USDC2;
			const depositorYieldPercent = 1000;

			await expect(
				domeProtocol
					.connect(otherAccount)
					.createDome(
						domeInfo,
						beneficiariesInfo,
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
			const yieldProtocol = POLYGON.YIELD_PROTOCOLS.AAVE_POLYGON_USDC2;
			const depositorYieldPercent = 1000;

			await expect(
				domeProtocol
					.connect(otherAccount)
					.createDome(
						domeInfo,
						beneficiariesInfo,
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
			const yieldProtocol = POLYGON.YIELD_PROTOCOLS.AAVE_POLYGON_USDC2;
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

			await expect(
				domeProtocol
					.connect(otherAccount)
					.createDome(
						domeInfo,
						beneficiariesInfo,
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
			const yieldProtocol = POLYGON.YIELD_PROTOCOLS.AAVE_POLYGON_USDC2;
			const depositorYieldPercent = 1000;

			await expect(
				domeProtocol
					.connect(otherAccount)
					.createDome(
						domeInfo,
						beneficiariesInfo,
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
			const yieldProtocol = POLYGON.YIELD_PROTOCOLS.AAVE_POLYGON_USDC2;
			const depositorYieldPercent = 1000;

			await expect(
				domeProtocol
					.connect(otherAccount)
					.createDome(
						domeInfo,
						beneficiariesInfo,
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
	});
});
