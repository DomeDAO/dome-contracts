// scripts/fetchTransactionHistory.js
const { ethers } = require("hardhat");
const { getAPIKey } = require("../../config");

async function main() {
    const account = "0xC9d60D366E5A1b0789453A9f831338dd53Afd632";
    await checkPendingTransactions(account).catch(console.error);
}

async function checkPendingTransactions(account) {
    const provider = ethers.provider; // Ensure you're connected to the appropriate network
    const currentNonce = await provider.getTransactionCount(account, 'latest');
    const pendingNonce = await provider.getTransactionCount(account, 'pending');

    console.log('Current nonce:', currentNonce);

    if (currentNonce < pendingNonce) {
        // This means there are pending transactions
        console.log(`There are ${pendingNonce - currentNonce} pending transactions for account: ${account}`);
        const block = await provider.getBlock('pending', true);
        const transactions = block.transactions.filter(tx => ethers.utils.getAddress(tx.from) === ethers.utils.getAddress(account));
        console.log(`Pending transactions from ${account}:`);
        transactions.forEach(tx => console.log(tx));

    } else {
        console.log('No pending transactions found for account:', account);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });