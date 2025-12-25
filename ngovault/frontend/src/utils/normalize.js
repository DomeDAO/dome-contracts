import { ethers } from "ethers";

export function valueToBigInt(value) {
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

export function normalizeQueueStruct(raw) {
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

export function normalizeProject(raw) {
  if (!raw) {
    return {
      id: 0,
      projectWallet: ethers.ZeroAddress,
      amountRequested: 0n,
      createdAt: 0,
      votingStart: 0,
      votingEnd: 0,
      votes: 0n,
      funded: false,
      description: "",
    };
  }

  const id = Number(raw.id ?? raw[0] ?? 0);
  const projectWallet = (raw.projectWallet ?? raw[1] ?? ethers.ZeroAddress)?.toString?.() ?? ethers.ZeroAddress;
  const amountRequested = valueToBigInt(raw.amountRequested ?? raw[2]);
  const createdAt = Number(valueToBigInt(raw.createdAt ?? raw[3]));
  const votingStart = Number(valueToBigInt(raw.votingStart ?? raw[4]));
  const votingEnd = Number(valueToBigInt(raw.votingEnd ?? raw[5]));
  const votes = valueToBigInt(raw.votes ?? raw[6]);
  const funded = Boolean(raw.funded ?? raw[7]);
  const description = (raw.description ?? raw[8] ?? "")?.toString?.() ?? "";

  return {
    id: Number.isFinite(id) ? id : 0,
    projectWallet,
    amountRequested,
    createdAt: Number.isFinite(createdAt) ? createdAt : 0,
    votingStart: Number.isFinite(votingStart) ? votingStart : 0,
    votingEnd: Number.isFinite(votingEnd) ? votingEnd : 0,
    votes,
    funded,
    description,
  };
}


