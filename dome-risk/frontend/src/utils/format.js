import { ethers } from "ethers";

export function formatUsd(value = 0n, decimals = 6, precision = 2) {
  const scaled = Number(ethers.formatUnits(value ?? 0n, decimals));
  if (!Number.isFinite(scaled)) return "$0.00";
  return `$${scaled.toLocaleString(undefined, {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  })}`;
}

export function formatToken(value = 0n, decimals = 18, precision = 4) {
  const scaled = Number(ethers.formatUnits(value ?? 0n, decimals));
  if (!Number.isFinite(scaled)) return "0";
  return scaled.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: precision,
  });
}

export function formatDateTime(timestampSeconds = 0) {
  if (!timestampSeconds) return "—";
  const date = new Date(Number(timestampSeconds) * 1000);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return date.toLocaleString();
}

export function formatDuration(seconds = 0) {
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

export function shorten(address) {
  if (!address) return "";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}


