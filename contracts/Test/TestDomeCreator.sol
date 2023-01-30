// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

/// Openzeppelin imports
import "@openzeppelin/contracts/access/Ownable.sol";

/// Local imports
import "./TestDomeCore.sol";

contract TestDomeCreator is Ownable {
    uint256 public systemOwnerPercentage;
    uint256 public paymentForCreateDome;

    mapping(address => address[]) public creatorDomes;
    mapping(address => address) public domeCreators;

    address stakingCoinAddress;
    address testMstableAddress;
    event domeCreated(address creator, string cid);

    constructor(){
        systemOwnerPercentage = 10;
        paymentForCreateDome = 50000000000000000;
        stakingCoinAddress = 0xD29CCeA8e85ccF5f2c50dca8C9ADE682f54573Eb;
        testMstableAddress = 0x17400Efb007633B04a9866E312961b8252d9E959;
    }

    modifier payedEnough(){
        require(msg.value >= paymentForCreateDome, "You must pay 0.5eth for create dome");
        _;
    }

    function CreateDome(
        string[] memory domeInfo,
        TestDomeCore.BeneficiaryInfo[] memory beneficiariesInfo
    ) public payable payedEnough{
        TestDomeCore dome = new TestDomeCore(
            domeInfo,
            stakingCoinAddress,
            testMstableAddress,
            msg.sender,
            owner(),
            systemOwnerPercentage,
            beneficiariesInfo
        );
        creatorDomes[msg.sender].push(address(dome));
        domeCreators[address(dome)] = msg.sender;
        emit domeCreated(msg.sender, domeInfo[0]);
    }

    function domesOf(address creator) public view returns (address[] memory) {
        return creatorDomes[creator];
    }

    function ChangeSystemOwnerPercentage(uint256 percentage) external onlyOwner {
        systemOwnerPercentage = percentage;
    }

    function withdrawEth(uint256 amount) external onlyOwner {
        address payable to = payable(msg.sender);
        to.transfer(amount);
    }

    function changePaymentForCreate(uint256 value) external onlyOwner {
        paymentForCreateDome = value;
    }
 
    function changeStakingCoinAddress(address _stakingCoinAddress) external onlyOwner {
        stakingCoinAddress = _stakingCoinAddress;
    }

    function changeTestMstableAddress(address _testMstableAddress) external onlyOwner {
        testMstableAddress = _testMstableAddress;
    }

}
