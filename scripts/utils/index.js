const fs = require("fs");

async function getGasPrice(increaseGasByPercent = 5) {
	const gasPrice = await ethers.provider.getGasPrice();
	const updatedGasPrice = gasPrice.add(gasPrice.mul(increaseGasByPercent).div(100));

	return updatedGasPrice;
}

function writeDeploy(chain, json) {
	if (!fs.existsSync("./metadata")) {
		fs.mkdirSync("./metadata");
	}

	const files = fs.readdirSync("./metadata");

	const isDome = Boolean(json.DOME);
	const latestFile = files.find((file) =>
		file.startsWith(`latest-${chain}-${isDome ? "dome" : "protocol"}`)
	);

	if (latestFile) {
		const newName = latestFile.slice(7);
		fs.renameSync(`./metadata/${latestFile}`, `./metadata/${newName}`);
	}

	const timestamp = new Date()
		.toISOString()
		.replace(/T/, " ")
		.replace(/\..+/, "");

	fs.writeFileSync(
		`./metadata/latest-${chain}-${isDome ? "dome" : "protocol"
		}-${timestamp}.json`,
		JSON.stringify(json)
	);
}

function getLatestProtocolDeploy(chain) {
	if (!fs.existsSync("./metadata")) {
		throw Error("No metadata folder found");
	}

	const files = fs.readdirSync("./metadata");

	const file = files.find((file) =>
		file.startsWith(`latest-${chain}-protocol`)
	);

	if (!file) {
		throw Error("No latest protocol deployment were found");
	}

	const deployment = fs.readFileSync(`./metadata/${file}`);

	return JSON.parse(deployment);
}

function getLatestDomeDeploy(chain) {
	if (!fs.existsSync("./metadata")) {
		throw Error("No metadata folder found");
	}

	const files = fs.readdirSync("./metadata");

	const file = files.find((file) => file.startsWith(`latest-${chain}-dome`));

	if (!file) {
		throw Error("No latest dome deployment were found");
	}

	const deployment = fs.readFileSync(`./metadata/${file}`);

	return JSON.parse(deployment);
}

module.exports = {
	writeDeploy,
	getLatestDomeDeploy,
	getLatestProtocolDeploy,
	getGasPrice
};
