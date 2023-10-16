module.exports = {
	env: {
		node: true,
		jest: true,
		es6: true,
	},
	extends: ["eslint:recommended", "plugin:prettier/recommended"],
	plugins: ["prettier"],
	parserOptions: {
		ecmaVersion: 2018,
	},
	rules: {
		"prettier/prettier": 1,
		"no-console": "warn",
		"func-names": "off",
		"no-underscore-dangle": "off",
		"consistent-return": "off",
		"jest/expect-expect": "off",
		"no-unused-vars": "warn",
	},
	overrides: [
		{
			files: ["hardhat.config.js"],
			globals: { task: true },
		},
	],
};
