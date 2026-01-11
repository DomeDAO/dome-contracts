import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

import {
  MockUSDC,
  MockStrategyVault,
  Governance,
  GovernanceBuffer,
  Vault,
  Share,
} from "../../typechain-types";

export const SHARE_SCALAR = 1_000_000_000_000n;

export async function deployVaultFixture(): Promise<{
  deployer: SignerWithAddress;
  alice: SignerWithAddress;
  bob: SignerWithAddress;
  carol: SignerWithAddress;
  asset: MockUSDC;
  strategy: MockStrategyVault;
  share: Share;
  governanceBuffer: GovernanceBuffer;
  vault: Vault;
  governance: Governance;
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

  const ShareFactory = await ethers.getContractFactory("Share");
  const share = (await ShareFactory.deploy("Dome Risk Share", "DRS", predictedVault)) as Share;
  await share.waitForDeployment();

  const BufferFactory = await ethers.getContractFactory("GovernanceBuffer");
  const governanceBuffer = (await BufferFactory.deploy(
    await asset.getAddress(),
    ethers.ZeroAddress
  )) as GovernanceBuffer;
  await governanceBuffer.waitForDeployment();

  const GovernanceFactory = await ethers.getContractFactory("Governance");
  const governance = (await GovernanceFactory.deploy(
    await asset.getAddress(),
    await share.getAddress(),
    await governanceBuffer.getAddress()
  )) as Governance;
  await governance.waitForDeployment();

  await (await governanceBuffer.setGovernance(await governance.getAddress())).wait();

  const VaultFactory = await ethers.getContractFactory("Vault");
  const donationBps = 1_000; // 10%
  const vault = (await VaultFactory.deploy(
    await asset.getAddress(),
    await share.getAddress(),
    await strategy.getAddress(),
    donationBps,
    await governance.getAddress(),
    await governanceBuffer.getAddress()
  )) as Vault;
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
