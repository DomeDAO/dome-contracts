// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;


/// Openzeppelin imports
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// Local imports
import "hardhat/console.sol";
import "./TestLiquidityToken.sol";

contract TestSaveMStable {

    using SafeERC20 for ERC20;
    TestLiquidityToken public liquidityToken;


    struct Stake {
        uint256 amount;
        uint256 lastBlockNumber;
    }

    mapping(address => Stake) public stakesMapping;
    ERC20 public token;
    uint256 _initialBlock;
    uint32 public rewardGrowthSpeed;

    /// Constructor
    constructor(address tokenAddress_) {
        token = ERC20(tokenAddress_);
        liquidityToken = new TestLiquidityToken("Test imUSD share", "TimUSD");
        _initialBlock = block.number;
        rewardGrowthSpeed = 1;
    }

    function changeRewardGrowthSpeed(uint32 value) public {
        rewardGrowthSpeed = value;
    }

    function deposit(uint256 assets, address receiver) public returns(uint256 shares) {
        require(0 != assets, "Amount cannot be 0");
        require(assets <= token.allowance(receiver, address(this)));
        token.safeTransferFrom(receiver, address(this), assets);
        Stake storage s = stakesMapping[receiver];
        if (0 == s.amount) {
            s.amount = assets;
        } else {
            s.amount = balanceOf(receiver) + assets;
        }
        s.lastBlockNumber = block.number;
        shares = assets;
        liquidityToken.mint(receiver, shares);
        return shares;
    }

    function withdraw(uint256 assets, address receiver, address owner) public returns(uint256 shares) {
        require(0 != assets, "amount cannot be 0");
        require(address(0x0) != receiver, "to cannot be 0x0");

        Stake storage s = stakesMapping[owner];
        require(s.amount > 0, "There is no deposit");

        s.amount = balanceOf(owner);

        s.lastBlockNumber = block.number;
        if (assets == type(uint256).max) {
            assets = s.amount;
            s.amount = 0;
        } else {
            require(s.amount >= assets, "Insufficient balance");
            s.amount -= assets;
        }
    
        token.safeTransfer(receiver, assets);
        
        shares = assets;
        //liquidityToken.burn(owner, shares);
        return shares;
    }

    function balanceOf(address user_) public view returns(uint256) {
        require(address(0x0) != user_, "user cannot be 0x0");
        Stake storage s = stakesMapping[user_];
        if(s.amount == 0){
            return 0;
        }
        uint256 balance = s.amount + s.amount * (block.number - s.lastBlockNumber) * rewardGrowthSpeed / 10000 ; 
        return balance;
    }

    function balanceOfUnderlying (address user_) public view returns(uint256) {
        return balanceOf(user_);
    }

    function convertToShares(uint256 assets) public view returns(uint256) {
        return assets;
    }

    function convertToAssets(uint256 shares) public view returns(uint256) {
        return shares;
    }
}