// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.0;

import {SafeERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

abstract contract DomeBase {
    using SafeERC20 for IERC20;

    address internal constant ETH_ADDRESS =
        0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    address internal immutable feeReceiver;
    uint16 internal immutable feePercent;

    mapping(address => bool) public shouldResetAllowance;

    constructor(address _feeReceiver, uint16 _feePercent) {
        feeReceiver = _feeReceiver;
        feePercent = _feePercent;
    }

    /// @notice Returns address token balance
    /// @param token address
    /// @return balance
    function _getBalance(
        address token
    ) internal view returns (uint256 balance) {
        if (token == address(ETH_ADDRESS)) {
            balance = address(this).balance;
        } else {
            balance = IERC20(token).balanceOf(address(this));
        }
    }

    /// @notice Sends provided token amount to the contract
    /// @param token represents token address to be transfered
    /// @param amount represents token amount to be transfered
    function _pullTokens(
        address token,
        uint256 amount
    ) internal returns (uint256 balance) {
        if (token == ETH_ADDRESS) {
            require(msg.value > 0, "ETH was not sent");
        } else {
            // solhint-disable reason-string
            require(msg.value == 0, "Along with token, the ETH was also sent");
            uint256 balanceBefore = _getBalance(token);

            // Transfers all tokens to current contract
            IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

            return _getBalance(token) - balanceBefore;
        }
        return amount;
    }

    /// @dev Gives MAX allowance to token spender
    /// @param token address to apporve
    /// @param spender address
    function _approveToken(
        address token,
        address spender,
        uint256 amount
    ) internal {
        IERC20 _token = IERC20(token);

        if (
            _token.allowance(address(this), spender) > amount &&
            !shouldResetAllowance[token]
        ) {
            return;
        } else {
            _token.safeApprove(spender, 0);
            _token.safeApprove(spender, type(uint256).max);
        }
    }

    ///@notice Sets address allowance that should be reset first
    function _setShouldResetAllowance(
        address[] calldata tokens,
        bool[] calldata statuses
    ) internal {
        require(
            tokens.length == statuses.length,
            "SetShouldResetAllowance: Invalid input length"
        );

        for (uint256 i = 0; i < tokens.length; i++) {
            shouldResetAllowance[tokens[i]] = statuses[i];
        }
    }

    /// @notice Subtracts fee from given amount
    /// @dev 0xEeeEE... address should be passed for ETH withdraw
    /// @param token represents token address
    /// @param amount represents token amount
    /// @return updatedAmount the amount reflected by fee
    function _subtractFees(
        address token,
        uint256 amount
    ) internal returns (uint256 updatedAmount) {
        if (feePercent > 0) {
            uint256 totalFeePortion = (amount * feePercent) / 10000;

            if (token == ETH_ADDRESS) {
                (bool success, ) = payable(feeReceiver).call{
                    value: totalFeePortion
                }("");

                require(
                    success,
                    "FeeSubtraction: unable to send value, recipient may have reverted"
                );
            } else {
                uint256 balanceBefore = IERC20(token).balanceOf(feeReceiver);
                IERC20(token).safeTransfer(feeReceiver, totalFeePortion);
                totalFeePortion =
                    IERC20(token).balanceOf(feeReceiver) -
                    balanceBefore;
            }

            updatedAmount = amount - totalFeePortion;
        }

        return updatedAmount;
    }

    // Prevents locked funs on the contract side
    receive() external payable {
        // solhint-disable-next-line
        require(msg.sender != tx.origin, "Do not send ETH directly");
    }
}
