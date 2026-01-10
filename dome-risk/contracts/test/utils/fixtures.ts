import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

import {
  MockUSDC,
  MockStrategyVault,
  NGOGovernance,
  NGOGovernanceBuffer,
  NGOVault,
  NGOShare,
} from "../../typechain-types";

export const SHARE_SCALAR = 1_000_000_000_000n;

export async function deployVaultFixture(): Promise<{
  deployer: SignerWithAddress;
  alice: SignerWithAddress;
  bob: SignerWithAddress;
  carol: SignerWithAddress;
  asset: MockUSDC;
  strategy: MockStrategyVault;
  share: NGOShare;
  governanceBuffer: NGOGovernanceBuffer;
  vault: NGOVault;
  governance: NGOGovernance;
}> {
  const [deployer, alice, bob, carol] = await ethers.getSigners();

  const MockUSDCFactory = await ethers.getContractFactory("MockUSDC");
  const asset = (await MockUSDCFactory.deploy()) as MockUSDC;
  await asset.waitForDeployment();

  const MockStrategy = await ethers.getContractFactory("MockStrategyVault");
  const strategy = (await MockStrategy.deploy(await asset.getAddress())) as MockStrategyVault;
  await strategy.waitForDeployment();

  const initialMint = ethers.parseUnits("1000000", 6);
  for (const signer of [alice, bob, carol]) {
    await asset.mint(signer.address, initialMint);
  }

  const nonce = await deployer.getNonce();
  const predictedVault = ethers.getCreateAddress({ from: deployer.address, nonce: nonce + 4 });

  const NGOShareFactory = await ethers.getContractFactory("NGOShare");
  const share = (await NGOShareFactory.deploy("NGO Share", "NGOS", predictedVault)) as NGOShare;
  await share.waitForDeployment();

  const BufferFactory = await ethers.getContractFactory("NGOGovernanceBuffer");
  const governanceBuffer = (await BufferFactory.deploy(
    await asset.getAddress(),
    ethers.ZeroAddress
  )) as NGOGovernanceBuffer;
  await governanceBuffer.waitForDeployment();

  const NGOGovernanceFactory = await ethers.getContractFactory("NGOGovernance");
  const governance = (await NGOGovernanceFactory.deploy(
    await asset.getAddress(),
    await share.getAddress(),
    await governanceBuffer.getAddress()
  )) as NGOGovernance;
  await governance.waitForDeployment();

  await (await governanceBuffer.setGovernance(await governance.getAddress())).wait();

  const NGOVaultFactory = await ethers.getContractFactory("NGOVault");
  const donationBps = 1_000; // 10%
  const vault = (await NGOVaultFactory.deploy(
    await asset.getAddress(),
    await share.getAddress(),
    await strategy.getAddress(),
    donationBps,
    await governance.getAddress(),
    await governanceBuffer.getAddress()
  )) as NGOVault;
  await vault.waitForDeployment();

  return {
    deployer,
    alice,
    bob,
    carol,
    asset,
    strategy,
    share,
    governanceBuffer,
    vault,
    governance,
  };
}

