// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {DomeInfo, BeneficiaryInfo, Dome} from "./DomeCore.sol";

contract DomeFactory is Ownable {
    uint16 public systemOwnerPercentage;
    uint256 public domeCreationFee;

    mapping(address => address) public domeCreators;
    mapping(address => address[]) public creatorDomes;

    event DomeCreated(
        address creator,
        address domeAddress,
        address yieldProtocol,
        string CID
    );

    constructor(uint16 _systemOwnerPercentage, uint256 _domeCreationFee) {
        systemOwnerPercentage = _systemOwnerPercentage;
        domeCreationFee = _domeCreationFee;
    }

    modifier payedEnough() {
        require(msg.value >= domeCreationFee, "You must pay <domeCreationFee>");
        _;
    }

    function createDome(
        DomeInfo memory domeInfo,
        BeneficiaryInfo[] memory beneficiariesInfo,
        uint16 _depositorYieldPercent,
        address _yieldProtocol
    ) external payable payedEnough {
        Dome dome = new Dome(
            domeInfo,
            beneficiariesInfo,
            _yieldProtocol,
            owner(),
            systemOwnerPercentage,
            _depositorYieldPercent
        );

        domeCreators[address(dome)] = msg.sender;
        creatorDomes[msg.sender].push(address(dome));

        emit DomeCreated(
            msg.sender,
            address(dome),
            _yieldProtocol,
            domeInfo.CID
        );
    }

    function domesOf(address creator) external view returns (address[] memory) {
        return creatorDomes[creator];
    }

    function changeSystemOwnerPercentage(uint16 percentage) external onlyOwner {
        require(percentage <= 1000, "Fee percent cannot be more than 10%");

        systemOwnerPercentage = percentage;
    }

    function changeDomeCreationFee(uint256 value) external onlyOwner {
        domeCreationFee = value;
    }

    function withdraw(address recipient) external onlyOwner {
        (bool success, ) = recipient.call{value: address(this).balance}("");

        require(success, "Unable to send value, recipient may have reverted");
    }

    receive() external payable {}
}
