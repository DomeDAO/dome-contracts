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

  const domeCore = "";
  const _domeCID = "";
  const shareTokenName = "";
  const shareTokenSymbol = "";
  const messageSender = "";
  const systemOwner = "";
  const stakingCoinAddress = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
  const mUSDSavingsContractAddress = "0x30647a72Dc82d7Fbb1123EA74716aB8A317Eac19";
  const mUSDTokenAddress = "0xe2f2a5C287993345a840Db3B0845fbC70f5935a5";
  const mAssetSaveWrapperAddress = "0x0CA7A25181FC991e3cC62BaC511E62973991f325";
  const mUSDSavingsVaultAddress = "0x78BefCa7de27d07DC6e71da295Cc2946681A6c7B";
  const systemOwnerPercentage = 10;

  
  
  await hre.run("verify:verify", {
    address: domeCore,
    constructorArguments: [
      [
        _domeCID, shareTokenName, shareTokenSymbol
      ],
      stakingCoinAddress,
      mUSDSavingsContractAddress,
      mUSDTokenAddress,
      mAssetSaveWrapperAddress,
      mUSDSavingsVaultAddress,
      messageSender,
      systemOwner,
      systemOwnerPercentage,
      [
        [
          "","",50
        ]
      ]
    ],
    contract: "contracts/Test/TestDomeCore.sol:TestDomeCore"
  });
  
  // await verifyContract(domeCore, [
  //   "QmQaXQ8mSXeRkEnLGN3beuVH6HmxjPCwozcE6fDt2WwR2T",
  //   "TestDome",
  //   "TD",
  //   "0xD29CCeA8e85ccF5f2c50dca8C9ADE682f54573Eb",
  //   "0x17400Efb007633B04a9866E312961b8252d9E959",
  //   "0x51dee7730fec3f50e8cd1922dc4aafc65fcc833a",
  //   "0xAE492E3873945F9af9B6caD802e030e2935073cE",
  //   10,
  //   [
  //     [
  //       'QmQ3dsj2h3cy2pn3t18s378LEDUMUesQGxxFfvbBacgJWq',"0x51dee7730fEC3F50E8cd1922DC4AaFC65fCC833a",50
  //     ]
  //   ]
  // ]);

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
