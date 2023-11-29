# DomeProtocol

```mermaid
sequenceDiagram
autonumber
    box Purple
    participant U as User
    participant P as DomeProtocol
    end
    U->> +P: createDome
    P ->>+DomeFactory: Create Dome Instance
    P -->>+WrappedVotingFactory: Create Voting Token
    P -->>+GovernanceFactory: Create Governance
```

```mermaid
sequenceDiagram
    box Purple
    participant U as User
    participant D as Dome
    end
    U->> +D: deposit/mint
    D->> -U: mint shares transfer underlying to dome
    U->> +D: withdraw/redeem
    D->> -U: burn shares trasnfer underlying to user
    box rgb(33,66,99)
    participant Beneficiary
    participant SystemOwner
    participant Reward Contract
    end
    U->> D: claimYieldAndDistribute
    D->> Beneficiary: transfer beneficiary yield portion
    D->> SystemOwner: transfer system owner portion


    U->> +D: claim
    D->> Reward Contract: claim generated reward token
    D->> -U: trasnfers reward token user


    U->> +D: donate
    Note over U,D: Donates erc20 tokens, transfers to beneficiaries
    U->> +D: burn
    Note over U,D: Burns shares, transfers underlying to beneficiaries
```

## Prerequisites

Before you begin, ensure you have met the following requirements:

- [Node.js](https://nodejs.org/) and [npm](https://www.npmjs.com/) installed on your machine.

## Installation

1. Clone the repository to your local machine:

```bash
git clone git@github.com:DomeDAO/dome-contracts.git
```

2. Navigate to the project directory:

```bash
cd dome-contracts
```

3. Install the project dependencies using npm:

```bash
npm install
```

## Compiling contracts

To compile the contract run `npm run build` in your terminal.

```bash
npm run build
```

After successful compilation you'll get the output:

```bash
Compiled 52 Solidity files successfully
```

Which indicates, as you may have guessed, that contracts have been successfully compiled and they're ready to be used.

## Environment Variables

To deploy the protocol, you will need to add the following `environment variables` to your .env file:

`DEPLOY_PRIV_KEY`
`DOME_CREATION_FEE`
`SYSTEM_OWNER_PERCENTAGE`
`SYSTEM_OWNER`

`POLYGON_RPC_URL`
`MAINNET_RPC_URL`
`GOERLI_RPC_URL`
`MUMBAI_RPC_URL`

You can find the RPC URL's on: https://chainlist.org/

To deploy a `dome instance`, you will need to add the deployed `DomeProtocol's` address to your .env file:

`DOME_PROTOCOL_ADDRESS `

For contract `verification`, you will need to add the explorer api keys for the required networks:

`POLYGON_API_KEY`

`MAINNET_API_KEY`

If you want to get detailed information about `deployment/execution gas prices`, you will need to add the `COINMARKETCAP_API` api key to your .env file:

Get one from: https://coinmarketcap.com/api/

![Gas report](/assets/gas-report.png)

## Running Tests

The project includes a comprehensive set of unit tests to ensure the correctness and robustness of the smart contracts. These tests cover the following aspects:

- **DomeProtocol Contract Testing:**

  - Validation of contract functionality.
  - Ownership management.
  - Events emission.

- **DomeInstance Contract Testing:**

  - Validation of contract functionality.
  - Ownership management.
  - Events emission.

- **Governance Contract Testing:**

  - Ownership management.
  - Validation of governance mechanisms.

- **Reward Contract Testing:**

  - Validation of contract functionality.

- **Burn Testing:**

  - Validation of contract functionality.
  - Events emission.

- **Donate Testing:**

  - Validation of contract functionality.
  - Events emission.

In total, there are 102 individual tests.

### Running Tests

If you want to run the tests locally or on your own development environment, run the tests using the following command:

```bash
npm run test
```

Don't forget to update [environment variables](#environment-variables) before testing, all tests are done on the polygon mainnet fork, so the `POLYGON_RPC_URL` should be set.

## Deployment

This section outlines the steps to deploy the `Dome` and `DomeProtocol` contracts. Before deploying, make sure to `set the required environment variables` and constructor parameters.

### Prerequisites

Before deploying the contracts, ensure the following prerequisites are met:

1. You have the necessary Ethereum accounts configured for deploying contracts.

2. You have the required environment variables set:

   - `DOME_CREATION_FEE` (in wei)
   - `SYSTEM_OWNER_PERCENTAGE` (up to 2500, representing 25%)
   - `SYSTEM_OWNER` (public wallet address)
   - `DEPLOY_PRIV_KEY` (Extract it from Metamask or you wallet )

3. Once you're ready to deploy the protocol, you should decide which network to use. We have predefined network entries, which you can use to deploy to a remote network such as `mainnet`, `polygon` or their testnets: `goerli`, `mumbai`. For these networks, the corresponding environment variables should be set: `POLYGON_RPC_URL`, `MAINNET_RPC_URL`,`GOERLI_RPC_URL`, `MUMBAI_RPC_URL`.

If you want to deploy somewhere else, you need to add a new network entry to `hardhat.config.js` file similarly to the others:

```
<network>: {
	url: <RPC-URL>,
	accounts: [<PRIV_KEY>]
}
```

And then to tell Hardhat to connect to a specific network, you can use the --network parameter when running any hardhat tasks, like this:

```bash
npx hardhat run scripts/scriptToRun.js --network <network-name>
```

### Deploying DomeProtocol

1. Start by deploying `DomeProtocol`:

```bash
npm run deployProtocol -- --network <network>
```

Also you can use predefined network deployment scripts:

```bash
npm run deployProtocol:mainnet
npm run deployProtocol:goerli
npm run deployProtocol:polygon
npm run deployProtocol:mumbai
npm run deployProtocol:hardhat
```

This script will also deploy some additional required contracts:

- `DomeFactory`
- `GovernanceFactory`
- `WrappedVotingFactory`
- `PriceTracker`
- `Buffer`
- `RewardToken`.

You will be prompted to submit the deployment of them.

2. After successful deployment, you will get output similar to this one:

```
DomeProtocol was deployed at 0xC72189CF685056DED9487704A80E9e2aEeC80227
- BUFFER at 0x622F14A17F4720D017B85044235ee527f8A4557E
- REWARD_TOKEN at 0x7feF49D87B5D293CAe263E4ab43456a27414840D
```

The address of the `DomeProtocol` contract should be set as an environment variable:

- `DOME_PROTOCOL_ADDRESS`

This is required for further `Dome` deployments:

### Deploying Dome

With the `DomeProtocol` contract deployed, you can now proceed to deploy the `Dome` contract.

1. Deploy `Dome` with the following required constructor parameters, you should modify them inside `scripts/deployDome.js` file:
   - `DomeInfo` (CID, TokenName, TokenSymbol)
     <img src="assets/dome-info.png" width="400"/>
   - `BeneficiariesInfo` (CID, wallet address, percent up to 10000, representing 100%)
     <img src="assets/beneficiary-info.png" width="400"/>
   - `YieldProtocol` (default is set to Polygon Mainnet Aave USDC protocol)
     <img src="assets/yield-protocol.png" width="400"/>
   - `DepositorYieldPercent` (up to 10000, representing 100%)
     <img src="assets/depositor-yield-percent.png" width="400"/>
   - `GovernanceSettings` (use only if you have buffer set as beneficiary)
     <img src="assets/governance-settings.png" width="400"/>
   - The `Dome` contract owner is the `Dome` deployer. (The `DEPLOY_PRIV_KEY` wallet)

Here is a [ list of ERC4626 protocols ](https://erc4626.info/vaults/) which are fully compatible with dome protocol, you can use them as `yield protocol` for deployment.

![ERC4626 vault list](/assets/erc4626list.png)

You may be wondering what underlying token uses the yield protocol.
There is a technical and reliable way to check this.

Firstly you should click on contract address of that yield located on the right side.
![ERC4626 contract position](/assets/erc4626contract.png)

It will redirect you to [ etherscan.io ](https://etherscan.io/) (In our case yield protocol is on ethereum, in the case of other evm, it could be [bscscan.com](https://bscscan.com/), [ ftmscan.com ](https://ftmscan.com/), [ polygonscan.com ](https://polygonscan.com/), etc.), where you would be able to interact with the blockchain.

On the explorer page you will see the `Contracts` and `Read Contract` tabs opened.
![Erc4626 without proxy](/assets/erc4626VaultwithoutProxy.png)

##

### Note

Some yield protocols can be `upgradable`, in that case you should navigate to `Read as Proxy` tab, under `Contract` tab.

![Erc4626 with proxy](/assets/erc4626VaultwithProxy.png)

##

After that you should see all available read function on that yield protocol.
But we are interested only in one of them called `asset`.

![ERC4626 contract asset](/assets/erc4626asset.png)

By simply clicking on that button we can see its value.
After you've found the address, you can `click` on that `address` and the explorer will redirect you to that token page with its info.

![ERC4626 asset info](/assets/erc4626tokeninfo.png)

In our case the underlying asset of the yield protocol is `ConvexCRV` token, congratulations!

#

After you've decided with the chain and protocol to use, you should copy its contract address and paste it as `yieldProtocol` under deployment script(`scripts/deployDome.js`)

![ERC4626 contract position](/assets/erc4626contract.png)

After setting the required parameters inside `scripts/deployDome.js` file. we are ready to deploy a `Dome` instance like this:

```bash
npm run deployDome.js -- --network <network>
```

Also you can use predefined network deployment scripts:

```bash
npm run deployDome:mainnet
npm run deployDome:goerli
npm run deployDome:polygon
npm run deployDome:mumbai
npm run deployDome:hardhat
```

After following these steps, both the `Dome` and `DomeProtocol` contracts should be successfully deployed, and you can start interacting with them as needed.

## Note

Please ensure that you are using the correct and secure deployment parameters and environment variables. Deploying smart contracts on the Ethereum network should be done with caution, and you should be familiar with the risks and implications.

## Verification

For smart contracts verification on the blockchain we use hardhat-verify to make the source code of your contracts publicly available and verifiable on block explorers like Etherscan. Below are the steps to verify your contracts.

### Configuration

1. Ensure you have set required environment variables for verifications on Polygon and Ethereum: `MAINNET_API_KEY`, `POLYGON_API_KEY`.

2. If you want to deploy somewhere else, you need to add a new etherscan api key entry to `hardhat.config.js` file, similarly to others:

```
module.exports = {
  // ... other configurations ...

  etherscan: {
    apiKey: {
      <network>: "<NETWORK_API_KEY>",
      // ... add more networks as needed ...
    },
  },
};
```

### Verifying the DomeProtocol

Once you've configured your API keys and deployed your contract, you can use the following command to verify your contract on the predefined networks:

```
npm run verifyProtocol:<network>
```

##

We also support recent deployment verification, which reads deployment metadata and uses that data for verification without any additional configuration:

Using our predefined networks (mainnet, goerli, polygon, mumbai) which are listed in `package.json`

```
npm run verifyLatestProtocol:<network>
```

Or for your custom ones listed in `hardhat.config.js`

```
npm run verifyLatestProtocol -- --network <network>
```

### Verifying the Dome

To verify the dome instance you should provide additional data inside `scripts/verifyDome.js` file:

- `domeInfo` (cid, tokenName, tokenSymbol)
- `beneficiariesInfo` (cid, wallet, percent up to 10000, representing 100%)
- `yieldProtocol` (yield protocol used in that dome)
- `systemOwner` (The owner of the DomeProtocol at the moment of that Dome deployment)
- `domeProtocolAddress` (The DomeProtocol address)
- `systemOwnerPercentage` (At the moment of that Dome deployment)
- `depositorYieldPercent` (At the moment of that Dome deployment)

```
npm run verifyDome:<network>
```

##

We also support recent deployment verification, which reads deployment metadata and uses that data for verification without any additional configuration:

Using our predefined networks (mainnet, goerli, polygon, mumbai) which are listed in `package.json`

```
npm run verifyLatestDome:<network>
```

Or for you custom ones listed in `hardhat.config.js`

```
npm run  verifyLatestDome -- --network <network>
```
