const { ethers, run } = require("hardhat");
const { getDomeEnvVars, getEnvVars } = require("../config");
const { getLatestDomeDeploy } = require("./utils");
const { convertDurationToBlocks } = require("../test/utils");
const { DOME_PROTOCOL_ADDRESS } = getDomeEnvVars();

async function main() {
	const network = await ethers.provider.getNetwork();
	const deployment = getLatestDomeDeploy(network.name);

	for (const key of Object.keys(deployment)) {
		await run("verify:verify", {
			address: deployment[key].address,
			constructorArguments: deployment[key].constructorArguments,
		});
	}

	const domeAddress = deployment.DOME.address;
	const domeProtocolAddress = deployment.DOME.protocol;

	const domeProtocol = await ethers.getContractAt("DomeProtocol", domeProtocolAddress);

	const governanceAddress = await domeProtocol.callStatic.domeGovernance(domeAddress);

	if (governanceAddress === ethers.constants.AddressZero) {
		return;
	}

	const governance = await ethers.getContractAt(
		"DomeGovernor",
		governanceAddress
	);

	const wrappedVotingAddress = await governance.callStatic.token();

	const governanceSettings = {
		votingDelay: convertDurationToBlocks(process.env.VOTING_DELAY),
		votingPeriod: convertDurationToBlocks(process.env.VOTING_PERIOD),
		proposalThreshold: 1,
	};

	const governanceConstructorArguments = [
		wrappedVotingAddress,
		governanceSettings.votingDelay,
		governanceSettings.votingPeriod,
		governanceSettings.proposalThreshold,
	];

	const wrappedConstructorArguments = [domeAddress];

	await run("verify:verify", {
		address: governance.address,
		constructorArguments: governanceConstructorArguments,
	});

	await run("verify:verify", {
		address: wrappedVotingAddress,
		constructorArguments: wrappedConstructorArguments,
	});
}

main().catch((error) => {
	console.error(error);
	process.exitCode(1);
});
