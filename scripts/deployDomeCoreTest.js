// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const hre = require("hardhat");

async function main() {
  // Hardhat always runs the compile task when running scripts with its command
  // line interface.
  //
  // If this script is run directly using `node` you may want to call compile
  // manually to make sure everything is compiled
  // await hre.run('compile');

  const usdc = "0xD29CCeA8e85ccF5f2c50dca8C9ADE682f54573Eb";
  const myWallet = "0x9C5304Cf9066a860672BA5cf7f1C4592DCf20f56";
  const owner = "0xAE492E3873945F9af9B6caD802e030e2935073cE";
  const testSaveMStable = "0xc270D310bc7650492B528C3b6c5fd04eFF33A5ce";


  // We get the contract to deploy
  const DomeCore = await hre.ethers.getContractFactory("DomeCore");
  const domeCore = await DomeCore.deploy(
    [
      "TestDomeCID","TestDome","TDT"
    ],
      usdc,
      testSaveMStable,
      testSaveMStable,
      testSaveMStable,
      testSaveMStable,
      owner,
      owner,
      10,
      [
        [
          "QmYDh63k84d368ff8HQBs1fFdBPg3GYiapkKqeWAFLFVps","0xAE492E3873945F9af9B6caD802e030e2935073cE",20
        ],
        [
          "QmRpVTVJwQSo3mvJ3weEt37vZ34HQvH8ofgH84q5fX6i64","0xf38CFd68632849a9499857411D883B86a4b73bb2",40
        ]
      ]
    );

  await domeCore.deployed();

  console.log("DomeCore deployed to:", domeCore.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
