const { ethers } = require("hardhat");
const { POLYGON, ETHEREUM } = require("../constants");

const uniV2Interface = new ethers.utils.Interface([
	"function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)",
	"function addLiquidityETH(address token, uint amountTokenDesired, uint amountTokenMin, uint amountETHMin, address to, uint deadline) external payable returns (uint amountToken, uint amountETH, uint liquidity)",
]);

const erc20Interface = new ethers.utils.Interface([
	"function name() public view returns (string)",
	"function symbol() public view returns (string)",
	"function decimals() public view returns (uint8)",
	"function totalSupply() public view returns (uint256)",
	"function balanceOf(address _owner) public view returns (uint256 balance)",
	"function transfer(address _to, uint256 _value) public returns (bool success)",
	"function transferFrom(address _from, address _to, uint256 _value) public returns (bool success)",
	"function approve(address _spender, uint256 _value) public returns (bool success)",
	"function allowance(address _owner, address _spender) public view returns (uint256 remaining)",
	"event Transfer(address indexed _from, address indexed _to, uint256 _value)",
	"event Approval(address indexed _owner, address indexed _spender, uint256 _value)",
]);

const mintableInterface = new ethers.utils.Interface([
	"function mint(address, uint256) external",
]);

const UNISWAP_LIKE_ROUTER_02 = {
	1: ETHEREUM.MAINNET.ADDRESSES.UNISWAP_ROUTER_02,
	5: ETHEREUM.MAINNET.ADDRESSES.UNISWAP_ROUTER_02,
	137: POLYGON.MAINNET.ADDRESSES.SUSHI_ROUTER_02,
	80001: POLYGON.MUMBAI.ADDRESSES.SUSHI_ROUTER_02,
};

async function mint(token, account, amount) {
	const calldata = mintableInterface.encodeFunctionData("mint", [
		account.address,
		amount,
	]);

	const tx = await account.sendTransaction({
		to: token,
		data: calldata,
	});

	return tx.wait;
}

async function addLiquidityETH(signer, token, amount, ethAmount) {
	const chainId = (await signer.provider.getNetwork()).chainId;
	const to = UNISWAP_LIKE_ROUTER_02[chainId];

	const calldata = uniV2Interface.encodeFunctionData("addLiquidityETH", [
		token,
		amount,
		ethAmount,
		0,
		signer.address,
		Date.now() + 12800,
	]);

	await approve(signer, token, to, amount);

	const tx = await signer.sendTransaction({
		to,
		data: calldata,
		value: ethAmount,
		gasLimit: 4000000,
	});

	return tx.wait;
}

function generateUniV2SwapData(fromToken, toToken, receiver, signer = null) {
	return uniV2Interface.encodeFunctionData("swapExactETHForTokens", [
		1,
		[fromToken, toToken],
		receiver,
		Date.now() + 12800,
	]);
}

async function getBalanceOf(tokenAddress, address, formatUnits = 0) {
	const response = await ethers.provider.call({
		to: tokenAddress,
		data: erc20Interface.encodeFunctionData("balanceOf", [address]),
	});

	const decodedValue = erc20Interface.decodeFunctionResult(
		"balanceOf",
		response
	).balance;

	if (formatUnits) {
		return ethers.utils.formatUnits(decodedValue, formatUnits);
	}

	return decodedValue;
}

async function getApproveData(to, amount) {
	return erc20Interface.encodeFunctionData("approve", [to, amount]);
}

async function approve(account, tokenAddress, to, amount) {
	const data = getApproveData(to, amount);

	const tx = await account.sendTransaction({ to: tokenAddress, data });
	return tx.wait;
}

/**
 *
 * @param {import('ethers').Signer} signer
 * @param {string} src
 * @param {string} dst
 * @param {(import('ethers').BigNumber | number)} amount
 * @param {string} dstReceiver
 * @returns
 */
async function swap(signer, src, dst, amount, dstReceiver = signer.address) {
	const chainId = (await signer.provider.getNetwork()).chainId;
	const to = UNISWAP_LIKE_ROUTER_02[chainId];

	const data = generateUniV2SwapData(src, dst, dstReceiver, signer);

	const balanceBefore = await getBalanceOf(dst, dstReceiver);

	await signer.sendTransaction({
		to,
		data,
		value: amount,
	});

	const balanceAfter = await getBalanceOf(dst, dstReceiver);

	return balanceAfter.sub(balanceBefore);
}

function convertDurationToBlocks(duration, blockTime = 2) {
	const value = duration.match(/\d+/)[0];

	switch (true) {
		case duration.includes("min"):
			return Math.floor((value * 60) / blockTime);
		case duration.includes("hour"):
			return Math.floor((value * 60 * 60) / blockTime);
		case duration.includes("day"):
			return Math.floor((value * 60 * 60 * 24) / blockTime);
		case duration.includes("week"):
			return Math.floor((value * 60 * 60 * 24 * 7) / blockTime);
		case duration.includes("month"):
			return Math.floor((value * 60 * 60 * 24 * 30) / blockTime);
		default: {
			return Math.floor(value / blockTime);
		}
	}
}

module.exports = {
	convertDurationToBlocks,
	generateUniV2SwapData,
	getBalanceOf,
	approve,
	getApproveData,
	swap,
	addLiquidityETH,
	mint,
};
