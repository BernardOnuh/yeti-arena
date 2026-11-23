// Where the Yeti Arena package lives on Sui. Filled in by scripts/deploy-testnet.mjs (writes web/.env.local).
// Until then on-chain recording is switched off and the game still works with server-verified scores.
export const chain = {
  network: (process.env.NEXT_PUBLIC_SUI_NETWORK || "testnet") as "testnet" | "devnet" | "mainnet",
  packageId: process.env.NEXT_PUBLIC_SUI_PACKAGE || "",
  arenaId: process.env.NEXT_PUBLIC_SUI_ARENA || "",
  seasonId: process.env.NEXT_PUBLIC_SUI_SEASON || "",
};
export const chainReady = Boolean(chain.packageId && chain.arenaId && chain.seasonId);
export const CLOCK = "0x6";
export const explorerTx = (digest: string) => `https://suiscan.xyz/${chain.network}/tx/${digest}`;
export const explorerObject = (id: string) => `https://suiscan.xyz/${chain.network}/object/${id}`;
