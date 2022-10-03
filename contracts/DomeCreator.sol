// SPDX-License-Identifier: MIT

pragma solidity ^0.8.13;

import "./IDomeCore.sol";
import "./DomeCore.sol";

contract DomeCreator {
    
    struct BeneficiariesInfo {
        string name;
        string url;
        string logo;
        address wallet;
        string description;
        uint256 percentage;
    }

    mapping(address => IDomeCore) public domes;

    mapping(address => BeneficiariesInfo) public beneficiaries;

    function CreateDome(
        address stakingCoinAddress,
        string memory name,
        string memory description,
        string memory lpTokenName,
        BeneficiariesInfo[] memory beneficiariesInfo
    ) public {
        domes[msg.sender] = new DomeCore(stakingCoinAddress, msg.sender, name, description, lpTokenName, beneficiariesInfo);
    }

    function getDome(address domeOwner) public view returns (IDomeCore){
        return  domes[domeOwner];
    }

    function setBeneficiariesInfo(
        string memory name,
        string memory url,
        string memory logo,
        address wallet,
        string memory description,
        uint256 percentage
    ) public {
        BeneficiariesInfo storage beneficiariesInfo = beneficiaries[msg.sender];
        beneficiariesInfo.name = name;
        beneficiariesInfo.url = url;
        beneficiariesInfo.logo = logo;
        beneficiariesInfo.wallet = wallet;
        beneficiariesInfo.description = description;
        beneficiariesInfo.percentage = percentage;
    }
}
