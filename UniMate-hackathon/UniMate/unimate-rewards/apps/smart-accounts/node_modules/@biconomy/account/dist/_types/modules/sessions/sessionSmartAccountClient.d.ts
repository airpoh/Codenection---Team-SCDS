import { type Chain, type Hex } from "viem";
import { type BiconomySmartAccountV2, type BiconomySmartAccountV2Config, type BuildUserOpOptions, type SupportedSigner, type Transaction } from "../../account";
import type { UserOpResponse } from "../../bundler/index.js";
import { type SessionSearchParam, type getSingleSessionTxParams } from "../index.js";
import type { ModuleInfo, StrictSessionParams } from "../utils/Types";
export type SessionType = "STANDARD" | "BATCHED" | "DISTRIBUTED_KEY";
export type ImpersonatedSmartAccountConfig = Omit<BiconomySmartAccountV2Config, "signer"> & {
    accountAddress: Hex;
    chainId: number;
    bundlerUrl: string;
};
export type GetSessionParameters = Parameters<typeof getSingleSessionTxParams>;
export type GetSessionResponse = {
    params: ModuleInfo;
};
export type SendSessionTransactionFunction = (getParameters: GetSessionParameters, manyOrOneTransactions: Transaction | Transaction[], buildUseropDto?: BuildUserOpOptions) => Promise<UserOpResponse>;
/**
 *
 * createSessionSmartAccountClient
 *
 * Creates a new instance of BiconomySmartAccountV2 class. This is used to impersonate a users smart account by a dapp, for use
 * with a valid session that has previously been granted by the user. A dummy signer is passed into the smart account instance, which cannot be used.
 * The sessionSigner is used instead for signing transactions, which is fetched from the session storage using the sessionID. {@link ISessionStorage}
 *
 * @param biconomySmartAccountConfig - Configuration for initializing the BiconomySmartAccountV2 instance {@link ImpersonatedSmartAccountConfig}.
 * @param conditionalSession - {@link SessionSearchParam} The session data that contains the sessionID and sessionSigner. If not provided, The default session storage (localStorage in browser, fileStorage in node backend) is used to fetch the sessionIDInfo
 * @param sessionType - {@link SessionType}: One of "STANDARD", "BATCHED" or "DISTRIBUTED_KEY". Default is "STANDARD".
 * @returns A promise that resolves to a new instance of {@link BiconomySmartAccountV2}.
 * @throws An error if something is wrong with the smart account instance creation.
 *
 * @example
 * import { createClient } from "viem"
 * import { createSmartAccountClient, BiconomySmartAccountV2 } from "@biconomy/account"
 * import { createWalletClient, http } from "viem";
 * import { polygonAmoy } from "viem/chains";
 * import { SessionFileStorage } from "@biconomy/session-file-storage";
 *
 * const signer = createWalletClient({
 *   account,
 *   chain: polygonAmoy,
 *   transport: http(),
 * });
 *
 *
 * // The following fields are required to create a session smart account client
 * const smartAccountAddress = '0x...';
 * const sessionStorage = new SessionFileStorage(smartAccountAddress);
 * const sessionKeyAddress = '0x...';
 * const sessionID = '0x...';
 *
 * const smartAccountWithSession = await createSessionSmartAccountClient(
 *   {
 *     accountAddress: smartAccountAddress, // Set the account address on behalf of the user
 *     bundlerUrl,
 *     paymasterUrl,
 *     chainId
 *   },
 *   "DEFAULT_STORE" // Can be ommitted if using default session storage (localStorage in browser, fileStorage in node backend)
 * )
 *
 * // The smartAccountWithSession instance can now be used to interact with the blockchain on behalf of the user in the same manner as a regular smart account instance.
 * // smartAccountWithSession.sendTransaction(...) etc.
 *
 */
export declare const createSessionSmartAccountClient: (biconomySmartAccountConfig: ImpersonatedSmartAccountConfig, conditionalSession: SessionSearchParam | "DEFAULT_STORE", sessionType?: SessionType | boolean) => Promise<BiconomySmartAccountV2>;
/**
 *
 * @param privateKey - The private key of the user's account
 * @param chain - The chain object
 * @returns {@link SupportedSigner} - A signer object that can be used to sign transactions
 */
export declare const toSupportedSigner: (privateKey: string, chain: Chain) => SupportedSigner;
/**
 *
 * @param privateKey The private key of the user's account
 * @param sessionIDs An array of sessionIDs
 * @param chain The chain object
 * @returns {@link StrictSessionParams[]} - An array of session parameters {@link StrictSessionParams} that can be used to sign transactions here {@link BuildUserOpOptions}
 */
export declare const toSessionParams: (privateKey: Hex, sessionIDs: string[], chain: Chain) => StrictSessionParams[];
//# sourceMappingURL=sessionSmartAccountClient.d.ts.map