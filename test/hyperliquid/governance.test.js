const { expect } = require("chai");
const { ethers } = require("hardhat");

const ACTION_SEND_ASSET = 13;

const PROPOSAL_STATE = {
	Pending: 0,
	Active: 1,
	Canceled: 2,
	Defeated: 3,
	Succeeded: 4,
	Executed: 5,
	PreSucceeded: 6,
};

describe("HyperliquidGovernor", function () {
	async function deployFixture() {
		const [deployer, voter1, voter2, projectWallet] = await ethers.getSigners();

		const MockERC20 = await ethers.getContractFactory("MockERC20");
		const usdc = await MockERC20.deploy("USD Coin", "USDC", 6);
		await usdc.deployed();

		const MockCoreWriter = await ethers.getContractFactory("MockCoreWriter");
		const coreWriter = await MockCoreWriter.deploy();
		await coreWriter.deployed();

		const HyperliquidBuffer =
			await ethers.getContractFactory("HyperliquidBuffer");
		const buffer = await HyperliquidBuffer.deploy();
		await buffer.deployed();

		const HyperliquidVault =
			await ethers.getContractFactory("HyperliquidVault");
		const vault = await HyperliquidVault.deploy(
			usdc.address,
			coreWriter.address,
			deployer.address,
			deployer.address,
			buffer.address,
			6000,
			0,
			"Hyperliquid IOU",
			"hlIOU"
		);
		await vault.deployed();

		await buffer.registerVault(
			vault.address,
			ethers.constants.AddressZero,
			usdc.address
		);
		await vault
			.connect(deployer)
			.updateAutoDeployConfig(true, ACTION_SEND_ASSET, buffer.address);

		const HyperliquidGovernor = await ethers.getContractFactory(
			"HyperliquidGovernor"
		);
		const governor = await HyperliquidGovernor.deploy(
			vault.address,
			1, // voting delay
			5, // voting period
			0, // proposal threshold
			usdc.address
		);
		await governor.deployed();

		await buffer.updateGovernance(vault.address, governor.address);

		return {
			deployer,
			voter1,
			voter2,
			projectWallet,
			usdc,
			vault,
			buffer,
			governor,
		};
	}

	async function setDeployedValue(vault, operator, value) {
		await vault.connect(operator).reportDeployedValue(value);
	}

	async function settleFromHyperliquid(
		vault,
		token,
		operator,
		principal,
		profit
	) {
		const total = principal.add(profit);
		await token.mint(vault.address, total);
		return vault.connect(operator).reconcileFromHyperliquid(principal, profit);
	}

	it("executes winning project and transfers reserves", async function () {
		const {
			deployer,
			voter1,
			voter2,
			projectWallet,
			usdc,
			vault,
			buffer,
			governor,
		} = await deployFixture();

		const deposit1 = ethers.utils.parseUnits("1000", 6);
		const deposit2 = ethers.utils.parseUnits("500", 6);

		await usdc.mint(voter1.address, deposit1);
		await usdc.mint(voter2.address, deposit2);

		await usdc.connect(voter1).approve(vault.address, deposit1);
		await usdc.connect(voter2).approve(vault.address, deposit2);

		await vault.connect(voter1).deposit(deposit1, voter1.address);
		await vault.connect(voter2).deposit(deposit2, voter2.address);

		await vault.connect(voter1).delegate(voter1.address);
		await vault.connect(voter2).delegate(voter2.address);

		const profit = ethers.utils.parseUnits("600", 6);
		await setDeployedValue(vault, deployer, deposit1.add(deposit2).add(profit));
		await settleFromHyperliquid(
			vault,
			usdc,
			deployer,
			ethers.constants.Zero,
			profit
		);

		const transferAmount = await buffer.vaultReserves(vault.address);
		const treasuryBalance = await usdc.balanceOf(buffer.address);
		expect(transferAmount).to.equal(profit.mul(6000).div(10000));
		expect(treasuryBalance).to.equal(transferAmount);

		await ethers.provider.send("evm_mine");
		const proposalId = await governor
			.connect(voter1)
			.callStatic.propose(
				projectWallet.address,
				transferAmount,
				"Fund Project",
				"Description"
			);

		await governor
			.connect(voter1)
			.propose(
				projectWallet.address,
				transferAmount,
				"Fund Project",
				"Description"
			);

		await ethers.provider.send("evm_mine");
		await governor.connect(voter1).castVote(proposalId);
		await governor.connect(voter2).castVote(proposalId);

		for (let i = 0; i < 6; i++) {
			await ethers.provider.send("evm_mine");
		}

		await expect(governor.triggerProposal()).to.emit(
			governor,
			"ProposalExecuted"
		);

		expect(await buffer.vaultReserves(vault.address)).to.equal(0);
		expect(await usdc.balanceOf(projectWallet.address)).to.equal(
			transferAmount
		);
	});

	it("rejects proposals requesting more than available reserves", async function () {
		const {
			deployer,
			voter1,
			voter2,
			projectWallet,
			usdc,
			vault,
			buffer,
			governor,
		} = await deployFixture();

		const amount = ethers.utils.parseUnits("400", 6);
		await usdc.mint(voter1.address, amount);
		await usdc.connect(voter1).approve(vault.address, amount);
		await vault.connect(voter1).deposit(amount, voter1.address);
		await vault.connect(voter1).delegate(voter1.address);

		const profit = ethers.utils.parseUnits("120", 6);
		await setDeployedValue(vault, deployer, amount.add(profit));
		await settleFromHyperliquid(vault, usdc, deployer, amount, profit);

		const reserves = await buffer.vaultReserves(vault.address);
		const requestAmount = reserves.add(1);

		await ethers.provider.send("evm_mine");
		const proposalId = await governor
			.connect(voter1)
			.callStatic.propose(
				projectWallet.address,
				requestAmount,
				"TooMuch",
				"Desc"
			);
		await governor
			.connect(voter1)
			.propose(projectWallet.address, requestAmount, "TooMuch", "Desc");

		await ethers.provider.send("evm_mine");
		await governor.connect(voter1).castVote(proposalId);

		for (let i = 0; i < 6; i++) {
			await ethers.provider.send("evm_mine");
		}

		await expect(governor.triggerProposal()).to.be.revertedWith(
			"Governor: proposal not successful"
		);
		expect(await governor.state(proposalId)).to.equal(PROPOSAL_STATE.Defeated);
		expect(await buffer.vaultReserves(vault.address)).to.equal(reserves);
	});

	it("executes only the project with the highest number of votes", async function () {
		const {
			deployer,
			voter1,
			voter2,
			projectWallet,
			usdc,
			vault,
			buffer,
			governor,
		} = await deployFixture();

		const depositAmount = ethers.utils.parseUnits("500", 6);
		await usdc.mint(voter1.address, depositAmount);
		await usdc.mint(voter2.address, depositAmount);
		await usdc.connect(voter1).approve(vault.address, depositAmount);
		await usdc.connect(voter2).approve(vault.address, depositAmount);
		await vault.connect(voter1).deposit(depositAmount, voter1.address);
		await vault.connect(voter2).deposit(depositAmount, voter2.address);
		await vault.connect(voter1).delegate(voter1.address);
		await vault.connect(voter2).delegate(voter2.address);

		const totalDeposit = depositAmount.mul(2);

		const profit = ethers.utils.parseUnits("200", 6);
		await setDeployedValue(vault, deployer, totalDeposit.add(profit));
		await settleFromHyperliquid(vault, usdc, deployer, totalDeposit, profit);

		const transferAmount = await buffer.vaultReserves(vault.address);

		await ethers.provider.send("evm_mine");
		const proposalA = await governor
			.connect(voter1)
			.callStatic.propose(
				projectWallet.address,
				transferAmount.div(2),
				"ProjectA",
				"A"
			);
		await governor
			.connect(voter1)
			.propose(projectWallet.address, transferAmount.div(2), "ProjectA", "A");

		const otherWallet = ethers.Wallet.createRandom().address;
		const proposalB = await governor
			.connect(voter2)
			.callStatic.propose(otherWallet, transferAmount.div(2), "ProjectB", "B");
		await governor
			.connect(voter2)
			.propose(otherWallet, transferAmount.div(2), "ProjectB", "B");

		await ethers.provider.send("evm_mine");
		await governor.connect(voter1).castVote(proposalA);
		await governor.connect(voter2).castVote(proposalB);
		await governor.connect(voter1).castVote(proposalB);

		for (let i = 0; i < 6; i++) {
			await ethers.provider.send("evm_mine");
		}

		await governor.triggerProposal();

		expect(await governor.state(proposalB)).to.equal(PROPOSAL_STATE.Executed);
		expect(await governor.state(proposalA)).to.equal(PROPOSAL_STATE.Defeated);
		expect(await buffer.vaultReserves(vault.address)).to.equal(
			transferAmount.sub(transferAmount.div(2))
		);
	});
});
