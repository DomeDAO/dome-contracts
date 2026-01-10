import { IFACE } from "./contracts";

const DEFAULT_BLOCK_CHUNK = 25_000;

function parseFromBlock(value) {
  if (value === undefined || value === null) return null;
  const trimmed = `${value}`.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.floor(parsed);
}

export function getQueueFromBlockFromEnv() {
  return parseFromBlock(import.meta.env.VITE_QUEUE_FROM_BLOCK);
}

export async function discoverQueuedWithdrawalUsers({
  provider,
  vaultAddress,
  fromBlock,
  toBlock,
  blockChunk = DEFAULT_BLOCK_CHUNK,
  onProgress,
}) {
  if (!provider) throw new Error("Missing provider");
  if (!vaultAddress) throw new Error("Missing vault address");
  if (fromBlock === null || fromBlock === undefined) throw new Error("Missing fromBlock");

  const latest = toBlock ?? (await provider.getBlockNumber());
  const start = Math.min(fromBlock, latest);
  const end = latest;

  const event = IFACE.NGOVault.getEvent("WithdrawalQueued");
  const topic0 = event.topicHash;

  const users = new Set();

  for (let chunkStart = start; chunkStart <= end; chunkStart += blockChunk) {
    const chunkEnd = Math.min(end, chunkStart + blockChunk - 1);
    const logs = await provider.getLogs({
      address: vaultAddress,
      fromBlock: chunkStart,
      toBlock: chunkEnd,
      topics: [topic0],
    });

    for (const log of logs) {
      try {
        const decoded = IFACE.NGOVault.decodeEventLog(event, log.data, log.topics);
        const user = (decoded.user ?? decoded[0])?.toString?.();
        if (user) users.add(user);
      } catch {
        // ignore malformed logs
      }
    }

    onProgress?.({ chunkStart, chunkEnd, logs: logs.length, uniqueUsers: users.size });
  }

  return Array.from(users);
}

export async function fetchPendingQueuedWithdrawals({ vaultContract, users, concurrency = 10, onProgress }) {
  if (!vaultContract) throw new Error("Missing vault contract");
  if (!Array.isArray(users) || users.length === 0) return [];

  const results = [];
  let idx = 0;
  let completed = 0;

  const worker = async () => {
    while (idx < users.length) {
      const current = users[idx++];
      try {
        const q = await vaultContract.queuedWithdrawals(current);
        const shares = q?.shares ?? q?.[0] ?? 0n;
        if (typeof shares === "bigint" ? shares > 0n : BigInt(shares) > 0n) {
          results.push({
            user: current,
            shares: q.shares ?? q[0],
            assets: q.assets ?? q[1],
            net: q.net ?? q[2],
            donation: q.donation ?? q[3],
            receiver: q.receiver ?? q[4],
            timestamp: q.timestamp ?? q[5],
          });
        }
      } catch {
        // ignore per-user errors
      } finally {
        completed += 1;
        onProgress?.({ completed, total: users.length });
      }
    }
  };

  const workers = Array.from({ length: Math.min(concurrency, users.length) }, () => worker());
  await Promise.all(workers);

  results.sort((a, b) => Number(a.timestamp ?? 0n) - Number(b.timestamp ?? 0n));
  return results;
}


