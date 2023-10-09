const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { POLYGON, ETHEREUM } = require("./constants");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("Dome-DAO", function () {
  async function deployDomeFactory() {
    const [owner, otherAccount] = await ethers.getSigners();

    const DomeFactrory = await ethers.getContractFactory("DomeFactory");
    const domeCreationFee = ethers.utils.parseEther("1");
    const systemOwnerPercentage = 1000;

    const domeFactory = await DomeFactrory.deploy(
      systemOwnerPercentage,
      domeCreationFee
    );

    return {
      domeFactory,
      domeCreationFee,
      systemOwnerPercentage,
      owner,
      otherAccount,
    };
  }

  describe("Dome-DAO", function () {
    describe("DomeFactory", function () {
      describe("Deployment", function () {
        it("Should set right owner", async function () {
          const { domeFactory, owner } = await loadFixture(deployDomeFactory);

          expect(await domeFactory.owner()).to.be.equal(owner.address);
        });

        it("Should set dome creation fee", async function () {
          const { domeFactory, domeCreationFee } =
            await loadFixture(deployDomeFactory);

          expect(await domeFactory.domeCreationFee()).to.be.equal(
            domeCreationFee
          );
        });

        it("Should set system owenr fee", async function () {
          const { domeFactory, systemOwnerPercentage } =
            await loadFixture(deployDomeFactory);

          expect(await domeFactory.systemOwnerPercentage()).to.be.equal(
            systemOwnerPercentage
          );
        });
      });

      describe("Validations", function () {
        it("Should revert creation with the right error if fee is not payed ", async function () {
          const { domeFactory, otherAccount } =
            await loadFixture(deployDomeFactory);

          const domeCID = "dome";
          const domeTokenName = "domeToken";
          const domeTokenSymbol = "domeToken";
          const domeInfo = [domeCID, domeTokenName, domeTokenSymbol];

          const beneficiaryCID = "beneficiary";
          const beneficiaryAddress = otherAccount.address;
          const beneficiaryPercent = 10000;

          const beneficiary = [
            beneficiaryCID,
            beneficiaryAddress,
            beneficiaryPercent,
          ];

          const beneficiariesInfo = [beneficiary];
          const yieldProtocol = POLYGON.YIELD_PROTOCOLS.AAVE_POLYGON_USDC;
          const depositorYieldPercent = 1000;

          await expect(
            domeFactory
              .connect(otherAccount)
              .createDome(
                domeInfo,
                beneficiariesInfo,
                depositorYieldPercent,
                yieldProtocol
              )
          ).to.be.revertedWith("You must pay <domeCreationFee>");
        });

        it("Should revert creation with the right error if fee is partly payed ", async function () {
          const { domeFactory, otherAccount, domeCreationFee } =
            await loadFixture(deployDomeFactory);

          const domeCID = "dome";
          const domeTokenName = "domeToken";
          const domeTokenSymbol = "domeToken";
          const domeInfo = [domeCID, domeTokenName, domeTokenSymbol];

          const beneficiaryCID = "beneficiary";
          const beneficiaryAddress = otherAccount.address;
          const beneficiaryPercent = 10000;

          const beneficiary = [
            beneficiaryCID,
            beneficiaryAddress,
            beneficiaryPercent,
          ];

          const beneficiariesInfo = [beneficiary];
          const yieldProtocol = POLYGON.YIELD_PROTOCOLS.AAVE_POLYGON_USDC;
          const depositorYieldPercent = 1000;

          await expect(
            domeFactory
              .connect(otherAccount)
              .createDome(
                domeInfo,
                beneficiariesInfo,
                depositorYieldPercent,
                yieldProtocol,
                { value: domeCreationFee.div(2) }
              )
          ).to.be.revertedWith("You must pay <domeCreationFee>");
        });

        it("Should allow creation if fee is payed ", async function () {
          const { domeFactory, otherAccount, domeCreationFee } =
            await loadFixture(deployDomeFactory);

          const domeCID = "dome";
          const domeTokenName = "domeToken";
          const domeTokenSymbol = "domeToken";
          const domeInfo = [domeCID, domeTokenName, domeTokenSymbol];

          const beneficiaryCID = "beneficiary";
          const beneficiaryAddress = otherAccount.address;
          const beneficiaryPercent = 10000;

          const beneficiary = [
            beneficiaryCID,
            beneficiaryAddress,
            beneficiaryPercent,
          ];

          const beneficiariesInfo = [beneficiary];
          const yieldProtocol = POLYGON.YIELD_PROTOCOLS.AAVE_POLYGON_USDC;
          const depositorYieldPercent = 1000;

          await expect(
            domeFactory
              .connect(otherAccount)
              .createDome(
                domeInfo,
                beneficiariesInfo,
                depositorYieldPercent,
                yieldProtocol,
                { value: domeCreationFee }
              )
          ).to.be.fulfilled;
        });

        it("Should change contract ballance after successful dome creation ", async function () {
          const { domeFactory, otherAccount, domeCreationFee } =
            await loadFixture(deployDomeFactory);

          const domeCID = "dome";
          const domeTokenName = "domeToken";
          const domeTokenSymbol = "domeToken";
          const domeInfo = [domeCID, domeTokenName, domeTokenSymbol];

          const beneficiaryCID = "beneficiary";
          const beneficiaryAddress = otherAccount.address;
          const beneficiaryPercent = 10000;

          const beneficiary = [
            beneficiaryCID,
            beneficiaryAddress,
            beneficiaryPercent,
          ];

          const beneficiariesInfo = [beneficiary];
          const yieldProtocol = POLYGON.YIELD_PROTOCOLS.AAVE_POLYGON_USDC;
          const depositorYieldPercent = 1000;

          await expect(
            domeFactory
              .connect(otherAccount)
              .createDome(
                domeInfo,
                beneficiariesInfo,
                depositorYieldPercent,
                yieldProtocol,
                { value: domeCreationFee }
              )
          ).to.changeEtherBalances(
            [otherAccount.address, domeFactory.address],
            [domeCreationFee.mul(-1), domeCreationFee]
          );
        });
      });

      describe("Events", function () {
        it("Should emit a dome creation event dome creation", async function () {
          const { domeFactory, otherAccount, domeCreationFee } =
            await loadFixture(deployDomeFactory);

          const domeCID = "dome";
          const domeTokenName = "domeToken";
          const domeTokenSymbol = "domeToken";
          const domeInfo = [domeCID, domeTokenName, domeTokenSymbol];

          const beneficiaryCID = "beneficiary";
          const beneficiaryAddress = otherAccount.address;
          const beneficiaryPercent = 10000;

          const beneficiary = [
            beneficiaryCID,
            beneficiaryAddress,
            beneficiaryPercent,
          ];

          const beneficiariesInfo = [beneficiary];
          const yieldProtocol = POLYGON.YIELD_PROTOCOLS.AAVE_POLYGON_USDC;
          const depositorYieldPercent = 1000;

          await expect(
            domeFactory
              .connect(otherAccount)
              .createDome(
                domeInfo,
                beneficiariesInfo,
                depositorYieldPercent,
                yieldProtocol,
                { value: domeCreationFee }
              )
          )
            .to.emit(domeFactory, "DomeCreated")
            .withArgs(
              otherAccount.address,
              anyValue,
              yieldProtocol,
              domeInfo[0]
            );
        });
      });

      describe("Ownership", function () {
        it("Shouldn't allow another accounts to withdraw creation fees", async function () {
          const { domeFactory, otherAccount, domeCreationFee } =
            await loadFixture(deployDomeFactory);

          const domeCID = "dome";
          const domeTokenName = "domeToken";
          const domeTokenSymbol = "domeToken";
          const domeInfo = [domeCID, domeTokenName, domeTokenSymbol];

          const beneficiaryCID = "beneficiary";
          const beneficiaryAddress = otherAccount.address;
          const beneficiaryPercent = 10000;

          const beneficiary = [
            beneficiaryCID,
            beneficiaryAddress,
            beneficiaryPercent,
          ];

          const beneficiariesInfo = [beneficiary];
          const yieldProtocol = POLYGON.YIELD_PROTOCOLS.AAVE_POLYGON_USDC;
          const depositorYieldPercent = 1000;

          await expect(
            domeFactory
              .connect(otherAccount)
              .createDome(
                domeInfo,
                beneficiariesInfo,
                depositorYieldPercent,
                yieldProtocol,
                { value: domeCreationFee }
              )
          ).to.changeEtherBalances(
            [otherAccount.address, domeFactory.address],
            [domeCreationFee.mul(-1), domeCreationFee]
          );

          await expect(
            domeFactory.connect(otherAccount).withdraw(otherAccount.address)
          ).to.be.revertedWith("Ownable: caller is not the owner");
        });

        it("Should allow contract owner to withdraw fees", async function () {
          const { owner, domeFactory, otherAccount, domeCreationFee } =
            await loadFixture(deployDomeFactory);

          const domeCID = "dome";
          const domeTokenName = "domeToken";
          const domeTokenSymbol = "domeToken";
          const domeInfo = [domeCID, domeTokenName, domeTokenSymbol];

          const beneficiaryCID = "beneficiary";
          const beneficiaryAddress = otherAccount.address;
          const beneficiaryPercent = 10000;

          const beneficiary = [
            beneficiaryCID,
            beneficiaryAddress,
            beneficiaryPercent,
          ];

          const beneficiariesInfo = [beneficiary];
          const yieldProtocol = POLYGON.YIELD_PROTOCOLS.AAVE_POLYGON_USDC;
          const depositorYieldPercent = 1000;

          await expect(
            domeFactory
              .connect(otherAccount)
              .createDome(
                domeInfo,
                beneficiariesInfo,
                depositorYieldPercent,
                yieldProtocol,
                { value: domeCreationFee }
              )
          ).to.changeEtherBalances(
            [otherAccount.address, domeFactory.address],
            [domeCreationFee.mul(-1), domeCreationFee]
          );

          await expect(
            domeFactory.connect(owner).withdraw(owner.address)
          ).to.changeEtherBalances(
            [domeFactory.address, owner.address],
            [domeCreationFee.mul(-1), domeCreationFee]
          );
        });

        it("Should allow contract owner to change system owner percentage", async function () {
          const { owner, domeFactory } = await loadFixture(deployDomeFactory);

          const newSystemOwnerPercentage = 2000;
          await expect(
            domeFactory
              .connect(owner)
              .changeSystemOwnerPercentage(newSystemOwnerPercentage)
          ).to.be.fulfilled;

          expect(await domeFactory.systemOwnerPercentage()).to.be.equal(
            newSystemOwnerPercentage
          );
        });
      });
    });

    describe("DomeCore", function () {
      describe("Deployment", function () {
        it("Should set right owner", async function () {
          const { domeFactory, owner } = await loadFixture(deployDomeFactory);

          expect(await domeFactory.owner()).to.be.equal(owner.address);
        });

        it("Should set dome creation fee", async function () {
          const { domeFactory, domeCreationFee } =
            await loadFixture(deployDomeFactory);

          expect(await domeFactory.domeCreationFee()).to.be.equal(
            domeCreationFee
          );
        });

        it("Should set system owenr fee", async function () {
          const { domeFactory, systemOwnerPercentage } =
            await loadFixture(deployDomeFactory);

          expect(await domeFactory.systemOwnerPercentage()).to.be.equal(
            systemOwnerPercentage
          );
        });
      });

      describe("Validations", function () {
        it("Should revert creation with the right error if fee is not payed ", async function () {
          const { domeFactory, otherAccount } =
            await loadFixture(deployDomeFactory);

          const domeCID = "dome";
          const domeTokenName = "domeToken";
          const domeTokenSymbol = "domeToken";
          const domeInfo = [domeCID, domeTokenName, domeTokenSymbol];

          const beneficiaryCID = "beneficiary";
          const beneficiaryAddress = otherAccount.address;
          const beneficiaryPercent = 10000;

          const beneficiary = [
            beneficiaryCID,
            beneficiaryAddress,
            beneficiaryPercent,
          ];

          const beneficiariesInfo = [beneficiary];
          const yieldProtocol = POLYGON.YIELD_PROTOCOLS.AAVE_POLYGON_USDC;
          const depositorYieldPercent = 1000;

          await expect(
            domeFactory
              .connect(otherAccount)
              .createDome(
                domeInfo,
                beneficiariesInfo,
                depositorYieldPercent,
                yieldProtocol
              )
          ).to.be.revertedWith("You must pay <domeCreationFee>");
        });

        it("Should revert creation with the right error if fee is partly payed ", async function () {
          const { domeFactory, otherAccount, domeCreationFee } =
            await loadFixture(deployDomeFactory);

          const domeCID = "dome";
          const domeTokenName = "domeToken";
          const domeTokenSymbol = "domeToken";
          const domeInfo = [domeCID, domeTokenName, domeTokenSymbol];

          const beneficiaryCID = "beneficiary";
          const beneficiaryAddress = otherAccount.address;
          const beneficiaryPercent = 10000;

          const beneficiary = [
            beneficiaryCID,
            beneficiaryAddress,
            beneficiaryPercent,
          ];

          const beneficiariesInfo = [beneficiary];
          const yieldProtocol = POLYGON.YIELD_PROTOCOLS.AAVE_POLYGON_USDC;
          const depositorYieldPercent = 1000;

          await expect(
            domeFactory
              .connect(otherAccount)
              .createDome(
                domeInfo,
                beneficiariesInfo,
                depositorYieldPercent,
                yieldProtocol,
                { value: domeCreationFee.div(2) }
              )
          ).to.be.revertedWith("You must pay <domeCreationFee>");
        });

        it("Should allow creation if fee is payed ", async function () {
          const { domeFactory, otherAccount, domeCreationFee } =
            await loadFixture(deployDomeFactory);

          const domeCID = "dome";
          const domeTokenName = "domeToken";
          const domeTokenSymbol = "domeToken";
          const domeInfo = [domeCID, domeTokenName, domeTokenSymbol];

          const beneficiaryCID = "beneficiary";
          const beneficiaryAddress = otherAccount.address;
          const beneficiaryPercent = 10000;

          const beneficiary = [
            beneficiaryCID,
            beneficiaryAddress,
            beneficiaryPercent,
          ];

          const beneficiariesInfo = [beneficiary];
          const yieldProtocol = POLYGON.YIELD_PROTOCOLS.AAVE_POLYGON_USDC;
          const depositorYieldPercent = 1000;

          await expect(
            domeFactory
              .connect(otherAccount)
              .createDome(
                domeInfo,
                beneficiariesInfo,
                depositorYieldPercent,
                yieldProtocol,
                { value: domeCreationFee }
              )
          ).to.be.fulfilled;
        });

        it("Should change contract ballance after successful dome creation ", async function () {
          const { domeFactory, otherAccount, domeCreationFee } =
            await loadFixture(deployDomeFactory);

          const domeCID = "dome";
          const domeTokenName = "domeToken";
          const domeTokenSymbol = "domeToken";
          const domeInfo = [domeCID, domeTokenName, domeTokenSymbol];

          const beneficiaryCID = "beneficiary";
          const beneficiaryAddress = otherAccount.address;
          const beneficiaryPercent = 10000;

          const beneficiary = [
            beneficiaryCID,
            beneficiaryAddress,
            beneficiaryPercent,
          ];

          const beneficiariesInfo = [beneficiary];
          const yieldProtocol = POLYGON.YIELD_PROTOCOLS.AAVE_POLYGON_USDC;
          const depositorYieldPercent = 1000;

          await expect(
            domeFactory
              .connect(otherAccount)
              .createDome(
                domeInfo,
                beneficiariesInfo,
                depositorYieldPercent,
                yieldProtocol,
                { value: domeCreationFee }
              )
          ).to.changeEtherBalances(
            [otherAccount.address, domeFactory.address],
            [domeCreationFee.mul(-1), domeCreationFee]
          );
        });
      });

      describe("Events", function () {
        it("Should emit a dome creation event dome creation", async function () {
          const { domeFactory, otherAccount, domeCreationFee } =
            await loadFixture(deployDomeFactory);

          const domeCID = "dome";
          const domeTokenName = "domeToken";
          const domeTokenSymbol = "domeToken";
          const domeInfo = [domeCID, domeTokenName, domeTokenSymbol];

          const beneficiaryCID = "beneficiary";
          const beneficiaryAddress = otherAccount.address;
          const beneficiaryPercent = 10000;

          const beneficiary = [
            beneficiaryCID,
            beneficiaryAddress,
            beneficiaryPercent,
          ];

          const beneficiariesInfo = [beneficiary];
          const yieldProtocol = POLYGON.YIELD_PROTOCOLS.AAVE_POLYGON_USDC;
          const depositorYieldPercent = 1000;

          await expect(
            domeFactory
              .connect(otherAccount)
              .createDome(
                domeInfo,
                beneficiariesInfo,
                depositorYieldPercent,
                yieldProtocol,
                { value: domeCreationFee }
              )
          )
            .to.emit(domeFactory, "DomeCreated")
            .withArgs(
              otherAccount.address,
              anyValue,
              yieldProtocol,
              domeInfo[0]
            );
        });
      });

      describe("Ownership", function () {
        it("Shouldn't allow another accounts to withdraw creation fees", async function () {
          const { domeFactory, otherAccount, domeCreationFee } =
            await loadFixture(deployDomeFactory);

          const domeCID = "dome";
          const domeTokenName = "domeToken";
          const domeTokenSymbol = "domeToken";
          const domeInfo = [domeCID, domeTokenName, domeTokenSymbol];

          const beneficiaryCID = "beneficiary";
          const beneficiaryAddress = otherAccount.address;
          const beneficiaryPercent = 10000;

          const beneficiary = [
            beneficiaryCID,
            beneficiaryAddress,
            beneficiaryPercent,
          ];

          const beneficiariesInfo = [beneficiary];
          const yieldProtocol = POLYGON.YIELD_PROTOCOLS.AAVE_POLYGON_USDC;
          const depositorYieldPercent = 1000;

          await expect(
            domeFactory
              .connect(otherAccount)
              .createDome(
                domeInfo,
                beneficiariesInfo,
                depositorYieldPercent,
                yieldProtocol,
                { value: domeCreationFee }
              )
          ).to.changeEtherBalances(
            [otherAccount.address, domeFactory.address],
            [domeCreationFee.mul(-1), domeCreationFee]
          );

          await expect(
            domeFactory.connect(otherAccount).withdraw(otherAccount.address)
          ).to.be.revertedWith("Ownable: caller is not the owner");
        });

        it("Should allow contract owner to withdraw fees", async function () {
          const { owner, domeFactory, otherAccount, domeCreationFee } =
            await loadFixture(deployDomeFactory);

          const domeCID = "dome";
          const domeTokenName = "domeToken";
          const domeTokenSymbol = "domeToken";
          const domeInfo = [domeCID, domeTokenName, domeTokenSymbol];

          const beneficiaryCID = "beneficiary";
          const beneficiaryAddress = otherAccount.address;
          const beneficiaryPercent = 10000;

          const beneficiary = [
            beneficiaryCID,
            beneficiaryAddress,
            beneficiaryPercent,
          ];

          const beneficiariesInfo = [beneficiary];
          const yieldProtocol = POLYGON.YIELD_PROTOCOLS.AAVE_POLYGON_USDC;
          const depositorYieldPercent = 1000;

          await expect(
            domeFactory
              .connect(otherAccount)
              .createDome(
                domeInfo,
                beneficiariesInfo,
                depositorYieldPercent,
                yieldProtocol,
                { value: domeCreationFee }
              )
          ).to.changeEtherBalances(
            [otherAccount.address, domeFactory.address],
            [domeCreationFee.mul(-1), domeCreationFee]
          );

          await expect(
            domeFactory.connect(owner).withdraw(owner.address)
          ).to.changeEtherBalances(
            [domeFactory.address, owner.address],
            [domeCreationFee.mul(-1), domeCreationFee]
          );
        });

        it("Should allow contract owner to change system owner percentage", async function () {
          const { owner, domeFactory } = await loadFixture(deployDomeFactory);

          const newSystemOwnerPercentage = 2000;
          await expect(
            domeFactory
              .connect(owner)
              .changeSystemOwnerPercentage(newSystemOwnerPercentage)
          ).to.be.fulfilled;

          expect(await domeFactory.systemOwnerPercentage()).to.be.equal(
            newSystemOwnerPercentage
          );
        });
      });
    });
  });
});
