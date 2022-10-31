// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const hre = require("hardhat");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const verifyContract = async (
  contractAddress,
  args,
) => {
  try {
    await hre.run("verify:verify", {
      address: contractAddress,
      constructorArguments: args
    });
    
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

  const usdc = "0x53CEafDCC6aB218899B689979451490469ef83b7";
  const myWallet1 = "0x9C5304Cf9066a860672BA5cf7f1C4592DCf20f56";
  const myWallet2 = "0xC95cE5A64b5f2d3772Ee6B9adF9AA27d7fF2b68D";
  const owner = "0xAE492E3873945F9af9B6caD802e030e2935073cE";
  const domeCore = "0x9745e90a0490Fc19a9960cA23Ef618cFa623c561";
  const testSaveMStable = "0xc270D310bc7650492B528C3b6c5fd04eFF33A5ce";


  await hre.run("verify:verify", {
    address: domeCore,
    constructorArguments: [
      "Dome2",
      "Second dome",
      "DomeToken",
      "DT",
      usdc,
      testSaveMStable,
      owner,
      owner,
      10,
      [
        [
          "School","url","logo","0xC9d60D366E5A1b0789453A9f831338dd53Afd632","For repair",20
        ],
        [
          "University","url","logo","0x9C5304Cf9066a860672BA5cf7f1C4592DCf20f56","For repair",10
        ]
      ]
    ]
  })

  // await hre.run("verify:verify", {
  //   address: "0x91e985634F4690e8B79872F5C29Be357eDC0fF9c",
  //   constructorArguments: [
  //     "TokenXXX",
  //     "XXX"
  //   ]
  // })
  // We get the contract to deploy

  

}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
