// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import {Governor, SafeCast} from "./Governor.sol";
import {IERC5805, IVotes} from "@openzeppelin/contracts/interfaces/IERC5805.sol";

/**
 * @dev Extension of {Governor} for voting weight extraction from an {ERC20Votes} token, or since v4.5 an {ERC721Votes} token.
 */
abstract contract GovernorVotes is Governor {
	IERC5805 public immutable token;

	constructor(IVotes tokenAddress) {
		token = IERC5805(address(tokenAddress));
	}

	/**
	 * @dev Clock (as specified in EIP-6372) is set to match the token's clock. Fallback to block numbers if the token
	 * does not implement EIP-6372.
	 */
	function clock() public view virtual override returns (uint48) {
		try token.clock() returns (uint48 timepoint) {
			return timepoint;
		} catch {
			return SafeCast.toUint48(block.number);
		}
	}

	/**
	 * @dev Machine-readable description of the clock as specified in EIP-6372.
	 */
	// solhint-disable-next-line func-name-mixedcase
	function CLOCK_MODE() public view virtual override returns (string memory) {
		try token.CLOCK_MODE() returns (string memory clockmode) {
			return clockmode;
		} catch {
			return "mode=blocknumber&from=default";
		}
	}

	/**
	 * Read the voting weight from the token's built in snapshot mechanism (see {Governor-_getVotes}).
	 */
	function _getVotes(
		address account,
		uint256,
		bytes memory /*params*/
	) internal view virtual override returns (uint256) {
		return token.getVotes(account);
	}
}
