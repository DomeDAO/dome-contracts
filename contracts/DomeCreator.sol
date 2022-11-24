// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

/// Openzeppelin imports
import "@openzeppelin/contracts/access/Ownable.sol";

/// Local imports
import "./DomeCore.sol";

contract DomeCreator is Ownable {
    uint256 public systemOwnerPercentage;
    uint256 public paymentForCreateDome;
    mapping(address => DomeCore[]) public creatorDomes;
    mapping(address => address) public domeCreators;

    event domeCreated(address creator, string cid);

    constructor(){
        systemOwnerPercentage = 10;
        paymentForCreateDome = 50000000000000000;
    }

    modifier payedEnough(){
        require(msg.value >= paymentForCreateDome, "You must pay 0.5eth for create dome");
        _;
    }

    function CreateDome(
        //string memory name,
        //string memory description,
        string memory domeCID,
        string memory shareName,
        string memory shareSymbol,
        address stakingCoinAddress,
        address testMstableAddress,
        DomeCore.BeneficiaryInfo[] memory beneficiariesInfo
    ) public payable payedEnough{
        DomeCore dome = new DomeCore(
            //name,
            //description,
            domeCID,
            shareName,
            shareSymbol,
            stakingCoinAddress,
            testMstableAddress,
            msg.sender,
            owner(),
            systemOwnerPercentage,
            beneficiariesInfo
        );
        creatorDomes[msg.sender].push(dome);
        domeCreators[address(dome)] = msg.sender;
        emit domeCreated(msg.sender, domeCID);
    }

    function CreateDometest() public payable payedEnough{
        
    }


    function domesOf(address creator) public view returns (DomeCore[] memory) {
        return creatorDomes[creator];
    }

    function creatorOf(address dome) public view returns (address) {
        return domeCreators[dome];
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

}
