import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

import { NGOGovernance, NGOGovernanceBuffer, NGOVault, MockUSDC } from "../typechain-types";
import { deployVaultFixture } from "./utils/fixtures";

const toUSDC = (value: string) => ethers.parseUnits(value, 6);

async function depositShares(
  vault: NGOVault,
  asset: MockUSDC,
  user: SignerWithAddress,
  amount: bigint = toUSDC("100")
) {
  await asset.connect(user).approve(await vault.getAddress(), amount);
  await vault.connect(user).deposit(amount, user.address);
}

describe("NGOGovernance", () => {
  async function fixture() {
    return deployVaultFixture();
  }

  async function submitProject(
    governance: NGOGovernance,
    submitter: SignerWithAddress,
    wallet: string,
    amount: bigint,
    description: string
  ) {
    const govWithSigner = governance.connect(submitter);
    const id = await govWithSigner.submitProject.staticCall(wallet, amount, description);
    await govWithSigner.submitProject(wallet, amount, description);
    return id;
  }

  async function startVoting(governance: NGOGovernance) {
    await time.increase(Number(await governance.VOTING_DELAY()) + 1);
  }

  async function endVoting(governance: NGOGovernance) {
    await time.increase(Number(await governance.VOTING_DURATION()) + 1);
  }

  async function waitFundingWindow(governance: NGOGovernance) {
    await time.increase(Number(await governance.MIN_VOTING_PERIOD()) + 1);
  }

  it("records project metadata and voting windows", async () => {
    const { governance, alice } = await loadFixture(fixture);
    const amount = toUSDC("50");
    const id = await submitProject(governance, alice, alice.address, amount, "Clean water");
    const project = await governance.projects(id);
    expect(project.id).to.equal(id);
    expect(project.projectWallet).to.equal(alice.address);
    expect(project.amountRequested).to.equal(amount);
    expect(project.description).to.equal("Clean water");
    expect(project.votingStart).to.equal(project.createdAt + (await governance.VOTING_DELAY()));
    expect(project.votingEnd).to.equal(project.createdAt + (await governance.VOTING_DURATION()));
  });

  it("enforces voting delays and duration", async () => {
    const { governance, vault, asset, alice } = await loadFixture(fixture);
    await depositShares(vault, asset, alice, toUSDC("20"));
    const id = await submitProject(governance, alice, alice.address, toUSDC("10"), "Playground");
    await expect(governance.connect(alice).vote(id)).to.be.revertedWithCustomError(
      governance,
      "VotingNotStarted"
    );
    await startVoting(governance);
    await governance.connect(alice).vote(id);
    await expect(governance.connect(alice).vote(id)).to.be.revertedWithCustomError(
      governance,
      "AlreadyVoted"
    );
    await endVoting(governance);
    await expect(governance.connect(alice).vote(id)).to.be.revertedWithCustomError(
      governance,
      "VotingEnded"
    );
  });

  it("requires voting power to vote", async () => {
    const { governance, alice, bob } = await loadFixture(fixture);
    const id = await submitProject(governance, alice, alice.address, toUSDC("10"), "Clinic");
    await startVoting(governance);
    await expect(governance.connect(bob).vote(id)).to.be.revertedWithCustomError(
      governance,
      "NoVotingPower"
    );
  });

  it("reverts when voting on invalid project", async () => {
    const { governance, alice } = await loadFixture(fixture);
    await expect(governance.connect(alice).vote(999)).to.be.revertedWithCustomError(
      governance,
      "InvalidProject"
    );
  });

  it("funds top project when buffer sufficient", async () => {
    const { governance, governanceBuffer, vault, asset, alice, bob, carol } = await loadFixture(fixture);
    await depositShares(vault, asset, alice, toUSDC("100"));
    await depositShares(vault, asset, bob, toUSDC("150"));
    await depositShares(vault, asset, carol, toUSDC("50"));

    const projectA = await submitProject(governance, alice, alice.address, toUSDC("60"), "A");
    const projectB = await submitProject(governance, bob, bob.address, toUSDC("40"), "B");
    await startVoting(governance);
    await governance.connect(alice).vote(projectA);
    await governance.connect(bob).vote(projectB);
    await governance.connect(carol).vote(projectB);
    await waitFundingWindow(governance);

    const bufferAmount = toUSDC("80");
    await asset.mint(await governanceBuffer.getAddress(), bufferAmount);
    const bobBalanceBefore = await asset.balanceOf(bob.address);

    await expect(governance.fundTopProject([projectA, projectB]))
      .to.emit(governance, "ProjectFunded")
      .withArgs(projectB, bob.address, toUSDC("40"));

    const bobBalanceAfter = await asset.balanceOf(bob.address);
    expect(bobBalanceAfter - bobBalanceBefore).to.equal(toUSDC("40"));
    expect(await governance.donationBuffer()).to.equal(bufferAmount - toUSDC("40"));
    const project = await governance.projects(projectB);
    expect(project.funded).to.equal(true);
  });

  it("skips expensive project when buffer too small", async () => {
    const { governance, governanceBuffer, vault, asset, alice, bob } = await loadFixture(fixture);
    await depositShares(vault, asset, alice, toUSDC("100"));
    await depositShares(vault, asset, bob, toUSDC("100"));

    const projectA = await submitProject(governance, alice, alice.address, toUSDC("150"), "Big");
    const projectB = await submitProject(governance, bob, bob.address, toUSDC("50"), "Small");

    await startVoting(governance);
    await governance.connect(alice).vote(projectA);
    await governance.connect(bob).vote(projectB);
    await waitFundingWindow(governance);

    await asset.mint(await governanceBuffer.getAddress(), toUSDC("80"));
    await governance.fundTopProject([projectA, projectB]);
    const project = await governance.projects(projectB);
    expect(project.funded).to.equal(true);
  });

  it("reverts when candidate list empty or invalid", async () => {
    const { governance } = await loadFixture(fixture);
    await expect(governance.fundTopProject([])).to.be.revertedWithCustomError(
      governance,
      "NoEligibleProject"
    );
    await expect(governance.fundTopProject([999])).to.be.revertedWithCustomError(
      governance,
      "InvalidProject"
    );
  });

  it("reverts before minimum funding window", async () => {
    const { governance, governanceBuffer, vault, asset, alice } = await loadFixture(fixture);
    await depositShares(vault, asset, alice, toUSDC("50"));
    const projectId = await submitProject(governance, alice, alice.address, toUSDC("10"), "Soon");
    await asset.mint(await governanceBuffer.getAddress(), toUSDC("10"));
    await expect(governance.fundTopProject([projectId])).to.be.revertedWithCustomError(
      governance,
      "VotingStillActive"
    );
  });

  it("reverts after six-month window ends", async () => {
    const { governance, governanceBuffer, vault, asset, alice } = await loadFixture(fixture);
    await depositShares(vault, asset, alice, toUSDC("50"));
    const projectId = await submitProject(governance, alice, alice.address, toUSDC("10"), "Later");
    await startVoting(governance);
    await governance.connect(alice).vote(projectId);
    await endVoting(governance);
    await asset.mint(await governanceBuffer.getAddress(), toUSDC("10"));
    await expect(governance.fundTopProject([projectId])).to.be.revertedWithCustomError(
      governance,
      "VotingEnded"
    );
  });

  it("prevents double funding", async () => {
    const { governance, governanceBuffer, vault, asset, alice } = await loadFixture(fixture);
    await depositShares(vault, asset, alice, toUSDC("50"));
    const projectId = await submitProject(governance, alice, alice.address, toUSDC("10"), "One");
    await startVoting(governance);
    await governance.connect(alice).vote(projectId);
    await waitFundingWindow(governance);
    await asset.mint(await governanceBuffer.getAddress(), toUSDC("20"));
    await governance.fundTopProject([projectId]);
    await expect(governance.fundTopProject([projectId])).to.be.revertedWithCustomError(
      governance,
      "NoEligibleProject"
    );
  });

  it("selects first candidate in case of vote tie", async () => {
    const { governance, governanceBuffer, vault, asset, alice, bob } = await loadFixture(fixture);
    await depositShares(vault, asset, alice, toUSDC("100"));
    await depositShares(vault, asset, bob, toUSDC("100"));

    const projectA = await submitProject(governance, alice, alice.address, toUSDC("30"), "Alpha");
    const projectB = await submitProject(governance, bob, bob.address, toUSDC("30"), "Beta");
    await startVoting(governance);
    await governance.connect(alice).vote(projectA);
    await governance.connect(bob).vote(projectB);
    await waitFundingWindow(governance);

    await asset.mint(await governanceBuffer.getAddress(), toUSDC("40"));
    await governance.fundTopProject([projectB, projectA]);
    const funded = await governance.projects(projectB);
    expect(funded.funded).to.equal(true);
  });
});

