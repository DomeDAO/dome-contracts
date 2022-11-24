// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const hre = require("hardhat");

const verifyContract = async (
  contractAddress,
  args,
) => {
  try {
    const tx = await hre.run("verify:verify", {
      address: contractAddress,
      constructorArguments: args
    });
    console.log(tx);

    await sleep(16000);
  } catch (error) {
    console.log("error is ->");
    console.log(error);
    console.log("cannot verify contract", contractAddress);
    await sleep(16000);
  }
  console.log("contract", contractAddress, "verified successfully");
};

async function main() {
  // Hardhat always runs the compile task when running scripts with its command
  // line interface.
  //
  // If this script is run directly using `node` you may want to call compile
  // manually to make sure everything is compiled
  // await hre.run('compile');

  // We get the contract to deploy
  const DomeCreator = await hre.ethers.getContractFactory("DomeCreator");
  const domeCreator = await DomeCreator.deploy();

  await domeCreator.deployed();

  console.log("DomeCreator deployed to:", domeCreator.address);
  
  //await verifyContract(domeCreator, []);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
