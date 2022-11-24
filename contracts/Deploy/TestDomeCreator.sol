// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import "../DomeCore.sol";
import "../DomeCreator.sol";

contract TestDomeCreator is DomeCreator {

    function domesOf2(address creator) public view returns (DomeCore) {
        return creatorDomes[creator][0];
    }

    constructor(){
        paymentForCreateDome = 50000000 gwei;
    }

}
