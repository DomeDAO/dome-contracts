// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

/// Openzeppelin imports
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import "@openzeppelin/contracts/interfaces/IERC4626.sol";

/// Local imports
import "./Deploy/TestSaveMStable.sol";
import "hardhat/console.sol";

contract DomeCore is ERC4626, Ownable { 
    
    struct BeneficiaryInfo {
        string name;
        string url;
        string logo;
        address wallet;
        string description;
        uint256 percentage;
    }


    //Amount Of UNderlying owned by depositor, interested + principal
    uint256 public underlyingOwnedByDepositor;

    using SafeERC20 for IERC20;

    string public _name;
    string public _description;
    string public _shareTokenName;
    address public _owner;
    address public _systemOwner;
    uint256 public _systemOwnerPercentage;

    //mapping(address => Staking) private userStaking;
    BeneficiaryInfo[] public beneficiaries;

    /// contracts
    IERC20 public stakingcoin;
    TestSaveMStable public testMStable; //todo(changed)

    /// Constructor   
    constructor(
        string memory name,
        string memory description,
        string memory shareTokenName,
        string memory shareTokenSymbol,
        address stakingCoinAddress,
        address testMstableAddress,
        address owner,
        address systemOwner,
        uint256 systemOwnerPercentage,
        BeneficiaryInfo[] memory beneficiariesInfo
    ) 
    ERC20(shareTokenName, shareTokenSymbol)
    ERC4626(IERC20Metadata(stakingCoinAddress))
    {
        stakingcoin = IERC20(stakingCoinAddress);
        _name = name;
        _description = description;
        _shareTokenName = shareTokenName;
        for(uint256 i; i < beneficiariesInfo.length; i++){
            beneficiaries.push(beneficiariesInfo[i]);
        }
        transferOwnership(owner);
        testMStable = TestSaveMStable(testMstableAddress);
        stakingcoin.approve(address(testMStable), 2**256 - 1);
        _owner = owner;
        _systemOwner = systemOwner;
        _systemOwnerPercentage = systemOwnerPercentage;
    }

    function getunderlyingOwnedByDepositor() public view returns(uint256){
        return underlyingOwnedByDepositor;
    }

    function totalBalance() public view returns (uint256){
        return testMStable.balanceOfUnderlying(address(this));
    }

    function setApproveForDome(uint256 amount) public onlyOwner{
        stakingcoin.approve(address(testMStable), amount);
    }

    function setMstable(address addr) external onlyOwner {
        testMStable = TestSaveMStable(addr);
    }

    function changeSystemOwnerAddress(address addr) public onlyOwner {
        _systemOwner = addr;
    }

    function deposit(uint256 amount, address receiver) public override returns(uint256) {  //todo msg sender & receiver
        require(amount > 0, "The amount must be greater than 0.");
        uint256 allowance = stakingcoin.allowance(msg.sender, address(this));
        require(
            amount <= allowance,
            "There is no as much allowance for staking coin."
        );
        uint256 balance = stakingcoin.balanceOf(msg.sender);
        require(
            amount <= balance,
            "There is no as much balance for staking coin."
        );

        stakingcoin.safeTransferFrom(msg.sender, address(this), amount);

        testMStable.deposit(amount, address(this));

        underlyingOwnedByDepositor += amount;

        uint256 liquidityAmount;
        
        if(totalSupply() == 0){
            liquidityAmount = amount;
        }
        else{
            liquidityAmount = amount * totalSupply() / (estimateReward() - amount);
        }
        _mint(receiver, liquidityAmount);

        return liquidityAmount;
    }

    function withdraw(uint256 assets, address receiver, address owner) public override returns(uint256) {
        require(owner == msg.sender, "Caller is not owner");
        require(0 < assets, "The amount must be greater than 0.");
        claimInterests();

        uint256 liquidityAmount = balanceOf(owner);

        uint256 totalReward = testMStable.balanceOfUnderlying(address(this));

        uint256 lToBurn = assets * totalSupply() / totalReward;
        require(lToBurn <= liquidityAmount, "You dont have enough balance");
        testMStable.withdraw(assets, receiver, address(this));

        // Remove part retributed 
        underlyingOwnedByDepositor -= lToBurn * underlyingOwnedByDepositor / totalSupply();

        _burn(msg.sender, lToBurn);
        return lToBurn;
    }

    function claimInterests() public {
        uint256 reward = testMStable.balanceOfUnderlying(address(this)) - underlyingOwnedByDepositor;
        uint256 systemFee = reward * _systemOwnerPercentage / 100;
        uint256 beneficiariesReward = (reward - systemFee) * beneficiariesPercentage() / 100;
        testMStable.withdraw(beneficiariesReward + systemFee, address(this), address(this));
        stakingcoin.safeTransfer(_systemOwner, systemFee);
        uint256 totalTransfered = systemFee;
        uint256 toTransfer;
        for(uint256 i; i < beneficiaries.length; i++) {
            if(i == beneficiaries.length - 1){
                toTransfer = beneficiariesReward + systemFee - totalTransfered;
                stakingcoin.safeTransfer(beneficiaries[i].wallet, toTransfer);
                totalTransfered += toTransfer;
            }
            else{
                toTransfer = (reward - systemFee) * beneficiaries[i].percentage / 100;
                stakingcoin.safeTransfer(beneficiaries[i].wallet, toTransfer);
                totalTransfered += toTransfer;
            }
        }
        underlyingOwnedByDepositor += (reward - totalTransfered);
    }

    function beneficiariesPercentage() public view returns (uint256 totalPercentage){
        for(uint256 i; i < beneficiaries.length; i++){
            totalPercentage += beneficiaries[i].percentage;
        }
    }

    function balanceOfUnderlying (address user) public view returns(uint256) {
        return balanceOf(user) * estimateReward() / totalSupply();
    }

    function estimateReward() public view returns(uint256){
        uint256 totalReward = testMStable.balanceOfUnderlying(address(this));
        uint256 reward;
        if(totalReward > underlyingOwnedByDepositor){
            uint256 newReward = totalReward - underlyingOwnedByDepositor;
            uint256 systemFee = newReward * _systemOwnerPercentage / 100;
            uint256 beneficiariesInterest = (newReward - systemFee) * beneficiariesPercentage() / 100;
            reward = totalReward - systemFee - beneficiariesInterest;
        }
        else{
            reward = totalReward;
        }
        return reward;
    }

}
