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

    address stakingCoinAddress;
    address mUSDSavingsContractAddress;
    address mUSDTokenAddress;
    address mAssetSaveWrapperAddress;
    address mUSDSavingsVaultAddress;

    event domeCreated(address creator, string cid);

    constructor(){
        stakingCoinAddress = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
        mUSDSavingsContractAddress = 0x30647a72Dc82d7Fbb1123EA74716aB8A317Eac19;
        mUSDTokenAddress = 0xe2f2a5C287993345a840Db3B0845fbC70f5935a5;
        mAssetSaveWrapperAddress = 0x0CA7A25181FC991e3cC62BaC511E62973991f325;
        mUSDSavingsVaultAddress = 0x78BefCa7de27d07DC6e71da295Cc2946681A6c7B;
        systemOwnerPercentage = 10;
        paymentForCreateDome = 500000000000000000;
    }

    modifier payedEnough(){
        require(msg.value >= paymentForCreateDome, "You must pay 0.5eth for create dome");
        _;
    }

    function CreateDome(
        string memory domeCID,
        string memory shareName,
        string memory shareSymbol,
        DomeCore.BeneficiaryInfo[] memory beneficiariesInfo
    ) public payable payedEnough{
        DomeCore dome = new DomeCore(
            domeCID,
            shareName,
            shareSymbol,
            stakingCoinAddress,
            mUSDSavingsContractAddress,
            mUSDTokenAddress,
            mAssetSaveWrapperAddress,
            mUSDSavingsVaultAddress,
            msg.sender,
            owner(),
            systemOwnerPercentage,
            beneficiariesInfo
        );
        creatorDomes[msg.sender].push(dome);
        domeCreators[address(dome)] = msg.sender;
        emit domeCreated(msg.sender, domeCID);
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

    function changeStakingCoinAddress(address _stakingCoinAddress) external onlyOwner {
        stakingCoinAddress = _stakingCoinAddress;
    }

    function changeMUSDSavingsContractAddress(address _mUSDSavingsContractAddress) external onlyOwner {
        mUSDSavingsContractAddress = _mUSDSavingsContractAddress;
    }
    
    function changeMUSDTokenAddress(address _mUSDTokenAddress) external onlyOwner {
        mUSDTokenAddress = _mUSDTokenAddress;
    }
    
    function changeMAssetSaveWrapperAddress(address _mAssetSaveWrapperAddress) external onlyOwner {
        mAssetSaveWrapperAddress = _mAssetSaveWrapperAddress;
    }
    
    function changemUSDSavingsVaultAddress(address _mUSDSavingsVaultAddress) external onlyOwner {
        mUSDSavingsVaultAddress = _mUSDSavingsVaultAddress;
    }
}
