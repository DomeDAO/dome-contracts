// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

interface IUniswapV2Router02 {
	function getAmountsOut(
		uint amountIn,
		address[] memory path
	) external view returns (uint[] memory amounts);

	function WETH() external pure returns (address);
}

contract PriceTracker is Ownable {
	address UNISWAP_ROUTER;
	address USDC;

	error Unauthorized();

	constructor(address _uniswapRouter, address _usdcAddress) {
		UNISWAP_ROUTER = _uniswapRouter;
		USDC = _usdcAddress;
	}

	function updateAddresses(
		address _uniswapRouter,
		address _usdc
	) external onlyOwner {
		UNISWAP_ROUTER = _uniswapRouter;
		USDC = _usdc;
	}

	function convertTo(
		address target,
		address asset,
		uint256 amount
	) external view returns (uint256) {
		if (asset == USDC) {
			return amount;
		}

		address[] memory wethRoutedPath;
		wethRoutedPath[0] = asset;
		wethRoutedPath[1] = IUniswapV2Router02(UNISWAP_ROUTER).WETH();
		wethRoutedPath[2] = target;

		uint256[] memory wethRoutedAmounts = IUniswapV2Router02(UNISWAP_ROUTER)
			.getAmountsOut(amount, wethRoutedPath);

		address[] memory directPath;
		directPath[0] = asset;
		directPath[1] = target;

		uint256[] memory directAmounts = IUniswapV2Router02(UNISWAP_ROUTER)
			.getAmountsOut(amount, directPath);

		return
			directAmounts[1] > wethRoutedAmounts[2]
				? directAmounts[1]
				: wethRoutedAmounts[2];
	}

	function convertToUSDC(
		address asset,
		uint256 amount
	) external view returns (uint256) {
		if (asset == USDC) {
			return amount;
		}

		address[] memory wethRoutedPath;
		wethRoutedPath[0] = asset;
		wethRoutedPath[1] = IUniswapV2Router02(UNISWAP_ROUTER).WETH();
		wethRoutedPath[2] = USDC;

		uint256[] memory wethRoutedAmounts = IUniswapV2Router02(UNISWAP_ROUTER)
			.getAmountsOut(amount, wethRoutedPath);

		address[] memory directPath;
		directPath[0] = asset;
		directPath[1] = USDC;

		uint256[] memory directAmounts = IUniswapV2Router02(UNISWAP_ROUTER)
			.getAmountsOut(amount, directPath);

		return
			directAmounts[1] > wethRoutedAmounts[2]
				? directAmounts[1]
				: wethRoutedAmounts[2];
	}
}
