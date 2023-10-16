const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { POLYGON } = require("./constants");
const {
	loadFixture,
	time,
} = require("@nomicfoundation/hardhat-network-helpers");
const { getBalanceOf, approve, sushiSwap } = require("./utils");

describe("Dome-DAO", function () {
	async function deployDomeFactory() {
		const [owner, otherAccount] = await ethers.getSigners();

		const DomeFactory = await ethers.getContractFactory("DomeFactory");
		const GovernanceFactory =
			await ethers.getContractFactory("GovernanceFactory");
		const DomeProtocol = await ethers.getContractFactory("DomeProtocol ");

		const domeFactory = await DomeFactory.deploy();
		const governanceFactory = await GovernanceFactory.deploy();

		const domeCreationFee = ethers.utils.parseEther("1");
		const systemOwnerPercentage = 1000;

		const domeProtocol = await DomeProtocol.deploy(
			owner.address,
			domeFactory.address,
			governanceFactory.address,
			systemOwnerPercentage,
			domeCreationFee
		);

		return {
			domeProtocol,
			domeCreationFee,
			systemOwnerPercentage,
			owner,
			otherAccount,
		};
	}

	async function deployDome() {
		const [owner, otherAccount, anotherAccount] = await ethers.getSigners();

		const DomeFactory = await ethers.getContractFactory("DomeFactory");
		const GovernanceFactory =
			await ethers.getContractFactory("GovernanceFactory");
		const DomeProtocol = await ethers.getContractFactory("DomeProtocol ");

		const domeFactory = await DomeFactory.deploy();
		const governanceFactory = await GovernanceFactory.deploy();

		const domeCreationFee = ethers.utils.parseEther("1");
		const systemOwnerPercentage = 1000;

		const domeProtocol = await DomeProtocol.deploy(
			owner.address,
			domeFactory.address,
			governanceFactory.address,
			systemOwnerPercentage,
			domeCreationFee
		);

		const CID = "dome";
		const tokenName = "domeToken";
		const tokenSymbol = "domeToken";
		const domeInfo = { CID, tokenName, tokenSymbol };

		const beneficiaryCID = "beneficiary";
		const beneficiaryAddress = otherAccount.address;
		const beneficiaryPercent = 10000;

		const beneficiary = {
			beneficiaryCID,
			wallet: beneficiaryAddress,
			percent: beneficiaryPercent,
		};

		const beneficiariesInfo = [beneficiary];
		const yieldProtocol = POLYGON.YIELD_PROTOCOLS.AAVE_POLYGON_USDC;
		const depositorYieldPercent = 1000;
		const tx = await domeProtocol
			.connect(otherAccount)
			.createDome(
				domeInfo,
				beneficiariesInfo,
				depositorYieldPercent,
				yieldProtocol,
				{ value: domeCreationFee }
			);
		const response = await tx.wait();

		const domeAddress = response.events.find(
			(event) =>
				event.topics[0] ===
				"0xf3e2fa62c1f52d87e22f305ca3b16beeeac792b82453f9c10b4a52e79d03db36"
		).args.domeAddress;

		const domeInstance = await ethers.getContractAt("Dome", domeAddress);

		const assetAddress = await domeInstance.asset();
		const assetContract = await ethers.getContractAt("IERC20", assetAddress);

		return {
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

	async function deployDomeWithAAVE() {
		const [owner, otherAccount, anotherAccount] = await ethers.getSigners();

		const DomeFactory = await ethers.getContractFactory("DomeFactory");
		const GovernanceFactory =
			await ethers.getContractFactory("GovernanceFactory");
		const DomeProtocol = await ethers.getContractFactory("DomeProtocol ");

		const domeFactory = await DomeFactory.deploy();
		const governanceFactory = await GovernanceFactory.deploy();

		const domeCreationFee = ethers.utils.parseEther("1");
		const systemOwnerPercentage = 1000;

		const domeProtocol = await DomeProtocol.deploy(
			owner.address,
			domeFactory.address,
			governanceFactory.address,
			systemOwnerPercentage,
			domeCreationFee
		);

		const CID = "dome";
		const tokenName = "domeToken";
		const tokenSymbol = "domeToken";
		const domeInfo = { CID, tokenName, tokenSymbol };

		const beneficiaryCID = "beneficiary";
		const beneficiaryAddress = otherAccount.address;
		const beneficiaryPercent = 10000;

		const beneficiary = {
			beneficiaryCID,
			wallet: beneficiaryAddress,
			percent: beneficiaryPercent,
		};

		const beneficiariesInfo = [beneficiary];
		const yieldProtocol = POLYGON.YIELD_PROTOCOLS.AAVE_POLYGON_USDC;
		const depositorYieldPercent = 1000;

		const tx = await domeProtocol
			.connect(otherAccount)
			.createDome(
				domeInfo,
				beneficiariesInfo,
				depositorYieldPercent,
				yieldProtocol,
				{
					value: domeCreationFee,
				}
			);

		const response = await tx.wait();

		const domeAddress = response.events.find(
			(event) =>
				event.topics[0] ===
				"0xf3e2fa62c1f52d87e22f305ca3b16beeeac792b82453f9c10b4a52e79d03db36"
		).args.domeAddress;

		const domeInstance = await ethers.getContractAt("Dome", domeAddress);

		const assetAddress = await domeInstance.asset();
		const assetContract = await ethers.getContractAt("IERC20", assetAddress);

		return {
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

	describe("Dome-DAO", function () {
		describe("DomeFactory", function () {
			describe("Deployment", function () {
				it("Should set right owner", async function () {
					const { domeProtocol, owner } = await loadFixture(deployDomeFactory);

					expect(await domeProtocol.owner()).to.be.equal(owner.address);
				});

				it("Should set dome creation fee", async function () {
					const { domeProtocol, domeCreationFee } =
						await loadFixture(deployDomeFactory);

					expect(await domeProtocol.domeCreationFee()).to.be.equal(
						domeCreationFee
					);
				});

				it("Should set system owenr fee", async function () {
					const { domeProtocol, systemOwnerPercentage } =
						await loadFixture(deployDomeFactory);

					expect(await domeProtocol.systemOwnerPercentage()).to.be.equal(
						systemOwnerPercentage
					);
				});
			});

			describe("Validations", function () {
				it("Should revert creation with the right error if fee is not payed ", async function () {
					const { domeProtocol, otherAccount } =
						await loadFixture(deployDomeFactory);

					const domeCID = "dome";
					const domeTokenName = "domeToken";
					const domeTokenSymbol = "domeToken";
					const domeInfo = [domeCID, domeTokenName, domeTokenSymbol];

					const beneficiaryCID = "beneficiary";
					const beneficiaryAddress = otherAccount.address;
					const beneficiaryPercent = 10000;

					const beneficiary = [
						beneficiaryCID,
						beneficiaryAddress,
						beneficiaryPercent,
					];

					const beneficiariesInfo = [beneficiary];
					const yieldProtocol = POLYGON.YIELD_PROTOCOLS.AAVE_POLYGON_USDC;
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
						await loadFixture(deployDomeFactory);

					const domeCID = "dome";
					const domeTokenName = "domeToken";
					const domeTokenSymbol = "domeToken";
					const domeInfo = [domeCID, domeTokenName, domeTokenSymbol];

					const beneficiaryCID = "beneficiary";
					const beneficiaryAddress = otherAccount.address;
					const beneficiaryPercent = 10000;

					const beneficiary = [
						beneficiaryCID,
						beneficiaryAddress,
						beneficiaryPercent,
					];

					const beneficiariesInfo = [beneficiary];
					const yieldProtocol = POLYGON.YIELD_PROTOCOLS.AAVE_POLYGON_USDC;
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
						await loadFixture(deployDomeFactory);

					const domeCID = "dome";
					const domeTokenName = "domeToken";
					const domeTokenSymbol = "domeToken";
					const domeInfo = [domeCID, domeTokenName, domeTokenSymbol];

					const beneficiaryCID = "beneficiary";
					const beneficiaryAddress = otherAccount.address;
					const beneficiaryPercent = 10000;

					const beneficiary = [
						beneficiaryCID,
						beneficiaryAddress,
						beneficiaryPercent,
					];

					const beneficiariesInfo = [beneficiary];
					const yieldProtocol = POLYGON.YIELD_PROTOCOLS.AAVE_POLYGON_USDC;
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
						await loadFixture(deployDomeFactory);

					const domeCID = "dome";
					const domeTokenName = "domeToken";
					const domeTokenSymbol = "domeToken";
					const domeInfo = [domeCID, domeTokenName, domeTokenSymbol];

					const beneficiaryCID = "beneficiary";
					const beneficiaryAddress = otherAccount.address;
					const beneficiaryPercent = 10000;

					const beneficiary = [
						beneficiaryCID,
						beneficiaryAddress,
						beneficiaryPercent,
					];

					const beneficiariesInfo = [beneficiary];
					const yieldProtocol = POLYGON.YIELD_PROTOCOLS.AAVE_POLYGON_USDC;
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
						await loadFixture(deployDomeFactory);

					const domeCID = "dome";
					const domeTokenName = "domeToken";
					const domeTokenSymbol = "domeToken";
					const domeInfo = [domeCID, domeTokenName, domeTokenSymbol];

					const beneficiaryCID = "beneficiary";
					const beneficiaryAddress = otherAccount.address;
					const beneficiaryPercent = 10000;

					const beneficiary = [
						beneficiaryCID,
						beneficiaryAddress,
						beneficiaryPercent,
					];

					const beneficiariesInfo = [beneficiary];
					const yieldProtocol = POLYGON.YIELD_PROTOCOLS.AAVE_POLYGON_USDC;
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
					)
						.to.emit(domeProtocol, "DomeCreated")
						.withArgs(
							otherAccount.address,
							anyValue,
							yieldProtocol,
							domeInfo[0]
						);
				});
			});

			describe("Ownership", function () {
				it("Shouldn't allow another accounts to withdraw creation fees", async function () {
					const { domeProtocol, otherAccount, domeCreationFee } =
						await loadFixture(deployDomeFactory);

					const domeCID = "dome";
					const domeTokenName = "domeToken";
					const domeTokenSymbol = "domeToken";
					const domeInfo = [domeCID, domeTokenName, domeTokenSymbol];

					const beneficiaryCID = "beneficiary";
					const beneficiaryAddress = otherAccount.address;
					const beneficiaryPercent = 10000;

					const beneficiary = [
						beneficiaryCID,
						beneficiaryAddress,
						beneficiaryPercent,
					];

					const beneficiariesInfo = [beneficiary];
					const yieldProtocol = POLYGON.YIELD_PROTOCOLS.AAVE_POLYGON_USDC;
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
						await loadFixture(deployDomeFactory);

					const domeCID = "dome";
					const domeTokenName = "domeToken";
					const domeTokenSymbol = "domeToken";
					const domeInfo = [domeCID, domeTokenName, domeTokenSymbol];

					const beneficiaryCID = "beneficiary";
					const beneficiaryAddress = otherAccount.address;
					const beneficiaryPercent = 10000;

					const beneficiary = [
						beneficiaryCID,
						beneficiaryAddress,
						beneficiaryPercent,
					];

					const beneficiariesInfo = [beneficiary];
					const yieldProtocol = POLYGON.YIELD_PROTOCOLS.AAVE_POLYGON_USDC;
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
					const { owner, domeProtocol } = await loadFixture(deployDomeFactory);

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

		describe("DomeCore", function () {
			describe("Deployment", function () {
				it("Should set right system owner", async function () {
					const { domeInstance, owner } = await loadFixture(deployDome);

					expect(await domeInstance.systemOwner()).to.be.equal(owner.address);
				});

				it("Should set right system owner fee percent", async function () {
					const { domeInstance, systemOwnerPercentage } =
						await loadFixture(deployDome);

					expect(await domeInstance.systemFeePercent()).to.be.equal(
						systemOwnerPercentage
					);
				});

				it("Should set right yieldProtocol", async function () {
					const { domeInstance, yieldProtocol } = await loadFixture(deployDome);

					expect(await domeInstance.yieldProtocol()).to.be.equal(yieldProtocol);
				});

				it("Should set right depositor yield percent", async function () {
					const { domeInstance, depositorYieldPercent } =
						await loadFixture(deployDome);

					expect(await domeInstance.depositorYieldPercent()).to.be.equal(
						depositorYieldPercent
					);
				});

				it("Should set right token name", async function () {
					const { domeInstance, domeInfo } = await loadFixture(deployDome);

					expect(await domeInstance.name()).to.be.equal(domeInfo.tokenName);
				});

				it("Should set right token symbol", async function () {
					const { domeInstance, domeInfo } = await loadFixture(deployDome);

					expect(await domeInstance.symbol()).to.be.equal(domeInfo.tokenSymbol);
				});

				it("Should set right dome CID", async function () {
					const { domeInstance, domeInfo } = await loadFixture(deployDome);

					expect(await domeInstance.DOME_CID()).to.be.equal(domeInfo.CID);
				});

				it("Should set right benefeciaries", async function () {
					const { domeInstance, beneficiariesInfo } =
						await loadFixture(deployDome);

					for (let i = 0; i < beneficiariesInfo.length; i++) {
						const beneficiary = await domeInstance.beneficiaries(i);

						expect(beneficiary.beneficiaryCID).to.be.equal(
							beneficiariesInfo[i].beneficiaryCID
						);

						expect(beneficiary.wallet).to.be.equal(beneficiariesInfo[i].wallet);

						expect(beneficiary.percent).to.be.equal(
							beneficiariesInfo[i].percent
						);
					}
				});
			});

			describe("Validations", function () {
				describe("Deposits", function () {
					it("Should revert deposit without assets allowance", async function () {
						const { assetContract, domeInstance, otherAccount } =
							await loadFixture(deployDome);

						const swapAmount = ethers.utils.parseEther("5");
						const assetsReceived = await sushiSwap(
							otherAccount,
							POLYGON.ADDRESSES.WMATIC,
							assetContract.address,
							swapAmount
						);

						await expect(
							domeInstance
								.connect(otherAccount)
								.deposit(assetsReceived, otherAccount.address)
						).to.be.revertedWith("ERC20: transfer amount exceeds allowance");
					});

					it("Should allow depositing assets into dome ", async function () {
						const { domeInstance, otherAccount, assetContract, asset } =
							await loadFixture(deployDome);

						const swapAmount = ethers.utils.parseEther("5");
						const assetsReceived = await sushiSwap(
							otherAccount,
							POLYGON.ADDRESSES.WMATIC,
							assetContract.address,
							swapAmount
						);

						await approve(
							otherAccount,
							asset,
							domeInstance.address,
							assetsReceived
						);

						await expect(
							domeInstance
								.connect(otherAccount)
								.deposit(assetsReceived, otherAccount.address)
						).to.be.fulfilled;
					});

					it("Should update user's asset balance after deposit", async function () {
						const { assetContract, domeInstance, otherAccount } =
							await loadFixture(deployDome);

						const asset = await domeInstance.asset();

						const swapAmount = ethers.utils.parseEther("5");
						const assetsReceived = await sushiSwap(
							otherAccount,
							POLYGON.ADDRESSES.WMATIC,
							assetContract.address,
							swapAmount
						);

						await approve(
							otherAccount,
							asset,
							domeInstance.address,
							assetsReceived
						);

						await expect(
							domeInstance
								.connect(otherAccount)
								.deposit(assetsReceived, otherAccount.address)
						).to.changeTokenBalance(
							assetContract,
							otherAccount.address,
							assetsReceived.mul(-1)
						);
					});

					it("Should update contract's yield share balance on deposit", async function () {
						const { domeInstance, otherAccount, yieldProtocol, assetContract } =
							await loadFixture(deployDome);

						const asset = await domeInstance.asset();

						const swapAmount = ethers.utils.parseEther("5");
						const assetsReceived = await sushiSwap(
							otherAccount,
							POLYGON.ADDRESSES.WMATIC,
							assetContract.address,
							swapAmount
						);

						await approve(
							otherAccount,
							asset,
							domeInstance.address,
							assetsReceived
						);

						const preivewDeposit =
							await domeInstance.previewDeposit(assetsReceived);

						const yieldProtocolContract = await ethers.getContractAt(
							"IERC20",
							yieldProtocol
						);

						await expect(
							domeInstance
								.connect(otherAccount)
								.deposit(assetsReceived, otherAccount.address)
						).to.changeTokenBalance(
							yieldProtocolContract,
							domeInstance.address,
							preivewDeposit
						);
					});

					it("Should send contract's wrapped share token to depositor", async function () {
						const { domeInstance, otherAccount, assetContract } =
							await loadFixture(deployDome);

						const asset = await domeInstance.asset();

						const swapAmount = ethers.utils.parseEther("5");
						const assetsReceived = await sushiSwap(
							otherAccount,
							POLYGON.ADDRESSES.WMATIC,
							assetContract.address,
							swapAmount
						);

						await approve(
							otherAccount,
							asset,
							domeInstance.address,
							assetsReceived
						);

						const preivewDeposit =
							await domeInstance.previewDeposit(assetsReceived);

						await expect(
							domeInstance
								.connect(otherAccount)
								.deposit(assetsReceived, otherAccount.address)
						).to.changeTokenBalance(
							domeInstance,
							otherAccount.address,
							preivewDeposit
						);
					});

					it("Should update contract's total assets balance after deposit", async function () {
						const { domeInstance, otherAccount, assetContract } =
							await loadFixture(deployDome);

						const asset = await domeInstance.asset();

						const swapAmount = ethers.utils.parseEther("5");
						const assetsReceived = await sushiSwap(
							otherAccount,
							POLYGON.ADDRESSES.WMATIC,
							assetContract.address,
							swapAmount
						);

						await approve(
							otherAccount,
							asset,
							domeInstance.address,
							assetsReceived
						);

						await expect(
							domeInstance
								.connect(otherAccount)
								.deposit(assetsReceived, otherAccount.address)
						).to.be.fulfilled;

						expect(await domeInstance.totalAssets()).to.be.equal(
							assetsReceived
						);
					});
				});

				describe("Mints", function () {
					it("Should revert mint without assets allowance", async function () {
						const { domeInstance, otherAccount, assetContract } =
							await loadFixture(deployDome);

						const swapAmount = ethers.utils.parseEther("5");
						const assetsReceived = await sushiSwap(
							otherAccount,
							POLYGON.ADDRESSES.WMATIC,
							assetContract.address,
							swapAmount
						);
						const assetToShares =
							await domeInstance.convertToShares(assetsReceived);

						await expect(
							domeInstance
								.connect(otherAccount)
								.mint(assetToShares, otherAccount.address)
						).to.be.revertedWith("ERC20: transfer amount exceeds allowance");
					});

					it("Should allow minting shares ", async function () {
						const { domeInstance, otherAccount, assetContract } =
							await loadFixture(deployDome);

						const swapAmount = ethers.utils.parseEther("5");
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

						const assetToShares =
							await domeInstance.convertToShares(assetsReceived);

						await expect(
							domeInstance
								.connect(otherAccount)
								.mint(assetToShares, otherAccount.address)
						).to.be.fulfilled;
					});

					it("Should update user's asset balance after mint", async function () {
						const { domeInstance, otherAccount, assetContract } =
							await loadFixture(deployDome);

						const swapAmount = ethers.utils.parseEther("5");
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

						const assetToShares =
							await domeInstance.convertToShares(assetsReceived);

						await expect(
							domeInstance
								.connect(otherAccount)
								.mint(assetToShares, otherAccount.address)
						).to.changeTokenBalance(
							assetContract,
							otherAccount.address,
							assetsReceived.mul(-1)
						);
					});

					it("Should update contract's yield share balance on mint", async function () {
						const { domeInstance, otherAccount, yieldProtocol, assetContract } =
							await loadFixture(deployDome);

						const swapAmount = ethers.utils.parseEther("5");
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

						const preivewDeposit =
							await domeInstance.previewDeposit(assetsReceived);

						const yieldProtocolContract = await ethers.getContractAt(
							"IERC20",
							yieldProtocol
						);

						const assetToShares =
							await domeInstance.convertToShares(assetsReceived);

						await expect(
							domeInstance
								.connect(otherAccount)
								.mint(assetToShares, otherAccount.address)
						).to.changeTokenBalance(
							yieldProtocolContract,
							domeInstance.address,
							preivewDeposit
						);
					});

					it("Should send contract's wrapped share token to minter", async function () {
						const { domeInstance, otherAccount, assetContract } =
							await loadFixture(deployDome);

						const swapAmount = ethers.utils.parseEther("5");
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

						const preivewDeposit =
							await domeInstance.previewDeposit(assetsReceived);

						const assetToShares =
							await domeInstance.convertToShares(assetsReceived);

						await expect(
							domeInstance
								.connect(otherAccount)
								.mint(assetToShares, otherAccount.address)
						).to.changeTokenBalance(
							domeInstance,
							otherAccount.address,
							preivewDeposit
						);
					});

					it("Should update contract's total assets balance after mint", async function () {
						const { domeInstance, otherAccount, assetContract } =
							await loadFixture(deployDome);

						const swapAmount = ethers.utils.parseEther("5");
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

						const assetToShares =
							await domeInstance.convertToShares(assetsReceived);

						await expect(
							domeInstance
								.connect(otherAccount)
								.mint(assetToShares, otherAccount.address)
						).to.be.fulfilled;

						expect(await domeInstance.totalAssets()).to.be.equal(
							assetsReceived
						);
					});
				});

				describe("Withdrawals", function () {
					it("Should revert withdrawal if asset amount exceeds the share balance", async function () {
						const { domeInstance, otherAccount, assetContract } =
							await loadFixture(deployDome);

						const swapAmount = ethers.utils.parseEther("5");
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

						const receiver = otherAccount.address;
						const owner = otherAccount.address;
						await expect(
							domeInstance
								.connect(otherAccount)
								.withdraw(assetsReceived, receiver, owner)
						).to.be.revertedWith("ERC20: burn amount exceeds balance");
					});

					it("Should allow max withdrawal of asset", async function () {
						const { domeInstance, otherAccount, assetContract } =
							await loadFixture(deployDome);

						const swapAmount = ethers.utils.parseEther("5");
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

						const maxWithdraw = await domeInstance.maxWithdraw(
							otherAccount.address
						);

						const receiver = otherAccount.address;
						const owner = otherAccount.address;
						await expect(
							domeInstance
								.connect(otherAccount)
								.withdraw(maxWithdraw, receiver, owner)
						).to.be.fulfilled;
					});

					it("Should update receiver's asset balance after withdrawal", async function () {
						const { domeInstance, otherAccount, assetContract } =
							await loadFixture(deployDome);

						const swapAmount = ethers.utils.parseEther("5");
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

						const maxWithdraw = await domeInstance.maxWithdraw(
							otherAccount.address
						);

						const receiver = otherAccount.address;
						const owner = otherAccount.address;
						await expect(
							domeInstance
								.connect(otherAccount)
								.withdraw(maxWithdraw, receiver, owner)
						).to.changeTokenBalance(assetContract, receiver, maxWithdraw);
					});

					it("Should update owner's share balance after withdrawal", async function () {
						const { domeInstance, otherAccount, assetContract } =
							await loadFixture(deployDome);

						const swapAmount = ethers.utils.parseEther("5");
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

						const preivewDeposit =
							await domeInstance.previewDeposit(assetsReceived);

						await expect(
							domeInstance
								.connect(otherAccount)
								.deposit(assetsReceived, otherAccount.address)
						).to.be.fulfilled;

						const maxWithdraw = await domeInstance.maxWithdraw(
							otherAccount.address
						);

						const receiver = otherAccount.address;
						const owner = otherAccount.address;
						await expect(
							domeInstance
								.connect(otherAccount)
								.withdraw(maxWithdraw, receiver, owner)
						).to.changeTokenBalance(
							domeInstance,
							owner,
							preivewDeposit.mul(-1)
						);
					});

					it("Should update dome's share balance after withdrawal", async function () {
						const { domeInstance, otherAccount, yieldProtocol, assetContract } =
							await loadFixture(deployDome);

						const swapAmount = ethers.utils.parseEther("5");
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

						const preivewDeposit =
							await domeInstance.previewDeposit(assetsReceived);

						await expect(
							domeInstance
								.connect(otherAccount)
								.deposit(assetsReceived, otherAccount.address)
						).to.be.fulfilled;

						const maxWithdraw = await domeInstance.maxWithdraw(
							otherAccount.address
						);

						const yieldProtocolContract = await ethers.getContractAt(
							"IERC20",
							yieldProtocol
						);

						const receiver = otherAccount.address;
						const owner = otherAccount.address;
						await expect(
							domeInstance
								.connect(otherAccount)
								.withdraw(maxWithdraw, receiver, owner)
						).to.changeTokenBalance(
							yieldProtocolContract,
							domeInstance.address,
							preivewDeposit.mul(-1)
						);
					});

					it("Should update dome's total asset balance after withdrawal", async function () {
						const { domeInstance, otherAccount, assetContract } =
							await loadFixture(deployDome);

						const swapAmount = ethers.utils.parseEther("5");
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

						const maxWithdraw = await domeInstance.maxWithdraw(
							otherAccount.address
						);

						const initialTotalAssets = await domeInstance.totalAssets();

						const receiver = otherAccount.address;
						const owner = otherAccount.address;

						await expect(
							domeInstance
								.connect(otherAccount)
								.withdraw(maxWithdraw, receiver, owner)
						).to.be.fulfilled;

						expect(await domeInstance.totalAssets()).to.be.equal(
							initialTotalAssets.sub(maxWithdraw)
						);
					});

					it("Should send contract's wrapped share token to depositor", async function () {
						const { domeInstance, otherAccount, assetContract } =
							await loadFixture(deployDome);

						const swapAmount = ethers.utils.parseEther("5");
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

						const preivewDeposit =
							await domeInstance.previewDeposit(assetsReceived);

						await expect(
							domeInstance
								.connect(otherAccount)
								.deposit(assetsReceived, otherAccount.address)
						).to.changeTokenBalance(
							domeInstance,
							otherAccount.address,
							preivewDeposit
						);
					});

					it("Should update contract's total assets balance after deposit", async function () {
						const { domeInstance, otherAccount, assetContract } =
							await loadFixture(deployDome);

						const swapAmount = ethers.utils.parseEther("5");
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

						expect(await domeInstance.totalAssets()).to.be.equal(
							assetsReceived
						);
					});
				});

				describe("Redeems", function () {
					it("Should revert redeem if shares amount exceeds the balance", async function () {
						const { domeInstance, otherAccount, assetContract } =
							await loadFixture(deployDome);

						const swapAmount = ethers.utils.parseEther("5");
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

						const preivewDeposit =
							await domeInstance.previewDeposit(assetsReceived);

						await expect(
							domeInstance
								.connect(otherAccount)
								.deposit(assetsReceived, otherAccount.address)
						).to.be.fulfilled;

						const receiver = otherAccount.address;
						const owner = otherAccount.address;
						await expect(
							domeInstance
								.connect(otherAccount)
								.redeem(preivewDeposit.add(1), receiver, owner)
						).to.be.revertedWith("ERC20: burn amount exceeds balance");
					});

					it("Should allow max redemption of asset", async function () {
						const { domeInstance, otherAccount, assetContract } =
							await loadFixture(deployDome);

						const swapAmount = ethers.utils.parseEther("5");
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

						const maxRedeem = await domeInstance.maxRedeem(
							otherAccount.address
						);

						const receiver = otherAccount.address;
						const owner = otherAccount.address;
						await expect(
							domeInstance
								.connect(otherAccount)
								.redeem(maxRedeem, receiver, owner)
						).to.be.fulfilled;
					});

					it("Should update receiver's asset balance after redeem", async function () {
						const { domeInstance, otherAccount, assetContract } =
							await loadFixture(deployDome);

						const swapAmount = ethers.utils.parseEther("5");
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

						const shareOwner = otherAccount;
						const maxRedeem = await domeInstance.maxRedeem(
							otherAccount.address
						);

						// Contract checks sender's asset balance, thats why we connect the signer
						const expectedAssets = await domeInstance
							.connect(shareOwner)
							.previewRedeem(maxRedeem);

						const receiver = otherAccount.address;
						await expect(
							domeInstance
								.connect(otherAccount)
								.redeem(maxRedeem, receiver, shareOwner.address)
						).to.changeTokenBalance(assetContract, receiver, expectedAssets);
					});

					it("Should update owner's share balance after redeem", async function () {
						const { domeInstance, otherAccount, assetContract } =
							await loadFixture(deployDome);

						const swapAmount = ethers.utils.parseEther("5");
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

						const shareOwner = otherAccount;
						const maxRedeem = await domeInstance.maxRedeem(
							otherAccount.address
						);

						const receiver = otherAccount.address;
						await expect(
							domeInstance
								.connect(otherAccount)
								.redeem(maxRedeem, receiver, shareOwner.address)
						).to.changeTokenBalance(
							domeInstance,
							shareOwner.address,
							maxRedeem.mul(-1)
						);
					});

					it("Should update dome's share balance after redeem", async function () {
						const { domeInstance, otherAccount, yieldProtocol, assetContract } =
							await loadFixture(deployDome);

						const swapAmount = ethers.utils.parseEther("5");
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

						const shareOwner = otherAccount;
						const maxRedeem = await domeInstance.maxRedeem(
							otherAccount.address
						);

						const yieldProtocolContract = await ethers.getContractAt(
							"IERC20",
							yieldProtocol
						);

						const receiver = otherAccount.address;
						await expect(
							domeInstance
								.connect(otherAccount)
								.redeem(maxRedeem, receiver, shareOwner.address)
						).to.changeTokenBalance(
							yieldProtocolContract,
							domeInstance.address,
							maxRedeem.mul(-1)
						);
					});

					it("Should update dome's total asset balance after redeem", async function () {
						const { domeInstance, otherAccount, assetContract } =
							await loadFixture(deployDome);

						const swapAmount = ethers.utils.parseEther("5");
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

						const shareOwner = otherAccount;
						const maxRedeem = await domeInstance.maxRedeem(
							otherAccount.address
						);

						// Contract checks sender's asset balance, thats why we connect the signer
						const expectedAssets = await domeInstance
							.connect(shareOwner)
							.previewRedeem(maxRedeem);

						const receiver = otherAccount.address;

						const initialTotalAssets = await domeInstance.totalAssets();

						await expect(
							domeInstance
								.connect(otherAccount)
								.redeem(maxRedeem, receiver, shareOwner.address)
						).to.be.fulfilled;

						expect(await domeInstance.totalAssets()).to.be.equal(
							initialTotalAssets.sub(expectedAssets)
						);
					});
				});

				describe("AAVE Yield Protocol", function () {
					it("Should allow claiming and distributing available yield after withdraw", async function () {
						const {
							domeInstance,
							otherAccount,
							anotherAccount,
							assetContract,
						} = await loadFixture(deployDomeWithAAVE);

						const swapAmount = ethers.utils.parseEther("100");
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

						const maxWithdraw = await domeInstance.maxWithdraw(
							otherAccount.address
						);

						const initialTotalAssets = await domeInstance.totalAssets();

						const receiver = otherAccount.address;
						const owner = otherAccount.address;

						await expect(
							domeInstance
								.connect(otherAccount)
								.withdraw(maxWithdraw, receiver, owner)
						).to.changeTokenBalance(
							assetContract,
							otherAccount.address,
							maxWithdraw
						);

						expect(await domeInstance.totalAssets()).to.be.equal(
							initialTotalAssets.sub(assetsReceived)
						);

						await expect(
							domeInstance.connect(anotherAccount).claimYieldAndDistribute()
						).to.be.fulfilled;
					});

					it("Should allow claiming and distributing available yield before withdraw", async function () {
						const {
							domeInstance,
							otherAccount,
							anotherAccount,
							assetContract,
						} = await loadFixture(deployDomeWithAAVE);

						const swapAmount = ethers.utils.parseEther("100");
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

						await expect(
							domeInstance.connect(anotherAccount).claimYieldAndDistribute()
						).to.be.fulfilled;

						const maxWithdraw = await domeInstance.maxWithdraw(
							otherAccount.address
						);

						const receiver = otherAccount.address;
						const owner = otherAccount.address;

						await expect(
							domeInstance
								.connect(otherAccount)
								.withdraw(maxWithdraw, receiver, owner)
						).to.be.fulfilled;
					});

					it.skip("Should allow claiming and distributing available yield before multiple withdraw", async function () {
						const {
							domeInstance,
							otherAccount,
							anotherAccount,
							assetContract,
						} = await loadFixture(deployDomeWithAAVE);

						let firstInital;
						let secondInital;
						for (let i = 0; i < 1; i++) {
							const swapAmount1 = ethers.utils.parseEther("100");
							const swapAmount2 = ethers.utils.parseEther("50");

							[firstInital, secondInital] = await Promise.all([
								sushiSwap(
									otherAccount,
									POLYGON.ADDRESSES.WMATIC,
									assetContract.address,
									swapAmount1,
									otherAccount.address
								),
								sushiSwap(
									anotherAccount,
									POLYGON.ADDRESSES.WMATIC,
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
								.withdraw(
									maxWithdraw1,
									otherAccount.address,
									otherAccount.address
								)
						).to.changeTokenBalance(assetContract, otherAccount, maxWithdraw1);

						const maxWithdraw2 = await domeInstance.callStatic.maxWithdraw(
							anotherAccount.address
						);

						console.log("First Deposit, claim and Withdraw done");

						await expect(
							domeInstance
								.connect(anotherAccount)
								.withdraw(
									maxWithdraw2,
									anotherAccount.address,
									anotherAccount.address
								)
						).to.changeTokenBalance(
							assetContract,
							anotherAccount,
							maxWithdraw2
						);

						for (let i = 0; i < 4; i++) {
							const swapAmount3 = ethers.utils.parseEther("57");
							const swapAmount4 = ethers.utils.parseEther("35");

							await Promise.all([
								sushiSwap(
									otherAccount,
									POLYGON.ADDRESSES.WMATIC,
									assetContract.address,
									swapAmount3,
									otherAccount.address
								),
								sushiSwap(
									anotherAccount,
									POLYGON.ADDRESSES.WMATIC,
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

						console.log("Second Deposit done");

						await time.increase(ONE_DAY * 60);

						await expect(
							domeInstance.connect(otherAccount).claimYieldAndDistribute()
						).to.be.fulfilled;

						console.log("First claim done");
						const maxWithdraw3Pre = await domeInstance.callStatic.maxWithdraw(
							otherAccount.address
						);

						const maxWithdraw4Pre = await domeInstance.maxWithdraw(
							anotherAccount.address
						);

						console.log(`MAX WITHDRAW 3 AFTER FIRST: ${maxWithdraw3Pre}`);
						console.log(`MAX WITHDRAW 4 AFTER FIRST: ${maxWithdraw4Pre}`);
						const avYield = await domeInstance.availableYield();
						expect(avYield[0]).to.be.eq(0);

						console.log("Second claim done");

						const maxWithdraw3 = await domeInstance.callStatic.maxWithdraw(
							otherAccount.address
						);

						console.log(`MAX WITHDRAW 3 AFTER SECOND: ${maxWithdraw3}`);

						// await expect(
						// 	domeInstance
						// 		.connect(otherAccount)
						// 		.withdraw(
						// 			maxWithdraw3,
						// 			otherAccount.address,
						// 			otherAccount.address
						// 		)
						// ).to.changeTokenBalance(assetContract, otherAccount, maxWithdraw3);

						const maxWithdraw4 = await domeInstance.maxWithdraw(
							anotherAccount.address
						);

						console.log(`MAX WITHDRAW 4 AFTER SECOND: ${maxWithdraw4}`);

						// await expect(
						// 	domeInstance
						// 		.connect(anotherAccount)
						// 		.withdraw(
						// 			maxWithdraw4,
						// 			anotherAccount.address,
						// 			anotherAccount.address
						// 		)
						// ).to.changeTokenBalance(
						// 	assetContract,
						// 	anotherAccount,
						// 	maxWithdraw4
						// );

						console.log("Second Deposit, claim and Withdraw done");
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

						const maxWithdraw = await domeInstance.maxWithdraw(
							otherAccount.address
						);

						const initialTotalAssets = await domeInstance.totalAssets();

						const receiver = otherAccount.address;
						const owner = otherAccount.address;

						await expect(
							domeInstance
								.connect(otherAccount)
								.withdraw(maxWithdraw, receiver, owner)
						).to.changeTokenBalance(
							assetContract,
							otherAccount.address,
							maxWithdraw
						);

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

						const availableYieldToClaim = (await domeInstance.availableYield())
							.assets;

						const maxWithdraw = await domeInstance.maxWithdraw(
							otherAccount.address
						);

						const initialTotalAssets = await domeInstance.totalAssets();

						const receiver = otherAccount.address;
						const owner = otherAccount.address;

						await expect(
							domeInstance
								.connect(otherAccount)
								.withdraw(maxWithdraw, receiver, owner)
						).to.changeTokenBalance(
							assetContract,
							otherAccount.address,
							maxWithdraw
						);

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

						const availableYieldToClaim = (await domeInstance.availableYield())
							.assets;

						const maxWithdraw = await domeInstance.maxWithdraw(
							otherAccount.address
						);

						const initialTotalAssets = await domeInstance.totalAssets();

						const receiver = otherAccount.address;
						const owner = otherAccount.address;

						await expect(
							domeInstance
								.connect(otherAccount)
								.withdraw(maxWithdraw, receiver, owner)
						).to.changeTokenBalance(
							assetContract,
							otherAccount.address,
							maxWithdraw
						);

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

						const maxWithdraw = await domeInstance.maxWithdraw(
							otherAccount.address
						);

						const initialTotalAssets = await domeInstance.totalAssets();

						const receiver = otherAccount.address;
						const owner = otherAccount.address;

						await expect(
							domeInstance
								.connect(otherAccount)
								.withdraw(maxWithdraw, receiver, owner)
						).to.changeTokenBalance(
							assetContract,
							otherAccount.address,
							maxWithdraw
						);

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

							const availableYieldToClaim = (
								await domeInstance.availableYield()
							).assets;

							const systemOwnerPortion = availableYieldToClaim
								.mul(systemOwnerPercentage)
								.div(10000);
							await expect(
								domeInstance.connect(anotherAccount).claimYieldAndDistribute()
							)
								.to.emit(domeInstance, "YieldClaimed")
								.withArgs(
									yieldProtocol,
									availableYieldToClaim.sub(systemOwnerPortion)
								);
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

							const availableYieldToClaim = (
								await domeInstance.availableYield()
							).assets;

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

							const availableYieldToClaim = (
								await domeInstance.availableYield()
							).assets;

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
			});

			describe("Events", function () {
				it("Should emit a Deposit event on deposit", async function () {
					const { domeInstance, otherAccount, assetContract } =
						await loadFixture(deployDome);

					const swapAmount = ethers.utils.parseEther("5");
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

					const preivewDeposit =
						await domeInstance.previewDeposit(assetsReceived);

					const sender = otherAccount.address;
					const receiver = otherAccount.address;
					const assets = assetsReceived;
					const shares = preivewDeposit;

					await expect(
						domeInstance
							.connect(otherAccount)
							.deposit(assetsReceived, otherAccount.address)
					)
						.to.emit(domeInstance, "Deposit")
						.withArgs(sender, receiver, assets, shares);
				});

				it("Should emit a Deposit event on mint", async function () {
					const { domeInstance, otherAccount, assetContract } =
						await loadFixture(deployDome);

					const swapAmount = ethers.utils.parseEther("5");
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

					const assetToShares =
						await domeInstance.convertToShares(assetsReceived);

					const sender = otherAccount.address;
					const receiver = otherAccount.address;
					const assets = assetsReceived;
					const shares = assetToShares;

					await expect(
						domeInstance.connect(otherAccount).mint(assetToShares, receiver)
					)
						.to.emit(domeInstance, "Deposit")
						.withArgs(sender, receiver, assets, shares);
				});

				it("Should emit a Withdraw event on withdraw", async function () {
					const { domeInstance, otherAccount, assetContract } =
						await loadFixture(deployDome);

					const swapAmount = ethers.utils.parseEther("5");
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

					const preivewDeposit =
						await domeInstance.previewDeposit(assetsReceived);

					await expect(
						domeInstance
							.connect(otherAccount)
							.deposit(assetsReceived, otherAccount.address)
					).to.be.fulfilled;

					const maxWithdraw = await domeInstance.maxWithdraw(
						otherAccount.address
					);

					const sender = otherAccount.address;
					const owner = otherAccount.address;
					const receiver = otherAccount.address;
					const assets = maxWithdraw;
					const shares = preivewDeposit;

					await expect(
						domeInstance
							.connect(otherAccount)
							.withdraw(maxWithdraw, receiver, owner)
					)
						.to.emit(domeInstance, "Withdraw")
						.withArgs(sender, receiver, owner, assets, shares);
				});

				it("Should emit a Withdraw event on redeem", async function () {
					const { domeInstance, otherAccount, assetContract } =
						await loadFixture(deployDome);

					const swapAmount = ethers.utils.parseEther("5");
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

					const maxRedeem = await domeInstance.maxRedeem(otherAccount.address);

					const sender = otherAccount.address;
					const owner = otherAccount.address;

					const expectedAssets = await domeInstance
						.connect(owner)
						.previewRedeem(maxRedeem);

					const receiver = otherAccount.address;
					const assets = expectedAssets;
					const shares = maxRedeem;

					await expect(
						domeInstance
							.connect(otherAccount)
							.redeem(maxRedeem, receiver, owner)
					)
						.to.emit(domeInstance, "Withdraw")
						.withArgs(sender, receiver, owner, assets, shares);
				});
			});

			describe("Ownership", function () {
				it("Shouldn't allow another accounts to change system owner's fees", async function () {
					const { domeInstance, otherAccount } = await loadFixture(deployDome);

					const newSystemOwnerPercentage = 1500;

					await expect(
						domeInstance
							.connect(otherAccount)
							.changeSystemFeePercent(newSystemOwnerPercentage)
					).to.be.revertedWith("Caller is not the system owner");
				});

				it("Shouldn't allow owner to set fee more than 25%", async function () {
					const { domeInstance, owner } = await loadFixture(deployDome);

					const newSystemOwnerPercentage = 2501;

					await expect(
						domeInstance
							.connect(owner)
							.changeSystemFeePercent(newSystemOwnerPercentage)
					).to.be.revertedWith("Fee percent cannot be more than 25%");
				});

				it("Should allow owner to change system owner fee", async function () {
					const { domeInstance, owner } = await loadFixture(deployDome);

					const newSystemOwnerPercentage = 2500;

					await expect(
						domeInstance
							.connect(owner)
							.changeSystemFeePercent(newSystemOwnerPercentage)
					).to.be.fulfilled;

					expect(await domeInstance.systemFeePercent()).to.be.equal(
						newSystemOwnerPercentage
					);
				});
			});
		});
	});
});
