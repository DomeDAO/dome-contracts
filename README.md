# Dome Contracts

A collection of decentralized protocols for yield generation, donations, and governance for civil society projects.

## Repository Structure

This monorepo contains multiple independent projects with different risk profiles:

| Project       | Path                         | Description                                                                     | Risk Level       |
| ------------- | ---------------------------- | ------------------------------------------------------------------------------- | ---------------- |
| **Dome Safe** | [`dome-safe/`](./dome-safe/) | Original Dome Protocol - stable yield generation with ERC-4626 vaults (Aave)    | 🟢 **Low Risk**  |
| **Dome Risk** | [`dome-risk/`](./dome-risk/) | NGO Vault on Hyperliquid - higher yield potential via Hyperliquid native vaults | 🔴 **High Risk** |

---

## Dome Safe (Low Risk)

The original Dome Protocol enables the creation of dome structures where users can deposit assets, generate yield via ERC-4626 compliant vaults (like Aave), and distribute returns to predefined beneficiaries.

### Key Features

- **Stable Yield Generation** - Integrates with battle-tested ERC-4626 vaults (Aave, etc.)
- **Beneficiary Distribution** - Generated yield distributed to predefined beneficiaries
- **Governance Integration** - Token holders can propose and vote on protocol changes
- **Depositor Rewards** - Configurable percentage of yield allocated to depositors

### Core Contracts

| Contract        | Description                                                   |
| --------------- | ------------------------------------------------------------- |
| `DomeProtocol`  | Factory for creating dome structures with governance settings |
| `DomeCore`      | Main vault - deposit/withdraw assets, mint/burn shares        |
| `Governance`    | Proposal creation, voting, and execution                      |
| `Buffer`        | Asset management and distribution buffer                      |
| `WrappedVoting` | Wraps staked tokens for governance participation              |

📖 **[Full Dome Safe Documentation](./dome-safe/README.md)** _(coming soon)_

---

## Dome Risk (High Risk)

> ⚠️ **WARNING**: This vault deploys capital into Hyperliquid's native vault. Hyperliquid positions are volatile; **you can lose principal** when funding rates or liquidation events move against the position.

NGO Vault is a HyperEVM-native ERC-4626 style vault that aggregates USDC donations, deploys capital into Hyperliquid's native vault, and routes profits toward civil society projects.

### Key Features

- **Higher Yield Potential** - Leverages Hyperliquid's native vaults
- **Donation Mechanism** - Configurable donation percentage (default 10%) to governance buffer
- **Withdrawal Queue** - Handles Hyperliquid's ~24h liquidity release window
- **Governance Projects** - Vote on and fund civil society initiatives

### Core Contracts

| Contract                   | Description                                                   |
| -------------------------- | ------------------------------------------------------------- |
| `NGOVault`                 | Entry point for deposits, redemptions, and withdrawal queuing |
| `NGOShare`                 | Share token (18 decimals) minted/burned by the vault          |
| `NGOGovernance`            | Project registration, voting, and fund disbursement           |
| `NGOGovernanceBuffer`      | Custodies donated USDC until governance release               |
| `HyperliquidBridgeAdapter` | Handles deposits/redemptions against Hyperliquid              |

📖 **[Full Dome Risk Documentation](./dome-risk/README.md)**

---

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) v18+ and [npm](https://www.npmjs.com/)
- Git

### Installation

```bash
# Clone the repository
git clone git@github.com:DomeDAO/dome-contracts.git
cd dome-contracts

# Install root dependencies (for dome-safe)
npm install
```

### Working with Dome Safe

```bash
# Compile contracts
npm run build

# Run tests (requires POLYGON_RPC_URL in .env)
npm run test

# Deploy protocol
npm run deployProtocol -- --network <network>
```

### Working with Dome Risk

```bash
cd dome-risk/contracts
npm install

# Run tests
npm run test

# Deploy to HyperEVM
npx hardhat run scripts/deploy-hyperevm.ts --network hyperevm
```

---

## Environment Variables

Create a `.env` file at the root with the following variables:

### Dome Safe

```env
# Deployment
DEPLOY_PRIV_KEY=<your-private-key>
DOME_CREATION_FEE=<fee-in-wei>
SYSTEM_OWNER_PERCENTAGE=<up-to-2500>
SYSTEM_OWNER=<wallet-address>

# Networks
POLYGON_RPC_URL=<rpc-url>
MAINNET_RPC_URL=<rpc-url>
ARBITRUM_RPC_URL=<rpc-url>

# Verification
POLYGON_API_KEY=<api-key>
MAINNET_API_KEY=<api-key>
ARBITRUM_API_KEY=<api-key>
```

### Dome Risk

See [`dome-risk/contracts/.env.example`](./dome-risk/contracts/.env.example) for HyperEVM-specific configuration.

---

## Supported Networks

### Dome Safe

- Ethereum Mainnet / Goerli
- Polygon Mainnet / Amoy
- Arbitrum One / Arbitrum Sepolia

### Dome Risk

- HyperEVM Testnet (Chain ID: 998)
- HyperEVM Mainnet (Chain ID: 999)

---

## Testing

### Dome Safe

```bash
# Run all tests (Polygon fork)
npm run test

# Tests require POLYGON_RPC_URL to be set
```

### Dome Risk

```bash
cd dome-risk/contracts

# Run all tests
npm run test

# Coverage report
npm run coverage

# Linting
npm run lint
```

---

## Security

- Dome Safe uses battle-tested ERC-4626 vaults with established protocols
- Dome Risk involves volatile Hyperliquid positions - **principal loss is possible**
- Always verify contract addresses before interacting
- Keep private keys secure and use multisig for production deployments

---

## CI/CD

GitHub Actions runs `npm run test` on every push or pull request to `master`. Failing tests block merges.

---

## License

See individual project directories for license information.

---

## Links

- [ERC-4626 Vault List](https://erc4626.info/vaults/) - Compatible yield protocols for Dome Safe
- [Hyperliquid Documentation](https://hyperliquid.xyz/docs) - HyperEVM integration docs
