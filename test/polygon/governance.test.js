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

describe("Governance", function () {
	async function deployDome() {
		const [
			systemOwner,
			domeCreator,
			otherAccount,
			anotherAccount,
			randomAccount,
			beneficiaryAccount,
		] = await ethers.getSigners();

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

			const description = "Proposal#1 Transfer funds to XXXX";

			await expect(
				governanceContract
					.connect(anotherAccount)
					.propose(walletAddress, transferAmount, description)
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
					.propose(walletAddress, transferAmount, description)
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
				.callStatic.propose(walletAddress, transferAmount, description);

			await expect(
				governanceContract
					.connect(otherAccount)
					.propose(walletAddress, transferAmount, description)
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
				.callStatic.propose(walletAddress, transferAmount, description);

			await expect(
				governanceContract
					.connect(otherAccount)
					.propose(walletAddress, transferAmount, description)
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
				.callStatic.propose(walletAddress, transferAmount, description);

			await expect(
				governanceContract
					.connect(otherAccount)
					.propose(walletAddress, transferAmount, description)
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
				.callStatic.propose(walletAddress, transferAmount, description);

			await expect(
				governanceContract
					.connect(otherAccount)
					.propose(walletAddress, transferAmount, description)
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

			const description = "Proposal#1 Transfer funds to XXXX";

			// Need to mine one block, to callStatic won't fail due to pastVotingBalance
			await mine(1);
			const proposalId = await governanceContract
				.connect(otherAccount)
				.callStatic.propose(walletAddress, transferAmount, description);

			await expect(
				governanceContract
					.connect(otherAccount)
					.propose(walletAddress, transferAmount, description)
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

			const description = "Proposal#1 Transfer funds to XXXX";

			// Need to mine one block, to callStatic won't fail due to pastVotingBalance
			await mine(1);
			const proposalId = await governanceContract
				.connect(otherAccount)
				.callStatic.propose(walletAddress, transferAmount, description);

			await expect(
				governanceContract
					.connect(otherAccount)
					.propose(walletAddress, transferAmount, description)
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

			const description = "Proposal#1 Transfer funds to XXXX";

			// Need to mine one block, to callStatic won't fail due to pastVotingBalance
			await mine(1);
			const proposalId = await governanceContract
				.connect(otherAccount)
				.callStatic.propose(walletAddress, transferAmount, description);

			await expect(
				governanceContract
					.connect(otherAccount)
					.propose(walletAddress, transferAmount, description)
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

			const description = "Proposal#1 Transfer funds to XXXX";

			// Need to mine one block, to callStatic won't fail due to pastVotingBalance
			await mine(1);
			const proposalId = await governanceContract
				.connect(anotherAccount)
				.callStatic.propose(walletAddress, transferAmount, description);

			await expect(
				governanceContract
					.connect(anotherAccount)
					.propose(walletAddress, transferAmount, description)
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

			const firstDescription = "Proposal#1 Transfer funds to XXXX";
			const secondDescription = "Proposal#2 Transfer funds to XXXX";

			// Need to mine one block, to callStatic won't fail due to pastVotingBalance
			await mine(1);

			const firstProposalId = await governanceContract
				.connect(anotherAccount)
				.callStatic.propose(walletAddress, transferAmount, firstDescription);

			const secondProposalId = await governanceContract
				.connect(anotherAccount)
				.callStatic.propose(walletAddress, transferAmount, secondDescription);

			await expect(
				governanceContract
					.connect(randomAccount)
					.propose(walletAddress, transferAmount, firstDescription)
			).to.be.fulfilled;

			await expect(
				governanceContract
					.connect(randomAccount)
					.propose(walletAddress, transferAmount, secondDescription)
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

			const firstDescription = "Proposal#1 Transfer funds to XXXX";
			const secondDescription = "Proposal#2 Transfer funds to XXXX";

			// Need to mine one block, to callStatic won't fail due to pastVotingBalance
			await mine(1);

			const firstProposalId = await governanceContract
				.connect(anotherAccount)
				.callStatic.propose(walletAddress, transferAmount, firstDescription);

			const secondProposalId = await governanceContract
				.connect(randomAccount)
				.callStatic.propose(walletAddress, transferAmount, secondDescription);

			await expect(
				governanceContract
					.connect(anotherAccount)
					.propose(walletAddress, transferAmount, firstDescription)
			).to.be.fulfilled;

			await expect(
				governanceContract
					.connect(randomAccount)
					.propose(walletAddress, transferAmount, secondDescription)
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

			const transferAmount = domeReserve.div(2);

			const firstDescription = "Proposal#1 Transfer funds to XXXX";
			const secondDescription = "Proposal#2 Transfer funds to XXXX";

			// Need to mine one block, to callStatic won't fail due to pastVotingBalance
			await mine(1);

			const firstProposalId = await governanceContract
				.connect(anotherAccount)
				.callStatic.propose(walletAddress, transferAmount, firstDescription);

			const secondProposalId = await governanceContract
				.connect(randomAccount)
				.callStatic.propose(walletAddress, transferAmount, secondDescription);

			await expect(
				governanceContract
					.connect(anotherAccount)
					.propose(walletAddress, transferAmount, firstDescription)
			).to.be.fulfilled;

			await expect(
				governanceContract
					.connect(randomAccount)
					.propose(walletAddress, transferAmount, secondDescription)
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
			).to.be.rejectedWith("Governor: proposal not successful");

			expect(
				await governanceContract.callStatic.state(secondProposalId)
			).to.be.equal(PROPOSAL_STATE.EXECUTED);

			expect(
				await governanceContract.callStatic.state(firstProposalId)
			).to.be.equal(PROPOSAL_STATE.PRESUCCEEDED);

			await expect(
				governanceContract.connect(otherAccount).execute(firstProposalId)
			).to.changeTokenBalance(assetContract, walletAddress, transferAmount);

			await expect(governanceContract.connect(randomAccount).triggerProposal())
				.to.be.revertedWithCustomError(governanceContract, "ProposalNotFound")
				.withArgs(0);

			expect(
				await governanceContract.callStatic.state(secondProposalId)
			).to.be.equal(PROPOSAL_STATE.EXECUTED);

			expect(
				await governanceContract.callStatic.state(firstProposalId)
			).to.be.equal(PROPOSAL_STATE.EXECUTED);
		});
	});
});
