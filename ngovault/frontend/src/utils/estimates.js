export const SHARE_SCALAR = 1_000_000_000_000n;

export function estimateSharesForDeposit(amount, totalSupply, totalAssets) {
  if (amount <= 0n) return 0n;
  if (totalSupply === 0n || totalAssets === 0n) {
    return amount * SHARE_SCALAR;
  }
  return (amount * totalSupply) / totalAssets;
}

export function estimateAssetsFromShares(shares, totalSupply, totalAssets) {
  if (shares <= 0n || totalSupply === 0n) return 0n;
  return (shares * totalAssets) / totalSupply;
}


