const { expect } = require("chai");
const { ethers } = require("hardhat");
const equal = require('fast-deep-equal');
const { tasks } = require('hardhat');
const hre = require('hardhat');
const console = require('console');
const { BigNumber, BigInt, FixedFormat, FixedNumber, formatFixed, parseFixed, BigNumberish } = require("@ethersproject/bignumber");
const { Console } = require('console');
const { cwd } = require('process');
const { int, string } = require('hardhat/internal/core/params/argumentTypes');
const { isCallTrace } = require("hardhat/internal/hardhat-network/stack-traces/message-trace");
const Web3 = require('web3');

const domeCoreABI = [
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "stakingcoinAddress",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "owner",
        "type": "address"
      },
      {
        "internalType": "string",
        "name": "_name",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "_description",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "_lpTokenName",
        "type": "string"
      },
      {
        "components": [
          {
            "internalType": "string",
            "name": "name",
            "type": "string"
          },
          {
            "internalType": "string",
            "name": "url",
            "type": "string"
          },
          {
            "internalType": "string",
            "name": "logo",
            "type": "string"
          },
          {
            "internalType": "address",
            "name": "wallet",
            "type": "address"
          },
          {
            "internalType": "string",
            "name": "description",
            "type": "string"
          },
          {
            "internalType": "uint256",
            "name": "percentage",
            "type": "uint256"
          }
        ],
        "internalType": "struct DomeCore3.BeneficiaryInfo[]",
        "name": "beneficiariesInfo",
        "type": "tuple[]"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "owner",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "spender",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "value",
        "type": "uint256"
      }
    ],
    "name": "Approval",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "caller",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "owner",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "assets",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "shares",
        "type": "uint256"
      }
    ],
    "name": "Deposit",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "previousOwner",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "newOwner",
        "type": "address"
      }
    ],
    "name": "OwnershipTransferred",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "from",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "to",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "value",
        "type": "uint256"
      }
    ],
    "name": "Transfer",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "caller",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "receiver",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "owner",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "assets",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "shares",
        "type": "uint256"
      }
    ],
    "name": "Withdraw",
    "type": "event"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "owner",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "spender",
        "type": "address"
      }
    ],
    "name": "allowance",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "spender",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      }
    ],
    "name": "approve",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "asset",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "account",
        "type": "address"
      }
    ],
    "name": "balanceOf",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "beneficiaries",
    "outputs": [
      {
        "internalType": "string",
        "name": "name",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "url",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "logo",
        "type": "string"
      },
      {
        "internalType": "address",
        "name": "wallet",
        "type": "address"
      },
      {
        "internalType": "string",
        "name": "description",
        "type": "string"
      },
      {
        "internalType": "uint256",
        "name": "percentage",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "beneficiariesPercentage",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "totalPercentage",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "shares",
        "type": "uint256"
      }
    ],
    "name": "convertToAssets",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "assets",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "assets",
        "type": "uint256"
      }
    ],
    "name": "convertToShares",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "shares",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "decimals",
    "outputs": [
      {
        "internalType": "uint8",
        "name": "",
        "type": "uint8"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "spender",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "subtractedValue",
        "type": "uint256"
      }
    ],
    "name": "decreaseAllowance",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "receiver",
        "type": "address"
      }
    ],
    "name": "deposit",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "description",
    "outputs": [
      {
        "internalType": "string",
        "name": "",
        "type": "string"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "domeName",
    "outputs": [
      {
        "internalType": "string",
        "name": "",
        "type": "string"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "spender",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "addedValue",
        "type": "uint256"
      }
    ],
    "name": "increaseAllowance",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "liquidityToken",
    "outputs": [
      {
        "internalType": "contract LiquidityToken",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "lpTokenName",
    "outputs": [
      {
        "internalType": "string",
        "name": "",
        "type": "string"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "name": "maxDeposit",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "name": "maxMint",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "owner",
        "type": "address"
      }
    ],
    "name": "maxRedeem",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "owner",
        "type": "address"
      }
    ],
    "name": "maxWithdraw",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "shares",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "receiver",
        "type": "address"
      }
    ],
    "name": "mint",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "name",
    "outputs": [
      {
        "internalType": "string",
        "name": "",
        "type": "string"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "owner",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "assets",
        "type": "uint256"
      }
    ],
    "name": "previewDeposit",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "shares",
        "type": "uint256"
      }
    ],
    "name": "previewMint",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "shares",
        "type": "uint256"
      }
    ],
    "name": "previewRedeem",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "assets",
        "type": "uint256"
      }
    ],
    "name": "previewWithdraw",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "shares",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "receiver",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "owner",
        "type": "address"
      }
    ],
    "name": "redeem",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "renounceOwnership",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "lpProvider",
        "type": "address"
      }
    ],
    "name": "stakingAmount",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "stakingcoin",
    "outputs": [
      {
        "internalType": "contract IERC20",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "symbol",
    "outputs": [
      {
        "internalType": "string",
        "name": "",
        "type": "string"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "testMSTable",
    "outputs": [
      {
        "internalType": "contract TestMStable",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "totalAssets",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "totalSupply",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "to",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      }
    ],
    "name": "transfer",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "from",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "to",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      }
    ],
    "name": "transferFrom",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "newOwner",
        "type": "address"
      }
    ],
    "name": "transferOwnership",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "assets",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "receiver",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "owner",
        "type": "address"
      }
    ],
    "name": "withdraw",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  }
];

async function deployContract(contract, args) {
  console.log(`deploying ${contract}...`);

  let Token = await ethers.getContractFactory(contract);
  let token;
  if (args) {
    console.log(`with args ${args}...`);
    token = await Token.deploy(args);
  }
  else {
    token = await Token.deploy();
  }

  await token.deployed();

  console.log(`${contract} deployed to: `, token.address);

  return token;
}

async function balanceERC20(token, tokenName, user, userName){
  console.log(`${userName} balance in ${tokenName} = `, await token.balanceOf(user.address) / 10**6);
}

async function balanceOfUSDC(user, userName){
  console.log(`${userName} balance in USDC = `, await testUSDC.balanceOf(user.address) / 10**6);
}

async function balanceOfUnderlying(user, userName){
  console.log(`${userName} balance = `, await domeCore.balanceOfUnderlying(user.address) / 10**6);
}

async function deposit(user, userName, amount){
  let am = amount.toString();
  am = am.concat("000000");
  await domeCore.connect(user).deposit(BigNumber.from(`${am}`), user.address);
  console.log(`${userName} staked ${amount} `);
}

async function withdraw(user, userName, amount){
  let am = amount.toString();
  am = am.concat("000000");
  await domeCore.connect(user).withdraw(BigNumber.from(`${am}`), user.address, user.address);
  console.log(`${userName} unstaked ${amount} `);
}

async function redeem(user, userName, amount){
  //let am = amount.toString();
  //am = am.concat("000000");
  await domeCore.connect(user).redeem(amount, user.address, user.address);
  console.log(`${userName} redeem ${amount} `);
}

async function increaseTime(seconds, blocksToMineAfter = 0) {
  await hre.network.provider.send("evm_increaseTime", [seconds]);
  await mineBlocks(blocksToMineAfter);
}

async function mineBlocks(blockNumber) {
  while (blockNumber > 0) {
    blockNumber--;
    //await ethers.network.provider.request({
    await hre.network.provider.request({
      method: "evm_mine",
      params: [],
    });
  }
}

describe("DomeCore", function () {

  let owner, addr1, addr2, addr3, addr4, addr5, addr6, addr7, addr8;
  let testUSDC, domeCreator, testMStable, liquidityToken, domeCore3;
  before(async () => {
    //return;
    testUSDC = await deployContract("TestUSDC");
    domeCreator = await deployContract("TestDomeCreator");
    testSaveMStable = await deployContract("TestSaveMStable", testUSDC.address);
    [owner, addr1, addr2, addr3, addr4, addr5, addr6, addr7, addr8, _] = await ethers.getSigners();
    console.log("=========== Deployed =========");
  });

  // beforeEach(async () => {return
  //   //testMStable = await deployContract("TestMStable", testUSDC.address);
  //   //await domeCreator.CreateDome(testUSDC.address,testSaveMStable.address,addr6.address, "dome", "dome", "lpToken", [["School","url","logo",addr7.address,"For repair",20],["University","url","logo",addr8.address,"For repair",30]]);
  // });

  beforeEach(async () => {
    //testMStable = await deployContract("TestMStable", testUSDC.address);
    await domeCreator.connect(addr4).CreateDome(
      "domeCid",
      "lpToken",
      "XXX",
      testUSDC.address,
      testSaveMStable.address,
      [
        ["Cid1",addr7.address,10],
        ["Cid2",addr8.address,20]
      ],
      {
        value: ethers.utils.parseEther("0.05")
      });
  });

  describe('Staking', () => {
    it('test 1', async () => {return
      
      // domeCore3 = await domeCreator.getDome(owner.address);
      // console.log("domeCore3", domeCore3);
      // domeCore = await hre.ethers.getContractAt("DomeCore3", domeCore3);
    
      // await testUSDC.mint(addr1.address, BigNumber.from('1000000000000000000000000'));

      // await testUSDC.connect(addr1).approve(domeCore.address, BigNumber.from('1000000000000000000000000'));

      // balanceERC20(testUSDC, "TestUSDC", addr1, "Addr1");
      // await domeCore.setMstable(testMStable.address);
      // const addr1Shares = await domeCore.connect(addr1).deposit(BigNumber.from('10000000000000000000000'), addr2.address);
      // //console.log("addr1Shares", addr1Shares);
      // balanceERC20(testUSDC, "TestUSDC", addr1, "Addr1");
      // balanceERC20(testMStable, "testMstable", domeCore, "domeCore");
      // lpTokenn = await domeCore.lpToken();
      // liquidityToken = await hre.ethers.getContractAt("LiquidityToken", lpTokenn);
      // console.log(liquidityToken.address);
      // balanceERC20(liquidityToken, "liquidityToken", addr1, "addr1");
      // balanceERC20(liquidityToken, "liquidityToken", addr2, "addr2");
      // balanceERC20(liquidityToken, "liquidityToken", domeCore, "domecore");
      // await domeCore.connect(addr2).withdraw(BigNumber.from('5000000000000000000000'), addr2.address, addr2.address);
      // await domeCore.connect(addr2).withdraw(BigNumber.from('5000000000000000000000'), addr1.address, addr2.address);

      // balanceERC20(testUSDC, "testUSDC", addr1, "addr1");
      // balanceERC20(testUSDC, "testUSDC", addr2, "addr2");
      // balanceERC20(liquidityToken, "liquidityToken", addr1, "addr1");
    })

    it('test 2', async () => {return
      domeCore2 = await domeCreator.getDome(owner.address);
      console.log("domeCore2", domeCore2);
      domeCore = await hre.ethers.getContractAt("DomeCore2", domeCore2);
      
      await testUSDC.mint(addr1.address, BigNumber.from('10000000000000000000000'));
      await testUSDC.connect(addr1).approve(domeCore.address, BigNumber.from('1000000000000000000000000'));
      await testUSDC.mint(testSaveMStable.address, BigNumber.from('10000000000000000000000000'));

      await testUSDC.mint(addr2.address, BigNumber.from('10000000000000000000000000'));
      await testUSDC.connect(addr2).approve(domeCore.address, BigNumber.from('1000000000000000000000000'));

      await balanceERC20(testUSDC, "TestUSDC", testSaveMStable, "testSaveMstable");

      await testSaveMStable.changeRewardGrowthSpeed(100);
      await balanceERC20(testUSDC, "TestUSDC", addr1, "Addr1");
      await domeCore.connect(addr1).deposit(BigNumber.from('1000000000000000000000'), addr1.address);
      await balanceERC20(testUSDC, "TestUSDC", addr1, "Addr1");

      await balanceERC20(testSaveMStable, "TestSaveMStable", domeCore, "Domecore");
      await mineBlocks(49);
      await balanceERC20(testSaveMStable, "TestSaveMStable", domeCore, "Domecore");
      await balanceERC20(testUSDC, "TestUSDC", addr7, "Addr7");
      await balanceERC20(testUSDC, "TestUSDC", addr8, "Addr8");

      await domeCore.connect(addr2).deposit(BigNumber.from('1000000000000000000000'), addr2.address);

      await domeCore.connect(addr1).withdraw(BigNumber.from('1000000000000000000000'), addr1.address, addr1.address);
      await balanceERC20(testUSDC, "TestUSDC", addr1, "Addr1");
      await balanceERC20(testUSDC, "TestUSDC", addr7, "Addr7");
      await balanceERC20(testUSDC, "TestUSDC", addr8, "Addr8");
      await balanceERC20(testUSDC, "TestUSDC", addr6, "Addr6");
      await balanceERC20(testSaveMStable, "TestSaveMStable", domeCore, "Domecore");

      console.log(`bufer = `,await domeCore.getBuffer()/ 10**18 );
      console.log(`totalStaked = `,await domeCore.getTotalStaked()/ 10**18 );
      await balanceERC20(domeCore, "Domecore", addr1, "addr1");
      await balanceERC20(domeCore, "Domecore", addr2, "addr2");
      await mineBlocks(1);
      console.log(`bufer = `,await domeCore.getBuffer()/ 10**18 );
      console.log(`totalStaked = `,await domeCore.getTotalStaked()/ 10**18 );


      console.log(`addr1 balance = `, await domeCore.balanceOfUnderlying(addr1.address) / 10**18);
      console.log(`addr2 balance = `, await domeCore.balanceOfUnderlying(addr2.address) / 10**18);
      await balanceERC20(testSaveMStable, "TestSaveMStable", domeCore, "Domecore");

    })

    it('test 3', async () => {return
      console.log(await ethers.provider.getBalance(domeCreator.address));

      domeCore2 = await domeCreator.domesOf2(addr4.address);
      domeCore = await hre.ethers.getContractAt("DomeCore", domeCore2);
      
      await testUSDC.mint(testSaveMStable.address, BigNumber.from('10000000000000000000000000'));
      await testUSDC.mint(addr1.address, BigNumber.from('10000000000000000000000'));
      await testUSDC.connect(addr1).approve(domeCore.address, BigNumber.from('1000000000000000000000000'));
      await testUSDC.mint(addr2.address, BigNumber.from('10000000000000000000000000'));
      await testUSDC.connect(addr2).approve(domeCore.address, BigNumber.from('1000000000000000000000000'));
      await testUSDC.mint(addr3.address, BigNumber.from('10000000000000000000000'));
      await testUSDC.connect(addr3).approve(domeCore.address, BigNumber.from('1000000000000000000000000'));

      await testSaveMStable.changeRewardGrowthSpeed(10);

      await deposit(addr1, "addr1", 10000);
      await deposit(addr2, "addr2", 10000);
      
      await mineBlocks(10);

      await balanceERC20(domeCore, "domecore", addr1, "addr1");
      await balanceERC20(domeCore, "domecore", addr2, "addr2");

      console.log(`addr1 balance = `, await domeCore.balanceOfUnderlying(addr1.address) / 10**18);
      console.log(`addr2 balance = `, await domeCore.balanceOfUnderlying(addr2.address) / 10**18);
      

      //await withdraw(addr1, "addr1", 10000);
      // console.log(await ethers.provider.getBalance(owner.address));
      // console.log(await ethers.provider.getBalance(addr4.address));
      // console.log(await ethers.provider.getBalance(domeCreator.address));
      // console.log(await ethers.provider.getBalance(domeCore.address));

      // await domeCreator.withdrawEth(BigNumber.from('30000000000000000'));
      // console.log(await ethers.provider.getBalance(owner.address));
      // console.log(await ethers.provider.getBalance(domeCreator.address));
      
      // console.log(await domeCore.convertToShares(BigNumber.from('10000000000000000000000')));
      // console.log(await domeCore.convertToAssets(BigNumber.from('10000000000000000000000')));
      await deposit(addr3, "addr3", 10000);
      await balanceERC20(domeCore, "domecore", addr3, "addr3");
      console.log(`addr1 balance = `, await domeCore.balanceOfUnderlying(addr1.address) / 10**18);
      console.log(`addr2 balance = `, await domeCore.balanceOfUnderlying(addr2.address) / 10**18);
      console.log(`addr3 balance = `, await domeCore.balanceOfUnderlying(addr3.address) / 10**18);
      await withdraw(addr1, "addr1", 10000);
      await balanceERC20(testUSDC, "testusdc", addr6, "addr6");
      await balanceERC20(testUSDC, "testusdc", addr7, "addr7");
      await balanceERC20(testUSDC, "testusdc", addr8, "addr8");
      await withdraw(addr2, "addr2", 10000);
      await balanceERC20(testUSDC, "testusdc", addr6, "addr6");
      await balanceERC20(testUSDC, "testusdc", addr7, "addr7");
      await balanceERC20(testUSDC, "testusdc", addr8, "addr8");
      




      //console.log(`totalStaked = `,await domeCore.getTotalStaked()/ 10**18 );


    })

    it('test 4', async () => {
      console.log(await ethers.provider.getBalance(domeCreator.address));

      domeCore2 = await domeCreator.domesOf2(addr4.address);
      domeCore = await hre.ethers.getContractAt("DomeCore", domeCore2);
      
      await testUSDC.mint(testSaveMStable.address, BigNumber.from('1000000000000'));
      await testUSDC.mint(addr1.address, BigNumber.from('1000000000000'));
      await testUSDC.connect(addr1).approve(domeCore.address, BigNumber.from('1000000000000'));
      await testUSDC.mint(addr2.address, BigNumber.from('1000000000000'));
      await testUSDC.connect(addr2).approve(domeCore.address, BigNumber.from('1000000000000'));
      await testUSDC.mint(addr3.address, BigNumber.from('1000000000000'));
      await testUSDC.connect(addr3).approve(domeCore.address, BigNumber.from('1000000000000'));

      await testSaveMStable.changeRewardGrowthSpeed(10);

      await deposit(addr1, "addr1", 10000);
      await deposit(addr2, "addr2", 10000);
      
      //await mineBlocks(10);

      await balanceERC20(domeCore, "domecore", addr1, "addr1");
      await balanceERC20(domeCore, "domecore", addr2, "addr2");
      await balanceOfUnderlying(addr1, "addr1");
      await balanceOfUnderlying(addr2, "addr2");

      
      

      await redeem(addr1, "addr1", 10000000000);
      await redeem(addr2, "addr2", 9993703966);
      // await withdraw(addr1, "addr1", 2000);
      // await withdraw(addr1, "addr1", 3000);
      // await withdraw(addr1, "addr1", 5000);
      // await withdraw(addr1, "addr1", 10000);
      // console.log(await ethers.provider.getBalance(owner.address));
      // console.log(await ethers.provider.getBalance(addr4.address));
      // console.log(await ethers.provider.getBalance(domeCreator.address));
      // console.log(await ethers.provider.getBalance(domeCore.address));

      // await domeCreator.withdrawEth(BigNumber.from('30000000000000000'));
      // console.log(await ethers.provider.getBalance(owner.address));
      // console.log(await ethers.provider.getBalance(domeCreator.address));
      
      // console.log(await domeCore.convertToShares(BigNumber.from('10000000000000000000000')));
      // console.log(await domeCore.convertToAssets(BigNumber.from('10000000000000000000000')));



      // await deposit(addr3, "addr3", 10000);
      // await balanceERC20(domeCore, "domecore", addr3, "addr3");
      // console.log(`addr1 balance = `, await domeCore.balanceOfUnderlying(addr1.address) / 10**18);
      // console.log(`addr2 balance = `, await domeCore.balanceOfUnderlying(addr2.address) / 10**18);
      // console.log(`addr3 balance = `, await domeCore.balanceOfUnderlying(addr3.address) / 10**18);
      // await withdraw(addr1, "addr1", 10000);
      // await balanceERC20(testUSDC, "testusdc", addr6, "addr6");
      // await balanceERC20(testUSDC, "testusdc", addr7, "addr7");
      // await balanceERC20(testUSDC, "testusdc", addr8, "addr8");
      // await withdraw(addr2, "addr2", 10000);
      // await balanceERC20(testUSDC, "testusdc", addr6, "addr6");
      // await balanceERC20(testUSDC, "testusdc", addr7, "addr7");
      // await balanceERC20(testUSDC, "testusdc", addr8, "addr8");
      




      //console.log(`totalStaked = `,await domeCore.getTotalStaked()/ 10**18 );


    })
  })

});
