import type { Chain } from "viem/chains";
/**
 * Utility method for converting a chainId to a {@link Chain} object
 *
 * @param chainId
 * @returns a {@link Chain} object for the given chainId
 * @throws if the chainId is not found
 */
export declare const getChain: (chainId: number) => Chain;
export declare const stringOrStringsToArray: (str: string | string[]) => string[];
type StringOrStrings = string | string[];
/**
 *
 * getCustomChain
 *
 * Utility method for creating a custom chain object
 *
 * @param name The name of the chain
 * @param id The chainId (number)
 * @param rpcUrl The RPC URL for the chain - may also be an array of URLs
 * @param blockExplorer The block explorer URL for the chain - may also be an array of URLs
 * @param nativeCurrency The native currency for the chain, ETH by default
 *
 * @example
 *
 * import { getCustomChain, createSmartAccountClient } from "@biconomy/account"
 *
 * const customChain = getCustomChain(
 *   "My Custom Chain",
 *   123456, // id
 *   "https://rpc.my-custom-chain.io", // Can also pass an array of URLs
 *   "https://explorer.my-custom-chain.io" // Can also pass an array of URLs
 * )
 *
 * const account = privateKeyToAccount(`0x${privateKey}`)
 * const walletClientWithCustomChain = createWalletClient({
 *   account,
 *   chain: customChain,
 *   transport: http()
 * })
 *
 * const smartAccountCustomChain = await createSmartAccountClient({
 *   signer: walletClientWithCustomChain,
 *   bundlerUrl,
 *   customChain
 * })
 *
 * const { wait } = await smartAccountCustomChain.sendTransaction({
 *   to: recipient,
 *   value: 1n
 * })
 *
 * const { success, receipt } = await wait();
 * console.log(success);
 *
 */
export declare const getCustomChain: (name: string, id: number, rpcUrl: StringOrStrings, blockExplorer: StringOrStrings, nativeCurrency?: Chain["nativeCurrency"], contracts?: Chain["contracts"]) => Chain;
export {};
//# sourceMappingURL=getChain.d.ts.map