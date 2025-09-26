import { type Address, type GetContractReturnType, type Hex, type PublicClient } from "viem";
import type { IBundler } from "../bundler/IBundler.js";
import { type UserOpResponse } from "../bundler/index.js";
import { BaseValidationModule, type ModuleInfo, type SendUserOpParams } from "../modules";
import { type FeeQuotesOrDataResponse, type IPaymaster } from "../paymaster";
import { type StateOverrideSet, type UserOperationStruct } from ".";
import { BaseSmartContractAccount } from "./BaseSmartContractAccount.js";
import { BiconomyAccountAbi } from "./abi/SmartAccount.js";
import type { BalancePayload, BatchUserOperationCallData, BiconomySmartAccountV2Config, BiconomySmartAccountV2ConfigConstructorProps, BiconomyTokenPaymasterRequest, BuildUserOpOptions, CounterFactualAddressParam, GetSessionParams, PaymasterUserOperationDto, QueryParamsForAddressResolver, SimulationType, SupportedToken, Transaction, TransferOwnershipCompatibleModule, WithdrawalRequest } from "./utils/Types.js";
type UserOperationKey = keyof UserOperationStruct;
export declare class BiconomySmartAccountV2 extends BaseSmartContractAccount {
    readonly biconomySmartAccountConfig: BiconomySmartAccountV2ConfigConstructorProps;
    private sessionData?;
    private sessionType;
    private sessionStorageClient;
    private SENTINEL_MODULE;
    private index;
    private chainId;
    private provider;
    paymaster?: IPaymaster;
    bundler?: IBundler;
    private accountContract?;
    private defaultFallbackHandlerAddress;
    private implementationAddress;
    private scanForUpgradedAccountsFromV1;
    private maxIndexForScan;
    defaultValidationModule: BaseValidationModule;
    activeValidationModule: BaseValidationModule;
    private constructor();
    /**
     * Creates a new instance of BiconomySmartAccountV2
     *
     * This method will create a BiconomySmartAccountV2 instance but will not deploy the Smart Account
     * Deployment of the Smart Account will be donewith the first user operation.
     *
     * - Docs: https://docs.biconomy.io/Account/integration#integration-1
     *
     * @param biconomySmartAccountConfig - Configuration for initializing the BiconomySmartAccountV2 instance {@link BiconomySmartAccountV2Config}.
     * @returns A promise that resolves to a new instance of BiconomySmartAccountV2.
     * @throws An error if something is wrong with the smart account instance creation.
     *
     * @example
     * import { createClient } from "viem"
     * import { createSmartAccountClient, BiconomySmartAccountV2 } from "@biconomy/account"
     * import { createWalletClient, http } from "viem";
     * import { polygonAmoy } from "viem/chains";
     *
     * const signer = createWalletClient({
     *   account,
     *   chain: polygonAmoy,
     *   transport: http(),
     * });
     *
     * const bundlerUrl = "" // Retrieve bundler url from dashboard
     *
     * const smartAccountFromStaticCreate = await BiconomySmartAccountV2.create({ signer, bundlerUrl });
     *
     * // Is the same as...
     *
     * const smartAccount = await createSmartAccountClient({ signer, bundlerUrl });
     *
     */
    static create(biconomySmartAccountConfig: BiconomySmartAccountV2Config): Promise<BiconomySmartAccountV2>;
    getAddress(params?: CounterFactualAddressParam): Promise<Hex>;
    getAccountAddress(params?: CounterFactualAddressParam): Promise<`0x${string}`>;
    /**
     * Returns an upper estimate for the gas spent on a specific user operation
     *
     * This method will fetch an approximate gas estimate for the user operation, given the current state of the network.
     * It is regularly an overestimate, and the actual gas spent will likely be lower.
     * It is unlikely to be an underestimate unless the network conditions rapidly change.
     *
     * @param transactions Array of {@link Transaction} to be sent.
     * @param buildUseropDto {@link BuildUserOpOptions}.
     * @returns Promise<bigint> - The estimated gas cost in wei.
     *
     * @example
     * import { createClient } from "viem"
     * import { createSmartAccountClient } from "@biconomy/account"
     * import { createWalletClient, http } from "viem";
     * import { polygonAmoy } from "viem/chains";
     *
     * const signer = createWalletClient({
     *   account,
     *   chain: polygonAmoy,
     *   transport: http(),
     * });
     *
     * const smartAccount = await createSmartAccountClient({ signer, bundlerUrl, paymasterUrl }); // Retrieve bundler/paymaster url from dashboard
     * const encodedCall = encodeFunctionData({
     *   abi: parseAbi(["function safeMint(address to) public"]),
     *   functionName: "safeMint",
     *   args: ["0x..."],
     * });
     *
     * const tx = {
     *   to: nftAddress,
     *   data: encodedCall
     * }
     *
     * const amountInWei = await smartAccount.getGasEstimates([tx, tx], {
     *    paymasterServiceData: {
     *      mode: PaymasterMode.SPONSORED,
     *    },
     * });
     *
     * console.log(amountInWei.toString());
     *
     */
    getGasEstimate(transactions: Transaction[], buildUseropDto?: BuildUserOpOptions): Promise<bigint>;
    /**
     * Returns balances for the smartAccount instance.
     *
     * This method will fetch tokens info given an array of token addresses for the smartAccount instance.
     * The balance of the native token will always be returned as the last element in the reponse array, with the address set to 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE.
     *
     * @param addresses - Optional. Array of asset addresses to fetch the balances of. If not provided, the method will return only the balance of the native token.
     * @returns Promise<Array<BalancePayload>> - An array of token balances (plus the native token balance) of the smartAccount instance.
     *
     * @example
     * import { createClient } from "viem"
     * import { createSmartAccountClient } from "@biconomy/account"
     * import { createWalletClient, http } from "viem";
     * import { polygonAmoy } from "viem/chains";
     *
     * const signer = createWalletClient({
     *   account,
     *   chain: polygonAmoy,
     *   transport: http(),
     * });
     *
     * const token = "0x747A4168DB14F57871fa8cda8B5455D8C2a8e90a";
     * const smartAccount = await createSmartAccountClient({ signer, bundlerUrl });
     * const [tokenBalanceFromSmartAccount, nativeTokenBalanceFromSmartAccount] = await smartAccount.getBalances([token]);
     *
     * console.log(tokenBalanceFromSmartAccount);
     * // {
     * //   amount: 1000000000000000n,
     * //   decimals: 6,
     * //   address: "0x747A4168DB14F57871fa8cda8B5455D8C2a8e90a",
     * //   formattedAmount: "1000000",
     * //   chainId: 80002
     * // }
     *
     * // or to get the nativeToken balance
     *
     * const [nativeTokenBalanceFromSmartAccount] = await smartAccount.getBalances();
     *
     * console.log(nativeTokenBalanceFromSmartAccount);
     * // {
     * //   amount: 1000000000000000n,
     * //   decimals: 18,
     * //   address: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
     * //   formattedAmount: "1",
     * //   chainId: 80002
     * // }
     *
     */
    getBalances(addresses?: Array<Hex>): Promise<Array<BalancePayload>>;
    /**
     * Transfers funds from Smart Account to recipient (usually EOA)
     * @param recipient - Address of the recipient
     * @param withdrawalRequests - Array of withdrawal requests {@link WithdrawalRequest}. If withdrawal request is an empty array, it will transfer the balance of the native token. Using a paymaster will ensure no dust remains in the smart account.
     * @param buildUseropDto - Optional. {@link BuildUserOpOptions}
     *
     * @returns Promise<UserOpResponse> - An object containing the status of the transaction.
     *
     * @example
     * import { createClient } from "viem"
     * import { createSmartAccountClient, NATIVE_TOKEN_ALIAS } from "@biconomy/account"
     * import { createWalletClient, http } from "viem";
     * import { polygonMumbai } from "viem/chains";
     *
     * const token = "0x747A4168DB14F57871fa8cda8B5455D8C2a8e90a";
     * const signer = createWalletClient({
     *   account,
     *   chain: polygonMumbai,
     *   transport: http(),
     * });
     *
     * const smartAccount = await createSmartAccountClient({ signer, bundlerUrl, biconomyPaymasterApiKey });
     *
     * const { wait } = await smartAccount.withdraw(
     *  [
     *    { address: token }, // omit the amount to withdraw the full balance
     *    { address: NATIVE_TOKEN_ALIAS, amount: 1n }
     *  ],
     *  account.address, // Default recipient used if no recipient is present in the withdrawal request
     *  {
     *    paymasterServiceData: { mode: PaymasterMode.SPONSORED },
     *  }
     * );
     *
     * // OR to withdraw all of the native token, leaving no dust in the smart account
     *
     * const { wait } = await smartAccount.withdraw([], account.address, {
     *  paymasterServiceData: { mode: PaymasterMode.SPONSORED },
     * });
     *
     * const { success } = await wait();
     */
    withdraw(withdrawalRequests?: WithdrawalRequest[] | null, defaultRecipient?: Hex | null, buildUseropDto?: BuildUserOpOptions): Promise<UserOpResponse>;
    /**
     * Return the account's address. This value is valid even before deploying the contract.
     */
    getCounterFactualAddress(params?: CounterFactualAddressParam): Promise<Hex>;
    private getCounterFactualAddressV2;
    _getAccountContract(): Promise<GetContractReturnType<typeof BiconomyAccountAbi, PublicClient>>;
    isActiveValidationModuleDefined(): boolean;
    isDefaultValidationModuleDefined(): boolean;
    setActiveValidationModule(validationModule: BaseValidationModule): BiconomySmartAccountV2;
    setDefaultValidationModule(validationModule: BaseValidationModule): BiconomySmartAccountV2;
    getV1AccountsUpgradedToV2(params: QueryParamsForAddressResolver): Promise<Hex>;
    /**
     * Return the value to put into the "initCode" field, if the account is not yet deployed.
     * This value holds the "factory" address, followed by this account's information
     */
    getAccountInitCode(): Promise<Hex>;
    /**
     *
     * @param to { target } address of transaction
     * @param value  represents amount of native tokens
     * @param data represent data associated with transaction
     * @returns encoded data for execute function
     */
    encodeExecute(to: Hex, value: bigint, data: Hex): Promise<Hex>;
    /**
     *
     * @param to { target } array of addresses in transaction
     * @param value  represents array of amount of native tokens associated with each transaction
     * @param data represent array of data associated with each transaction
     * @returns encoded data for executeBatch function
     */
    encodeExecuteBatch(to: Array<Hex>, value: Array<bigint>, data: Array<Hex>): Promise<Hex>;
    encodeBatchExecute(txs: BatchUserOperationCallData): Promise<Hex>;
    getDummySignatures(params?: ModuleInfo): Promise<Hex>;
    getDummySignature(): Hex;
    getDummyPaymasterData(): string;
    validateUserOp(userOp: Partial<UserOperationStruct>, requiredFields: UserOperationKey[]): boolean;
    signUserOp(userOp: Partial<UserOperationStruct>, params?: SendUserOpParams): Promise<UserOperationStruct>;
    getSignatureWithModuleAddress(moduleSignature: Hex, moduleAddress?: Hex): Hex;
    getPaymasterUserOp(userOp: Partial<UserOperationStruct>, paymasterServiceData: PaymasterUserOperationDto): Promise<Partial<UserOperationStruct>>;
    private getPaymasterAndData;
    private getPaymasterFeeQuotesOrData;
    /**
     *
     * @description This function will retrieve fees from the paymaster in erc20 mode
     *
     * @param manyOrOneTransactions Array of {@link Transaction} to be batched and sent. Can also be a single {@link Transaction}.
     * @param buildUseropDto {@link BuildUserOpOptions}.
     * @returns Promise<FeeQuotesOrDataResponse>
     *
     * @example
     * import { createClient } from "viem"
     * import { createSmartAccountClient } from "@biconomy/account"
     * import { createWalletClient, http } from "viem";
     * import { polygonAmoy } from "viem/chains";
     *
     * const signer = createWalletClient({
     *   account,
     *   chain: polygonAmoy,
     *   transport: http(),
     * });
     *
     * const smartAccount = await createSmartAccountClient({ signer, bundlerUrl }); // Retrieve bundler url from dashboard
     * const encodedCall = encodeFunctionData({
     *   abi: parseAbi(["function safeMint(address to) public"]),
     *   functionName: "safeMint",
     *   args: ["0x..."],
     * });
     *
     * const transaction = {
     *   to: nftAddress,
     *   data: encodedCall
     * }
     *
     * const feeQuotesResponse: FeeQuotesOrDataResponse = await smartAccount.getTokenFees(transaction, { paymasterServiceData: { mode: PaymasterMode.ERC20 } });
     *
     * const userSeletedFeeQuote = feeQuotesResponse.feeQuotes?.[0];
     *
     * const { wait } = await smartAccount.sendTransaction(transaction, {
     *    paymasterServiceData: {
     *      mode: PaymasterMode.ERC20,
     *      feeQuote: userSeletedFeeQuote,
     *      spender: feeQuotesResponse.tokenPaymasterAddress,
     *    },
     * });
     *
     * const { success, receipt } = await wait();
     *
     */
    getTokenFees(manyOrOneTransactions: Transaction | Transaction[], buildUseropDto: BuildUserOpOptions): Promise<FeeQuotesOrDataResponse>;
    /**
     *
     * @description This function will return an array of supported tokens from the erc20 paymaster associated with the Smart Account
     * @returns Promise<{@link SupportedToken}>
     *
     * @example
     * import { createClient } from "viem"
     * import { createSmartAccountClient } from "@biconomy/account"
     * import { createWalletClient, http } from "viem";
     * import { polygonAmoy } from "viem/chains";
     *
     * const signer = createWalletClient({
     *   account,
     *   chain: polygonAmoy,
     *   transport: http(),
     * });
     *
     * const smartAccount = await createSmartAccountClient({ signer, bundlerUrl, biconomyPaymasterApiKey }); // Retrieve bundler url from dashboard
     * const tokens = await smartAccount.getSupportedTokens();
     *
     * // [
     * //   {
     * //     symbol: "USDC",
     * //     tokenAddress: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
     * //     decimal: 6,
     * //     logoUrl: "https://assets.coingecko.com/coins/images/279/large/usd-coin.png?1595353707",
     * //     premiumPercentage: 0.1,
     * //   }
     * // ]
     *
     */
    getSupportedTokens(): Promise<SupportedToken[]>;
    /**
     *
     * @param userOp
     * @param params
     * @description This function will take a user op as an input, sign it with the owner key, and send it to the bundler.
     * @returns Promise<UserOpResponse>
     * Sends a user operation
     *
     * - Docs: https://docs.biconomy.io/Account/methods#senduserop-
     *
     * @param userOp Partial<{@link UserOperationStruct}> the userOp params to be sent.
     * @param params {@link SendUserOpParams}.
     * @returns Promise<{@link UserOpResponse}> that you can use to track the user operation.
     *
     * @example
     * import { createClient } from "viem"
     * import { createSmartAccountClient } from "@biconomy/account"
     * import { createWalletClient, http } from "viem";
     * import { polygonAmoy } from "viem/chains";
     *
     * const signer = createWalletClient({
     *   account,
     *   chain: polygonAmoy,
     *   transport: http(),
     * });
     *
     * const smartAccount = await createSmartAccountClient({ signer, bundlerUrl }); // Retrieve bundler url from dashboard
     * const encodedCall = encodeFunctionData({
     *   abi: parseAbi(["function safeMint(address to) public"]),
     *   functionName: "safeMint",
     *   args: ["0x..."],
     * });
     *
     * const transaction = {
     *   to: nftAddress,
     *   data: encodedCall
     * }
     *
     * const userOp = await smartAccount.buildUserOp([transaction]);
     *
     * const { wait } = await smartAccount.sendUserOp(userOp);
     * const { success, receipt } = await wait();
     *
     */
    sendUserOp(userOp: Partial<UserOperationStruct>, params?: SendUserOpParams): Promise<UserOpResponse>;
    /**
     *
     * @param userOp - The signed user operation to send
     * @param simulationType - The type of simulation to perform ("validation" | "validation_and_execution")
     * @description This function call will take 'signedUserOp' as input and send it to the bundler
     * @returns
     */
    sendSignedUserOp(userOp: UserOperationStruct, simulationType?: SimulationType): Promise<UserOpResponse>;
    getUserOpHash(userOp: Partial<UserOperationStruct>): Promise<Hex>;
    estimateUserOpGas(userOp: Partial<UserOperationStruct>, stateOverrideSet?: StateOverrideSet): Promise<Partial<UserOperationStruct>>;
    getNonce(nonceKey?: number): Promise<bigint>;
    private getBuildUserOpNonce;
    /**
     * Transfers ownership of the smart account to a new owner.
     * @param newOwner The address of the new owner.
     * @param moduleAddress {@link TransferOwnershipCompatibleModule} The address of the validation module (ECDSA Ownership Module or Multichain Validation Module).
     * @param buildUseropDto {@link BuildUserOpOptions}. Optional parameter
     * @returns A Promise that resolves to a UserOpResponse or rejects with an Error.
     * @description This function will transfer ownership of the smart account to a new owner. If you use session key manager module, after transferring the ownership
     * you will need to re-create a session for the smart account with the new owner (signer) and specify "accountAddress" in "createSmartAccountClient" function.
     * @example
     *
     * let walletClient = createWalletClient({
          account,
          chain: baseSepolia,
          transport: http()
        });
  
        let smartAccount = await createSmartAccountClient({
          signer: walletClient,
          paymasterUrl: "https://paymaster.biconomy.io/api/v1/...",
          bundlerUrl: `https://bundler.biconomy.io/api/v2/84532/nJPK7B3ru.dd7f7861-190d-41bd-af80-6877f74b8f44`,
          chainId: 84532
        });
        const response = await smartAccount.transferOwnership(newOwner, DEFAULT_ECDSA_OWNERSHIP_MODULE, {paymasterServiceData: {mode: PaymasterMode.SPONSORED}});
        
        walletClient = createWalletClient({
          newOwnerAccount,
          chain: baseSepolia,
          transport: http()
        })
        
        smartAccount = await createSmartAccountClient({
          signer: walletClient,
          paymasterUrl: "https://paymaster.biconomy.io/api/v1/...",
          bundlerUrl: `https://bundler.biconomy.io/api/v2/84532/nJPK7B3ru.dd7f7861-190d-41bd-af80-6877f74b8f44`,
          chainId: 84532,
          accountAddress: await smartAccount.getAccountAddress()
        })
     */
    transferOwnership(newOwner: Address, moduleAddress: TransferOwnershipCompatibleModule, buildUseropDto?: BuildUserOpOptions): Promise<UserOpResponse>;
    /**
     * Sends a transaction (builds and sends a user op in sequence)
     *
     * - Docs: https://docs.biconomy.io/Account/methods#sendtransaction-
     *
     * @param manyOrOneTransactions Array of {@link Transaction} to be batched and sent. Can also be a single {@link Transaction}.
     * @param buildUseropDto {@link BuildUserOpOptions}.
     * @param sessionData - Optional parameter. If you are using session keys, you can pass the sessionIds, the session and the storage client to retrieve the session data while sending a tx {@link GetSessionParams}
     * @returns Promise<{@link UserOpResponse}> that you can use to track the user operation.
     *
     * @example
     * ```ts
     * import { createClient } from "viem"
     * import { createSmartAccountClient } from "@biconomy/account"
     * import { createWalletClient, http } from "viem";
     * import { polygonAmoy } from "viem/chains";
     *
     * const signer = createWalletClient({
     *   account,
     *   chain: polygonAmoy,
     *   transport: http(),
     * });
     *
     * const smartAccount = await createSmartAccountClient({ signer, bundlerUrl }); // Retrieve bundler url from dashboard
     * const encodedCall = encodeFunctionData({
     *   abi: parseAbi(["function safeMint(address to) public"]),
     *   functionName: "safeMint",
     *   args: ["0x..."],
     * });
     *
     * const transaction = {
     *   to: nftAddress,
     *   data: encodedCall
     * }
     *
     * const { waitForTxHash } = await smartAccount.sendTransaction(transaction);
     * const { transactionHash, userOperationReceipt } = await wait();
     * ```
     */
    sendTransaction(manyOrOneTransactions: Transaction | Transaction[], buildUseropDto?: BuildUserOpOptions, sessionData?: GetSessionParams): Promise<UserOpResponse>;
    /**
     * Retrieves the session parameters for sending the session transaction
     *
     * @description This method is called under the hood with the third argument passed into the smartAccount.sendTransaction(...args) method. It is used to retrieve the relevant session parameters while sending the session transaction.
     *
     * @param leafIndex - The leaf index(es) of the session in the storage client to be used. If you want to use the last leaf index, you can pass "LAST_LEAVES" as the value.
     * @param store - The {@link ISessionStorage} client to be used. If you want to use the default storage client (localStorage in the browser), you can pass "DEFAULT_STORE" as the value. Alternatively you can pass in {@link SessionSearchParam} for more control over how the leaves are stored and retrieved.
     * @param chain - Optional, will be inferred if left unset
     * @param txs - Optional, used only for validation while using Batched session type
     * @returns Promise<{@link GetSessionParams}>
     *
     * @example
     * ```ts
     * import { createClient } from "viem"
     * import { createSmartAccountClient } from "@biconomy/account"
     * import { createWalletClient, http } from "viem";
     * import { polygonAmoy } from "viem/chains";
     *
     * const signer = createWalletClient({
     *   account,
     *   chain: polygonAmoy,
     *   transport: http(),
     * });
     *
     * const smartAccount = await createSmartAccountClient({ signer, bundlerUrl }); // Retrieve bundler url from dashboard
     * const encodedCall = encodeFunctionData({
     *   abi: parseAbi(["function safeMint(address to) public"]),
     *   functionName: "safeMint",
     *   args: ["0x..."],
     * });
     *
     * const transaction = {
     *   to: nftAddress,
     *   data: encodedCall
     * }
     *
     * const { waitForTxHash } = await smartAccount.sendTransaction(transaction);
     * const { transactionHash, userOperationReceipt } = await wait();
     * ```
     */
    getSessionParams({ leafIndex, store, chain, txs }: GetSessionParams): Promise<{
        params: ModuleInfo;
    }>;
    /**
     * Builds a user operation
     *
     * This method will also simulate the validation and execution of the user operation, telling the user if the user operation will be successful or not.
     *
     * - Docs: https://docs.biconomy.io/Account/methods#builduserop-
     *
     * @param transactions Array of {@link Transaction} to be sent.
     * @param buildUseropDto {@link BuildUserOpOptions}.
     * @returns Promise<Partial{@link UserOperationStruct}>> the built user operation to be sent.
     *
     * @example
     * import { createClient } from "viem"
     * import { createSmartAccountClient } from "@biconomy/account"
     * import { createWalletClient, http } from "viem";
     * import { polygonAmoy } from "viem/chains";
     *
     * const signer = createWalletClient({
     *   account,
     *   chain: polygonAmoy,
     *   transport: http(),
     * });
     *
     * const smartAccount = await createSmartAccountClient({ signer, bundlerUrl }); // Retrieve bundler url from dashboard
     * const encodedCall = encodeFunctionData({
     *   abi: parseAbi(["function safeMint(address to) public"]),
     *   functionName: "safeMint",
     *   args: ["0x..."],
     * });
     *
     * const transaction = {
     *   to: nftAddress,
     *   data: encodedCall
     * }
     *
     * const userOp = await smartAccount.buildUserOp([{ to: "0x...", data: encodedCall }]);
     *
     */
    buildUserOp(transactions: Transaction[], buildUseropDto?: BuildUserOpOptions): Promise<Partial<UserOperationStruct>>;
    private validateUserOpAndPaymasterRequest;
    /**
     *
     * @param userOp partial user operation without signature and paymasterAndData
     * @param tokenPaymasterRequest This dto provides information about fee quote. Fee quote is received from earlier request getFeeQuotesOrData() to the Biconomy paymaster.
     *  maxFee and token decimals from the quote, along with the spender is required to append approval transaction.
     * @notice This method should be called when gas is paid in ERC20 token using TokenPaymaster
     * @description Optional method to update the userOp.calldata with batched transaction which approves the paymaster spender with necessary amount(if required)
     * @returns updated userOp with new callData, callGasLimit
     */
    buildTokenPaymasterUserOp(userOp: Partial<UserOperationStruct>, tokenPaymasterRequest: BiconomyTokenPaymasterRequest): Promise<Partial<UserOperationStruct>>;
    signUserOpHash(userOpHash: string, params?: ModuleInfo): Promise<Hex>;
    /**
     * Deploys the smart contract
     *
     * This method will deploy a Smart Account contract. It is useful for deploying in a moment when you know that gas prices are low,
     * and you want to deploy the account before sending the first user operation. This step can otherwise be skipped,
     * as the deployment will alternatively be bundled with the first user operation.
     *
     * @param buildUseropDto {@link BuildUserOpOptions}.
     * @returns Promise<{@link UserOpResponse}> that you can use to track the user operation.
     * @error Throws an error if the account has already been deployed.
     * @error Throws an error if the account has not enough native token balance to deploy, if not using a paymaster.
     *
     * @example
     * import { createClient } from "viem"
     * import { createSmartAccountClient } from "@biconomy/account"
     * import { createWalletClient, http } from "viem";
     * import { polygonAmoy } from "viem/chains";
     *
     * const signer = createWalletClient({
     *   account,
     *   chain: polygonAmoy,
     *   transport: http(),
     * });
     *
     * const smartAccount = await createSmartAccountClient({
     *  signer,
     *  biconomyPaymasterApiKey,
     *  bundlerUrl
     * });
     *
     * // If you want to use a paymaster...
     * const { wait } = await smartAccount.deploy({
     *   paymasterServiceData: { mode: PaymasterMode.SPONSORED },
     * });
     *
     * // Or if you can't use a paymaster send native token to this address:
     * const counterfactualAddress = await smartAccount.getAccountAddress();
     *
     * // Then deploy the account
     * const { wait } = await smartAccount.deploy();
     *
     * const { success, receipt } = await wait();
     *
     */
    deploy(buildUseropDto?: BuildUserOpOptions): Promise<UserOpResponse>;
    getFactoryData(): Promise<`0x${string}` | undefined>;
    signMessage(message: string | Uint8Array): Promise<Hex>;
    getIsValidSignatureData(messageHash: Hex, signature: Hex): Promise<Hex>;
    enableModule(moduleAddress: Hex): Promise<UserOpResponse>;
    getEnableModuleData(moduleAddress: Hex): Promise<Transaction>;
    getSetupAndEnableModuleData(moduleAddress: Hex, moduleSetupData: Hex): Promise<Transaction>;
    disableModule(prevModule: Hex, moduleAddress: Hex): Promise<UserOpResponse>;
    getDisableModuleData(prevModule: Hex, moduleAddress: Hex): Promise<Transaction>;
    isModuleEnabled(moduleAddress: Hex): Promise<boolean>;
    getAllModules(pageSize?: number): Promise<Array<string>>;
}
export {};
//# sourceMappingURL=BiconomySmartAccountV2.d.ts.map