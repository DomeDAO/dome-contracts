// SPDX-License-Identifier: MIT

pragma solidity ^0.8.13;

import "./IDomeCore.sol";

contract DomeCreator {
    
    struct BenInfo {
        string name;
        string url;
        string logo;
        address wallet;
        string description;
        uint256 percentage;
    }

    mapping(address => BenInfo) public benefituries;

    function CreateDome(
        string memory name,
        string memory description,
        string memory lpTokenName,
        BenInfo[] memory beninfo
    ) public {
        
    }

    function setBenInfo(
        string memory name,
        string memory url,
        string memory logo,
        address wallet,
        string memory description,
        uint256 percentage
    ) public {
        BenInfo storage beninfo = benefituries[msg.sender];
        beninfo.name = name;
        beninfo.url = url;
        beninfo.logo = logo;
        beninfo.wallet = wallet;
        beninfo.description = description;
        beninfo.percentage = percentage;
    }
}
