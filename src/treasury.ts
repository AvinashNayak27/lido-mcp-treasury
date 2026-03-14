import { createPublicClient, createWalletClient, http, formatEther, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { WSTETH_ADDRESS, WSTETH_ABI } from "./constants.js";
import { getExchangeRate } from "./lido.js";

export class TreasuryManager {
  private account;
  private walletClient;
  private publicClient;
  private principalWstETH: bigint;
  private principalStETHSnapshot: bigint;

  constructor(privateKey: `0x${string}`, principalWstETH: bigint, principalStETHSnapshot: bigint) {
    this.account = privateKeyToAccount(privateKey);
    this.publicClient = createPublicClient({ chain: base, transport: http(process.env.BASE_RPC_URL ?? "https://mainnet.base.org") });
    this.walletClient = createWalletClient({ account: this.account, chain: base, transport: http(process.env.BASE_RPC_URL ?? "https://mainnet.base.org") });
    this.principalWstETH = principalWstETH;
    this.principalStETHSnapshot = principalStETHSnapshot;
  }

  get address() { return this.account.address; }

  async getStatus() {
    const [balanceRaw, rateData] = await Promise.all([
      this.publicClient.readContract({ address: WSTETH_ADDRESS, abi: WSTETH_ABI, functionName: "balanceOf", args: [this.account.address] }),
      getExchangeRate(),
    ]);
    const currentStETH = await this.publicClient.readContract({ address: WSTETH_ADDRESS, abi: WSTETH_ABI, functionName: "getStETHByWstETH", args: [balanceRaw] });
    const yieldAccrued = currentStETH > this.principalStETHSnapshot ? currentStETH - this.principalStETHSnapshot : 0n;
    return {
      address: this.account.address,
      balance_wstETH: formatEther(balanceRaw),
      current_stETH_value: formatEther(currentStETH),
      principal_stETH_locked: formatEther(this.principalStETHSnapshot),
      principal_wstETH_locked: formatEther(this.principalWstETH),
      accrued_yield_stETH: formatEther(yieldAccrued),
      exchange_rate: rateData.stETHPerWstETH,
      is_principal_protected: balanceRaw >= this.principalWstETH,
    };
  }

  async getSpendableYield() {
    const status = await this.getStatus();
    const currentWstETH = await this.publicClient.readContract({ address: WSTETH_ADDRESS, abi: WSTETH_ABI, functionName: "balanceOf", args: [this.account.address] });
    const spendable = currentWstETH > this.principalWstETH ? currentWstETH - this.principalWstETH : 0n;
    return { spendable_wstETH: formatEther(spendable), spendable_raw: spendable, status };
  }

  async spendYield(to: `0x${string}`, wstETHAmount: string) {
    const amount = parseEther(wstETHAmount);
    const { spendable_raw } = await this.getSpendableYield();
    if (amount > spendable_raw) throw new Error(`Insufficient yield. Requested: ${wstETHAmount} wstETH, Available: ${formatEther(spendable_raw)} wstETH. Principal is protected.`);
    const hash = await this.walletClient.writeContract({ address: WSTETH_ADDRESS, abi: WSTETH_ABI, functionName: "transfer", args: [to, amount] });
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
    return { success: true, tx_hash: hash, block_number: receipt.blockNumber.toString(), amount_sent_wstETH: wstETHAmount, recipient: to, basescan: `https://basescan.org/tx/${hash}` };
  }
}

export async function createTreasuryManager(): Promise<TreasuryManager | null> {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) return null;
  const pk = (privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`) as `0x${string}`;
  const account = privateKeyToAccount(pk);
  const client = createPublicClient({ chain: base, transport: http(process.env.BASE_RPC_URL ?? "https://mainnet.base.org") });
  const balanceRaw = await client.readContract({ address: WSTETH_ADDRESS, abi: WSTETH_ABI, functionName: "balanceOf", args: [account.address] });
  const stETHValue = await client.readContract({ address: WSTETH_ADDRESS, abi: WSTETH_ABI, functionName: "getStETHByWstETH", args: [balanceRaw] });
  return new TreasuryManager(pk, balanceRaw, stETHValue);
}
