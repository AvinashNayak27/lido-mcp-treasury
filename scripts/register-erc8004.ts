import "dotenv/config";
import { createWalletClient, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { ERC8004_IDENTITY_REGISTRY, ERC8004_ABI } from "../src/constants.js";

async function main() {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) throw new Error("PRIVATE_KEY not set in .env");
  const pk = (privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`) as `0x${string}`;
  const account = privateKeyToAccount(pk);
  console.log(`Registering agent from address: ${account.address}`);
  const agentCard = {
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name: "Lido MCP Treasury Agent",
    description: "Principal-protected stETH treasury with MCP server. Stake via Lido, accrue yield, spend only rewards. Built for The Synthesis hackathon.",
    image: "",
    active: true,
    services: [
      { name: "MCP", endpoint: "https://github.com/AvinashNayak27/lido-mcp-treasury", version: "2025-11-05" },
      { name: "web", endpoint: "https://github.com/AvinashNayak27/lido-mcp-treasury" },
    ],
    x402Support: false,
  };
  const uri = `data:application/json;base64,${Buffer.from(JSON.stringify(agentCard)).toString("base64")}`;
  const walletClient = createWalletClient({ account, chain: base, transport: http(process.env.BASE_RPC_URL ?? "https://mainnet.base.org") });
  const publicClient = createPublicClient({ chain: base, transport: http(process.env.BASE_RPC_URL ?? "https://mainnet.base.org") });
  console.log("Sending registration transaction...");
  const hash = await walletClient.writeContract({ address: ERC8004_IDENTITY_REGISTRY, abi: ERC8004_ABI, functionName: "register", args: [uri] });
  console.log(`TX hash: ${hash}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`Confirmed in block ${receipt.blockNumber}`);
  console.log(`BaseScan: https://basescan.org/tx/${hash}`);
}
main().catch((err) => { console.error(err); process.exit(1); });
