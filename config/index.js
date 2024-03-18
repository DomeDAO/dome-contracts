const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.join(__dirname, "../.env") });

function getEnvVars(fields) {
	const vars = {};

	for (const field of fields) {
		if (!(field in process.env)) {
			throw Error(`${field} var is not set`);
		}

		vars[field] = process.env[field];
	}

	return vars;
}

function getProtocolEnvVars() {
	return getEnvVars([
		"DOME_CREATION_FEE",
		"SYSTEM_OWNER_PERCENTAGE",
		"SYSTEM_OWNER",
	]);
}

function getDomeEnvVars() {
	return getEnvVars(["DOME_PROTOCOL_ADDRESS"]);
}

function getProtocolVerifyEnvVars() {
	return getEnvVars([
		"DOME_CREATION_FEE",
		"SYSTEM_OWNER_PERCENTAGE",
		"SYSTEM_OWNER",
		"DOME_PROTOCOL_ADDRESS",
	]);
}

function getAPIKey() {
	return getEnvVars(["POLYGON_API_KEY"]);
}

module.exports = {
	getEnvVars,
	getProtocolEnvVars,
	getDomeEnvVars,
	getProtocolVerifyEnvVars,
	getAPIKey,
};
