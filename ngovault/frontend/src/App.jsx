import { useCallback, useEffect, useMemo, useState } from "react";
import { BrowserProvider, Contract, ethers } from "ethers";

const vaultAbi = [
  "function totalAssets() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function donationBps() view returns (uint16)",
  "function totalQueuedWithdrawalAssets() view returns (uint256)",
  "function totalDeposited(address) view returns (uint256)",
  "function totalWithdrawn(address) view returns (uint256)",
  "function totalDonated(address) view returns (uint256)",
  "function queuedWithdrawals(address) view returns (uint256 shares,uint256 assets,uint256 net,uint256 donation,address receiver,uint256 timestamp)",
  "function deposit(uint256 assets, address receiver) returns (uint256)",
  "function redeem(uint256 shares, address receiver) returns (uint256,uint256)",
  "function processQueuedWithdrawal(address user) returns (uint256,uint256)",
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

const SHARE_SCALAR = 1_000_000_000_000n;
const AUTO_REFRESH_MS = 20_000;
const WITHDRAWAL_LOCK_SECONDS = 60 * 60 * 24;
const ADDRESS_STORAGE_KEY = "ngovault:addresses";
const emptyAddresses = { vault: "", asset: "", share: "" };

const defaultUserStats = {
  usdcBalance: 0n,
  shareBalance: 0n,
  deposited: 0n,
  withdrawn: 0n,
  donated: 0n,
};

const defaultVaultStats = {
  totalAssets: 0n,
  totalSupply: 0n,
  donationBps: 0,
  totalQueuedAssets: 0n,
};

const defaultMeta = {
  assetDecimals: 6,
  shareDecimals: 18,
  assetSymbol: "USDC",
  shareSymbol: "NGO",
};

function App() {
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [account, setAccount] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [status, setStatus] = useState("Connect wallet to begin.");
  const [addresses, setAddresses] = useState(() => {
    if (typeof window === "undefined") return emptyAddresses;
    try {
      return JSON.parse(window.localStorage.getItem(ADDRESS_STORAGE_KEY)) ?? emptyAddresses;
    } catch {
      return emptyAddresses;
    }
  });
  const [meta, setMeta] = useState(defaultMeta);
  const [vaultStats, setVaultStats] = useState(defaultVaultStats);
  const [userStats, setUserStats] = useState(defaultUserStats);
  const [queueInfo, setQueueInfo] = useState(null);
  const [depositAmount, setDepositAmount] = useState("");
  const [redeemAmount, setRedeemAmount] = useState("");
  const [busy, setBusy] = useState({ deposit: false, redeem: false, process: false });

  const log = useCallback((message) => {
    const timestamp = new Date().toLocaleTimeString();
    setStatus(`[${timestamp}] ${message}`);
  }, []);

  const addressesAreValid = useMemo(
    () => ["vault", "asset", "share"].every((key) => ethers.isAddress(addresses[key] ?? "")),
    [addresses]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(ADDRESS_STORAGE_KEY, JSON.stringify(addresses));
    } catch {
      // ignore storage errors
    }
  }, [addresses]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.ethereum) {
      log("MetaMask not detected. Install it to continue.");
      return;
    }

    let mounted = true;
    const browserProvider = new BrowserProvider(window.ethereum);
    setProvider(browserProvider);

    const init = async () => {
      try {
        const network = await browserProvider.getNetwork();
        if (!mounted) return;
        setChainId(Number(network.chainId));
        const accounts = await browserProvider.listAccounts();
        if (!mounted) return;
        const nextAccount = normalizeAccount(accounts?.[0]);
        if (nextAccount) {
          setAccount(nextAccount);
          setSigner(await browserProvider.getSigner(nextAccount));
          log(`Reconnected as ${shorten(nextAccount)}.`);
        }
      } catch (error) {
        console.warn("Provider init failed", error);
      }
    };

    init();

    const handleAccountsChanged = async (accounts = []) => {
      const nextAccount = normalizeAccount(accounts[0]);
      if (!nextAccount) {
        setAccount(null);
        setSigner(null);
        setUserStats(defaultUserStats);
        setQueueInfo(null);
        log("Wallet disconnected.");
        return;
      }
      setAccount(nextAccount);
      if (browserProvider) {
        try {
          setSigner(await browserProvider.getSigner(nextAccount));
        } catch (error) {
          console.warn("Unable to refresh signer", error);
          setSigner(null);
        }
      }
      log(`Switched to ${shorten(nextAccount)}.`);
      refreshStats(true);
    };

    const handleChainChanged = async (hexChainId) => {
      const numeric = Number.parseInt(hexChainId, 16);
      setChainId(Number.isNaN(numeric) ? null : numeric);
      setSigner(null);
      setQueueInfo(null);
      log(`Switched to chain ${numeric}.`);
      await refreshStats();
    };

    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged", handleChainChanged);

    return () => {
      mounted = false;
      window.ethereum?.removeListener("accountsChanged", handleAccountsChanged);
      window.ethereum?.removeListener("chainChanged", handleChainChanged);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshStats = useCallback(
    async (silent = false) => {
      if (!provider) {
        if (!silent) log("Connect a wallet to load stats.");
        return false;
      }

      if (!addressesAreValid) {
        if (!silent) log("Enter valid vault, asset, and share addresses.");
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

        const [
          totalAssets,
          totalSupply,
          donationBps,
          totalQueuedWithdrawalAssets,
          assetDecimals,
          assetSymbol,
          shareDecimals,
          shareSymbol,
        ] = await Promise.all([
          vaultContract.totalAssets(),
          vaultContract.totalSupply(),
          vaultContract.donationBps(),
          vaultContract.totalQueuedWithdrawalAssets(),
          assetContract.decimals().catch(() => meta.assetDecimals),
          assetContract.symbol().catch(() => meta.assetSymbol),
          shareContract.decimals().catch(() => meta.shareDecimals),
          shareContract.symbol().catch(() => meta.shareSymbol),
        ]);

        setMeta({
          assetDecimals: Number(assetDecimals),
          assetSymbol: assetSymbol || "ASSET",
          shareDecimals: Number(shareDecimals),
          shareSymbol: shareSymbol || "SHARE",
        });

        setVaultStats({
          totalAssets,
          totalSupply,
          donationBps: Number(donationBps),
          totalQueuedAssets: totalQueuedWithdrawalAssets,
        });

        if (account) {
          const [shareBalance, usdcBalance, deposited, withdrawn, donated, queueStruct] = await Promise.all([
            shareContract.balanceOf(account),
            assetContract.balanceOf(account),
            vaultContract.totalDeposited(account),
            vaultContract.totalWithdrawn(account),
            vaultContract.totalDonated(account),
            vaultContract.queuedWithdrawals(account),
          ]);

          setUserStats({
            shareBalance,
            usdcBalance,
            deposited,
            withdrawn,
            donated,
          });
          setQueueInfo(normalizeQueueStruct(queueStruct));
        } else {
          setUserStats(defaultUserStats);
          setQueueInfo(null);
        }

        if (!silent) {
          log("Stats refreshed.");
        }
        return true;
      } catch (error) {
        console.error(error);
        log(`Unable to load stats: ${error.shortMessage ?? error.message}`);
        return false;
      }
    },
    [account, addresses, addressesAreValid, log, meta.assetDecimals, meta.assetSymbol, meta.shareDecimals, meta.shareSymbol, provider, signer]
  );

  useEffect(() => {
    if (!provider || !addressesAreValid) return undefined;
    const interval = setInterval(() => {
      refreshStats(true);
    }, AUTO_REFRESH_MS);
    return () => clearInterval(interval);
  }, [addressesAreValid, provider, refreshStats]);

  useEffect(() => {
    const handleVisibility = () => {
      if (!document.hidden) {
        refreshStats(true);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [refreshStats]);

  const connectWallet = useCallback(async () => {
    if (typeof window === "undefined" || !window.ethereum) {
      log("MetaMask not detected. Install it to continue.");
      return;
    }
    try {
      const nextProvider = provider ?? new BrowserProvider(window.ethereum);
      setProvider(nextProvider);
      const accounts = await nextProvider.send("eth_requestAccounts", []);
      const nextAccount = normalizeAccount(accounts?.[0]);
      if (!nextAccount) {
        log("Connection rejected.");
        return;
      }
      setAccount(nextAccount);
      setSigner(await nextProvider.getSigner(nextAccount));
      const network = await nextProvider.getNetwork();
      setChainId(Number(network.chainId));
      log(`Connected as ${shorten(nextAccount)} on chain ${Number(network.chainId)}.`);
      await refreshStats();
    } catch (error) {
      console.error(error);
      log(`Connection failed: ${error.message}`);
    }
  }, [log, provider, refreshStats]);

  const handleAddressChange = (key, value) => {
    setAddresses((prev) => ({ ...prev, [key]: value.trim() }));
  };

  const clearAddresses = () => {
    setAddresses(emptyAddresses);
    setMeta(defaultMeta);
    setVaultStats(defaultVaultStats);
    setUserStats(defaultUserStats);
    setQueueInfo(null);
    log("Cleared saved addresses.");
  };

  const loadDeploymentJson = async () => {
    if (!chainId) {
      await refreshStats(true);
    }
    if (!chainId) {
      log("Connect a wallet to detect the chain first.");
      return;
    }

    try {
      const response = await fetch(`/deployments/${chainId}.json`, { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Deployment JSON not found. Update public/deployments.");
      }
      const json = await response.json();
      setAddresses({
        vault: json.contracts?.vault ?? "",
        asset: json.contracts?.usdc ?? "",
        share: json.contracts?.share ?? "",
      });
      log(`Loaded deployment for chain ${chainId}.`);
      await refreshStats();
    } catch (error) {
      console.error(error);
      log(`Unable to load deployment JSON: ${error.message}`);
    }
  };

  const hasQueuedWithdrawal = Boolean(queueInfo && queueInfo.shares > 0n);
  const canTransact = Boolean(signer) && !hasQueuedWithdrawal;

  const depositPreview = useMemo(() => {
    if (!depositAmount) return "Enter an amount to preview.";
    try {
      const amount = ethers.parseUnits(depositAmount, meta.assetDecimals);
      if (amount === 0n) return "Amount must be greater than zero.";
      const shares = estimateSharesForDeposit(amount, vaultStats.totalSupply, vaultStats.totalAssets);
      if (shares === 0n) return "Vault stats not available yet.";
      return `≈ ${formatToken(shares, meta.shareDecimals)} ${meta.shareSymbol} for ${formatUsd(amount, meta.assetDecimals)}`;
    } catch {
      return "Enter a valid number.";
    }
  }, [depositAmount, meta.assetDecimals, meta.shareDecimals, meta.shareSymbol, vaultStats.totalAssets, vaultStats.totalSupply]);

  const redeemPreview = useMemo(() => {
    if (!redeemAmount) return "Enter shares to see an estimate.";
    try {
      const shares = ethers.parseUnits(redeemAmount, meta.shareDecimals);
      if (shares === 0n) return "Amount must be greater than zero.";
      const gross = estimateAssetsFromShares(shares, vaultStats.totalSupply, vaultStats.totalAssets);
      if (gross === 0n) return "Vault has no assets yet.";
      const donationCap = (gross * BigInt(vaultStats.donationBps ?? 0)) / 10_000n;
      const netEstimate = gross - donationCap;
      return `≈ ${formatUsd(netEstimate, meta.assetDecimals)} after up to ${formatUsd(
        donationCap,
        meta.assetDecimals
      )} donation (${(vaultStats.donationBps / 100).toFixed(2)}% cap).`;
    } catch {
      return "Enter a valid number.";
    }
  }, [
    meta.assetDecimals,
    meta.shareDecimals,
    redeemAmount,
    vaultStats.donationBps,
    vaultStats.totalAssets,
    vaultStats.totalSupply,
  ]);

  const sharePrice = useMemo(() => {
    const assets = Number(ethers.formatUnits(vaultStats.totalAssets ?? 0n, meta.assetDecimals));
    const shares = Number(ethers.formatUnits(vaultStats.totalSupply ?? 0n, meta.shareDecimals));
    if (!shares || !Number.isFinite(assets) || !Number.isFinite(shares) || shares === 0) return 0;
    return assets / shares;
  }, [meta.assetDecimals, meta.shareDecimals, vaultStats.totalAssets, vaultStats.totalSupply]);

  const deposit = async () => {
    if (!signer) {
      log("Connect wallet to deposit.");
      return;
    }
    if (hasQueuedWithdrawal) {
      log("Process your pending withdrawal before depositing again.");
      return;
    }
    if (!addressesAreValid) {
      log("Enter valid vault and asset addresses.");
      return;
    }
    let amount;
    try {
      amount = ethers.parseUnits(depositAmount || "0", meta.assetDecimals);
    } catch {
      log("Enter a valid deposit amount.");
      return;
    }
    if (amount === 0n) {
      log("Enter a deposit amount.");
      return;
    }

    setBusy((prev) => ({ ...prev, deposit: true }));
    try {
      const assetContract = new Contract(addresses.asset, erc20Abi, signer);
      const vaultContract = new Contract(addresses.vault, vaultAbi, signer);
      const allowance = await assetContract.allowance(account, addresses.vault);
      if (allowance < amount) {
        log("Approving asset spend...");
        const approveTx = await assetContract.approve(addresses.vault, amount);
        await approveTx.wait();
      }
      log("Submitting deposit...");
      const tx = await vaultContract.deposit(amount, account);
      await tx.wait();
      setDepositAmount("");
      log("Deposit confirmed.");
      await refreshStats();
    } catch (error) {
      console.error(error);
      log(`Deposit failed: ${error.shortMessage ?? error.message}`);
    } finally {
      setBusy((prev) => ({ ...prev, deposit: false }));
    }
  };

  const redeem = async () => {
    if (!signer) {
      log("Connect wallet to redeem.");
      return;
    }
    if (hasQueuedWithdrawal) {
      log("Process the pending withdrawal before redeeming again.");
      return;
    }
    if (!ethers.isAddress(addresses.vault)) {
      log("Enter a valid vault address.");
      return;
    }
    let shares;
    try {
      shares = ethers.parseUnits(redeemAmount || "0", meta.shareDecimals);
    } catch {
      log("Enter a valid share amount.");
      return;
    }
    if (shares === 0n) {
      log("Enter share amount to redeem.");
      return;
    }

    setBusy((prev) => ({ ...prev, redeem: true }));
    try {
      const vaultContract = new Contract(addresses.vault, vaultAbi, signer);
      log("Submitting redemption...");
      const tx = await vaultContract.redeem(shares, account);
      await tx.wait();
      setRedeemAmount("");
      log("Redemption confirmed.");
      await refreshStats();
    } catch (error) {
      console.error(error);
      log(`Redeem failed: ${error.shortMessage ?? error.message}`);
    } finally {
      setBusy((prev) => ({ ...prev, redeem: false }));
    }
  };

  const processQueuedWithdrawal = async () => {
    if (!signer) {
      log("Connect wallet to process withdrawals.");
      return;
    }
    if (!hasQueuedWithdrawal) {
      log("No queued withdrawal found for this wallet.");
      return;
    }
    if (!ethers.isAddress(addresses.vault)) {
      log("Enter a valid vault address first.");
      return;
    }

    setBusy((prev) => ({ ...prev, process: true }));
    try {
      const vaultContract = new Contract(addresses.vault, vaultAbi, signer);
      log("Processing queued withdrawal...");
      const tx = await vaultContract.processQueuedWithdrawal(account);
      await tx.wait();
      log("Queued withdrawal processed.");
      await refreshStats();
    } catch (error) {
      console.error(error);
      log(`Processing failed: ${error.shortMessage ?? error.message}`);
    } finally {
      setBusy((prev) => ({ ...prev, process: false }));
    }
  };

  const fillMaxDeposit = () => {
    if (!account) {
      log("Connect a wallet to load your balance.");
      return;
    }
    setDepositAmount(ethers.formatUnits(userStats.usdcBalance ?? 0n, meta.assetDecimals));
  };

  const fillMaxRedeem = () => {
    if (!account) {
      log("Connect a wallet to load your balance.");
      return;
    }
    setRedeemAmount(ethers.formatUnits(userStats.shareBalance ?? 0n, meta.shareDecimals));
  };

  const queueReadyText = useMemo(() => {
    if (!queueInfo || queueInfo.shares === 0n) return null;
    const readyAt = queueInfo.timestamp ? queueInfo.timestamp + WITHDRAWAL_LOCK_SECONDS : 0;
    const now = Math.floor(Date.now() / 1000);
    if (!readyAt) return "Awaiting bridge release from the strategy.";
    if (now >= readyAt) {
      return `Lock window elapsed · ready since ${formatDateTime(readyAt)}`;
    }
    return `Estimated unlock in ${formatDuration(readyAt - now)} (ready ≈ ${formatDateTime(readyAt)})`;
  }, [queueInfo]);

  const connectionBadge = useMemo(() => {
    if (typeof window === "undefined" || !window.ethereum) {
      return "Install MetaMask to connect.";
    }
    if (account) {
      return `Connected ${shorten(account)} · Chain ${chainId ?? "?"}`;
    }
    if (chainId) {
      return `Viewing chain ${chainId} · read only`;
    }
    return "Wallet not connected.";
  }, [account, chainId]);

  return (
    <main className="app">
      <header>
        <div>
          <h1>NGO Vault</h1>
          <p className="muted">Stake USDC on HyperEVM and track Hyperliquid bridge settlements.</p>
          <p className="muted badge">{connectionBadge}</p>
        </div>
        <div className="header-actions">
          <button className="secondary" onClick={() => refreshStats()} disabled={!addressesAreValid || !provider}>
            Refresh Stats
          </button>
          <button onClick={connectWallet}>{account ? "Switch Wallet" : "Connect Wallet"}</button>
        </div>
      </header>

      <section className="panel">
        <h2>Deployment Settings</h2>
        <div className="grid">
          <label>
            <span>Vault address</span>
            <input value={addresses.vault} onChange={(e) => handleAddressChange("vault", e.target.value)} placeholder="0x..." />
          </label>
          <label>
            <span>USDC address</span>
            <input value={addresses.asset} onChange={(e) => handleAddressChange("asset", e.target.value)} placeholder="0x..." />
          </label>
          <label>
            <span>Share token address</span>
            <input value={addresses.share} onChange={(e) => handleAddressChange("share", e.target.value)} placeholder="0x..." />
          </label>
        </div>
        <p className="muted">
          Paste the deployed contract addresses for the current network or host <code>/deployments/&lt;chainId&gt;.json</code> and click “Load from JSON”.
        </p>
        <div className="button-row">
          <button className="secondary" onClick={loadDeploymentJson}>
            Load from JSON
          </button>
          <button className="ghost" onClick={clearAddresses}>
            Clear saved
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>Vault Overview</h2>
        <div className="grid stats">
          <div>
            <span>Total Assets ({meta.assetSymbol})</span>
            <strong>{formatUsd(vaultStats.totalAssets, meta.assetDecimals)}</strong>
          </div>
          <div>
            <span>Total Supply ({meta.shareSymbol})</span>
            <strong>{formatToken(vaultStats.totalSupply, meta.shareDecimals)}</strong>
          </div>
          <div>
            <span>Price / Share</span>
            <strong>${sharePrice.toFixed(4)}</strong>
          </div>
          <div>
            <span>Queued Withdrawals</span>
            <strong>{formatUsd(vaultStats.totalQueuedAssets, meta.assetDecimals)}</strong>
          </div>
          <div>
            <span>Donation Rate</span>
            <strong>{(vaultStats.donationBps / 100).toFixed(2)}%</strong>
          </div>
        </div>
        <div className="grid stats">
          <div>
            <span>Your {meta.assetSymbol}</span>
            <strong>{formatUsd(userStats.usdcBalance, meta.assetDecimals)}</strong>
          </div>
          <div>
            <span>Your {meta.shareSymbol}</span>
            <strong>{formatToken(userStats.shareBalance, meta.shareDecimals)}</strong>
          </div>
          <div>
            <span>Total Deposited</span>
            <strong>{formatUsd(userStats.deposited, meta.assetDecimals)}</strong>
          </div>
          <div>
            <span>Total Withdrawn</span>
            <strong>{formatUsd(userStats.withdrawn, meta.assetDecimals)}</strong>
          </div>
          <div>
            <span>Total Donated</span>
            <strong>{formatUsd(userStats.donated, meta.assetDecimals)}</strong>
          </div>
        </div>
      </section>

      <section className="panel">
        <h2>Actions</h2>
        <div className="form-grid">
          <label>
            <span>Deposit {meta.assetSymbol}</span>
            <div className="input-row">
              <input value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} placeholder="0.00" inputMode="decimal" autoComplete="off" />
              <button type="button" className="ghost small" onClick={fillMaxDeposit} disabled={!account}>
                Max
              </button>
            </div>
          </label>
          <div className="action-stack">
            <button onClick={deposit} disabled={!canTransact || busy.deposit}>
              {busy.deposit ? "Depositing..." : "Deposit"}
            </button>
            <p className="muted hint">{depositPreview}</p>
          </div>
        </div>
        <div className="form-grid">
          <label>
            <span>Redeem {meta.shareSymbol}</span>
            <div className="input-row">
              <input value={redeemAmount} onChange={(e) => setRedeemAmount(e.target.value)} placeholder="0.00" inputMode="decimal" autoComplete="off" />
              <button type="button" className="ghost small" onClick={fillMaxRedeem} disabled={!account}>
                Max
              </button>
            </div>
          </label>
          <div className="action-stack">
            <button onClick={redeem} disabled={!canTransact || busy.redeem}>
              {busy.redeem ? "Redeeming..." : "Redeem"}
            </button>
            <p className="muted hint">{redeemPreview}</p>
          </div>
        </div>
      </section>

      <section className="panel">
        <h2>Withdrawal Queue</h2>
        <p className="muted">
          HyperEVM withdrawals unlock after the strategy releases liquidity (≈24h bridge window). If a redeem cannot settle instantly it is queued here; once ready click “Process Withdrawal”.
        </p>
        {queueInfo && queueInfo.shares > 0n ? (
          <>
            <div className="grid stats">
              <div>
                <span>Queued Shares</span>
                <strong>{formatToken(queueInfo.shares, meta.shareDecimals)}</strong>
              </div>
              <div>
                <span>Net Assets</span>
                <strong>{formatUsd(queueInfo.net, meta.assetDecimals)}</strong>
              </div>
              <div>
                <span>Donation Cap</span>
                <strong>{formatUsd(queueInfo.donation, meta.assetDecimals)}</strong>
              </div>
              <div>
                <span>Receiver</span>
                <strong>{shorten(queueInfo.receiver)}</strong>
              </div>
              <div>
                <span>Requested</span>
                <strong>{formatDateTime(queueInfo.timestamp)}</strong>
              </div>
              <div className="queue-status">
                <span>Lock Status</span>
                <strong>{queueReadyText}</strong>
              </div>
            </div>
            <div className="button-row">
              <button className="secondary" onClick={processQueuedWithdrawal} disabled={!signer || !hasQueuedWithdrawal || busy.process}>
                {busy.process ? "Processing..." : "Process Withdrawal"}
              </button>
            </div>
          </>
        ) : (
          <p className="muted">No queued withdrawal detected for {account ? shorten(account) : "this wallet"}.</p>
        )}
      </section>

      <section className="panel">
        <h2>Status</h2>
        <pre className="status-box">{status}</pre>
      </section>
    </main>
  );
}

function estimateSharesForDeposit(amount, totalSupply, totalAssets) {
  if (amount <= 0n) return 0n;
  if (totalSupply === 0n || totalAssets === 0n) {
    return amount * SHARE_SCALAR;
  }
  return (amount * totalSupply) / totalAssets;
}

function estimateAssetsFromShares(shares, totalSupply, totalAssets) {
  if (shares <= 0n || totalSupply === 0n) return 0n;
  return (shares * totalAssets) / totalSupply;
}

function formatUsd(value = 0n, decimals = 6, precision = 2) {
  const scaled = Number(ethers.formatUnits(value ?? 0n, decimals));
  if (!Number.isFinite(scaled)) return "$0.00";
  return `$${scaled.toLocaleString(undefined, {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  })}`;
}

function formatToken(value = 0n, decimals = 18, precision = 4) {
  const scaled = Number(ethers.formatUnits(value ?? 0n, decimals));
  if (!Number.isFinite(scaled)) return "0";
  return scaled.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: precision,
  });
}

function formatDateTime(timestampSeconds = 0) {
  if (!timestampSeconds) return "—";
  const date = new Date(Number(timestampSeconds) * 1000);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return date.toLocaleString();
}

function formatDuration(seconds = 0) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "ready now";
  }
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.max(0, Math.floor(seconds % 60));
  const parts = [];
  if (hrs) parts.push(`${hrs}h`);
  if (mins) parts.push(`${mins}m`);
  if (!hrs && !mins) parts.push(`${secs}s`);
  return parts.slice(0, 2).join(" ");
}

function shorten(address) {
  if (!address) return "";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function normalizeAccount(value) {
  if (!value) return undefined;
  if (typeof value === "string") return value;
  if (typeof value.address === "string") return value.address;
  return undefined;
}

function normalizeQueueStruct(raw) {
  if (!raw) {
    return {
      shares: 0n,
      assets: 0n,
      net: 0n,
      donation: 0n,
      receiver: ethers.ZeroAddress,
      timestamp: 0,
    };
  }
  const shares = valueToBigInt(raw.shares ?? raw[0]);
  const assets = valueToBigInt(raw.assets ?? raw[1]);
  const net = valueToBigInt(raw.net ?? raw[2]);
  const donation = valueToBigInt(raw.donation ?? raw[3]);
  const receiver = (raw.receiver ?? raw[4] ?? ethers.ZeroAddress)?.toString?.() ?? ethers.ZeroAddress;
  const timestampValue = raw.timestamp ?? raw[5] ?? 0;
  const timestamp = typeof timestampValue === "bigint" ? Number(timestampValue) : Number(timestampValue ?? 0);

  return {
    shares,
    assets,
    net,
    donation,
    receiver,
    timestamp: Number.isFinite(timestamp) ? timestamp : 0,
  };
}

function valueToBigInt(value) {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(value);
  if (typeof value === "string" && value.length) return BigInt(value);
  if (value && typeof value.toString === "function") {
    try {
      return BigInt(value.toString());
    } catch {
      return 0n;
    }
  }
  return 0n;
}

export default App;

