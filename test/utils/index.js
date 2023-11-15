const { ethers } = require("hardhat");
const { ADDRESSES } = require("../constants/polygon");

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

const aaveLendingPoolV3Interface = new ethers.utils.Interface([
	"function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external",
	"function supplyWithPermit( address asset, uint256 amount, address onBehalfOf, uint16 referralCode, uint256 deadline, uint8 permitV, bytes32 permitR, bytes32 permitS) external",
	"function withdraw(address asset, uint256 amount, address to) external returns (uint256)",
	"function borrow( address asset, uint256 amount, uint256 interestRateMode, uint16 referralCode, address onBehalfOf) external",
	"function repay( address asset, uint256 amount, uint256 interestRateMode, address onBehalfOf) external returns (uint256)",
	"function repayWithPermit( address asset, uint256 amount, uint256 interestRateMode, address onBehalfOf, uint256 deadline, uint8 permitV, bytes32 permitR, bytes32 permitS) external returns (uint256)",
	"function repayWithATokens( address asset, uint256 amount, uint256 interestRateMode) external returns (uint256)",
	"function deposit(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external",
]);

const mintableInterface = new ethers.utils.Interface([
	"function mint(address, uint256) external",
]);

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

async function addLiquidityETH(account, token, amount, ethAmount) {
	const calldata = uniV2Interface.encodeFunctionData("addLiquidityETH", [
		token,
		amount,
		ethAmount,
		0,
		account.address,
		Date.now() + 12800,
	]);

	await approve(account, token, ADDRESSES.SUSHI_ROUTER02, amount);

	const tx = await account.sendTransaction({
		to: ADDRESSES.SUSHI_ROUTER02,
		data: calldata,
		value: ethAmount,
		gasLimit: 4000000,
	});

	return tx.wait;
}

function generateUniV2SwapData(fromToken, toToken, receiver) {
	return uniV2Interface.encodeFunctionData("swapExactETHForTokens", [
		0,
		[fromToken, toToken],
		receiver,
		Date.now() + 12800,
	]);
}

async function getBalanceOf(tokenAddress, address, foramtUnits = 0) {
	const response = await ethers.provider.call({
		to: tokenAddress,
		data: erc20Interface.encodeFunctionData("balanceOf", [address]),
	});

	const decodedValue = erc20Interface.decodeFunctionResult(
		"balanceOf",
		response
	).balance;

	if (foramtUnits) {
		return ethers.utils.formatUnits(decodedValue, foramtUnits);
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

async function sushiSwap(
	account,
	fromToken,
	toToken,
	amount,
	receiver = account.address
) {
	const data = generateUniV2SwapData(fromToken, toToken, receiver);

	await Promise.all([
		account.call({
			to: ADDRESSES.SUSHI_ROUTER02,
			data,
			value: amount,
		}),
		account.sendTransaction({
			to: ADDRESSES.SUSHI_ROUTER02,
			data,
			value: amount,
		}),
	]);

	const balance = await getBalanceOf(toToken, receiver);

	return balance;
}

async function getAavev3SupplyData(
	asset,
	amount,
	onBehalfOf,
	referralCode = 0
) {
	return aaveLendingPoolV3Interface.encodeFunctionData("supply", [
		asset,
		amount,
		onBehalfOf,
		referralCode,
	]);
}

async function getAavev3BorrowData(
	asset,
	amount,
	interestRateMode,
	onBehalfOf,
	referralCode = 0
) {
	return aaveLendingPoolV3Interface.encodeFunctionData("borrow", [
		asset,
		amount,
		interestRateMode,
		referralCode,
		onBehalfOf,
	]);
}

async function aaveBorrow(
	account,
	asset,
	amount,
	interestRateMode,
	onBehalfOf,
	referralCode = 0
) {
	const data = getAavev3BorrowData(
		asset,
		amount,
		interestRateMode,
		onBehalfOf,
		referralCode
	);

	return account.sendTransaction({ to: ADDRESSES.AAVE_LENDING_POOL, data });
}

async function aaveSupply(
	account,
	asset,
	amount,
	onBehalfOf,
	referralCode = 0
) {
	const data = getAavev3SupplyData(asset, amount, onBehalfOf, referralCode);

	await approve(account, asset, ADDRESSES.AAVE_LENDING_POOL, amount);

	return account.sendTransaction({ to: ADDRESSES.AAVE_LENDING_POOL, data });
}

async function getAaveRepayData(asset, amount, interestRateMode, onBehalfOf) {
	return aaveLendingPoolV3Interface.encodeFunctionData("repay", [
		asset,
		amount,
		interestRateMode,
		onBehalfOf,
	]);
}

async function aaveRepay(account, asset, amount, interestRateMode, onBehalfOf) {
	const data = getAaveRepayData(asset, amount, interestRateMode, onBehalfOf);

	await approve(account, asset, ADDRESSES.AAVE_LENDING_POOL, amount);

	return account.sendTransaction({
		to: ADDRESSES.AAVE_LENDING_POOL,
		data,
		gasLimit: 700000,
	});
}

module.exports = {
	generateUniV2SwapData,
	getBalanceOf,
	approve,
	getApproveData,
	sushiSwap,
	getAavev3SupplyData,
	getAavev3BorrowData,
	aaveBorrow,
	aaveSupply,
	getAaveRepayData,
	aaveRepay,
	addLiquidityETH,
	mint,
};
