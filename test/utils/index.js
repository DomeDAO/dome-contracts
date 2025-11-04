const { ethers } = require("hardhat");

async function approve(account, tokenAddress, spender, amount) {
	const token = await ethers.getContractAt("MockERC20", tokenAddress);
	const tx = await token.connect(account).approve(spender, amount);
	return tx.wait();
}

async function getBalanceOf(tokenAddress, account) {
	const token = await ethers.getContractAt("MockERC20", tokenAddress);
	return token.balanceOf(account);
}

async function swap(
	signer,
	src,
	dst,
	amount,
	dstReceiver = signer.address
) {
	src; // unused, retained for compatibility

	const token = await ethers.getContractAt("MockERC20", dst);
	const tx = await token.mint(dstReceiver, amount);
	await tx.wait();
	return amount;
}

function convertDurationToBlocks(
	duration,
	blockTime = 60 * 60 * 24 // default to one-day blocks for faster tests
) {
	const value = duration.match(/\d+/)[0];

	switch (true) {
		case duration.includes("minute"):
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
	getBalanceOf,
	approve,
	swap,
};
