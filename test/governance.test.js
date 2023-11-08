const { expect } = require("chai");
const { ethers } = require("hardhat");
const { POLYGON } = require("./constants");
const {
	loadFixture,
	time,
	mine,
} = require("@nomicfoundation/hardhat-network-helpers");
const { approve, sushiSwap } = require("./utils");

describe("Governance", function () {
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
		};
	}

	describe("Validations", function () {
		it("Should revert to create proposal if caller is not the dome owner", async function () {
			const {
				assetContract,
				domeInstance,
				otherAccount,
				anotherAccount,
				bufferContract,
				governanceContract,
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

			await domeInstance.connect(otherAccount).claimYieldAndDistribute();

			const walletAddress = anotherAccount.address;
			const domeReserve = await bufferContract.callStatic.domeReserves(
				domeInstance.address
			);

			const transferAmount = domeReserve;

			const reserveTransferCalldata =
				governanceContract.interface.encodeFunctionData("reserveTransfer", [
					walletAddress,
					transferAmount,
				]);

			const description = "Proposal#1 Transfer funds to XXXX";
			const duration = 10; // 10 blocks - each block ~ 12 secs

			await expect(
				governanceContract
					.connect(anotherAccount)
					.propose(
						walletAddress,
						transferAmount,
						reserveTransferCalldata,
						description,
						duration
					)
			).to.be.revertedWithCustomError(governanceContract, "Unauthorized");
		});

		it("Should allow to create proposal if caller is the dome owner", async function () {
			const {
				assetContract,
				domeInstance,
				otherAccount,
				anotherAccount,
				bufferContract,
				governanceContract,
				domeCreator,
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

			await domeInstance.connect(otherAccount).claimYieldAndDistribute();

			const walletAddress = anotherAccount.address;
			const domeReserve = await bufferContract.callStatic.domeReserves(
				domeInstance.address
			);

			const transferAmount = domeReserve;

			const reserveTransferCalldata =
				governanceContract.interface.encodeFunctionData("reserveTransfer", [
					walletAddress,
					transferAmount,
				]);

			const description = "Proposal#1 Transfer funds to XXXX";
			const duration = 10; // 10 blocks - each block ~ 12 secs

			await expect(
				governanceContract
					.connect(domeCreator)
					.propose(
						walletAddress,
						transferAmount,
						reserveTransferCalldata,
						description,
						duration
					)
			).to.be.fulfilled;
		});

		it("Should revert to cancel proposal if caller is the dome owner", async function () {
			const {
				assetContract,
				domeInstance,
				otherAccount,
				anotherAccount,
				bufferContract,
				governanceContract,
				domeCreator,
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

			await domeInstance.connect(otherAccount).claimYieldAndDistribute();

			const walletAddress = anotherAccount.address;
			const domeReserve = await bufferContract.callStatic.domeReserves(
				domeInstance.address
			);

			const transferAmount = domeReserve;

			const reserveTransferCalldata =
				governanceContract.interface.encodeFunctionData("reserveTransfer", [
					walletAddress,
					transferAmount,
				]);

			const description = "Proposal#1 Transfer funds to XXXX";
			const duration = 10; // 10 blocks - each block ~ 12 secs

			await expect(
				governanceContract
					.connect(domeCreator)
					.propose(
						walletAddress,
						transferAmount,
						reserveTransferCalldata,
						description,
						duration
					)
			).to.be.fulfilled;

			const descriptionHash = ethers.utils.id(description);

			await expect(
				governanceContract
					.connect(anotherAccount)
					.cancel(
						walletAddress,
						transferAmount,
						reserveTransferCalldata,
						descriptionHash
					)
			).to.be.revertedWith("Governor: only proposer can cancel");
		});

		it("Should allow to cancel proposal if caller is the dome owner", async function () {
			const {
				assetContract,
				domeInstance,
				otherAccount,
				anotherAccount,
				bufferContract,
				governanceContract,
				domeCreator,
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

			await domeInstance.connect(otherAccount).claimYieldAndDistribute();

			const walletAddress = anotherAccount.address;
			const domeReserve = await bufferContract.callStatic.domeReserves(
				domeInstance.address
			);

			const transferAmount = domeReserve;

			const reserveTransferCalldata =
				governanceContract.interface.encodeFunctionData("reserveTransfer", [
					walletAddress,
					transferAmount,
				]);

			const description = "Proposal#1 Transfer funds to XXXX";
			const duration = 10; // 10 blocks - each block ~ 12 secs

			await expect(
				governanceContract
					.connect(domeCreator)
					.propose(
						walletAddress,
						transferAmount,
						reserveTransferCalldata,
						description,
						duration
					)
			).to.be.fulfilled;

			const descriptionHash = ethers.utils.id(description);

			await expect(
				governanceContract
					.connect(domeCreator)
					.cancel(
						walletAddress,
						transferAmount,
						reserveTransferCalldata,
						descriptionHash
					)
			).to.be.fulfilled;
		});

		it("Should revert the owner to cancel proposal if the proposal is expired", async function () {
			const {
				assetContract,
				domeInstance,
				otherAccount,
				anotherAccount,
				bufferContract,
				governanceContract,
				domeCreator,
				PROPOSAL_STATE,
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

			await domeInstance.connect(otherAccount).claimYieldAndDistribute();

			const walletAddress = anotherAccount.address;
			const domeReserve = await bufferContract.callStatic.domeReserves(
				domeInstance.address
			);

			const transferAmount = domeReserve;

			const reserveTransferCalldata =
				governanceContract.interface.encodeFunctionData("reserveTransfer", [
					walletAddress,
					transferAmount,
				]);

			const description = "Proposal#1 Transfer funds to XXXX";
			const duration = 10; // 10 blocks - each block ~ 12 secs

			const proposalId = await governanceContract
				.connect(domeCreator)
				.callStatic.propose(
					walletAddress,
					transferAmount,
					reserveTransferCalldata,
					description,
					duration
				);

			await expect(
				governanceContract
					.connect(domeCreator)
					.propose(
						walletAddress,
						transferAmount,
						reserveTransferCalldata,
						description,
						duration
					)
			).to.be.fulfilled;

			await mine(duration);

			const descriptionHash = ethers.utils.id(description);

			await expect(
				governanceContract
					.connect(domeCreator)
					.cancel(
						walletAddress,
						transferAmount,
						reserveTransferCalldata,
						descriptionHash
					)
			).to.be.revertedWith("Governor: proposal not active");

			expect(await governanceContract.callStatic.state(proposalId)).to.be.equal(
				PROPOSAL_STATE.DEFEATED
			);
		});

		it("Should allow the owner to cancel proposal if the proposal is not expired", async function () {
			const {
				assetContract,
				domeInstance,
				otherAccount,
				anotherAccount,
				bufferContract,
				governanceContract,
				domeCreator,
				PROPOSAL_STATE,
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

			await domeInstance.connect(otherAccount).claimYieldAndDistribute();

			const walletAddress = anotherAccount.address;
			const domeReserve = await bufferContract.callStatic.domeReserves(
				domeInstance.address
			);

			const transferAmount = domeReserve;

			const reserveTransferCalldata =
				governanceContract.interface.encodeFunctionData("reserveTransfer", [
					walletAddress,
					transferAmount,
				]);

			const description = "Proposal#1 Transfer funds to XXXX";
			const duration = 10; // 10 blocks - each block ~ 12 secs

			const proposalId = await governanceContract
				.connect(domeCreator)
				.callStatic.propose(
					walletAddress,
					transferAmount,
					reserveTransferCalldata,
					description,
					duration
				);

			await expect(
				governanceContract
					.connect(domeCreator)
					.propose(
						walletAddress,
						transferAmount,
						reserveTransferCalldata,
						description,
						duration
					)
			).to.be.fulfilled;

			await mine(duration - 1);

			const descriptionHash = ethers.utils.id(description);

			await expect(
				governanceContract
					.connect(domeCreator)
					.cancel(
						walletAddress,
						transferAmount,
						reserveTransferCalldata,
						descriptionHash
					)
			).to.be.fulfilled;

			expect(await governanceContract.callStatic.state(proposalId)).to.be.equal(
				PROPOSAL_STATE.CANCELED
			);
		});

		it("Should allow stakeholder to deposit shares to the voting contract to get voting tokens with ratio 1:1", async function () {
			const { assetContract, domeInstance, anotherAccount, votingContract } =
				await loadFixture(deployDome);

			const swapAmount = ethers.utils.parseEther("50");
			const assetsReceived = await sushiSwap(
				anotherAccount,
				POLYGON.ADDRESSES.WMATIC,
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
		});

		it("Should allow stakeholder to burn voting delegates and withdraw deposited shares with ratio 1:1", async function () {
			const { assetContract, domeInstance, anotherAccount, votingContract } =
				await loadFixture(deployDome);

			const swapAmount = ethers.utils.parseEther("50");
			const assetsReceived = await sushiSwap(
				anotherAccount,
				POLYGON.ADDRESSES.WMATIC,
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

		it("Should transfer funds after successful proposal", async function () {
			const {
				assetContract,
				domeInstance,
				anotherAccount,
				bufferContract,
				governanceContract,
				domeCreator,
				PROPOSAL_STATE,
				votingContract,
			} = await loadFixture(deployDome);

			const swapAmount = ethers.utils.parseEther("50");
			const assetsReceived = await sushiSwap(
				anotherAccount,
				POLYGON.ADDRESSES.WMATIC,
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

			const reserveTransferCalldata =
				governanceContract.interface.encodeFunctionData("reserveTransfer", [
					walletAddress,
					transferAmount,
				]);

			const description = "Proposal#1 Transfer funds to XXXX";
			const duration = 10; // 10 blocks - each block ~ 12 secs

			const proposalId = await governanceContract
				.connect(domeCreator)
				.callStatic.propose(
					walletAddress,
					transferAmount,
					reserveTransferCalldata,
					description,
					duration
				);

			await expect(
				governanceContract
					.connect(domeCreator)
					.propose(
						walletAddress,
						transferAmount,
						reserveTransferCalldata,
						description,
						duration
					)
			).to.be.fulfilled;

			await expect(
				governanceContract.connect(anotherAccount).castVote(proposalId)
			).to.be.fulfilled;

			await mine(duration);

			expect(await governanceContract.callStatic.state(proposalId)).to.be.equal(
				PROPOSAL_STATE.SUCCEEDED
			);

			const descriptionHash = ethers.utils.id(description);

			await expect(
				governanceContract
					.connect(domeCreator)
					.execute(
						walletAddress,
						transferAmount,
						reserveTransferCalldata,
						descriptionHash
					)
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
				domeCreator,
				PROPOSAL_STATE,
				randomAccount,
				votingContract,
			} = await loadFixture(deployDome);

			const swapAmount1 = ethers.utils.parseEther("50");
			const swapAmount2 = ethers.utils.parseEther("100");
			const [assetsReceived1, assetsReceived2] = await Promise.all([
				sushiSwap(
					anotherAccount,
					POLYGON.ADDRESSES.WMATIC,
					assetContract.address,
					swapAmount1
				),
				sushiSwap(
					randomAccount,
					POLYGON.ADDRESSES.WMATIC,
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

			const reserveTransferCalldata =
				governanceContract.interface.encodeFunctionData("reserveTransfer", [
					walletAddress,
					transferAmount,
				]);

			const firstDescription = "Proposal#1 Transfer funds to XXXX";
			const duration = 10; // 10 blocks - each block ~ 12 secs

			const secondDescription = "Proposal#2 Transfer funds to XXXX";

			const firstProposalId = await governanceContract
				.connect(domeCreator)
				.callStatic.propose(
					walletAddress,
					transferAmount,
					reserveTransferCalldata,
					firstDescription,
					duration
				);

			const secondProposalId = await governanceContract
				.connect(domeCreator)
				.callStatic.propose(
					walletAddress,
					transferAmount,
					reserveTransferCalldata,
					secondDescription,
					duration
				);

			await expect(
				governanceContract
					.connect(domeCreator)
					.propose(
						walletAddress,
						transferAmount,
						reserveTransferCalldata,
						firstDescription,
						duration
					)
			).to.be.fulfilled;

			await expect(
				governanceContract
					.connect(domeCreator)
					.propose(
						walletAddress,
						transferAmount,
						reserveTransferCalldata,
						secondDescription,
						duration
					)
			).to.be.fulfilled;

			await expect(
				governanceContract.connect(anotherAccount).castVote(firstProposalId)
			).to.be.fulfilled;

			await expect(
				governanceContract.connect(randomAccount).castVote(secondProposalId)
			).to.be.fulfilled;

			await mine(duration);

			expect(
				await governanceContract.callStatic.state(firstProposalId)
			).to.be.equal(PROPOSAL_STATE.DEFEATED, "firstState");

			expect(
				await governanceContract.callStatic.state(secondProposalId)
			).to.be.equal(PROPOSAL_STATE.SUCCEEDED, "secondState");

			const firstDescriptionHash = ethers.utils.id(firstDescription);
			const secondDescriptionHash = ethers.utils.id(secondDescription);

			await expect(
				governanceContract
					.connect(domeCreator)
					.execute(
						walletAddress,
						transferAmount,
						reserveTransferCalldata,
						firstDescriptionHash
					)
			).to.reverted;

			await expect(
				governanceContract
					.connect(domeCreator)
					.execute(
						walletAddress,
						transferAmount,
						reserveTransferCalldata,
						secondDescriptionHash
					)
			).to.changeTokenBalance(assetContract, walletAddress, transferAmount);

			expect(
				await governanceContract.callStatic.state(secondProposalId)
			).to.be.equal(PROPOSAL_STATE.EXECUTED);
		});

		it("Should only execute proposal with highest votes on triggerProposal", async function () {
			const {
				assetContract,
				domeInstance,
				anotherAccount,
				bufferContract,
				governanceContract,
				domeCreator,
				PROPOSAL_STATE,
				votingContract,
				randomAccount,
			} = await loadFixture(deployDome);

			const swapAmount1 = ethers.utils.parseEther("50");
			const swapAmount2 = ethers.utils.parseEther("100");
			const [assetsReceived1, assetsReceived2] = await Promise.all([
				sushiSwap(
					anotherAccount,
					POLYGON.ADDRESSES.WMATIC,
					assetContract.address,
					swapAmount1
				),
				sushiSwap(
					randomAccount,
					POLYGON.ADDRESSES.WMATIC,
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

			const reserveTransferCalldata =
				governanceContract.interface.encodeFunctionData("reserveTransfer", [
					walletAddress,
					transferAmount,
				]);

			const firstDescription = "Proposal#1 Transfer funds to XXXX";
			const duration = 10; // 10 blocks - each block ~ 12 secs

			const secondDescription = "Proposal#2 Transfer funds to XXXX";

			const firstProposalId = await governanceContract
				.connect(domeCreator)
				.callStatic.propose(
					walletAddress,
					transferAmount,
					reserveTransferCalldata,
					firstDescription,
					duration
				);

			const secondProposalId = await governanceContract
				.connect(domeCreator)
				.callStatic.propose(
					walletAddress,
					transferAmount,
					reserveTransferCalldata,
					secondDescription,
					duration
				);

			await expect(
				governanceContract
					.connect(domeCreator)
					.propose(
						walletAddress,
						transferAmount,
						reserveTransferCalldata,
						firstDescription,
						duration
					)
			).to.be.fulfilled;

			await expect(
				governanceContract
					.connect(domeCreator)
					.propose(
						walletAddress,
						transferAmount,
						reserveTransferCalldata,
						secondDescription,
						duration
					)
			).to.be.fulfilled;

			await expect(
				governanceContract.connect(anotherAccount).castVote(firstProposalId)
			).to.be.fulfilled;

			await expect(
				governanceContract.connect(randomAccount).castVote(secondProposalId)
			).to.be.fulfilled;

			expect(
				await governanceContract.callStatic.state(firstProposalId)
			).to.be.equal(PROPOSAL_STATE.ACTIVE);

			expect(
				await governanceContract.callStatic.state(secondProposalId)
			).to.be.equal(PROPOSAL_STATE.PRESUCCEEDED, "HERE");

			const firstDescriptionHash = ethers.utils.id(firstDescription);
			const secondDescriptionHash = ethers.utils.id(secondDescription);

			await expect(
				governanceContract
					.connect(domeCreator)
					.execute(
						walletAddress,
						transferAmount,
						reserveTransferCalldata,
						firstDescriptionHash
					)
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
				governanceContract
					.connect(domeCreator)
					.execute(
						walletAddress,
						transferAmount,
						reserveTransferCalldata,
						secondDescriptionHash
					)
			).to.be.rejected;

			expect(
				await governanceContract.callStatic.state(firstProposalId)
			).to.be.equal(PROPOSAL_STATE.ACTIVE);

			expect(
				await governanceContract.callStatic.state(secondProposalId)
			).to.be.equal(PROPOSAL_STATE.EXECUTED);
		});
	});
});
