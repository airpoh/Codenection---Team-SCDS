import type { Chain } from "viem";
import { type BiconomySmartAccountV2, type BuildUserOpOptions, type Transaction } from "../../account";
import { type CreateSessionDataParams, type SessionGrantedPayload, type SessionParams, type SessionSearchParam } from "../index.js";
import type { ISessionStorage } from "../interfaces/ISessionStorage";
export type CreateBatchSessionConfig = {
    /** The storage client to be used for storing the session data */
    sessionStorageClient: ISessionStorage;
    /** An array of session configurations */
    leaves: CreateSessionDataParams[];
};
/**
 *
 * createBatchSession
 *
 * Creates a session manager that handles multiple sessions at once for a given user's smart account.
 * Useful for handling multiple granted sessions at once.
 *
 * @param smartAccount - The user's {@link BiconomySmartAccountV2} smartAccount instance.
 * @param sessionKeyAddress - The address of the sessionKey upon which the policy is to be imparted.
 * @param batchSessionConfig - An array of session configurations {@link CreateBatchSessionConfig}.
 * @param buildUseropDto - Optional. {@link BuildUserOpOptions}
 * @returns Promise<{@link SessionGrantedPayload}> - An object containing the status of the transaction and the sessionID.
 *
 * @example
 *
 * ```typescript
 * import { createClient } from "viem"
 * import { createSmartAccountClient } from "@biconomy/account"
 * import { createWalletClient, http } from "viem";
 * import { polygonAmoy } from "viem/chains";
 * import { SessionFileStorage } from "@biconomy/session-file-storage";

* const signer = createWalletClient({
 *   account,
 *   chain: polygonAmoy,
 *   transport: http(),
 * });
 *
 * const smartAccount = await createSmartAccountClient({ signer, bundlerUrl, paymasterUrl }); // Retrieve bundler/paymaster url from dashboard
 * const smartAccountAddress = await smartAccount.getAccountAddress();
 * const nftAddress = "0x1758f42Af7026fBbB559Dc60EcE0De3ef81f665e"
 * const sessionStorage = new SessionFileStorage(smartAccountAddress);
 * const sessionKeyAddress = (await sessionStorage.addSigner(undefined, polygonAmoy)).getAddress();
 *
 *  const leaves: CreateSessionDataParams[] = [
 *    createERC20SessionDatum({
 *      interval: {
 *        validUntil: 0,
 *        validAfter: 0
 *      },
 *      sessionKeyAddress,
 *      sessionKeyData: encodeAbiParameters(
 *        [
 *          { type: "address" },
 *          { type: "address" },
 *          { type: "address" },
 *          { type: "uint256" }
 *        ],
 *        [sessionKeyAddress, token, recipient, amount]
 *      )
 *    }),
 *    createABISessionDatum({
 *      interval: {
 *        validUntil: 0,
 *        validAfter: 0
 *      },
 *      sessionKeyAddress,
 *      contractAddress: nftAddress,
 *      functionSelector: "safeMint(address)",
 *      rules: [
 *        {
 *          offset: 0,
 *          condition: 0,
 *          referenceValue: smartAccountAddress
 *        }
 *      ],
 *      valueLimit: 0n
 *    })
 *  ]
 *
 *  const { wait, sessionID } = await createBatchSession(
 *    smartAccount,
 *    sessionStorageClient: sessionStorage,
 *    leaves,
 *    {
 *      paymasterServiceData: { mode: PaymasterMode.SPONSORED },
 *    }
 *  )
 *
 *  const {
 *    receipt: { transactionHash },
 *    success
 *  } = await wait();
 *
 *  console.log({ sessionID, success }); // Use the sessionID later to retrieve the sessionKey from the storage client
 *
 * ```
 */
export declare const createBatchSession: (smartAccount: BiconomySmartAccountV2, sessionStorageClient: ISessionStorage, leaves: CreateSessionDataParams[], buildUseropDto?: BuildUserOpOptions) => Promise<SessionGrantedPayload>;
export type BatchSessionParamsPayload = {
    params: {
        batchSessionParams: SessionParams[];
    };
};
/**
 * getBatchSessionTxParams
 *
 * Retrieves the transaction parameters for a batched session.
 *
 * @param transactions - An array of {@link Transaction}s.
 * @param correspondingIndexes - An array of indexes for the transactions corresponding to the relevant session. If not provided, the last {transaction.length} sessions are used.
 * @param conditionalSession - {@link SessionSearchParam} The session data that contains the sessionID and sessionSigner. If not provided, The default session storage (localStorage in browser, fileStorage in node backend) is used to fetch the sessionIDInfo
 * @param chain - The chain.
 * @returns Promise<{@link BatchSessionParamsPayload}> - session parameters.
 *
 */
export declare const getBatchSessionTxParams: (transactions: Transaction[], correspondingIndexes: number[] | null, conditionalSession: SessionSearchParam, chain: Chain) => Promise<BatchSessionParamsPayload>;
//# sourceMappingURL=batch.d.ts.map