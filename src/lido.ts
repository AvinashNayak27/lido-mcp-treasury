import { createPublicClient, http, formatEther, parseEther } from "viem";
import { base } from "viem/chains";
import { WSTETH_ADDRESS, WSTETH_ABI, LIDO_APR_API } from "./constants.js";

export const publicClient = createPublicClient({
  chain: base,
  transport: http(process.env.BASE_RPC_URL ?? "https://mainnet.base.org"),
});

export async function getWstETHBalance(address: `0x${string}`) {
  const raw = await publicClient.readContract({ address: WSTETH_ADDRESS, abi: WSTETH_ABI, functionName: "balanceOf", args: [address] });
  return { wstETH: formatEther(raw), raw };
}

export async function getExchangeRate() {
  const rate = await publicClient.readContract({ address: WSTETH_ADDRESS, abi: WSTETH_ABI, functionName: "stEthPerToken" });
  return { stETHPerWstETH: formatEther(rate), raw: rate };
}

export async function stETHToWstETH(stETHAmount: string) {
  const amount = parseEther(stETHAmount);
  const wstETH = await publicClient.readContract({ address: WSTETH_ADDRESS, abi: WSTETH_ABI, functionName: "getWstETHByStETH", args: [amount] });
  return { wstETH: formatEther(wstETH), raw: wstETH };
}

export async function wstETHToStETH(wstETHAmount: string) {
  const amount = parseEther(wstETHAmount);
  const stETH = await publicClient.readContract({ address: WSTETH_ADDRESS, abi: WSTETH_ABI, functionName: "getStETHByWstETH", args: [amount] });
  return { stETH: formatEther(stETH), raw: stETH };
}

export async function getLidoAPR() {
  const res = await fetch(LIDO_APR_API);
  if (!res.ok) throw new Error(`Lido APR API error: ${res.status}`);
  const data = await res.json() as { data: { smaApr: number; timeUnix: number } };
  return { apr: data.data.smaApr, asOf: new Date(data.data.timeUnix * 1000).toISOString() };
}

export async function estimateYield(wstETHAmount: string) {
  const [{ stETH }, { apr }] = await Promise.all([wstETHToStETH(wstETHAmount), getLidoAPR()]);
  const stETHValue = parseFloat(stETH);
  const annualYieldStETH = stETHValue * (apr / 100);
  return {
    principal_wstETH: wstETHAmount,
    principal_stETH: stETH,
    apr_percent: apr,
    annual_yield_stETH: annualYieldStETH.toFixed(6),
    daily_yield_stETH: (annualYieldStETH / 365).toFixed(8),
    monthly_yield_stETH: (annualYieldStETH / 12).toFixed(6),
  };
}
