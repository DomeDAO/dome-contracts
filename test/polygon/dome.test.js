const { expect } = require("chai");
const { ethers } = require("hardhat");
const {
	POLYGON: { MAINNET },
} = require("../constants");
const {
	loadFixture,
	time,
} = require("@nomicfoundation/hardhat-network-helpers");
const { approve, swap, convertDurationToBlocks } = require("../utils");
const { deployMockEnvironment } = require("../helpers/deploy");

describe("DomeCore", function () {
	async function deployDome() {
		const { owner, others, contracts, mocks, params } =
			await deployMockEnvironment();
		const [otherAccount, anotherAccount, randomAccount] = others;
		const { domeFactory, governanceFactory, wrappedVotingFactory, domeProtocol } =
			contracts;
		const { usdc, wmatic, aaveProvider } = mocks;
		const { domeCreationFee, systemOwnerPercentage } = params;

		MAINNET.ADDRESSES.USDC = usdc.address;
		MAINNET.ADDRESSES.WMATIC = wmatic.address;
		MAINNET.YIELD_PROTOCOLS.AAVE_POLYGON_USDC = aaveProvider.address;

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
		const assetContract = await ethers.getContractAt("MockERC20", assetAddress);

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

		const PROPOSAL_STATE = {
			PENDING: 0,
			ACTIVE: 1,
			CANCELED: 2,
			DEFEATED: 3,
			SUCCEEDED: 4,
			EXPIRED: 5,
			EXECUTED: 6,
			PRESUCCEEDED: 7,
		};

		return {
			votingContract,
			randomAccount,
			PROPOSAL_STATE,
			domeCreator,
			governanceContract,
			bufferContract,
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
			wmatic,
		};
	}

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

		it("Should set right beneficiaries", async function () {
			const { domeInstance, beneficiariesInfo } = await loadFixture(deployDome);

			for (let i = 0; i < beneficiariesInfo.length; i++) {
				const beneficiary = await domeInstance.beneficiaries(i);

				expect(beneficiary.beneficiaryCID).to.be.equal(
					beneficiariesInfo[i].beneficiaryCID
				);

				expect(beneficiary.wallet).to.be.equal(beneficiariesInfo[i].wallet);

				expect(beneficiary.percent).to.be.equal(beneficiariesInfo[i].percent);
			}
		});
	});

	describe("Validations", function () {
		describe("Deposits", function () {
			it("Should revert deposit without assets allowance", async function () {
				const { assetContract, domeInstance, otherAccount } =
					await loadFixture(deployDome);

				const swapAmount = ethers.utils.parseEther("5");
				const assetsReceived = await swap(
					otherAccount,
					MAINNET.ADDRESSES.WMATIC,
					assetContract.address,
					swapAmount
				);

				await expect(
					domeInstance
						.connect(otherAccount)
						.deposit(assetsReceived, otherAccount.address)
				).to.be.revertedWith("ERC20: insufficient allowance");
			});

			it("Should allow depositing assets into dome ", async function () {
				const { domeInstance, otherAccount, assetContract, asset } =
					await loadFixture(deployDome);

				const swapAmount = ethers.utils.parseEther("5");
				const assetsReceived = await swap(
					otherAccount,
					MAINNET.ADDRESSES.WMATIC,
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

				const swapAmount = ethers.utils.parseEther("5");
				const [asset, assetsReceived] = await Promise.all([
					domeInstance.asset(),
					swap(
						otherAccount,
						MAINNET.ADDRESSES.WMATIC,
						assetContract.address,
						swapAmount
					),
				]);

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

				const swapAmount = ethers.utils.parseEther("5");
				const [asset, assetsReceived] = await Promise.all([
					domeInstance.asset(),
					swap(
						otherAccount,
						MAINNET.ADDRESSES.WMATIC,
						assetContract.address,
						swapAmount
					),
				]);

				await approve(
					otherAccount,
					asset,
					domeInstance.address,
					assetsReceived
				);

				const previewDeposit =
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
					previewDeposit
				);
			});

			it("Should send contract's wrapped share token to depositor", async function () {
				const { domeInstance, otherAccount, assetContract } =
					await loadFixture(deployDome);

				const swapAmount = ethers.utils.parseEther("5");
				const [asset, assetsReceived] = await Promise.all([
					domeInstance.asset(),
					swap(
						otherAccount,
						MAINNET.ADDRESSES.WMATIC,
						assetContract.address,
						swapAmount
					),
				]);

				await approve(
					otherAccount,
					asset,
					domeInstance.address,
					assetsReceived
				);

				const previewDeposit =
					await domeInstance.previewDeposit(assetsReceived);

				await expect(
					domeInstance
						.connect(otherAccount)
						.deposit(assetsReceived, otherAccount.address)
				).to.changeTokenBalance(
					domeInstance,
					otherAccount.address,
					previewDeposit
				);
			});

			it("Should update contract's total assets balance after deposit", async function () {
				const { domeInstance, otherAccount, assetContract } =
					await loadFixture(deployDome);

				const swapAmount = ethers.utils.parseEther("5");
				const [asset, assetsReceived] = await Promise.all([
					domeInstance.asset(),
					swap(
						otherAccount,
						MAINNET.ADDRESSES.WMATIC,
						assetContract.address,
						swapAmount
					),
				]);

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

				expect(await domeInstance.totalAssets()).to.be.equal(assetsReceived);
			});
		});

		describe("Mints", function () {
			it("Should revert mint without assets allowance", async function () {
				const { domeInstance, otherAccount, assetContract } =
					await loadFixture(deployDome);

				const swapAmount = ethers.utils.parseEther("5");
				const assetsReceived = await swap(
					otherAccount,
					MAINNET.ADDRESSES.WMATIC,
					assetContract.address,
					swapAmount
				);
				const assetToShares =
					await domeInstance.convertToShares(assetsReceived);

				await expect(
					domeInstance
						.connect(otherAccount)
						.mint(assetToShares, otherAccount.address)
				).to.be.revertedWith("ERC20: insufficient allowance");
			});

			it("Should allow minting shares ", async function () {
				const { domeInstance, otherAccount, assetContract } =
					await loadFixture(deployDome);

				const swapAmount = ethers.utils.parseEther("5");
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

				const previewDeposit =
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
					previewDeposit
				);
			});

			it("Should send contract's wrapped share token to minter", async function () {
				const { domeInstance, otherAccount, assetContract } =
					await loadFixture(deployDome);

				const swapAmount = ethers.utils.parseEther("5");
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

				const previewDeposit =
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
					previewDeposit
				);
			});

			it("Should update contract's total assets balance after mint", async function () {
				const { domeInstance, otherAccount, assetContract } =
					await loadFixture(deployDome);

				const swapAmount = ethers.utils.parseEther("5");
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

				const assetToShares =
					await domeInstance.convertToShares(assetsReceived);

				await expect(
					domeInstance
						.connect(otherAccount)
						.mint(assetToShares, otherAccount.address)
				).to.be.fulfilled;

				expect(await domeInstance.totalAssets()).to.be.equal(assetsReceived);
			});
		});

		describe("Withdrawals", function () {
			it("Should withdraw available assets even if requested amount exceeds balance", async function () {
				const { domeInstance, otherAccount, assetContract } =
					await loadFixture(deployDome);

				const swapAmount = ethers.utils.parseEther("5");
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

				await expect(
					domeInstance
						.connect(otherAccount)
						.deposit(assetsReceived, otherAccount.address)
				).to.be.fulfilled;

				const receiver = otherAccount.address;
				const owner = otherAccount.address;
				const excessiveAssets = assetsReceived.mul(2);
				const receiverBalanceBefore = await assetContract.balanceOf(receiver);

				await expect(
					domeInstance
						.connect(otherAccount)
						.withdraw(excessiveAssets, receiver, owner)
				).to.be.fulfilled;

				expect(await assetContract.balanceOf(receiver)).to.equal(
					receiverBalanceBefore.add(assetsReceived)
				);

				expect(await domeInstance.balanceOf(otherAccount.address)).to.equal(0);
			});

			it("Should allow max withdrawal of asset", async function () {
				const { domeInstance, otherAccount, assetContract } =
					await loadFixture(deployDome);

				const swapAmount = ethers.utils.parseEther("5");
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

				const previewDeposit =
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
				).to.changeTokenBalance(domeInstance, owner, previewDeposit.mul(-1));
			});

			it("Should update dome's share balance after withdrawal", async function () {
				const { domeInstance, otherAccount, yieldProtocol, assetContract } =
					await loadFixture(deployDome);

				const swapAmount = ethers.utils.parseEther("5");
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

				const previewDeposit =
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
					previewDeposit.mul(-1)
				);
			});

			it("Should update dome's total asset balance after withdrawal", async function () {
				const { domeInstance, otherAccount, assetContract } =
					await loadFixture(deployDome);

				const swapAmount = ethers.utils.parseEther("5");
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

				await expect(
					domeInstance
						.connect(otherAccount)
						.deposit(assetsReceived, otherAccount.address)
				).to.be.fulfilled;

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
				).to.be.fulfilled;

				expect(await domeInstance.totalAssets()).to.be.equal(
					initialTotalAssets.sub(maxWithdraw)
				);
			});

			it("Should send contract's wrapped share token to depositor", async function () {
				const { domeInstance, otherAccount, assetContract } =
					await loadFixture(deployDome);

				const swapAmount = ethers.utils.parseEther("5");
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

				const previewDeposit =
					await domeInstance.previewDeposit(assetsReceived);

				await expect(
					domeInstance
						.connect(otherAccount)
						.deposit(assetsReceived, otherAccount.address)
				).to.changeTokenBalance(
					domeInstance,
					otherAccount.address,
					previewDeposit
				);
			});

			it("Should update contract's total assets balance after deposit", async function () {
				const { domeInstance, otherAccount, assetContract } =
					await loadFixture(deployDome);

				const swapAmount = ethers.utils.parseEther("5");
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

				await expect(
					domeInstance
						.connect(otherAccount)
						.deposit(assetsReceived, otherAccount.address)
				).to.be.fulfilled;

				expect(await domeInstance.totalAssets()).to.be.equal(assetsReceived);
			});

			it("Should send depositors yield on withdrawal, if staker withdraws more than he deposited", async function () {
				const {
					assetContract,
					domeInstance,
					otherAccount,
					depositorYieldPercent,
				} = await loadFixture(deployDome);

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

				await expect(
					domeInstance
						.connect(otherAccount)
						.deposit(assetsReceived, otherAccount.address)
				).to.be.fulfilled;

				const ONE_DAY = 60 * 60 * 24;
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

				await expect(
					domeInstance
						.connect(otherAccount)
						.withdraw(maxWithdraw, otherAccount.address, otherAccount.address)
				).to.changeTokenBalance(
					assetContract,
					otherAccount,
					assetsReceived.add(depositorsYieldPortion)
				);
			});
		});

		describe("Redeems", function () {
			it("Should revert redeem if shares amount exceeds the balance", async function () {
				const { domeInstance, otherAccount, assetContract } =
					await loadFixture(deployDome);

				const swapAmount = ethers.utils.parseEther("5");
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

				const previewDeposit =
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
						.redeem(previewDeposit.add(1), receiver, owner)
				).to.be.revertedWith("ERC20: burn amount exceeds balance");
			});

			it("Should allow max redemption of asset", async function () {
				const { domeInstance, otherAccount, assetContract } =
					await loadFixture(deployDome);

				const swapAmount = ethers.utils.parseEther("5");
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

				await expect(
					domeInstance
						.connect(otherAccount)
						.deposit(assetsReceived, otherAccount.address)
				).to.be.fulfilled;

				const maxRedeem = await domeInstance.maxRedeem(otherAccount.address);

				const receiver = otherAccount.address;
				const owner = otherAccount.address;
				await expect(
					domeInstance.connect(otherAccount).redeem(maxRedeem, receiver, owner)
				).to.be.fulfilled;
			});

			it("Should update receiver's asset balance after redeem", async function () {
				const { domeInstance, otherAccount, assetContract } =
					await loadFixture(deployDome);

				const swapAmount = ethers.utils.parseEther("5");
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

				await expect(
					domeInstance
						.connect(otherAccount)
						.deposit(assetsReceived, otherAccount.address)
				).to.be.fulfilled;

				const shareOwner = otherAccount;
				const maxRedeem = await domeInstance.maxRedeem(otherAccount.address);

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

				await expect(
					domeInstance
						.connect(otherAccount)
						.deposit(assetsReceived, otherAccount.address)
				).to.be.fulfilled;

				const shareOwner = otherAccount;
				const maxRedeem = await domeInstance.maxRedeem(otherAccount.address);

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

				await expect(
					domeInstance
						.connect(otherAccount)
						.deposit(assetsReceived, otherAccount.address)
				).to.be.fulfilled;

				const shareOwner = otherAccount;

				const [maxRedeem, yieldProtocolContract] = await Promise.all([
					domeInstance.maxRedeem(otherAccount.address),
					ethers.getContractAt("IERC20", yieldProtocol),
				]);

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

				await expect(
					domeInstance
						.connect(otherAccount)
						.deposit(assetsReceived, otherAccount.address)
				).to.be.fulfilled;

				const shareOwner = otherAccount;
				const maxRedeem = await domeInstance.maxRedeem(otherAccount.address);

				// Contract checks sender's asset balance, thats why we connect the signer
				const [expectedAssets, initialTotalAssets] = await Promise.all([
					domeInstance.connect(shareOwner).callStatic.previewRedeem(maxRedeem),
					domeInstance.totalAssets(),
				]);

				const receiver = otherAccount.address;

				await expect(
					domeInstance
						.connect(otherAccount)
						.redeem(maxRedeem, receiver, shareOwner.address)
				).to.be.fulfilled;

				expect(await domeInstance.totalAssets()).to.be.equal(
					initialTotalAssets.sub(expectedAssets)
				);
			});

			it("Should send depositors yield on withdrawal, if staker redeems more than he deposited", async function () {
				const {
					assetContract,
					domeInstance,
					otherAccount,
					depositorYieldPercent,
				} = await loadFixture(deployDome);

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

				const maxWithdraw = await domeInstance
					.connect(otherAccount)
					.callStatic.maxRedeem(otherAccount.address);

				await expect(
					domeInstance
						.connect(otherAccount)
						.redeem(maxWithdraw, otherAccount.address, otherAccount.address)
				).to.changeTokenBalance(
					assetContract,
					otherAccount,
					assetsReceived.add(depositorsYieldPortion)
				);
			});
		});
	});

	describe("Events", function () {
		it("Should emit a Deposit event on deposit", async function () {
			const { domeInstance, otherAccount, assetContract } =
				await loadFixture(deployDome);

			const swapAmount = ethers.utils.parseEther("5");
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

			const previewDeposit = await domeInstance.previewDeposit(assetsReceived);

			const sender = otherAccount.address;
			const receiver = otherAccount.address;
			const assets = assetsReceived;
			const shares = previewDeposit;

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

			const assetToShares = await domeInstance.convertToShares(assetsReceived);

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

			const previewDeposit = await domeInstance.previewDeposit(assetsReceived);

			await expect(
				domeInstance
					.connect(otherAccount)
					.deposit(assetsReceived, otherAccount.address)
			).to.be.fulfilled;

			const maxWithdraw = await domeInstance.maxWithdraw(otherAccount.address);

			const sender = otherAccount.address;
			const owner = otherAccount.address;
			const receiver = otherAccount.address;
			const assets = maxWithdraw;
			const shares = previewDeposit;

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
				domeInstance.connect(otherAccount).redeem(maxRedeem, receiver, owner)
			)
				.to.emit(domeInstance, "Withdraw")
				.withArgs(sender, receiver, owner, assets, shares);
		});
	});
});
