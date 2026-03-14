import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getWstETHBalance, getExchangeRate, getLidoAPR, estimateYield, stETHToWstETH, wstETHToStETH } from "./lido.js";
import { createTreasuryManager } from "./treasury.js";

const server = new McpServer({ name: "lido-mcp-treasury", version: "1.0.0" });

server.tool("get_apr", "Get the current Lido staking APR (7-day SMA)", {}, async () => {
  try {
    const data = await getLidoAPR();
    return { content: [{ type: "text", text: JSON.stringify({ apr_percent: data.apr, as_of: data.asOf, description: `Current Lido stETH staking APR is ${data.apr.toFixed(2)}% (7-day SMA)` }, null, 2) }] };
  } catch (e) { return { content: [{ type: "text", text: `Error: ${String(e)}` }], isError: true }; }
});

server.tool("get_balance", "Get wstETH balance of any address on Base mainnet", { address: z.string().describe("Ethereum address (0x...)") }, async ({ address }) => {
  try {
    const result = await getWstETHBalance(address as `0x${string}`);
    const stETH = await wstETHToStETH(result.wstETH);
    return { content: [{ type: "text", text: JSON.stringify({ address, wstETH: result.wstETH, stETH_equivalent: stETH.stETH, network: "Base mainnet" }, null, 2) }] };
  } catch (e) { return { content: [{ type: "text", text: `Error: ${String(e)}` }], isError: true }; }
});

server.tool("get_exchange_rate", "Get current wstETH to stETH exchange rate on Base mainnet", {}, async () => {
  try {
    const rate = await getExchangeRate();
    return { content: [{ type: "text", text: JSON.stringify({ stETH_per_wstETH: rate.stETHPerWstETH, description: `1 wstETH = ${rate.stETHPerWstETH} stETH`, network: "Base mainnet" }, null, 2) }] };
  } catch (e) { return { content: [{ type: "text", text: `Error: ${String(e)}` }], isError: true }; }
});

server.tool("convert", "Convert between stETH and wstETH amounts", { direction: z.enum(["stETH_to_wstETH", "wstETH_to_stETH"]).describe("Conversion direction"), amount: z.string().describe("Amount to convert") }, async ({ direction, amount }) => {
  try {
    const result = direction === "stETH_to_wstETH" ? await stETHToWstETH(amount) : await wstETHToStETH(amount);
    const [fromToken, toToken, value] = direction === "stETH_to_wstETH" ? ["stETH", "wstETH", (result as any).wstETH] : ["wstETH", "stETH", (result as any).stETH];
    return { content: [{ type: "text", text: JSON.stringify({ input: `${amount} ${fromToken}`, output: `${value} ${toToken}`, direction }, null, 2) }] };
  } catch (e) { return { content: [{ type: "text", text: `Error: ${String(e)}` }], isError: true }; }
});

server.tool("estimate_yield", "Estimate annual, monthly, and daily staking yield for a given wstETH amount", { wstETH_amount: z.string().describe("Amount of wstETH to estimate yield for") }, async ({ wstETH_amount }) => {
  try {
    const result = await estimateYield(wstETH_amount);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (e) { return { content: [{ type: "text", text: `Error: ${String(e)}` }], isError: true }; }
});

server.tool("treasury_status", "Get the stETH treasury status: principal locked, accrued yield, and spendable balance", {}, async () => {
  try {
    const treasury = await createTreasuryManager();
    if (!treasury) return { content: [{ type: "text", text: "Treasury not configured. Set PRIVATE_KEY in .env" }], isError: true };
    const status = await treasury.getStatus();
    const { spendable_wstETH } = await treasury.getSpendableYield();
    return { content: [{ type: "text", text: JSON.stringify({ ...status, spendable_yield_wstETH: spendable_wstETH }, null, 2) }] };
  } catch (e) { return { content: [{ type: "text", text: `Error: ${String(e)}` }], isError: true }; }
});

server.tool("spend_yield", "Spend accrued stETH yield from the treasury. Principal is ALWAYS protected.", { to: z.string().describe("Recipient address (0x...)"), wstETH_amount: z.string().describe("Amount of wstETH yield to send") }, async ({ to, wstETH_amount }) => {
  try {
    const treasury = await createTreasuryManager();
    if (!treasury) return { content: [{ type: "text", text: "Treasury not configured. Set PRIVATE_KEY in .env" }], isError: true };
    const result = await treasury.spendYield(to as `0x${string}`, wstETH_amount);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (e) { return { content: [{ type: "text", text: `Error: ${String(e)}` }], isError: true }; }
});

server.tool("agent_identity", "Get the ERC-8004 onchain identity of this Lido MCP Treasury agent", {}, async () => {
  return { content: [{ type: "text", text: JSON.stringify({ name: "Lido MCP Treasury Agent", description: "Lido staking MCP server with principal-protected stETH treasury and ERC-8004 onchain identity", erc8004_registry: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432", token_id: process.env.AGENT_TOKEN_ID ?? "not yet registered", treasury_address: process.env.TREASURY_ADDRESS ?? "not yet deployed", network: "Base mainnet", capabilities: ["get_apr","get_balance","get_exchange_rate","convert","estimate_yield","treasury_status","spend_yield"], github: "https://github.com/AvinashNayak27/lido-mcp-treasury" }, null, 2) }] };
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("Lido MCP Treasury server running (stdio)\n");
}
main().catch((err) => { process.stderr.write(`Fatal: ${err}\n`); process.exit(1); });
