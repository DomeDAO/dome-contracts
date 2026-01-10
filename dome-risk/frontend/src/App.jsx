import { useCallback, useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";

import { getInjectedBrowserProvider, getRpcProvider, makeContractsWithOptions, normalizeAccount } from "./lib/contracts";
import {
  discoverQueuedWithdrawalUsers,
  fetchPendingQueuedWithdrawals,
  getQueueFromBlockFromEnv,
} from "./lib/queueIndexer";

import { estimateAssetsFromShares, estimateSharesForDeposit } from "./utils/estimates";
import { formatDateTime, formatDuration, formatToken, formatUsd, shorten } from "./utils/format";
import { normalizeProject, normalizeQueueStruct } from "./utils/normalize";

import { Header } from "./components/Header";
import { DeploymentSettings } from "./components/DeploymentSettings";
import { VaultOverview } from "./components/VaultOverview";
import { VaultActions } from "./components/VaultActions";
import { UserWithdrawalQueue } from "./components/UserWithdrawalQueue";
import { GlobalWithdrawalQueue } from "./components/GlobalWithdrawalQueue";
import { GovernanceProjects } from "./components/GovernanceProjects";
import { StatusPanel } from "./components/StatusPanel";

const AUTO_REFRESH_MS = 20_000;
const WITHDRAWAL_LOCK_SECONDS = 60 * 60 * 24;
const ADDRESS_STORAGE_KEY = "ngovault:addresses";
const emptyAddresses = { vault: "", asset: "", share: "", governance: "", buffer: "" };

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
  const [globalQueue, setGlobalQueue] = useState([]);
  const [globalQueueStatus, setGlobalQueueStatus] = useState("");
  const [governanceStats, setGovernanceStats] = useState({ bufferBalance: 0n, projectCount: 0 });
  const [projects, setProjects] = useState([]);
  const [projectForm, setProjectForm] = useState({ wallet: "", amount: "", description: "" });
  const [depositAmount, setDepositAmount] = useState("");
  const [redeemAmount, setRedeemAmount] = useState("");
  const [busy, setBusy] = useState({
    deposit: false,
    redeem: false,
    process: false,
    refreshQueue: false,
    processAll: false,
    submitProject: false,
    vote: false,
    fund: false,
  });

  const log = useCallback((message) => {
    const timestamp = new Date().toLocaleTimeString();
    setStatus(`[${timestamp}] ${message}`);
  }, []);

  const coreAddressesAreValid = useMemo(
    () => ["vault", "asset", "share"].every((key) => ethers.isAddress(addresses[key] ?? "")),
    [addresses]
  );

  const governanceAddressesAreValid = useMemo(
    () => ["governance", "buffer"].every((key) => ethers.isAddress(addresses[key] ?? "")),
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
    if (typeof window === "undefined") return;
    if (!window.ethereum) {
      log("MetaMask not detected. Install it to continue.");
      return;
    }

    let mounted = true;
    const browserProvider = getInjectedBrowserProvider();
    if (!browserProvider) {
      log("MetaMask provider unavailable.");
      return;
    }
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
        setGlobalQueue([]);
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
      setGlobalQueue([]);
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
  }, []);

  const refreshStats = useCallback(
    async (silent = false) => {
      if (!provider) {
        if (!silent) log("Connect a wallet to load stats.");
        return false;
      }

      if (!coreAddressesAreValid) {
        if (!silent) log("Enter valid vault, USDC, and share addresses.");
        return false;
      }

      if (!silent) {
        log("Fetching latest stats...");
      }

      try {
        const runner = signer ?? provider;
        const { vault, asset, share, governance, buffer } = makeContractsWithOptions(addresses, runner, {
          require: ["vault", "asset", "share"],
        });

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
          vault.totalAssets(),
          vault.totalSupply(),
          vault.donationBps(),
          vault.totalQueuedWithdrawalAssets(),
          asset.decimals().catch(() => meta.assetDecimals),
          asset.symbol().catch(() => meta.assetSymbol),
          share.decimals().catch(() => meta.shareDecimals),
          share.symbol().catch(() => meta.shareSymbol),
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
            share.balanceOf(account),
            asset.balanceOf(account),
            vault.totalDeposited(account),
            vault.totalWithdrawn(account),
            vault.totalDonated(account),
            vault.queuedWithdrawals(account),
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

        if (governanceAddressesAreValid && governance) {
          const [bufferBalance, projectCount] = await Promise.all([
            governance.donationBuffer().catch(() => (buffer ? buffer.balance() : 0n)),
            governance.projectCount().catch(() => 0n),
          ]);
          setGovernanceStats({
            bufferBalance: bufferBalance ?? 0n,
            projectCount: Number(projectCount ?? 0n),
          });
        } else {
          setGovernanceStats({ bufferBalance: 0n, projectCount: 0 });
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
    [
      account,
      addresses,
      coreAddressesAreValid,
      governanceAddressesAreValid,
      log,
      meta.assetDecimals,
      meta.assetSymbol,
      meta.shareDecimals,
      meta.shareSymbol,
      provider,
      signer,
    ]
  );

  useEffect(() => {
    if (!provider || !coreAddressesAreValid) return undefined;
    const interval = setInterval(() => {
      refreshStats(true);
    }, AUTO_REFRESH_MS);
    return () => clearInterval(interval);
  }, [coreAddressesAreValid, provider, refreshStats]);

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
      const nextProvider = provider ?? getInjectedBrowserProvider();
      if (!nextProvider) {
        log("MetaMask provider unavailable.");
        return;
      }
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
        governance: json.contracts?.governance ?? "",
        buffer: json.contracts?.buffer ?? "",
      });
      log(`Loaded deployment for chain ${chainId}.`);
      await refreshStats();
    } catch (error) {
      console.error(error);
      log(`Unable to load deployment JSON: ${error.message}`);
    }
  };

  const hasQueuedWithdrawal = Boolean(queueInfo && queueInfo.shares > 0n);
  const canTransact = Boolean(signer) && coreAddressesAreValid && !hasQueuedWithdrawal;

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
    if (!coreAddressesAreValid) {
      log("Enter valid vault, USDC, and share addresses.");
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
      const { vault, asset } = makeContractsWithOptions(addresses, signer, { require: ["vault", "asset"] });
      if (!vault || !asset) {
        log("Missing vault or asset contract.");
        return;
      }

      const allowance = await asset.allowance(account, addresses.vault);
      if (allowance < amount) {
        log("Approving asset spend...");
        const approveTx = await asset.approve(addresses.vault, amount);
        await approveTx.wait();
      }
      log("Submitting deposit...");
      const tx = await vault.deposit(amount, account);
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
    if (!coreAddressesAreValid) {
      log("Enter valid vault, USDC, and share addresses.");
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
      const { vault } = makeContractsWithOptions(addresses, signer, { require: ["vault"] });
      if (!vault) {
        log("Missing vault contract.");
        return;
      }
      log("Submitting redemption...");
      const tx = await vault.redeem(shares, account);
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
      const { vault } = makeContractsWithOptions(addresses, signer, { require: ["vault"] });
      if (!vault) {
        log("Missing vault contract.");
        return;
      }
      log("Processing queued withdrawal...");
      const tx = await vault.processQueuedWithdrawal(account);
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

  const refreshGlobalQueue = async () => {
    if (!provider) {
      log("Connect a wallet (or open the app with an RPC) to scan the global queue.");
      return;
    }
    if (!ethers.isAddress(addresses.vault)) {
      log("Enter a valid vault address to scan the queue.");
      return;
    }

    const fromBlock = getQueueFromBlockFromEnv();
    if (fromBlock === null) {
      log("Set VITE_QUEUE_FROM_BLOCK to enable global queue discovery.");
      return;
    }

    setBusy((prev) => ({ ...prev, refreshQueue: true }));
    setGlobalQueueStatus("Scanning WithdrawalQueued logs...");
    try {
      const rpcProvider = getRpcProvider(import.meta.env.VITE_RPC_URL);
      const logProvider = rpcProvider ?? provider;

      const users = await discoverQueuedWithdrawalUsers({
        provider: logProvider,
        vaultAddress: addresses.vault,
        fromBlock,
        onProgress: ({ chunkStart, chunkEnd, logs, uniqueUsers }) => {
          setGlobalQueueStatus(
            `Scanning blocks ${chunkStart}..${chunkEnd} · ${logs} logs · ${uniqueUsers} unique users`
          );
        },
      });

      setGlobalQueueStatus(`Found ${users.length} wallets in queue logs. Checking pending withdrawals...`);
      const { vault } = makeContractsWithOptions(addresses, logProvider, { require: ["vault"] });
      const pending = await fetchPendingQueuedWithdrawals({
        vaultContract: vault,
        users,
        onProgress: ({ completed, total }) => {
          setGlobalQueueStatus(`Checking queuedWithdrawals(user) · ${completed}/${total}`);
        },
      });

      setGlobalQueue(pending);
      setGlobalQueueStatus(`Pending withdrawals: ${pending.length}`);
    } catch (error) {
      console.error(error);
      setGlobalQueueStatus(`Queue scan failed: ${error.shortMessage ?? error.message}`);
    } finally {
      setBusy((prev) => ({ ...prev, refreshQueue: false }));
    }
  };

  const processSingleGlobalQueue = async (user) => {
    if (!signer) {
      log("Connect wallet to process withdrawals.");
      return;
    }
    if (!ethers.isAddress(addresses.vault)) {
      log("Enter a valid vault address first.");
      return;
    }
    try {
      const { vault } = makeContractsWithOptions(addresses, signer, { require: ["vault"] });
      if (!vault) throw new Error("Missing vault contract");
      log(`Processing queued withdrawal for ${shorten(user)}...`);
      const tx = await vault.processQueuedWithdrawal(user);
      await tx.wait();
      log(`Processed queued withdrawal for ${shorten(user)}.`);
      await refreshStats(true);
      await refreshGlobalQueue();
    } catch (error) {
      console.error(error);
      log(`Process failed: ${error.shortMessage ?? error.message}`);
    }
  };

  const processAllQueuedWithdrawals = async () => {
    if (!signer) {
      log("Connect wallet to process withdrawals.");
      return;
    }
    if (!ethers.isAddress(addresses.vault)) {
      log("Enter a valid vault address first.");
      return;
    }
    if (!globalQueue.length) {
      log("No global queued withdrawals found.");
      return;
    }

    setBusy((prev) => ({ ...prev, processAll: true }));
    try {
      const { vault } = makeContractsWithOptions(addresses, signer, { require: ["vault"] });
      if (!vault) throw new Error("Missing vault contract");

      for (let i = 0; i < globalQueue.length; i++) {
        const entry = globalQueue[i];
        try {
          log(`(${i + 1}/${globalQueue.length}) Processing ${shorten(entry.user)}...`);
          const tx = await vault.processQueuedWithdrawal(entry.user);
          await tx.wait();
        } catch (error) {
          // Most common: Withdrawal locked. Continue to next.
          console.warn("Process failed", entry.user, error);
          log(`(${i + 1}/${globalQueue.length}) Failed for ${shorten(entry.user)}: ${error.shortMessage ?? error.message}`);
        }
      }

      log("Process-all completed.");
      await refreshStats(true);
      await refreshGlobalQueue();
    } finally {
      setBusy((prev) => ({ ...prev, processAll: false }));
    }
  };

  const refreshProjects = async () => {
    if (!provider) {
      log("Connect a wallet (or view with a provider) to load projects.");
      return;
    }
    if (!governanceAddressesAreValid) {
      log("Enter governance + buffer addresses to load projects.");
      return;
    }
    try {
      const runner = signer ?? provider;
      const { governance } = makeContractsWithOptions(addresses, runner, { require: ["governance"] });
      if (!governance) throw new Error("Missing governance contract");

      const countBn = await governance.projectCount();
      const count = Number(countBn ?? 0n);
      const ids = Array.from({ length: count }, (_, i) => i + 1);
      if (!ids.length) {
        setProjects([]);
        return;
      }

      const entries = await Promise.all(
        ids.map(async (id) => {
          const raw = await governance.projects(id);
          const has = account ? await governance.hasVoted(id, account).catch(() => false) : false;
          return { ...normalizeProject(raw), hasVoted: Boolean(has) };
        })
      );
      setProjects(entries);
    } catch (error) {
      console.error(error);
      log(`Unable to load projects: ${error.shortMessage ?? error.message}`);
    }
  };

  const submitProject = async () => {
    if (!signer) {
      log("Connect wallet to submit a project.");
      return;
    }
    if (!governanceAddressesAreValid) {
      log("Enter governance + buffer addresses first.");
      return;
    }
    if (!ethers.isAddress(projectForm.wallet)) {
      log("Enter a valid project wallet address.");
      return;
    }
    let amount;
    try {
      amount = ethers.parseUnits(projectForm.amount || "0", meta.assetDecimals);
    } catch {
      log("Enter a valid amount requested.");
      return;
    }
    if (amount === 0n) {
      log("Amount requested must be > 0.");
      return;
    }
    setBusy((prev) => ({ ...prev, submitProject: true }));
    try {
      const { governance } = makeContractsWithOptions(addresses, signer, { require: ["governance"] });
      if (!governance) throw new Error("Missing governance contract");
      log("Submitting project...");
      const tx = await governance.submitProject(projectForm.wallet, amount, projectForm.description || "");
      await tx.wait();
      log("Project submitted.");
      setProjectForm({ wallet: "", amount: "", description: "" });
      await refreshStats(true);
      await refreshProjects();
    } catch (error) {
      console.error(error);
      log(`Submit failed: ${error.shortMessage ?? error.message}`);
    } finally {
      setBusy((prev) => ({ ...prev, submitProject: false }));
    }
  };

  const voteForProject = async (projectId) => {
    if (!signer) {
      log("Connect wallet to vote.");
      return;
    }
    if (!governanceAddressesAreValid) {
      log("Enter governance + buffer addresses first.");
      return;
    }
    setBusy((prev) => ({ ...prev, vote: true }));
    try {
      const { governance } = makeContractsWithOptions(addresses, signer, { require: ["governance"] });
      if (!governance) throw new Error("Missing governance contract");
      log(`Voting for project #${projectId}...`);
      const tx = await governance.vote(projectId);
      await tx.wait();
      log(`Voted for project #${projectId}.`);
      await refreshProjects();
    } catch (error) {
      console.error(error);
      log(`Vote failed: ${error.shortMessage ?? error.message}`);
    } finally {
      setBusy((prev) => ({ ...prev, vote: false }));
    }
  };

  const fundTopProject = async () => {
    if (!signer) {
      log("Connect wallet to fund a project.");
      return;
    }
    if (!governanceAddressesAreValid) {
      log("Enter governance + buffer addresses first.");
      return;
    }
    if (!projects.length) {
      log("Load projects first.");
      return;
    }
    setBusy((prev) => ({ ...prev, fund: true }));
    try {
      const { governance } = makeContractsWithOptions(addresses, signer, { require: ["governance"] });
      if (!governance) throw new Error("Missing governance contract");
      const candidateIds = projects.map((p) => Number(p.id)).filter(Boolean);
      log("Funding top eligible project...");
      const tx = await governance.fundTopProject(candidateIds);
      await tx.wait();
      log("Funded top eligible project.");
      await refreshStats(true);
      await refreshProjects();
    } catch (error) {
      console.error(error);
      log(`Fund failed: ${error.shortMessage ?? error.message}`);
    } finally {
      setBusy((prev) => ({ ...prev, fund: false }));
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
      <Header
        connectionBadge={connectionBadge}
        onRefreshStats={() => refreshStats()}
        disableRefresh={!coreAddressesAreValid || !provider}
        onConnectWallet={connectWallet}
        account={account}
      />

      <DeploymentSettings
        addresses={addresses}
        onChangeAddress={handleAddressChange}
        onLoadFromJson={loadDeploymentJson}
        onClearSaved={clearAddresses}
        chainId={chainId}
      />

      <VaultOverview
        meta={meta}
        vaultStats={vaultStats}
        userStats={userStats}
        sharePrice={sharePrice}
        governanceStats={governanceStats}
      />

      <VaultActions
        meta={meta}
        userStats={userStats}
        depositAmount={depositAmount}
        setDepositAmount={setDepositAmount}
        depositPreview={depositPreview}
        onDeposit={deposit}
        redeemAmount={redeemAmount}
        setRedeemAmount={setRedeemAmount}
        redeemPreview={redeemPreview}
        onRedeem={redeem}
        canTransact={canTransact}
        busy={busy}
        onFillMaxDeposit={fillMaxDeposit}
        onFillMaxRedeem={fillMaxRedeem}
        account={account}
      />

      <UserWithdrawalQueue
        queueInfo={queueInfo}
        meta={meta}
        queueReadyText={queueReadyText}
        onProcess={processQueuedWithdrawal}
        busy={busy}
        signer={signer}
        hasQueuedWithdrawal={hasQueuedWithdrawal}
        account={account}
      />

      <GlobalWithdrawalQueue
        provider={provider}
        signer={signer}
        vaultAddress={ethers.isAddress(addresses.vault) ? addresses.vault : ""}
        meta={meta}
        globalQueueStatus={globalQueueStatus}
        globalQueue={globalQueue}
        busy={busy}
        onRefresh={refreshGlobalQueue}
        onProcessAll={processAllQueuedWithdrawals}
        onProcessOne={processSingleGlobalQueue}
      />

      <GovernanceProjects
        provider={provider}
        signer={signer}
        governanceAddressesAreValid={governanceAddressesAreValid}
        meta={meta}
        governanceStats={governanceStats}
        projects={projects}
        busy={busy}
        onLoadProjects={refreshProjects}
        onFundTop={fundTopProject}
        projectForm={projectForm}
        setProjectForm={setProjectForm}
        onSubmitProject={submitProject}
        onVote={voteForProject}
      />

      <StatusPanel status={status} />
    </main>
  );
}

export default App;

