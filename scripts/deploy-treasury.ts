import "dotenv/config";
import { createPublicClient, http, formatEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { WSTETH_ADDRESS, WSTETH_ABI } from "../src/constants.js";
import { getLidoAPR, getExchangeRate } from "../src/lido.js";

async function main() {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) throw new Error("PRIVATE_KEY not set in .env");
  const pk = (privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`) as `0x${string}`;
  const account = privateKeyToAccount(pk);
  const client = createPublicClient({ chain: base, transport: http(process.env.BASE_RPC_URL ?? "https://mainnet.base.org") });
  const balanceRaw = await client.readContract({ address: WSTETH_ADDRESS, abi: WSTETH_ABI, functionName: "balanceOf", args: [account.address] });
  const stETHValue = await client.readContract({ address: WSTETH_ADDRESS, abi: WSTETH_ABI, functionName: "getStETHByWstETH", args: [balanceRaw] });
  const [rate, apr] = await Promise.all([getExchangeRate(), getLidoAPR()]);
  console.log("\n=== Treasury Principal Snapshot ===");
  console.log(`Wallet: ${account.address}`);
  console.log(`wstETH balance: ${formatEther(balanceRaw)}`);
  console.log(`stETH value: ${formatEther(stETHValue)}`);
  console.log(`Rate: ${rate.stETHPerWstETH} stETH/wstETH`);
  console.log(`APR: ${apr.apr.toFixed(2)}%`);
  const annual = parseFloat(formatEther(stETHValue)) * (apr.apr / 100);
  console.log(`Annual yield: ${annual.toFixed(6)} stETH`);
  console.log(`\nAdd to .env:\nTREASURY_ADDRESS=${account.address}\nPRINCIPAL_WSTETH=${balanceRaw.toString()}\nPRINCIPAL_STETH_SNAPSHOT=${stETHValue.toString()}`);
}
main().catch((err) => { console.error(err); process.exit(1); });
