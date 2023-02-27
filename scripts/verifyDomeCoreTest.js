// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const hre = require("hardhat");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// const verifyContract = async (
//   contractAddress,
//   args,
// ) => {
//   try {
//     await hre.run("verify:verify", {
//       address: contractAddress,
//       constructorArguments: args
//     });
    
//     await sleep(16000);
//   } catch (error) {
//     console.log("error is ->");
//     console.log(error);
//     console.log("cannot verify contract", contractAddress);
//     await sleep(16000);
//   }
//   console.log("contract", contractAddress, "verified successfully");
// };

async function main() {
  // Hardhat always runs the compile task when running scripts with its command
  // line interface.
  //
  // If this script is run directly using `node` you may want to call compile
  // manually to make sure everything is compiled
  // await hre.run('compile');

  const domeCore = "0x4Aa11d4a6EA97f8c8548A031315Ea6B75E3ea43c";
  const _domeCID = "TestDomeCID";
  const shareTokenName = "TestDome";
  const shareTokenSymbol = "TDT";
  const messageSender = "0xAE492E3873945F9af9B6caD802e030e2935073cE";
  const systemOwner = "0xAE492E3873945F9af9B6caD802e030e2935073cE";
  const stakingCoinAddress = "0xD29CCeA8e85ccF5f2c50dca8C9ADE682f54573Eb";
  const mUSDSavingsContractAddress = "0xc270D310bc7650492B528C3b6c5fd04eFF33A5ce";
  const mUSDTokenAddress = "0xc270D310bc7650492B528C3b6c5fd04eFF33A5ce";
  const mAssetSaveWrapperAddress = "0xc270D310bc7650492B528C3b6c5fd04eFF33A5ce";
  const mUSDSavingsVaultAddress = "0xc270D310bc7650492B528C3b6c5fd04eFF33A5ce";
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
          "QmYDh63k84d368ff8HQBs1fFdBPg3GYiapkKqeWAFLFVps","0xAE492E3873945F9af9B6caD802e030e2935073cE",20
        ],
        [
          "QmRpVTVJwQSo3mvJ3weEt37vZ34HQvH8ofgH84q5fX6i64","0xf38CFd68632849a9499857411D883B86a4b73bb2",40
        ]
      ]
    ],
    contract: "contracts/DomeCore.sol:DomeCore"
  });
  
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
