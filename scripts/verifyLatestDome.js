const { ethers, run } = require("hardhat");
const { getLatestDomeDeploy } = require("./utils");

async function main() {
	const network = await ethers.provider.getNetwork();
	const { DOME } = getLatestDomeDeploy(network.name);

	const dome = await ethers.getContractAt("Dome", DOME.address);

	await run("verify:verify", {
		address: dome.address,
		constructorArguments: DOME.constructorArguments,
	});
}

main().catch((error) => {
	console.error(error);
	process.exitCode(1);
});
