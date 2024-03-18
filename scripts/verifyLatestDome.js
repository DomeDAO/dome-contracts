const { ethers, run } = require("hardhat");
const { getLatestDomeDeploy } = require("./utils");

async function main() {
	const network = await ethers.provider.getNetwork();
	const deployment = getLatestDomeDeploy(network.name);

	for (const key of Object.keys(deployment)) {
		await run("verify:verify", {
			address: deployment[key].address,
			constructorArguments: deployment[key].constructorArguments,
		});
	}
}

main().catch((error) => {
	console.error(error);
	process.exitCode(1);
});
