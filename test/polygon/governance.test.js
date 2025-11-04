const { expect } = require("chai");
const { ethers } = require("hardhat");
const {
	POLYGON: { MAINNET },
} = require("../constants");
const {
	loadFixture,
	time,
	mine,
} = require("@nomicfoundation/hardhat-network-helpers");
const { approve, swap, convertDurationToBlocks } = require("../utils");
const { deployMockEnvironment } = require("../helpers/deploy");

async function proposeAndGetId(
	governanceContract,
	signer,
	wallet,
	amount,
	title,
	description
) {
	const proposalId = await governanceContract
		.connect(signer)
		.callStatic.propose(wallet, amount, title, description);

	await expect(
		governanceContract
			.connect(signer)
			.propose(wallet, amount, title, description)
	).to.emit(governanceContract, "ProposalCreated");

	return proposalId;
}

describe("Governance", function () {
	async function deployDome() {
		const { owner, others, contracts, params } = await deployMockEnvironment();
		const [
			domeCreator,
			otherAccount,
			anotherAccount,
			randomAccount,
			beneficiaryAccount,
		] = others;

		const {
			domeProtocol,
			domeFactory,
			governanceFactory,
			wrappedVotingFactory,
		} = contracts;
		const { domeCreationFee, systemOwnerPercentage } = params;
		const systemOwner = owner;

		const bufferAddress = await domeProtocol.callStatic.BUFFER();
		const bufferContract = await ethers.getContractAt("Buffer", bufferAddress);

		const domeInfo = {
			CID: "<DOME_CID>",
			tokenName: "<DOME_TOKEN_NAME>",
			tokenSymbol: "<DOME_TOKEN_SYMBOL>",
		};

		const randomBeneficiary = {
			beneficiaryCID: "beneficiary",
			wallet: beneficiaryAccount.address,
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
			.connect(domeCreator)
			.callStatic.createDome(
				domeInfo,
				beneficiariesInfo,
				governanceSettings,
				depositorYieldPercent,
				yieldProtocol,
				{ value: domeCreationFee }
			);

		await domeProtocol
			.connect(domeCreator)
			.createDome(
				domeInfo,
				beneficiariesInfo,
				governanceSettings,
				depositorYieldPercent,
				yieldProtocol,
				{ value: domeCreationFee }
			);

		const domeInstance = await ethers.getContractAt("Dome", domeAddress);

		const assetAddress = await domeInstance.asset();
		const assetContract = await ethers.getContractAt("IERC20", assetAddress);

		const bufferSeedSwapAmount = ethers.utils.parseEther("100");
		const seededAssets = await swap(
			domeCreator,
			MAINNET.ADDRESSES.WMATIC,
			assetContract.address,
			bufferSeedSwapAmount
		);

		await approve(
			domeCreator,
			assetContract.address,
			domeInstance.address,
			seededAssets
		);

		await domeInstance
			.connect(domeCreator)
			.donate(assetContract.address, seededAssets);

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
			EXECUTED: 5,
			PRESUCCEEDED: 6,
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
			systemOwner,
			otherAccount,
			anotherAccount,
			domeInstance,
			depositorYieldPercent,
			beneficiaryAccount,
			yieldProtocol,
			beneficiariesInfo,
			domeInfo,
			governanceSettings,
		};
	}

	describe("Validations", function () {
		it("Should revert to create proposal if creation threshold isn't passed", async function () {
			const {
				assetContract,
				domeInstance,
				otherAccount,
				anotherAccount,
				bufferContract,
				governanceContract,
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

			const walletAddress = anotherAccount.address;
			const domeReserve = await bufferContract.callStatic.domeReserves(
				domeInstance.address
			);

			const transferAmount = domeReserve;

			const title = "Proposal#1";
			const description = "Proposal#1 Transfer funds to XXXX";

			await expect(
				governanceContract
					.connect(anotherAccount)
					.propose(walletAddress, transferAmount, title, description)
			).to.be.revertedWith("Governor: proposer votes below proposal threshold");
		});

		it("Should allow stakeholder to deposit shares to the voting contract to get voting tokens with ratio 1:1", async function () {
			const { assetContract, domeInstance, anotherAccount, votingContract } =
				await loadFixture(deployDome);

			const swapAmount = ethers.utils.parseEther("50");
			const assetsReceived = await swap(
				anotherAccount,
				MAINNET.ADDRESSES.WMATIC,
				assetContract.address,
				swapAmount
			);

			await approve(
				anotherAccount,
				assetContract.address,
				domeInstance.address,
				assetsReceived
			);

			await expect(
				domeInstance
					.connect(anotherAccount)
					.deposit(assetsReceived, anotherAccount.address)
			).to.be.fulfilled;

			const ONE_DAY = 60 * 60 * 24;
			await time.increase(ONE_DAY * 60);

			await domeInstance.connect(anotherAccount).claimYieldAndDistribute();

			expect(await votingContract.getVotes(anotherAccount.address)).to.be.eq(0);

			const sharesAmount = await domeInstance.callStatic.balanceOf(
				anotherAccount.address
			);

			await approve(
				anotherAccount,
				domeInstance.address,
				votingContract.address,
				sharesAmount
			);

			await expect(
				votingContract
					.connect(anotherAccount)
					.depositFor(anotherAccount.address, sharesAmount)
			).to.changeTokenBalance(
				domeInstance,
				anotherAccount.address,
				sharesAmount.mul(-1)
			);

			expect(
				await votingContract.callStatic.balanceOf(anotherAccount.address)
			).to.be.equal(sharesAmount);
		});

		it("Should allow stakeholder to delegate it's voting tokens", async function () {
			const { assetContract, domeInstance, anotherAccount, votingContract } =
				await loadFixture(deployDome);

			const swapAmount = ethers.utils.parseEther("50");
			const assetsReceived = await swap(
				anotherAccount,
				MAINNET.ADDRESSES.WMATIC,
				assetContract.address,
				swapAmount
			);

			await approve(
				anotherAccount,
				assetContract.address,
				domeInstance.address,
				assetsReceived
			);

			await expect(
				domeInstance
					.connect(anotherAccount)
					.deposit(assetsReceived, anotherAccount.address)
			).to.be.fulfilled;

			const ONE_DAY = 60 * 60 * 24;
			await time.increase(ONE_DAY * 60);

			await domeInstance.connect(anotherAccount).claimYieldAndDistribute();

			expect(await votingContract.getVotes(anotherAccount.address)).to.be.eq(0);

			const sharesAmount = await domeInstance.callStatic.balanceOf(
				anotherAccount.address
			);

			await approve(
				anotherAccount,
				domeInstance.address,
				votingContract.address,
				sharesAmount
			);

			await expect(
				votingContract
					.connect(anotherAccount)
					.depositFor(anotherAccount.address, sharesAmount)
			).to.changeTokenBalance(
				domeInstance,
				anotherAccount.address,
				sharesAmount.mul(-1)
			);

			expect(
				await votingContract.callStatic.balanceOf(anotherAccount.address)
			).to.be.equal(sharesAmount);

			await expect(
				votingContract.connect(anotherAccount).delegate(anotherAccount.address)
			).to.be.fulfilled;

			expect(await votingContract.getVotes(anotherAccount.address)).to.be.eq(
				sharesAmount
			);
		});

		it("Should allow to create proposal if threshold was passed", async function () {
			const {
				assetContract,
				domeInstance,
				otherAccount,
				votingContract,
				anotherAccount,
				bufferContract,
				governanceContract,
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

			await domeInstance.connect(otherAccount).claimYieldAndDistribute();

			const walletAddress = anotherAccount.address;
			const domeReserve = await bufferContract.callStatic.domeReserves(
				domeInstance.address
			);

			const transferAmount = domeReserve;

			const title = "Proposal#1";
			const description = "Proposal#1 Transfer funds to XXXX";

			const sharesAmount = await domeInstance.callStatic.balanceOf(
				otherAccount.address
			);
			await approve(
				otherAccount,
				domeInstance.address,
				votingContract.address,
				sharesAmount
			);

			await expect(
				votingContract
					.connect(otherAccount)
					.depositFor(otherAccount.address, sharesAmount)
			).to.changeTokenBalance(
				domeInstance,
				otherAccount.address,
				sharesAmount.mul(-1)
			);

			await expect(
				votingContract.connect(otherAccount).delegate(otherAccount.address)
			).to.be.fulfilled;

			await expect(
				governanceContract
					.connect(otherAccount)
					.propose(walletAddress, transferAmount, title, description)
			).to.be.fulfilled;
		});

		it("Should revert to cancel proposal if caller is not the proposal creator", async function () {
			const {
				assetContract,
				domeInstance,
				otherAccount,
				anotherAccount,
				bufferContract,
				governanceContract,
				votingContract,
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

			await domeInstance.connect(otherAccount).claimYieldAndDistribute();

			const walletAddress = anotherAccount.address;
			const domeReserve = await bufferContract.callStatic.domeReserves(
				domeInstance.address
			);

			const transferAmount = domeReserve;

			const title = "Proposal#1";
			const description = "Proposal#1 Transfer funds to XXXX";

			const sharesAmount = await domeInstance.callStatic.balanceOf(
				otherAccount.address
			);
			await approve(
				otherAccount,
				domeInstance.address,
				votingContract.address,
				sharesAmount
			);

			await expect(
				votingContract
					.connect(otherAccount)
					.depositFor(otherAccount.address, sharesAmount)
			).to.changeTokenBalance(
				domeInstance,
				otherAccount.address,
				sharesAmount.mul(-1)
			);

			await expect(
				votingContract.connect(otherAccount).delegate(otherAccount.address)
			).to.be.fulfilled;

			// Need to mine one block, to callStatic won't fail due to pastVotingBalance
			await mine(1);
			const proposalId = await governanceContract
				.connect(otherAccount)
				.callStatic.propose(walletAddress, transferAmount, title, description);

			await expect(
				governanceContract
					.connect(otherAccount)
					.propose(walletAddress, transferAmount, title, description)
			).to.be.fulfilled;

			await expect(
				governanceContract.connect(anotherAccount).cancel(proposalId)
			).to.be.revertedWith("Governor: only proposer can cancel");
		});

		it("Should allow to cancel proposal if caller is the proposal creator", async function () {
			const {
				assetContract,
				domeInstance,
				otherAccount,
				anotherAccount,
				bufferContract,
				governanceContract,
				votingContract,
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

			await domeInstance.connect(otherAccount).claimYieldAndDistribute();

			const walletAddress = anotherAccount.address;
			const domeReserve = await bufferContract.callStatic.domeReserves(
				domeInstance.address
			);

			const transferAmount = domeReserve;

			const title = "Proposal#1";
			const description = "Proposal#1 Transfer funds to XXXX";

			const sharesAmount = await domeInstance.callStatic.balanceOf(
				otherAccount.address
			);
			await approve(
				otherAccount,
				domeInstance.address,
				votingContract.address,
				sharesAmount
			);

			await expect(
				votingContract
					.connect(otherAccount)
					.depositFor(otherAccount.address, sharesAmount)
			).to.changeTokenBalance(
				domeInstance,
				otherAccount.address,
				sharesAmount.mul(-1)
			);

			await expect(
				votingContract.connect(otherAccount).delegate(otherAccount.address)
			).to.be.fulfilled;

			// Need to mine one block, to callStatic won't fail due to pastVotingBalance
			await mine(1);
			const proposalId = await governanceContract
				.connect(otherAccount)
				.callStatic.propose(walletAddress, transferAmount, title, description);

			await expect(
				governanceContract
					.connect(otherAccount)
					.propose(walletAddress, transferAmount, title, description)
			).to.be.fulfilled;

			await expect(governanceContract.connect(otherAccount).cancel(proposalId))
				.to.be.fulfilled;
		});

		it("Should revert the creator to cancel proposal if the proposal is expired", async function () {
			const {
				assetContract,
				domeInstance,
				otherAccount,
				anotherAccount,
				bufferContract,
				governanceContract,
				PROPOSAL_STATE,
				governanceSettings,
				votingContract,
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

			await domeInstance.connect(otherAccount).claimYieldAndDistribute();

			const walletAddress = anotherAccount.address;
			const domeReserve = await bufferContract.callStatic.domeReserves(
				domeInstance.address
			);

			const transferAmount = domeReserve;

			const title = "Proposal#1";
			const description = "Proposal#1 Transfer funds to XXXX";

			const sharesAmount = await domeInstance.callStatic.balanceOf(
				otherAccount.address
			);
			await approve(
				otherAccount,
				domeInstance.address,
				votingContract.address,
				sharesAmount
			);

			await expect(
				votingContract
					.connect(otherAccount)
					.depositFor(otherAccount.address, sharesAmount)
			).to.changeTokenBalance(
				domeInstance,
				otherAccount.address,
				sharesAmount.mul(-1)
			);

			await expect(
				votingContract.connect(otherAccount).delegate(otherAccount.address)
			).to.be.fulfilled;

			// Need to mine one block, to callStatic won't fail due to pastVotingBalance
			await mine(1);
			const proposalId = await governanceContract
				.connect(otherAccount)
				.callStatic.propose(walletAddress, transferAmount, title, description);

			await expect(
				governanceContract
					.connect(otherAccount)
					.propose(walletAddress, transferAmount, title, description)
			).to.be.fulfilled;

			expect(await governanceContract.callStatic.state(proposalId)).to.be.equal(
				PROPOSAL_STATE.PENDING
			);

			await mine(
				governanceSettings.votingDelay + governanceSettings.votingPeriod + 1
			);

			expect(await governanceContract.callStatic.state(proposalId)).to.be.equal(
				PROPOSAL_STATE.DEFEATED
			);

			await expect(
				governanceContract.connect(otherAccount).cancel(proposalId)
			).to.be.revertedWith("Governor: proposal not active");

			expect(await governanceContract.callStatic.state(proposalId)).to.be.equal(
				PROPOSAL_STATE.DEFEATED
			);
		});

		it("Should allow the creator to cancel proposal if the proposal is not expired", async function () {
			const {
				assetContract,
				domeInstance,
				otherAccount,
				anotherAccount,
				bufferContract,
				governanceContract,
				PROPOSAL_STATE,
				votingContract,
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

			await domeInstance.connect(otherAccount).claimYieldAndDistribute();

			const walletAddress = anotherAccount.address;
			const domeReserve = await bufferContract.callStatic.domeReserves(
				domeInstance.address
			);

			const transferAmount = domeReserve;

			const title = "Proposal#1";
			const description = "Proposal#1 Transfer funds to XXXX";

			const sharesAmount = await domeInstance.callStatic.balanceOf(
				otherAccount.address
			);
			await approve(
				otherAccount,
				domeInstance.address,
				votingContract.address,
				sharesAmount
			);

			await expect(
				votingContract
					.connect(otherAccount)
					.depositFor(otherAccount.address, sharesAmount)
			).to.changeTokenBalance(
				domeInstance,
				otherAccount.address,
				sharesAmount.mul(-1)
			);

			await expect(
				votingContract.connect(otherAccount).delegate(otherAccount.address)
			).to.be.fulfilled;

			// Need to mine one block, to callStatic won't fail due to pastVotingBalance
			await mine(1);
			const proposalId = await governanceContract
				.connect(otherAccount)
				.callStatic.propose(walletAddress, transferAmount, title, description);

			await expect(
				governanceContract
					.connect(otherAccount)
					.propose(walletAddress, transferAmount, title, description)
			).to.be.fulfilled;

			expect(await governanceContract.callStatic.state(proposalId)).to.be.equal(
				PROPOSAL_STATE.PENDING
			);

			await expect(governanceContract.connect(otherAccount).cancel(proposalId))
				.to.be.fulfilled;

			expect(await governanceContract.callStatic.state(proposalId)).to.be.equal(
				PROPOSAL_STATE.CANCELED
			);
		});

		it("Should allow stakeholder to burn voting delegates and withdraw deposited shares with ratio 1:1", async function () {
			const { assetContract, domeInstance, anotherAccount, votingContract } =
				await loadFixture(deployDome);

			const swapAmount = ethers.utils.parseEther("50");
			const assetsReceived = await swap(
				anotherAccount,
				MAINNET.ADDRESSES.WMATIC,
				assetContract.address,
				swapAmount
			);

			await approve(
				anotherAccount,
				assetContract.address,
				domeInstance.address,
				assetsReceived
			);

			await expect(
				domeInstance
					.connect(anotherAccount)
					.deposit(assetsReceived, anotherAccount.address)
			).to.be.fulfilled;

			const ONE_DAY = 60 * 60 * 24;
			await time.increase(ONE_DAY * 60);

			await domeInstance.connect(anotherAccount).claimYieldAndDistribute();

			expect(await votingContract.getVotes(anotherAccount.address)).to.be.eq(0);

			const sharesAmount = await domeInstance.balanceOf(anotherAccount.address);

			await approve(
				anotherAccount,
				domeInstance.address,
				votingContract.address,
				sharesAmount
			);

			await expect(
				votingContract
					.connect(anotherAccount)
					.depositFor(anotherAccount.address, sharesAmount)
			).to.changeTokenBalance(
				domeInstance,
				anotherAccount.address,
				sharesAmount.mul(-1)
			);

			await expect(
				votingContract.connect(anotherAccount).delegate(anotherAccount.address)
			).to.be.fulfilled;

			expect(await votingContract.getVotes(anotherAccount.address)).to.be.eq(
				sharesAmount
			);

			await expect(
				votingContract
					.connect(anotherAccount)
					.withdrawTo(anotherAccount.address, sharesAmount)
			).to.changeTokenBalance(
				domeInstance,
				anotherAccount.address,
				sharesAmount
			);

			expect(await votingContract.getVotes(anotherAccount.address)).to.be.eq(0);
		});

		it("Should revert stakeholder to vote for pending proposal", async function () {
			const {
				assetContract,
				domeInstance,
				otherAccount,
				bufferContract,
				governanceContract,
				PROPOSAL_STATE,
				anotherAccount,
				votingContract,
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

			await domeInstance.connect(otherAccount).claimYieldAndDistribute();

			expect(await votingContract.getVotes(otherAccount.address)).to.be.eq(0);

			const sharesAmount = await domeInstance.balanceOf(otherAccount.address);

			await approve(
				otherAccount,
				domeInstance.address,
				votingContract.address,
				sharesAmount
			);

			const anotherAccountDepositAmount = sharesAmount.div(10);
			const otherAccountDepositAmount = sharesAmount.sub(
				anotherAccountDepositAmount
			);

			await expect(
				votingContract
					.connect(otherAccount)
					.depositFor(otherAccount.address, otherAccountDepositAmount)
			).to.changeTokenBalance(
				domeInstance,
				otherAccount.address,
				otherAccountDepositAmount.mul(-1)
			);

			await expect(
				votingContract
					.connect(otherAccount)
					.depositFor(anotherAccount.address, anotherAccountDepositAmount)
			).to.changeTokenBalance(
				domeInstance,
				otherAccount.address,
				anotherAccountDepositAmount.mul(-1)
			);

			await expect(
				votingContract.connect(otherAccount).delegate(otherAccount.address)
			).to.be.fulfilled;

			await expect(
				votingContract.connect(anotherAccount).delegate(anotherAccount.address)
			).to.be.fulfilled;

			expect(await votingContract.getVotes(otherAccount.address)).to.be.eq(
				otherAccountDepositAmount
			);

			expect(await votingContract.getVotes(anotherAccount.address)).to.be.eq(
				anotherAccountDepositAmount
			);

			const walletAddress = ethers.Wallet.createRandom().address;
			const domeReserve = await bufferContract.callStatic.domeReserves(
				domeInstance.address
			);

			const transferAmount = domeReserve;

			const title = "Proposal#1";
			const description = "Proposal#1 Transfer funds to XXXX";

			// Need to mine one block, to callStatic won't fail due to pastVotingBalance
			await mine(1);
			const proposalId = await governanceContract
				.connect(otherAccount)
				.callStatic.propose(walletAddress, transferAmount, title, description);

			await expect(
				governanceContract
					.connect(otherAccount)
					.propose(walletAddress, transferAmount, title, description)
			).to.be.fulfilled;

			expect(await governanceContract.callStatic.state(proposalId)).to.be.equal(
				PROPOSAL_STATE.PENDING
			);

			await expect(
				governanceContract.connect(anotherAccount).castVote(proposalId)
			).to.be.revertedWith("Governor: vote not currently active");
		});

		it("Should revert stakeholder to vote for expired proposal", async function () {
			const {
				assetContract,
				domeInstance,
				otherAccount,
				bufferContract,
				governanceContract,
				PROPOSAL_STATE,
				anotherAccount,
				votingContract,
				governanceSettings,
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

			await domeInstance.connect(otherAccount).claimYieldAndDistribute();

			expect(await votingContract.getVotes(otherAccount.address)).to.be.eq(0);

			const sharesAmount = await domeInstance.balanceOf(otherAccount.address);

			await approve(
				otherAccount,
				domeInstance.address,
				votingContract.address,
				sharesAmount
			);

			const anotherAccountDepositAmount = sharesAmount.div(10);
			const otherAccountDepositAmount = sharesAmount.sub(
				anotherAccountDepositAmount
			);

			await expect(
				votingContract
					.connect(otherAccount)
					.depositFor(otherAccount.address, otherAccountDepositAmount)
			).to.changeTokenBalance(
				domeInstance,
				otherAccount.address,
				otherAccountDepositAmount.mul(-1)
			);

			await expect(
				votingContract
					.connect(otherAccount)
					.depositFor(anotherAccount.address, anotherAccountDepositAmount)
			).to.changeTokenBalance(
				domeInstance,
				otherAccount.address,
				anotherAccountDepositAmount.mul(-1)
			);

			await expect(
				votingContract.connect(otherAccount).delegate(otherAccount.address)
			).to.be.fulfilled;

			await expect(
				votingContract.connect(anotherAccount).delegate(anotherAccount.address)
			).to.be.fulfilled;

			expect(await votingContract.getVotes(otherAccount.address)).to.be.eq(
				otherAccountDepositAmount
			);

			expect(await votingContract.getVotes(anotherAccount.address)).to.be.eq(
				anotherAccountDepositAmount
			);

			const walletAddress = ethers.Wallet.createRandom().address;
			const domeReserve = await bufferContract.callStatic.domeReserves(
				domeInstance.address
			);

			const transferAmount = domeReserve;

			const title = "Proposal#1";
			const description = "Proposal#1 Transfer funds to XXXX";

			// Need to mine one block, to callStatic won't fail due to pastVotingBalance
			await mine(1);
			const proposalId = await governanceContract
				.connect(otherAccount)
				.callStatic.propose(walletAddress, transferAmount, title, description);

			await expect(
				governanceContract
					.connect(otherAccount)
					.propose(walletAddress, transferAmount, title, description)
			).to.be.fulfilled;

			expect(await governanceContract.callStatic.state(proposalId)).to.be.equal(
				PROPOSAL_STATE.PENDING
			);

			await mine(
				governanceSettings.votingDelay + governanceSettings.votingPeriod + 1
			);

			expect(await governanceContract.callStatic.state(proposalId)).to.be.equal(
				PROPOSAL_STATE.DEFEATED
			);

			await expect(
				governanceContract.connect(anotherAccount).castVote(proposalId)
			).to.be.revertedWith("Governor: vote not currently active");
		});

		it("Should allow stakeholder to vote for active proposal", async function () {
			const {
				assetContract,
				domeInstance,
				otherAccount,
				bufferContract,
				governanceContract,
				PROPOSAL_STATE,
				anotherAccount,
				votingContract,
				governanceSettings,
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

			await domeInstance.connect(otherAccount).claimYieldAndDistribute();

			expect(await votingContract.getVotes(otherAccount.address)).to.be.eq(0);

			const sharesAmount = await domeInstance.balanceOf(otherAccount.address);

			await approve(
				otherAccount,
				domeInstance.address,
				votingContract.address,
				sharesAmount
			);

			const anotherAccountDepositAmount = sharesAmount.div(10);
			const otherAccountDepositAmount = sharesAmount.sub(
				anotherAccountDepositAmount
			);

			await expect(
				votingContract
					.connect(otherAccount)
					.depositFor(otherAccount.address, otherAccountDepositAmount)
			).to.changeTokenBalance(
				domeInstance,
				otherAccount.address,
				otherAccountDepositAmount.mul(-1)
			);

			await expect(
				votingContract
					.connect(otherAccount)
					.depositFor(anotherAccount.address, anotherAccountDepositAmount)
			).to.changeTokenBalance(
				domeInstance,
				otherAccount.address,
				anotherAccountDepositAmount.mul(-1)
			);

			await expect(
				votingContract.connect(otherAccount).delegate(otherAccount.address)
			).to.be.fulfilled;

			await expect(
				votingContract.connect(anotherAccount).delegate(anotherAccount.address)
			).to.be.fulfilled;

			expect(await votingContract.getVotes(otherAccount.address)).to.be.eq(
				otherAccountDepositAmount
			);

			expect(await votingContract.getVotes(anotherAccount.address)).to.be.eq(
				anotherAccountDepositAmount
			);

			const walletAddress = ethers.Wallet.createRandom().address;
			const domeReserve = await bufferContract.callStatic.domeReserves(
				domeInstance.address
			);

			const transferAmount = domeReserve;

			const title = "Proposal#1";
			const description = "Proposal#1 Transfer funds to XXXX";

			// Need to mine one block, to callStatic won't fail due to pastVotingBalance
			await mine(1);
			const proposalId = await governanceContract
				.connect(otherAccount)
				.callStatic.propose(walletAddress, transferAmount, title, description);

			await expect(
				governanceContract
					.connect(otherAccount)
					.propose(walletAddress, transferAmount, title, description)
			).to.be.fulfilled;

			expect(await governanceContract.callStatic.state(proposalId)).to.be.equal(
				PROPOSAL_STATE.PENDING
			);

			await mine(governanceSettings.votingDelay + 1);
			expect(await governanceContract.callStatic.state(proposalId)).to.be.equal(
				PROPOSAL_STATE.ACTIVE
			);

			await expect(
				governanceContract.connect(anotherAccount).castVote(proposalId)
			).to.be.fulfilled;
		});

		it("Should transfer funds after successful proposal", async function () {
			const {
				assetContract,
				domeInstance,
				anotherAccount,
				bufferContract,
				governanceContract,
				governanceSettings,
				PROPOSAL_STATE,
				votingContract,
			} = await loadFixture(deployDome);

			const swapAmount = ethers.utils.parseEther("50");
			const assetsReceived = await swap(
				anotherAccount,
				MAINNET.ADDRESSES.WMATIC,
				assetContract.address,
				swapAmount
			);

			await approve(
				anotherAccount,
				assetContract.address,
				domeInstance.address,
				assetsReceived
			);

			await expect(
				domeInstance
					.connect(anotherAccount)
					.deposit(assetsReceived, anotherAccount.address)
			).to.be.fulfilled;

			const ONE_DAY = 60 * 60 * 24;
			await time.increase(ONE_DAY * 60);

			await domeInstance.connect(anotherAccount).claimYieldAndDistribute();

			expect(await votingContract.getVotes(anotherAccount.address)).to.be.eq(0);

			const sharesAmount = await domeInstance.balanceOf(anotherAccount.address);

			await approve(
				anotherAccount,
				domeInstance.address,
				votingContract.address,
				sharesAmount
			);

			await expect(
				votingContract
					.connect(anotherAccount)
					.depositFor(anotherAccount.address, sharesAmount)
			).to.changeTokenBalance(
				domeInstance,
				anotherAccount.address,
				sharesAmount.mul(-1)
			);

			await expect(
				votingContract.connect(anotherAccount).delegate(anotherAccount.address)
			).to.be.fulfilled;

			expect(await votingContract.getVotes(anotherAccount.address)).to.be.eq(
				sharesAmount
			);

			const walletAddress = ethers.Wallet.createRandom().address;
			const domeReserve = await bufferContract.callStatic.domeReserves(
				domeInstance.address
			);

			const transferAmount = domeReserve;

			const title = "Proposal#1";
			const description = "Proposal#1 Transfer funds to XXXX";

			// Need to mine one block, to callStatic won't fail due to pastVotingBalance
			await mine(1);
			const proposalId = await governanceContract
				.connect(anotherAccount)
				.callStatic.propose(walletAddress, transferAmount, title, description);

			await expect(
				governanceContract
					.connect(anotherAccount)
					.propose(walletAddress, transferAmount, title, description)
			).to.be.fulfilled;

			await mine(governanceSettings.votingDelay + 1);

			await expect(
				governanceContract.connect(anotherAccount).castVote(proposalId)
			).to.be.fulfilled;

			await mine(governanceSettings.votingPeriod + 1);

			expect(await governanceContract.callStatic.state(proposalId)).to.be.equal(
				PROPOSAL_STATE.SUCCEEDED
			);

			await expect(
				governanceContract.connect(anotherAccount).execute(proposalId)
			).to.changeTokenBalance(assetContract, walletAddress, transferAmount);

			expect(await governanceContract.callStatic.state(proposalId)).to.be.equal(
				PROPOSAL_STATE.EXECUTED
			);
		});

		it("Should execute only proposal with highest votes", async function () {
			const {
				assetContract,
				domeInstance,
				anotherAccount,
				bufferContract,
				governanceContract,
				otherAccount,
				PROPOSAL_STATE,
				randomAccount,
				votingContract,
				governanceSettings,
			} = await loadFixture(deployDome);

			const swapAmount1 = ethers.utils.parseEther("50");
			const swapAmount2 = ethers.utils.parseEther("100");
			const [assetsReceived1, assetsReceived2] = await Promise.all([
				swap(
					anotherAccount,
					MAINNET.ADDRESSES.WMATIC,
					assetContract.address,
					swapAmount1
				),
				swap(
					randomAccount,
					MAINNET.ADDRESSES.WMATIC,
					assetContract.address,
					swapAmount2
				),
			]);

			await Promise.all([
				approve(
					anotherAccount,
					assetContract.address,
					domeInstance.address,
					assetsReceived1
				),
				approve(
					randomAccount,
					assetContract.address,
					domeInstance.address,
					assetsReceived2
				),
			]);

			await expect(
				domeInstance
					.connect(anotherAccount)
					.deposit(assetsReceived1, anotherAccount.address)
			).to.be.fulfilled;

			await expect(
				domeInstance
					.connect(randomAccount)
					.deposit(assetsReceived2, randomAccount.address)
			).to.be.fulfilled;

			const ONE_DAY = 60 * 60 * 24;
			await time.increase(ONE_DAY * 60);

			await domeInstance.connect(anotherAccount).claimYieldAndDistribute();

			expect(await votingContract.getVotes(anotherAccount.address)).to.be.eq(0);

			expect(await votingContract.getVotes(randomAccount.address)).to.be.eq(0);

			const [sharesAmount1, sharesAmount2] = await Promise.all([
				domeInstance.balanceOf(anotherAccount.address),
				domeInstance.balanceOf(randomAccount.address),
			]);

			await Promise.all([
				approve(
					anotherAccount,
					domeInstance.address,
					votingContract.address,
					sharesAmount1
				),
				approve(
					randomAccount,
					domeInstance.address,
					votingContract.address,
					sharesAmount2
				),
			]);

			await expect(
				votingContract
					.connect(anotherAccount)
					.depositFor(anotherAccount.address, sharesAmount1)
			).to.changeTokenBalance(
				domeInstance,
				anotherAccount.address,
				sharesAmount1.mul(-1)
			);

			await expect(
				votingContract
					.connect(randomAccount)
					.depositFor(randomAccount.address, sharesAmount2)
			).to.changeTokenBalance(
				domeInstance,
				randomAccount.address,
				sharesAmount2.mul(-1)
			);

			await expect(
				votingContract.connect(anotherAccount).delegate(anotherAccount.address)
			).to.be.fulfilled;

			await expect(
				votingContract.connect(randomAccount).delegate(randomAccount.address)
			).to.be.fulfilled;

			expect(sharesAmount2).to.be.gt(sharesAmount1);

			expect(await votingContract.getVotes(anotherAccount.address)).to.be.eq(
				sharesAmount1
			);

			expect(await votingContract.getVotes(randomAccount.address)).to.be.eq(
				sharesAmount2
			);

			const walletAddress = ethers.Wallet.createRandom().address;
			const domeReserve = await bufferContract.callStatic.domeReserves(
				domeInstance.address
			);

			const transferAmount = domeReserve;

			const firstTitle = "Proposal#1";
			const firstDescription = "Proposal#1 Transfer funds to XXXX";

			const secondTitle = "Proposal#2";
			const secondDescription = "Proposal#2 Transfer funds to XXXX";

			// Need to mine one block, to callStatic won't fail due to pastVotingBalance
			await mine(1);

			const firstProposalId = await governanceContract
				.connect(anotherAccount)
				.callStatic.propose(
					walletAddress,
					transferAmount,
					firstTitle,
					firstDescription
				);

			const secondProposalId = await governanceContract
				.connect(anotherAccount)
				.callStatic.propose(
					walletAddress,
					transferAmount,
					secondTitle,
					secondDescription
				);

			await expect(
				governanceContract
					.connect(randomAccount)
					.propose(walletAddress, transferAmount, firstTitle, firstDescription)
			).to.be.fulfilled;

			await expect(
				governanceContract
					.connect(randomAccount)
					.propose(
						walletAddress,
						transferAmount,
						secondTitle,
						secondDescription
					)
			).to.be.fulfilled;

			await mine(governanceSettings.votingDelay + 1);

			await expect(
				governanceContract.connect(anotherAccount).castVote(firstProposalId)
			).to.be.fulfilled;

			await expect(
				governanceContract.connect(randomAccount).castVote(secondProposalId)
			).to.be.fulfilled;

			await mine(governanceSettings.votingPeriod + 1);

			expect(
				await governanceContract.callStatic.state(firstProposalId)
			).to.be.equal(PROPOSAL_STATE.DEFEATED, "firstState");

			expect(
				await governanceContract.callStatic.state(secondProposalId)
			).to.be.equal(PROPOSAL_STATE.SUCCEEDED, "secondState");

			await expect(
				governanceContract.connect(otherAccount).execute(firstProposalId)
			).to.be.revertedWith("Governor: proposal not successful");

			expect(
				await governanceContract.callStatic.state(firstProposalId)
			).to.be.equal(PROPOSAL_STATE.DEFEATED);

			await expect(
				governanceContract.connect(otherAccount).execute(secondProposalId)
			).to.changeTokenBalance(assetContract, walletAddress, transferAmount);

			expect(
				await governanceContract.callStatic.state(secondProposalId)
			).to.be.equal(PROPOSAL_STATE.EXECUTED);
		});

		it("Should only execute proposal with highest votes on triggerProposal", async function () {
			const {
				assetContract,
				otherAccount,
				domeInstance,
				anotherAccount,
				bufferContract,
				governanceContract,
				PROPOSAL_STATE,
				votingContract,
				randomAccount,
				governanceSettings,
			} = await loadFixture(deployDome);

			const swapAmount1 = ethers.utils.parseEther("50");
			const swapAmount2 = ethers.utils.parseEther("100");
			const [assetsReceived1, assetsReceived2] = await Promise.all([
				swap(
					anotherAccount,
					MAINNET.ADDRESSES.WMATIC,
					assetContract.address,
					swapAmount1
				),
				swap(
					randomAccount,
					MAINNET.ADDRESSES.WMATIC,
					assetContract.address,
					swapAmount2
				),
			]);

			await Promise.all([
				approve(
					anotherAccount,
					assetContract.address,
					domeInstance.address,
					assetsReceived1
				),
				approve(
					randomAccount,
					assetContract.address,
					domeInstance.address,
					assetsReceived2
				),
			]);

			await expect(
				domeInstance
					.connect(anotherAccount)
					.deposit(assetsReceived1, anotherAccount.address)
			).to.be.fulfilled;

			await expect(
				domeInstance
					.connect(randomAccount)
					.deposit(assetsReceived2, randomAccount.address)
			).to.be.fulfilled;

			const ONE_DAY = 60 * 60 * 24;
			await time.increase(ONE_DAY * 60);

			await domeInstance.connect(anotherAccount).claimYieldAndDistribute();

			expect(await votingContract.getVotes(anotherAccount.address)).to.be.eq(0);

			expect(await votingContract.getVotes(randomAccount.address)).to.be.eq(0);

			const [sharesAmount1, sharesAmount2] = await Promise.all([
				domeInstance.balanceOf(anotherAccount.address),
				domeInstance.balanceOf(randomAccount.address),
			]);

			expect(sharesAmount2).to.be.gt(sharesAmount1);

			await Promise.all([
				approve(
					anotherAccount,
					domeInstance.address,
					votingContract.address,
					sharesAmount1
				),
				approve(
					randomAccount,
					domeInstance.address,
					votingContract.address,
					sharesAmount2
				),
			]);

			await expect(
				votingContract
					.connect(anotherAccount)
					.depositFor(anotherAccount.address, sharesAmount1)
			).to.changeTokenBalance(
				domeInstance,
				anotherAccount.address,
				sharesAmount1.mul(-1)
			);

			await expect(
				votingContract
					.connect(randomAccount)
					.depositFor(randomAccount.address, sharesAmount2)
			).to.changeTokenBalance(
				domeInstance,
				randomAccount.address,
				sharesAmount2.mul(-1)
			);

			await expect(
				votingContract.connect(anotherAccount).delegate(anotherAccount.address)
			).to.be.fulfilled;

			await expect(
				votingContract.connect(randomAccount).delegate(randomAccount.address)
			).to.be.fulfilled;

			expect(
				await votingContract.callStatic.getVotes(anotherAccount.address)
			).to.be.eq(sharesAmount1);

			expect(
				await votingContract.callStatic.getVotes(randomAccount.address)
			).to.be.eq(sharesAmount2);

			const walletAddress = ethers.Wallet.createRandom().address;
			const domeReserve = await bufferContract.callStatic.domeReserves(
				domeInstance.address
			);

			const transferAmount = domeReserve;

			const firstTitle = "Proposal#1";
			const firstDescription = "Proposal#1 Transfer funds to XXXX";

			const secondTitle = "Proposal#2";
			const secondDescription = "Proposal#2 Transfer funds to XXXX";

			// Need to mine one block, to callStatic won't fail due to pastVotingBalance
			await mine(1);

			const firstProposalId = await governanceContract
				.connect(anotherAccount)
				.callStatic.propose(
					walletAddress,
					transferAmount,
					firstTitle,
					firstDescription
				);

			const secondProposalId = await governanceContract
				.connect(randomAccount)
				.callStatic.propose(
					walletAddress,
					transferAmount,
					secondTitle,
					secondDescription
				);

			await expect(
				governanceContract
					.connect(anotherAccount)
					.propose(walletAddress, transferAmount, firstTitle, firstDescription)
			).to.be.fulfilled;

			await expect(
				governanceContract
					.connect(randomAccount)
					.propose(
						walletAddress,
						transferAmount,
						secondTitle,
						secondDescription
					)
			).to.be.fulfilled;

			await mine(governanceSettings.votingDelay + 1);

			await expect(
				governanceContract.connect(anotherAccount).castVote(firstProposalId)
			).to.be.fulfilled;

			await expect(
				governanceContract.connect(randomAccount).castVote(secondProposalId)
			).to.be.fulfilled;

			expect(
				await governanceContract.callStatic.state(firstProposalId)
			).to.be.equal(PROPOSAL_STATE.ACTIVE, "First proposal is not ACTIVE");

			expect(
				await governanceContract.callStatic.state(secondProposalId)
			).to.be.equal(
				PROPOSAL_STATE.PRESUCCEEDED,
				"Second proposal is not PRE_SUCCEEDED"
			);

			await expect(
				governanceContract.connect(otherAccount).execute(firstProposalId)
			).to.revertedWith("Governor: proposal not successful");

			expect(
				await governanceContract.callStatic.state(secondProposalId)
			).to.be.equal(PROPOSAL_STATE.PRESUCCEEDED);

			expect(
				await governanceContract.callStatic.state(firstProposalId)
			).to.be.equal(PROPOSAL_STATE.ACTIVE);

			await expect(
				governanceContract.connect(randomAccount).triggerProposal()
			).to.changeTokenBalance(assetContract, walletAddress, transferAmount);

			await expect(
				governanceContract.connect(otherAccount).execute(secondProposalId)
			).to.be.rejected;

			expect(
				await governanceContract.callStatic.state(firstProposalId)
			).to.be.equal(PROPOSAL_STATE.ACTIVE);

			expect(
				await governanceContract.callStatic.state(secondProposalId)
			).to.be.equal(PROPOSAL_STATE.EXECUTED);
		});

		it("Should execute both proposals one by one if both are successful", async function () {
			const {
				assetContract,
				domeInstance,
				anotherAccount,
				bufferContract,
				governanceContract,
				PROPOSAL_STATE,
				votingContract,
				governanceSettings,
			} = await loadFixture(deployDome);

			const ONE_DAY = 60 * 60 * 24;

		async function provideVotingPower(voter, amount) {
			const assetsReceived = await swap(
				voter,
				MAINNET.ADDRESSES.WMATIC,
				assetContract.address,
				amount
			);

			await approve(
				voter,
				assetContract.address,
				domeInstance.address,
				assetsReceived
			);

			await expect(
				domeInstance.connect(voter).deposit(assetsReceived, voter.address)
			).to.be.fulfilled;

			await time.increase(ONE_DAY);

			await domeInstance.connect(voter).claimYieldAndDistribute();

			const sharesAmount = await domeInstance.callStatic.balanceOf(
				voter.address
			);

			await approve(
				voter,
				domeInstance.address,
				votingContract.address,
				sharesAmount
			);

			await expect(
				votingContract
					.connect(voter)
					.depositFor(voter.address, sharesAmount)
			).to.changeTokenBalance(
				domeInstance,
				voter.address,
				sharesAmount.mul(-1)
			);

			await expect(
				votingContract.connect(voter).delegate(voter.address)
			).to.be.fulfilled;
			}

			await provideVotingPower(anotherAccount, ethers.utils.parseEther("150"));

			const domeReserveBefore = await bufferContract.callStatic.domeReserves(
				domeInstance.address
			);
			const firstWallet = ethers.Wallet.createRandom().address;
			const firstTransferAmount = domeReserveBefore.div(2);

			await mine(1);
			const firstProposalId = await proposeAndGetId(
				governanceContract,
				anotherAccount,
				firstWallet,
				firstTransferAmount,
				"Sequential Proposal #1",
				"Execute first proposal sequentially"
			);

			await mine(governanceSettings.votingDelay + 1);

			await expect(
				governanceContract.connect(anotherAccount).castVote(firstProposalId)
			).to.be.fulfilled;

			await mine(governanceSettings.votingPeriod + 1);

			expect(
				await governanceContract.callStatic.state(firstProposalId)
			).to.be.equal(PROPOSAL_STATE.SUCCEEDED);

			await expect(
				governanceContract.connect(anotherAccount).execute(firstProposalId)
			).to.changeTokenBalance(
				assetContract,
				firstWallet,
				firstTransferAmount
			);

			expect(
				await governanceContract.callStatic.state(firstProposalId)
			).to.be.equal(PROPOSAL_STATE.EXECUTED);

			const domeReserveAfter = await bufferContract.callStatic.domeReserves(
				domeInstance.address
			);
			const secondWallet = ethers.Wallet.createRandom().address;
			const secondTransferAmount = domeReserveAfter.gt(0)
				? domeReserveAfter
				: firstTransferAmount;

			await mine(1);
			const secondProposalId = await proposeAndGetId(
				governanceContract,
				anotherAccount,
				secondWallet,
				secondTransferAmount,
				"Sequential Proposal #2",
				"Execute second proposal sequentially"
			);

			await mine(governanceSettings.votingDelay + 1);

			await expect(
				governanceContract.connect(anotherAccount).castVote(secondProposalId)
			).to.be.fulfilled;

			await mine(governanceSettings.votingPeriod + 1);

			expect(
				await governanceContract.callStatic.state(secondProposalId)
			).to.be.equal(PROPOSAL_STATE.SUCCEEDED);

			await expect(
				governanceContract.connect(anotherAccount).execute(secondProposalId)
			).to.changeTokenBalance(
				assetContract,
				secondWallet,
				secondTransferAmount
			);

			expect(
				await governanceContract.callStatic.state(secondProposalId)
			).to.be.equal(PROPOSAL_STATE.EXECUTED);
		});

		it("Should allow stakeholder to vote for active proposal with new votes", async function () {
			const {
				assetContract,
				domeInstance,
				otherAccount,
				bufferContract,
				governanceContract,
				PROPOSAL_STATE,
				votingContract,
				governanceSettings,
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

			await domeInstance.connect(otherAccount).claimYieldAndDistribute();

			expect(await votingContract.getVotes(otherAccount.address)).to.be.eq(0);

			const sharesAmount = await domeInstance.balanceOf(otherAccount.address);

			await approve(
				otherAccount,
				domeInstance.address,
				votingContract.address,
				sharesAmount
			);

			const otherAccountDepositAmountFirstHalf = sharesAmount.div(2);
			const otherAccountDepositAmountSecondHalf = sharesAmount.sub(
				otherAccountDepositAmountFirstHalf
			);

			await expect(
				votingContract
					.connect(otherAccount)
					.depositFor(otherAccount.address, otherAccountDepositAmountFirstHalf)
			).to.changeTokenBalance(
				domeInstance,
				otherAccount.address,
				otherAccountDepositAmountFirstHalf.mul(-1)
			);

			await expect(
				votingContract.connect(otherAccount).delegate(otherAccount.address)
			).to.be.fulfilled;

			expect(await votingContract.getVotes(otherAccount.address)).to.be.eq(
				otherAccountDepositAmountFirstHalf
			);

			const walletAddress = ethers.Wallet.createRandom().address;
			const domeReserve = await bufferContract.callStatic.domeReserves(
				domeInstance.address
			);

			const transferAmount = domeReserve;

			const title = "Proposal#1";
			const description = "Proposal#1 Transfer funds to XXXX";

			// Need to mine one block, to callStatic won't fail due to pastVotingBalance
			await mine(1);
			const proposalId = await governanceContract
				.connect(otherAccount)
				.callStatic.propose(walletAddress, transferAmount, title, description);

			await expect(
				governanceContract
					.connect(otherAccount)
					.propose(walletAddress, transferAmount, title, description)
			).to.be.fulfilled;

			expect(await governanceContract.callStatic.state(proposalId)).to.be.equal(
				PROPOSAL_STATE.PENDING
			);

			await mine(governanceSettings.votingDelay + 1);
			expect(await governanceContract.callStatic.state(proposalId)).to.be.equal(
				PROPOSAL_STATE.ACTIVE
			);

			await expect(
				governanceContract.connect(otherAccount).castVote(proposalId)
			).to.be.fulfilled;

			const proposalVotesFirstHalf =
				await governanceContract.callStatic.proposalVotes(proposalId);

			await expect(
				votingContract
					.connect(otherAccount)
					.depositFor(otherAccount.address, otherAccountDepositAmountSecondHalf)
			).to.changeTokenBalance(
				domeInstance,
				otherAccount.address,
				otherAccountDepositAmountSecondHalf.mul(-1)
			);

			await expect(
				votingContract.connect(otherAccount).delegate(otherAccount.address)
			).to.be.fulfilled;

			await expect(
				governanceContract.connect(otherAccount).castVote(proposalId)
			).to.be.fulfilled;

			const proposalVotesSecondHalf =
				await governanceContract.callStatic.proposalVotes(proposalId);

			expect(await votingContract.getVotes(otherAccount.address)).to.be.eq(
				otherAccountDepositAmountFirstHalf.add(
					otherAccountDepositAmountSecondHalf
				)
			);

			await expect(
				votingContract
					.connect(otherAccount)
					.withdrawTo(otherAccount.address, proposalVotesFirstHalf)
			).to.be.fulfilled;

			expect(
				await governanceContract.callStatic.proposalVotes(proposalId)
			).to.be.eq(proposalVotesSecondHalf.sub(proposalVotesFirstHalf));
		});

		it("Should allow stakeholder to vote for active proposal with new votes and withdraw them all", async function () {
			const {
				assetContract,
				domeInstance,
				otherAccount,
				bufferContract,
				governanceContract,
				PROPOSAL_STATE,
				votingContract,
				governanceSettings,
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

			await domeInstance.connect(otherAccount).claimYieldAndDistribute();

			expect(await votingContract.getVotes(otherAccount.address)).to.be.eq(0);

			const sharesAmount = await domeInstance.balanceOf(otherAccount.address);

			await approve(
				otherAccount,
				domeInstance.address,
				votingContract.address,
				sharesAmount
			);

			const otherAccountDepositAmountFirstHalf = sharesAmount.div(2);
			const otherAccountDepositAmountSecondHalf = sharesAmount.sub(
				otherAccountDepositAmountFirstHalf
			);

			await expect(
				votingContract
					.connect(otherAccount)
					.depositFor(otherAccount.address, otherAccountDepositAmountFirstHalf)
			).to.changeTokenBalance(
				domeInstance,
				otherAccount.address,
				otherAccountDepositAmountFirstHalf.mul(-1)
			);

			await expect(
				votingContract.connect(otherAccount).delegate(otherAccount.address)
			).to.be.fulfilled;

			expect(await votingContract.getVotes(otherAccount.address)).to.be.eq(
				otherAccountDepositAmountFirstHalf
			);

			const walletAddress = ethers.Wallet.createRandom().address;
			const domeReserve = await bufferContract.callStatic.domeReserves(
				domeInstance.address
			);

			const transferAmount = domeReserve;

			const title = "Proposal#1";
			const description = "Proposal#1 Transfer funds to XXXX";

			// Need to mine one block, to callStatic won't fail due to pastVotingBalance
			await mine(1);
			const proposalId = await governanceContract
				.connect(otherAccount)
				.callStatic.propose(walletAddress, transferAmount, title, description);

			await expect(
				governanceContract
					.connect(otherAccount)
					.propose(walletAddress, transferAmount, title, description)
			).to.be.fulfilled;

			expect(await governanceContract.callStatic.state(proposalId)).to.be.equal(
				PROPOSAL_STATE.PENDING
			);

			await mine(governanceSettings.votingDelay + 1);
			expect(await governanceContract.callStatic.state(proposalId)).to.be.equal(
				PROPOSAL_STATE.ACTIVE
			);

			await expect(
				governanceContract.connect(otherAccount).castVote(proposalId)
			).to.be.fulfilled;

			await expect(
				votingContract
					.connect(otherAccount)
					.depositFor(otherAccount.address, otherAccountDepositAmountSecondHalf)
			).to.changeTokenBalance(
				domeInstance,
				otherAccount.address,
				otherAccountDepositAmountSecondHalf.mul(-1)
			);

			await expect(
				votingContract.connect(otherAccount).delegate(otherAccount.address)
			).to.be.fulfilled;

			await expect(
				governanceContract.connect(otherAccount).castVote(proposalId)
			).to.be.fulfilled;

			const proposalVotesSecondHalf =
				await governanceContract.callStatic.proposalVotes(proposalId);

			expect(await votingContract.getVotes(otherAccount.address)).to.be.eq(
				otherAccountDepositAmountFirstHalf.add(
					otherAccountDepositAmountSecondHalf
				)
			);

			expect(await governanceContract.callStatic.state(proposalId)).to.be.equal(
				PROPOSAL_STATE.PRESUCCEEDED
			);

			await expect(
				votingContract
					.connect(otherAccount)
					.withdrawTo(otherAccount.address, proposalVotesSecondHalf)
			).to.be.fulfilled;

			expect(await governanceContract.callStatic.state(proposalId)).to.be.equal(
				PROPOSAL_STATE.ACTIVE
			);

			expect(
				await governanceContract.callStatic.proposalVotes(proposalId)
			).to.be.eq(0);
		});

		it("Should allow stakeholder to vote for active proposal with new votes and withdraw them all after trigger", async function () {
			const {
				assetContract,
				domeInstance,
				otherAccount,
				bufferContract,
				governanceContract,
				PROPOSAL_STATE,
				votingContract,
				governanceSettings,
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

			await domeInstance.connect(otherAccount).claimYieldAndDistribute();

			expect(await votingContract.getVotes(otherAccount.address)).to.be.eq(0);

			const sharesAmount = await domeInstance.balanceOf(otherAccount.address);

			await approve(
				otherAccount,
				domeInstance.address,
				votingContract.address,
				sharesAmount
			);

			const otherAccountDepositAmountFirstHalf = sharesAmount.div(2);
			const otherAccountDepositAmountSecondHalf = sharesAmount.sub(
				otherAccountDepositAmountFirstHalf
			);

			await expect(
				votingContract
					.connect(otherAccount)
					.depositFor(otherAccount.address, otherAccountDepositAmountFirstHalf)
			).to.changeTokenBalance(
				domeInstance,
				otherAccount.address,
				otherAccountDepositAmountFirstHalf.mul(-1)
			);

			await expect(
				votingContract.connect(otherAccount).delegate(otherAccount.address)
			).to.be.fulfilled;

			expect(await votingContract.getVotes(otherAccount.address)).to.be.eq(
				otherAccountDepositAmountFirstHalf
			);

			const walletAddress = ethers.Wallet.createRandom().address;
			const domeReserve = await bufferContract.callStatic.domeReserves(
				domeInstance.address
			);

			const transferAmount = domeReserve;

			const title = "Proposal#1";
			const description = "Proposal#1 Transfer funds to XXXX";

			// Need to mine one block, to callStatic won't fail due to pastVotingBalance
			await mine(1);
			const proposalId = await governanceContract
				.connect(otherAccount)
				.callStatic.propose(walletAddress, transferAmount, title, description);

			await expect(
				governanceContract
					.connect(otherAccount)
					.propose(walletAddress, transferAmount, title, description)
			).to.be.fulfilled;

			expect(await governanceContract.callStatic.state(proposalId)).to.be.equal(
				PROPOSAL_STATE.PENDING
			);

			await mine(governanceSettings.votingDelay + 1);
			expect(await governanceContract.callStatic.state(proposalId)).to.be.equal(
				PROPOSAL_STATE.ACTIVE
			);

			await expect(
				governanceContract.connect(otherAccount).castVote(proposalId)
			).to.be.fulfilled;

			await expect(
				votingContract
					.connect(otherAccount)
					.depositFor(otherAccount.address, otherAccountDepositAmountSecondHalf)
			).to.changeTokenBalance(
				domeInstance,
				otherAccount.address,
				otherAccountDepositAmountSecondHalf.mul(-1)
			);

			await expect(
				votingContract.connect(otherAccount).delegate(otherAccount.address)
			).to.be.fulfilled;

			await expect(
				governanceContract.connect(otherAccount).castVote(proposalId)
			).to.be.fulfilled;

			const proposalVotesSecondHalf =
				await governanceContract.callStatic.proposalVotes(proposalId);

			expect(await votingContract.getVotes(otherAccount.address)).to.be.eq(
				otherAccountDepositAmountFirstHalf.add(
					otherAccountDepositAmountSecondHalf
				)
			);

			expect(await governanceContract.callStatic.state(proposalId)).to.be.equal(
				PROPOSAL_STATE.PRESUCCEEDED
			);

			await expect(
				governanceContract.connect(otherAccount).triggerProposal()
			).to.changeTokenBalance(assetContract, walletAddress, transferAmount);

			await expect(
				votingContract
					.connect(otherAccount)
					.withdrawTo(otherAccount.address, proposalVotesSecondHalf)
			).to.be.fulfilled;

			expect(await governanceContract.callStatic.state(proposalId)).to.be.equal(
				PROPOSAL_STATE.EXECUTED
			);

			expect(
				await governanceContract.callStatic.proposalVotes(proposalId)
			).to.be.eq(proposalVotesSecondHalf);
		});

		it("Should allow to retrieve proposals data after proposal creation", async function () {
			const {
				assetContract,
				domeInstance,
				otherAccount,
				bufferContract,
				governanceContract,
				PROPOSAL_STATE,
				votingContract,
				governanceSettings,
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

			await domeInstance.connect(otherAccount).claimYieldAndDistribute();

			expect(await votingContract.getVotes(otherAccount.address)).to.be.eq(0);

			const sharesAmount = await domeInstance.balanceOf(otherAccount.address);

			await approve(
				otherAccount,
				domeInstance.address,
				votingContract.address,
				sharesAmount
			);

			const otherAccountDepositAmountFirstHalf = sharesAmount.div(2);
			const otherAccountDepositAmountSecondHalf = sharesAmount.sub(
				otherAccountDepositAmountFirstHalf
			);

			await expect(
				votingContract
					.connect(otherAccount)
					.depositFor(otherAccount.address, otherAccountDepositAmountFirstHalf)
			).to.changeTokenBalance(
				domeInstance,
				otherAccount.address,
				otherAccountDepositAmountFirstHalf.mul(-1)
			);

			await expect(
				votingContract.connect(otherAccount).delegate(otherAccount.address)
			).to.be.fulfilled;

			expect(await votingContract.getVotes(otherAccount.address)).to.be.eq(
				otherAccountDepositAmountFirstHalf
			);

			const walletAddress = ethers.Wallet.createRandom().address;
			const domeReserve = await bufferContract.callStatic.domeReserves(
				domeInstance.address
			);

			const transferAmount = domeReserve;

			const title = "Proposal#1";
			const description = "Proposal#1 Transfer funds to XXXX";

			// Need to mine one block, to callStatic won't fail due to pastVotingBalance
			await mine(1);
			const proposalId = await governanceContract
				.connect(otherAccount)
				.callStatic.propose(walletAddress, transferAmount, title, description);

			await expect(
				governanceContract
					.connect(otherAccount)
					.propose(walletAddress, transferAmount, title, description)
			).to.be.fulfilled;

			expect(await governanceContract.callStatic.state(proposalId)).to.be.equal(
				PROPOSAL_STATE.PENDING
			);

			await mine(governanceSettings.votingDelay + 1);
			expect(await governanceContract.callStatic.state(proposalId)).to.be.equal(
				PROPOSAL_STATE.ACTIVE
			);

			await expect(
				governanceContract.connect(otherAccount).castVote(proposalId)
			).to.be.fulfilled;

			await expect(
				votingContract
					.connect(otherAccount)
					.depositFor(otherAccount.address, otherAccountDepositAmountSecondHalf)
			).to.changeTokenBalance(
				domeInstance,
				otherAccount.address,
				otherAccountDepositAmountSecondHalf.mul(-1)
			);

			await expect(
				votingContract.connect(otherAccount).delegate(otherAccount.address)
			).to.be.fulfilled;

			await expect(
				governanceContract.connect(otherAccount).castVote(proposalId)
			).to.be.fulfilled;

			const proposalVotesSecondHalf =
				await governanceContract.callStatic.proposalVotes(proposalId);

			expect(await votingContract.getVotes(otherAccount.address)).to.be.eq(
				otherAccountDepositAmountFirstHalf.add(
					otherAccountDepositAmountSecondHalf
				)
			);

			expect(await governanceContract.callStatic.state(proposalId)).to.be.equal(
				PROPOSAL_STATE.PRESUCCEEDED
			);

			await expect(
				governanceContract.connect(otherAccount).triggerProposal()
			).to.changeTokenBalance(assetContract, walletAddress, transferAmount);

			await expect(
				votingContract
					.connect(otherAccount)
					.withdrawTo(otherAccount.address, proposalVotesSecondHalf)
			).to.be.fulfilled;

			expect(await governanceContract.callStatic.state(proposalId)).to.be.equal(
				PROPOSAL_STATE.EXECUTED
			);

			expect(
				await governanceContract.callStatic.proposalVotes(proposalId)
			).to.be.eq(proposalVotesSecondHalf);
		});

		it("Should deposit votes twice, vote on each deposit, withdraw and update proposals vote balance", async function () {
			const {
				assetContract,
				domeInstance,
				otherAccount,
				anotherAccount,
				bufferContract,
				governanceContract,
				PROPOSAL_STATE,
				votingContract,
				governanceSettings,
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

			await domeInstance.connect(otherAccount).claimYieldAndDistribute();

			expect(await votingContract.getVotes(otherAccount.address)).to.be.eq(0);

			const sharesAmount = await domeInstance.balanceOf(otherAccount.address);

			await approve(
				otherAccount,
				domeInstance.address,
				votingContract.address,
				sharesAmount
			);

			const otherAccountDepositAmountFirstHalf = sharesAmount.div(2);
			const otherAccountDepositAmountSecondHalf = sharesAmount.sub(
				otherAccountDepositAmountFirstHalf
			);

			await expect(
				votingContract
					.connect(otherAccount)
					.depositFor(otherAccount.address, otherAccountDepositAmountFirstHalf)
			).to.changeTokenBalance(
				domeInstance,
				otherAccount.address,
				otherAccountDepositAmountFirstHalf.mul(-1)
			);

			await expect(
				votingContract.connect(otherAccount).delegate(otherAccount.address)
			).to.be.fulfilled;

			expect(await votingContract.getVotes(otherAccount.address)).to.be.eq(
				otherAccountDepositAmountFirstHalf
			);

			const walletAddress = ethers.Wallet.createRandom().address;
			const domeReserve = await bufferContract.callStatic.domeReserves(
				domeInstance.address
			);

			const transferAmount = domeReserve;

			const title = "Proposal#1";
			const description = "Proposal#1 Transfer funds to XXXX";

			// Need to mine one block, to callStatic won't fail due to pastVotingBalance
			await mine(1);
			const proposalId = await governanceContract
				.connect(otherAccount)
				.callStatic.propose(walletAddress, transferAmount, title, description);

			await expect(
				governanceContract
					.connect(otherAccount)
					.propose(walletAddress, transferAmount, title, description)
			).to.be.fulfilled;

			expect(await governanceContract.callStatic.state(proposalId)).to.be.equal(
				PROPOSAL_STATE.PENDING
			);

			await mine(governanceSettings.votingDelay + 1);
			expect(await governanceContract.callStatic.state(proposalId)).to.be.equal(
				PROPOSAL_STATE.ACTIVE
			);

			expect(
				await governanceContract.callStatic.proposalVotesOf(
					proposalId,
					otherAccount.address
				)
			).to.be.eq(await governanceContract.callStatic.proposalVotes(proposalId));

			await expect(
				governanceContract.connect(otherAccount).castVote(proposalId)
			).to.be.fulfilled;

			expect(
				await governanceContract.callStatic.proposalVotesOf(
					proposalId,
					otherAccount.address
				)
			).to.be.eq(await governanceContract.callStatic.proposalVotes(proposalId));

			await expect(
				governanceContract.connect(otherAccount).castVote(proposalId)
			).to.be.rejectedWith("Already voted");

			expect(
				await governanceContract.callStatic.proposalVotesOf(
					proposalId,
					otherAccount.address
				)
			).to.be.eq(await governanceContract.callStatic.proposalVotes(proposalId));

			await expect(
				votingContract
					.connect(otherAccount)
					.depositFor(otherAccount.address, otherAccountDepositAmountSecondHalf)
			).to.changeTokenBalance(
				domeInstance,
				otherAccount.address,
				otherAccountDepositAmountSecondHalf.mul(-1)
			);

			await expect(
				votingContract.connect(otherAccount).delegate(otherAccount.address)
			).to.be.fulfilled;

			await expect(
				governanceContract.connect(otherAccount).castVote(proposalId)
			).to.be.fulfilled;
			expect(
				await governanceContract.callStatic.proposalVotesOf(
					proposalId,
					otherAccount.address
				)
			).to.be.eq(await governanceContract.callStatic.proposalVotes(proposalId));

			await expect(
				votingContract
					.connect(otherAccount)
					.withdrawTo(otherAccount.address, otherAccountDepositAmountSecondHalf)
			).to.be.fulfilled;

			expect(
				await governanceContract.callStatic.proposalVotesOf(
					proposalId,
					otherAccount.address
				)
			).to.be.eq(await governanceContract.callStatic.proposalVotes(proposalId));

			const [, , votes] = (
				await governanceContract.callStatic.getProposals()
			)[0];

			const votesToAssets =
				await domeInstance.callStatic.convertToAssets(votes);

			expect(votesToAssets).to.be.gte(15000000);

			{
				const assetsReceived = await swap(
					anotherAccount,
					MAINNET.ADDRESSES.WMATIC,
					assetContract.address,
					swapAmount
				);

				await approve(
					anotherAccount,
					assetContract.address,
					domeInstance.address,
					assetsReceived
				);

				await expect(
					domeInstance
						.connect(anotherAccount)
						.deposit(assetsReceived, anotherAccount.address)
				).to.be.fulfilled;

				expect(await votingContract.getVotes(anotherAccount.address)).to.be.eq(
					0
				);

				const sharesAmount = await domeInstance.balanceOf(
					anotherAccount.address
				);

				await approve(
					anotherAccount,
					domeInstance.address,
					votingContract.address,
					sharesAmount
				);

				await expect(
					votingContract
						.connect(anotherAccount)
						.depositFor(anotherAccount.address, sharesAmount)
				).to.changeTokenBalance(
					domeInstance,
					anotherAccount.address,
					sharesAmount.mul(-1)
				);

				await expect(
					votingContract
						.connect(anotherAccount)
						.delegate(anotherAccount.address)
				).to.be.fulfilled;

				expect(await votingContract.getVotes(anotherAccount.address)).to.be.eq(
					sharesAmount
				);

				expect(
					await governanceContract.callStatic.proposalVotesOf(
						proposalId,
						anotherAccount.address
					)
				).to.be.eq(0);

				const proposalVotesBefore =
					await governanceContract.callStatic.proposalVotes(proposalId);

				await expect(
					governanceContract.connect(anotherAccount).castVote(proposalId)
				).to.be.fulfilled;

				expect(
					await governanceContract.callStatic.proposalVotesOf(
						proposalId,
						anotherAccount.address
					)
				).to.be.eq(sharesAmount);

				expect(
					await governanceContract.callStatic.proposalVotes(proposalId)
				).to.be.eq(proposalVotesBefore.add(sharesAmount));
			}
		});
		it("Should allow to fill proposal if status is live", async function () {
			const {
				assetContract, // USDC contract
				domeInstance,
				otherAccount,
				anotherAccount,
				bufferContract,
				governanceContract,
				PROPOSAL_STATE,
				votingContract,
				governanceSettings,
			} = await loadFixture(deployDome);

			// Get USDC for otherAccount
			const swapAmount = ethers.utils.parseEther("5000");
			const assetsReceived = await swap(
				otherAccount,
				MAINNET.ADDRESSES.WMATIC,
				assetContract.address,
				swapAmount
			);

			// Create proposal
			const walletAddress = anotherAccount.address;
			const transferAmount = assetsReceived.div(2);
			const assetsToDeposit = assetsReceived.div(3);
			const title = "Proposal#1";
			const description = "Proposal#1 Transfer funds to XXXX";

			await approve(
				otherAccount,
				assetContract.address,
				domeInstance.address,
				assetsToDeposit
			);
			await domeInstance
				.connect(otherAccount)
				.deposit(assetsToDeposit, otherAccount.address);

			const sharesAmount = await domeInstance.balanceOf(otherAccount.address);

			await approve(
				otherAccount,
				domeInstance.address,
				votingContract.address,
				sharesAmount
			);
			await votingContract
				.connect(otherAccount)
				.depositFor(otherAccount.address, sharesAmount);
			await votingContract.connect(otherAccount).delegate(otherAccount.address);

			// Create proposal
			const proposalId = await governanceContract
				.connect(otherAccount)
				.callStatic.propose(walletAddress, transferAmount, title, description);

			await governanceContract
				.connect(otherAccount)
				.propose(walletAddress, transferAmount, title, description);

			// Try to fill while proposal is still pending
			await expect(
				governanceContract.connect(otherAccount).fill(proposalId)
			).to.be.revertedWith("Governor: proposal not active");

			await mine(governanceSettings.votingDelay + 1);

			await expect(
				governanceContract.connect(otherAccount).fill(proposalId)
			).to.be.revertedWith("ERC20: insufficient allowance");

			// Approve USDC transfer for filling proposal
			await approve(
				otherAccount,
				assetContract.address,
				governanceContract.address,
				transferAmount
			);

			// Fill the proposal
			await expect(
				governanceContract.connect(otherAccount).fill(proposalId)
			).to.changeTokenBalances(
				assetContract,
				[otherAccount.address, walletAddress],
				[transferAmount.mul(-1), transferAmount]
			);

			// Verify proposal state is now succeeded
			expect(await governanceContract.state(proposalId)).to.equal(
				PROPOSAL_STATE.EXECUTED
			);
		});
	});
});
