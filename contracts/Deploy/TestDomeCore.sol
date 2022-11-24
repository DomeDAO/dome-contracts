// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

/// Openzeppelin imports
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import "@openzeppelin/contracts/interfaces/IERC4626.sol";

/// Local imports
//import "../IDomeCore.sol";
import "../LiquidityToken.sol";
import "../TestSaveMStable.sol";
import "hardhat/console.sol";
import "../DomeCore.sol";

contract TestDomeCore is DomeCore { 
    
    /// Constructor   
    constructor(
        string memory domeCID,
        string memory shareTokenName,
        string memory shareTokenSymbol,
        address stakingCoinAddress,
        address testMstableAddress,
        address owner,
        address systemOwner,
        uint256 systemOwnerPercentage,
        BeneficiaryInfo[] memory beneficiariesInfo
    ) 
    DomeCore(
        domeCID,
        shareTokenName,
        shareTokenSymbol,
        stakingCoinAddress,
        testMstableAddress,
        owner,
        systemOwner,
        systemOwnerPercentage,
        beneficiariesInfo)
    {}

}
