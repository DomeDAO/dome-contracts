import { BrowserProvider, Contract, ethers } from "https://cdn.jsdelivr.net/npm/ethers@6.10.0/dist/ethers.esm.min.js";

const vaultAbi = [
  "function totalAssets() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function donationBps() view returns (uint16)",
  "function totalDeposited(address) view returns (uint256)",
  "function totalWithdrawn(address) view returns (uint256)",
  "function totalDonated(address) view returns (uint256)",
  "function deposit(uint256 assets, address receiver) returns (uint256)",
  "function redeem(uint256 shares, address receiver) returns (uint256,uint256)",
];

const erc20Abi = [
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];

const shareAbi = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];

const ADDRESS_STORAGE_KEY = "ngovault:addresses";
const AUTO_REFRESH_MS = 20_000;
const SHARE_SCALAR = 1_000_000_000_000n;
const injectedEthereum = typeof window !== "undefined" ? window.ethereum : undefined;
const WALLET_DISPLAY_NAME = injectedEthereum?.isMetaMask ? "MetaMask" : "wallet";

let provider;
let signer;
let account;
let chainId;
let autoRefreshHandle;
let providerInitialized = false;

const state = {
  assetDecimals: 6,
  shareDecimals: 18,
  assetSymbol: "USDC",
  shareSymbol: "NGO",
  totalAssets: 0n,
  totalSupply: 0n,
  donationBps: 0,
  user: {
    usdcBalance: 0n,
    shareBalance: 0n,
    deposited: 0n,
    withdrawn: 0n,
    donated: 0n,
  },
};

const metadataCache = {
  asset: null,
  share: null,
};

const statusEl = document.getElementById("status");
const statsEl = document.getElementById("stats");
const userStatsEl = document.getElementById("user-stats");
const connectionBadge = document.getElementById("connection-badge");
const connectBtn = document.getElementById("connect-btn");
const refreshBtn = document.getElementById("refresh-btn");
const depositBtn = document.getElementById("deposit-btn");
const redeemBtn = document.getElementById("redeem-btn");
const depositInput = document.getElementById("deposit-input");
const redeemInput = document.getElementById("redeem-input");
const depositPreviewEl = document.getElementById("deposit-preview");
const redeemPreviewEl = document.getElementById("redeem-preview");
const depositMaxBtn = document.getElementById("deposit-max-btn");
const redeemMaxBtn = document.getElementById("redeem-max-btn");
const loadJsonBtn = document.getElementById("load-json-btn");
const clearAddressesBtn = document.getElementById("clear-addresses-btn");
const depositLabel = document.getElementById("deposit-label");
const redeemLabel = document.getElementById("redeem-label");

statsEl.innerHTML = `<p class="muted">Provide contract addresses to view stats.</p>`;
userStatsEl.innerHTML = `<p class="muted">Connect a wallet to view your balances.</p>`;

restoreSavedAddresses();
updateActionLabels();
updateDepositPreview();
updateRedeemPreview();
updateActionButtons();
updateConnectionBadge();

connectBtn.addEventListener("click", connectWallet);
refreshBtn.addEventListener("click", () => refreshStats());
depositBtn.addEventListener("click", deposit);
redeemBtn.addEventListener("click", redeem);
loadJsonBtn.addEventListener("click", loadDeploymentJson);
clearAddressesBtn?.addEventListener("click", clearSavedAddresses);
depositMaxBtn?.addEventListener("click", fillMaxDeposit);
redeemMaxBtn?.addEventListener("click", fillMaxRedeem);
depositInput.addEventListener("input", () => updateDepositPreview());
redeemInput.addEventListener("input", () => updateRedeemPreview());

["vault-address", "asset-address", "share-address"].forEach((id) => {
  const input = document.getElementById(id);
  input.addEventListener("change", () => handleAddressInputChange());
});
initProvider();

function log(message) {
  const timestamp = new Date().toLocaleTimeString();
  statusEl.textContent = `[${timestamp}] ${message}`;
}

function formatUsd(value, decimals = state.assetDecimals, precision = 2) {
  const scaled = Number(ethers.formatUnits(value ?? 0n, decimals));
  if (!Number.isFinite(scaled)) return "$0.00";
  return `$${scaled.toLocaleString(undefined, {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  })}`;
}

function formatToken(value, decimals, precision = 4) {
  const scaled = Number(ethers.formatUnits(value ?? 0n, decimals));
  if (!Number.isFinite(scaled)) return "0";
  return scaled.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: precision,
  });
}

function shorten(address) {
  if (!address) return "";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function getAddresses() {
  return {
    vault: document.getElementById("vault-address").value.trim(),
    asset: document.getElementById("asset-address").value.trim(),
    share: document.getElementById("share-address").value.trim(),
  };
}

function addressesAreValid(addresses) {
  return ["vault", "asset", "share"].every((key) => ethers.isAddress(addresses[key] ?? ""));
}

function persistAddresses() {
  try {
    localStorage.setItem(ADDRESS_STORAGE_KEY, JSON.stringify(getAddresses()));
  } catch (error) {
    console.warn("Unable to persist addresses", error);
  }
}

function restoreSavedAddresses() {
  try {
    const saved = localStorage.getItem(ADDRESS_STORAGE_KEY);
    if (!saved) return;
    const parsed = JSON.parse(saved);
    document.getElementById("vault-address").value = parsed.vault ?? "";
    document.getElementById("asset-address").value = parsed.asset ?? "";
    document.getElementById("share-address").value = parsed.share ?? "";
  } catch (error) {
    console.warn("Unable to restore saved addresses", error);
  }
}

function clearSavedAddresses() {
  localStorage.removeItem(ADDRESS_STORAGE_KEY);
  document.getElementById("vault-address").value = "";
  document.getElementById("asset-address").value = "";
  document.getElementById("share-address").value = "";
  metadataCache.asset = null;
  metadataCache.share = null;
  statsEl.innerHTML = `<p class="muted">Provide contract addresses to view stats.</p>`;
  userStatsEl.innerHTML = `<p class="muted">Connect a wallet to view your balances.</p>`;
  updateDepositPreview();
  updateRedeemPreview();
  log("Cleared saved addresses.");
}

function handleAddressInputChange() {
  persistAddresses();
  updateDepositPreview();
  updateRedeemPreview();
  refreshStats({ silent: true });
}

async function initProvider() {
  if (providerInitialized) {
    return provider;
  }
  if (!window.ethereum) {
    log("MetaMask not detected. Install it to connect.");
    updateConnectionBadge();
    return undefined;
  }

  providerInitialized = true;
  provider = new BrowserProvider(window.ethereum);

  try {
    const network = await provider.getNetwork();
    chainId = Number(network.chainId);
  } catch (error) {
    console.warn("Unable to read network", error);
  }

  if (typeof window.ethereum.on === "function") {
    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged", handleChainChanged);
  }

  updateConnectionBadge();
  await attemptEagerConnection();
  await refreshStats({ silent: true });
  return provider;
}

async function attemptEagerConnection() {
  if (!provider) return;
  try {
    const accounts = await provider.listAccounts();
    const nextAccount = normalizeAccount(accounts?.[0]);
    if (nextAccount) {
      account = nextAccount;
      signer = await provider.getSigner(nextAccount);
      log(`Reconnected as ${shorten(nextAccount)}.`);
    } else {
      account = undefined;
      signer = undefined;
    }
  } catch (error) {
    console.warn("Unable to eager connect", error);
  } finally {
    updateConnectionBadge();
  }
}

async function loadDeploymentJson() {
  if (!provider) {
    log("Connect or install a wallet first.");
    return;
  }
  await ensureChainId();
  if (!chainId) {
    log("Unable to detect chainId.");
    return;
  }
  try {
    const response = await fetch(`/deployments/${chainId}.json`, { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Deployment JSON not found.");
    }
    const json = await response.json();
    document.getElementById("vault-address").value = json.contracts?.vault ?? "";
    document.getElementById("asset-address").value = json.contracts?.usdc ?? "";
    document.getElementById("share-address").value = json.contracts?.share ?? "";
    persistAddresses();
    log(`Loaded deployment for chain ${chainId}.`);
    await refreshStats();
  } catch (error) {
    console.error(error);
    log(`Unable to load deployment JSON: ${error.message}`);
  }
}

async function connectWallet() {
  if (!window.ethereum) {
    log("MetaMask not detected. Install it to continue.");
    return;
  }

  await initProvider();
  if (!provider) return;

  try {
    const accounts = await provider.send("eth_requestAccounts", []);
    const nextAccount = normalizeAccount(accounts?.[0]);
    account = nextAccount;
    signer = nextAccount ? await provider.getSigner(nextAccount) : undefined;
    const network = await provider.getNetwork();
    chainId = Number(network.chainId);
    updateConnectionBadge();
    log(`Connected as ${shorten(account)} on chain ${chainId}.`);
    updateActionButtons();
    await refreshStats();
  } catch (error) {
    console.error(error);
    log(`Connection failed: ${error.message}`);
  }
}

async function handleAccountsChanged(accounts = []) {
  const nextAccount = normalizeAccount(accounts[0]);
  if (nextAccount && provider) {
    account = nextAccount;
    signer = await provider.getSigner(nextAccount);
  } else {
    account = undefined;
    signer = undefined;
  }
  updateConnectionBadge();
  updateActionButtons();
  if (account) {
    log(`Switched to ${shorten(account)}.`);
  } else {
    log("Wallet disconnected.");
  }
  refreshStats({ silent: true });
}

async function handleChainChanged(newChainId) {
  chainId = Number.parseInt(newChainId, 16);
  if (window.ethereum) {
    provider = new BrowserProvider(window.ethereum);
    if (account) {
      try {
        signer = await provider.getSigner(account);
      } catch (error) {
        console.warn("Unable to refresh signer on chain change", error);
        signer = undefined;
      }
    } else {
      signer = undefined;
    }
  } else {
    provider = undefined;
    signer = undefined;
  }
  metadataCache.asset = null;
  metadataCache.share = null;
  updateConnectionBadge();
  updateActionButtons();
  log(`Switched to chain ${chainId}.`);
  refreshStats();
}

function updateConnectionBadge() {
  if (!connectionBadge) return;
  if (!window.ethereum) {
    connectionBadge.textContent = "Install MetaMask to connect.";
    if (connectBtn) {
      connectBtn.textContent = "MetaMask required";
      connectBtn.disabled = true;
    }
    updateActionButtons();
    return;
  }

  if (connectBtn) {
    connectBtn.disabled = false;
  }

  if (account) {
    connectionBadge.textContent = `Connected ${shorten(account)} · Chain ${chainId ?? "?"}`;
    if (connectBtn) {
      connectBtn.textContent = `Switch ${WALLET_DISPLAY_NAME}`;
    }
  } else if (chainId) {
    connectionBadge.textContent = `Viewing chain ${chainId} · read only`;
    if (connectBtn) {
      connectBtn.textContent = `Connect ${WALLET_DISPLAY_NAME}`;
    }
  } else {
    connectionBadge.textContent = `${WALLET_DISPLAY_NAME} not connected.`;
    if (connectBtn) {
      connectBtn.textContent = `Connect ${WALLET_DISPLAY_NAME}`;
    }
  }
  updateActionButtons();
}

function updateActionLabels() {
  if (depositLabel) {
    depositLabel.textContent = `Deposit ${state.assetSymbol}`;
  }
  if (redeemLabel) {
    redeemLabel.textContent = `Redeem ${state.shareSymbol}`;
  }
}

function updateActionButtons() {
  const hasSigner = Boolean(signer);
  [depositBtn, redeemBtn].forEach((btn) => {
    if (btn) {
      btn.disabled = !hasSigner;
    }
  });
  [depositMaxBtn, redeemMaxBtn].forEach((btn) => {
    if (btn) {
      btn.disabled = !hasSigner;
    }
  });
}

function ensureAutoRefresh() {
  if (autoRefreshHandle || typeof window === "undefined") return;
  autoRefreshHandle = window.setInterval(() => {
    refreshStats({ silent: true });
  }, AUTO_REFRESH_MS);
}

async function ensureChainId() {
  if (chainId || !provider) return chainId;
  const network = await provider.getNetwork();
  chainId = Number(network.chainId);
  updateConnectionBadge();
  return chainId;
}

async function refreshStats({ silent = false } = {}) {
  if (!provider) {
    if (!silent) log("Connect a wallet to load stats.");
    return false;
  }

  const addresses = getAddresses();
  if (!addressesAreValid(addresses)) {
    if (!silent) {
      log("Enter valid vault, asset, and share addresses.");
    }
    return false;
  }

  if (!silent) {
    log("Fetching latest stats...");
  }

  try {
    const runner = signer ?? provider;
    const vaultContract = new Contract(addresses.vault, vaultAbi, runner);
    const assetContract = new Contract(addresses.asset, erc20Abi, runner);
    const shareContract = new Contract(addresses.share, shareAbi, runner);

    await ensureTokenMetadata(addresses, assetContract, shareContract);

    const [totalAssets, totalSupply, donationBps] = await Promise.all([
      vaultContract.totalAssets(),
      vaultContract.totalSupply(),
      vaultContract.donationBps(),
    ]);

    state.totalAssets = totalAssets;
    state.totalSupply = totalSupply;
    state.donationBps = Number(donationBps);

    renderVaultStats();

    if (account) {
      const [shareBalance, usdcBalance, deposited, withdrawn, donated] = await Promise.all([
        shareContract.balanceOf(account),
        assetContract.balanceOf(account),
        vaultContract.totalDeposited(account),
        vaultContract.totalWithdrawn(account),
        vaultContract.totalDonated(account),
      ]);

      state.user = {
        shareBalance,
        usdcBalance,
        deposited,
        withdrawn,
        donated,
      };

      renderUserStats();
    } else {
      state.user = {
        shareBalance: 0n,
        usdcBalance: 0n,
        deposited: 0n,
        withdrawn: 0n,
        donated: 0n,
      };
      userStatsEl.innerHTML = `<p class="muted">Connect a wallet to view your balances.</p>`;
    }

    updateDepositPreview();
    updateRedeemPreview();
    updateActionLabels();

    if (!silent) {
      log("Stats refreshed.");
    }
    ensureAutoRefresh();
    return true;
  } catch (error) {
    console.error(error);
    log(`Unable to load stats: ${error.shortMessage ?? error.message}`);
    return false;
  }
}

async function ensureTokenMetadata(addresses, assetContract, shareContract) {
  const tasks = [];

  if (metadataCache.asset !== addresses.asset) {
    metadataCache.asset = addresses.asset;
    tasks.push(
      assetContract
        .decimals()
        .then((value) => {
          state.assetDecimals = Number(value);
        })
        .catch(() => {
          state.assetDecimals = 6;
        }),
      assetContract
        .symbol()
        .then((symbol) => {
          state.assetSymbol = symbol || "ASSET";
        })
        .catch(() => {
          state.assetSymbol = "ASSET";
        })
    );
  }

  if (metadataCache.share !== addresses.share) {
    metadataCache.share = addresses.share;
    tasks.push(
      shareContract
        .decimals()
        .then((value) => {
          state.shareDecimals = Number(value);
        })
        .catch(() => {
          state.shareDecimals = 18;
        }),
      shareContract
        .symbol()
        .then((symbol) => {
          state.shareSymbol = symbol || "SHARE";
        })
        .catch(() => {
          state.shareSymbol = "SHARE";
        })
    );
  }

  if (tasks.length) {
    await Promise.all(tasks);
  }
}

function renderVaultStats() {
  const price = computeSharePrice();
  statsEl.innerHTML = `
    <div><span>Total Assets (${state.assetSymbol})</span><strong>${formatUsd(state.totalAssets)}</strong></div>
    <div><span>Total Supply (${state.shareSymbol})</span><strong>${formatToken(
      state.totalSupply,
      state.shareDecimals
    )}</strong></div>
    <div><span>Price / Share</span><strong>$${price.toFixed(4)}</strong></div>
    <div><span>Donation Rate</span><strong>${(state.donationBps / 100).toFixed(2)}%</strong></div>
  `;
}

function renderUserStats() {
  const { usdcBalance, shareBalance, deposited, withdrawn, donated } = state.user;
  userStatsEl.innerHTML = `
    <div><span>Your ${state.assetSymbol}</span><strong>${formatUsd(usdcBalance)}</strong></div>
    <div><span>Your ${state.shareSymbol}</span><strong>${formatToken(
      shareBalance,
      state.shareDecimals
    )}</strong></div>
    <div><span>Total Deposited</span><strong>${formatUsd(deposited)}</strong></div>
    <div><span>Total Withdrawn</span><strong>${formatUsd(withdrawn)}</strong></div>
    <div><span>Total Donated</span><strong>${formatUsd(donated)}</strong></div>
  `;
}

function computeSharePrice() {
  const assets = Number(ethers.formatUnits(state.totalAssets ?? 0n, state.assetDecimals));
  const shares = Number(ethers.formatUnits(state.totalSupply ?? 0n, state.shareDecimals));
  if (!shares || !Number.isFinite(assets) || !Number.isFinite(shares) || shares === 0) {
    return 0;
  }
  return assets / shares;
}

function estimateSharesForDeposit(amount) {
  if (amount <= 0n) return 0n;
  if (state.totalSupply === 0n || state.totalAssets === 0n) {
    return amount * SHARE_SCALAR;
  }
  return (amount * state.totalSupply) / state.totalAssets;
}

function estimateAssetsFromShares(shares) {
  if (shares <= 0n || state.totalSupply === 0n) return 0n;
  return (shares * state.totalAssets) / state.totalSupply;
}

function updateDepositPreview() {
  const raw = depositInput.value.trim();
  if (!raw) {
    depositPreviewEl.textContent = "Enter an amount to preview.";
    return;
  }
  try {
    const amount = ethers.parseUnits(raw, state.assetDecimals);
    if (amount === 0n) {
      depositPreviewEl.textContent = "Amount must be greater than zero.";
      return;
    }
    const shares = estimateSharesForDeposit(amount);
    if (shares === 0n) {
      depositPreviewEl.textContent = "Vault stats not available yet.";
      return;
    }
    depositPreviewEl.textContent = `≈ ${formatToken(shares, state.shareDecimals)} ${
      state.shareSymbol
    } for ${formatUsd(amount)}`;
  } catch (error) {
    depositPreviewEl.textContent = "Enter a valid number.";
  }
}

function updateRedeemPreview() {
  const raw = redeemInput.value.trim();
  if (!raw) {
    redeemPreviewEl.textContent = "Enter shares to see an estimate.";
    return;
  }
  try {
    const shares = ethers.parseUnits(raw, state.shareDecimals);
    if (shares === 0n) {
      redeemPreviewEl.textContent = "Amount must be greater than zero.";
      return;
    }
    const gross = estimateAssetsFromShares(shares);
    if (gross === 0n) {
      redeemPreviewEl.textContent = "Vault has no assets yet.";
      return;
    }
    const donationCap = (gross * BigInt(state.donationBps ?? 0)) / 10_000n;
    const netEstimate = gross - donationCap;
    redeemPreviewEl.textContent = `≈ ${formatUsd(netEstimate)} after up to ${formatUsd(
      donationCap
    )} donation (${(state.donationBps / 100).toFixed(2)}% cap).`;
  } catch (error) {
    redeemPreviewEl.textContent = "Enter a valid number.";
  }
}

async function deposit() {
  if (!signer) {
    log("Connect wallet to deposit.");
    return;
  }

  const { vault, asset } = getAddresses();
  if (!ethers.isAddress(vault) || !ethers.isAddress(asset)) {
    log("Enter valid vault and asset addresses.");
    return;
  }

  let amount;
  try {
    amount = ethers.parseUnits(depositInput.value || "0", state.assetDecimals);
  } catch {
    log("Enter a valid deposit amount.");
    return;
  }

  if (amount === 0n) {
    log("Enter a deposit amount.");
    return;
  }

  setButtonBusy(depositBtn, true, "Depositing...");

  try {
    const assetContract = new Contract(asset, erc20Abi, signer);
    const vaultContract = new Contract(vault, vaultAbi, signer);
    const allowance = await assetContract.allowance(account, vault);
    if (allowance < amount) {
      log("Approving asset spend...");
      const approveTx = await assetContract.approve(vault, amount);
      await approveTx.wait();
    }

    log("Submitting deposit...");
    const tx = await vaultContract.deposit(amount, account);
    await tx.wait();
    depositInput.value = "";
    log("Deposit confirmed.");
    await refreshStats();
  } catch (error) {
    console.error(error);
    log(`Deposit failed: ${error.shortMessage ?? error.message}`);
  } finally {
    setButtonBusy(depositBtn, false);
  }
}

async function redeem() {
  if (!signer) {
    log("Connect wallet to redeem.");
    return;
  }

  const { vault } = getAddresses();
  if (!ethers.isAddress(vault)) {
    log("Enter a valid vault address.");
    return;
  }

  let shares;
  try {
    shares = ethers.parseUnits(redeemInput.value || "0", state.shareDecimals);
  } catch {
    log("Enter a valid share amount.");
    return;
  }

  if (shares === 0n) {
    log("Enter share amount to redeem.");
    return;
  }

  setButtonBusy(redeemBtn, true, "Redeeming...");

  try {
    const vaultContract = new Contract(vault, vaultAbi, signer);
    log("Submitting redemption...");
    const tx = await vaultContract.redeem(shares, account);
    await tx.wait();
    redeemInput.value = "";
    log("Redemption confirmed.");
    await refreshStats();
  } catch (error) {
    console.error(error);
    log(`Redeem failed: ${error.shortMessage ?? error.message}`);
  } finally {
    setButtonBusy(redeemBtn, false);
  }
}

function setButtonBusy(button, isBusy, busyText = "Working...") {
  if (!button.dataset.idle) {
    button.dataset.idle = button.textContent;
  }
  if (isBusy) {
    button.disabled = true;
    button.textContent = busyText;
  } else {
    button.disabled = false;
    button.textContent = button.dataset.idle;
  }
}

function fillMaxDeposit() {
  if (!account) {
    log("Connect a wallet to load your balance.");
    return;
  }
  depositInput.value = ethers.formatUnits(state.user.usdcBalance ?? 0n, state.assetDecimals);
  updateDepositPreview();
}

function fillMaxRedeem() {
  if (!account) {
    log("Connect a wallet to load your balance.");
    return;
  }
  redeemInput.value = ethers.formatUnits(state.user.shareBalance ?? 0n, state.shareDecimals);
  updateRedeemPreview();
}

window.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    refreshStats({ silent: true });
  }
});

function normalizeAccount(value) {
  if (!value) return undefined;
  if (typeof value === "string") return value;
  if (typeof value.address === "string") return value.address;
  return undefined;
}
