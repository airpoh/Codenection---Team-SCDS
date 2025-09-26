import type { Chain, Hex } from "viem";
import type { UserOperationStruct } from "../../account";
export type Bundlerconfig = {
    bundlerUrl: string;
    entryPointAddress?: string;
    chainId?: number;
    userOpReceiptIntervals?: {
        [key in number]?: number;
    };
    userOpWaitForTxHashIntervals?: {
        [key in number]?: number;
    };
    userOpReceiptMaxDurationIntervals?: {
        [key in number]?: number;
    };
    userOpWaitForTxHashMaxDurationIntervals?: {
        [key in number]?: number;
    };
    /** Can be used to optionally override the chain with a custom chain if it doesn't already exist in viems list of supported chains. Alias of customChain */
    viemChain?: Chain;
    /** Can be used to optionally override the chain with a custom chain if it doesn't already exist in viems list of supported chains. Alias of viemChain */
    customChain?: Chain;
};
export type BundlerConfigWithChainId = Bundlerconfig & {
    chainId: number;
};
export type UserOpReceipt = {
    userOpHash: string;
    entryPoint: string;
    paymaster: string;
    actualGasCost: Hex;
    actualGasUsed: Hex;
    success: "true" | "false";
    reason: string;
    logs: Array<any>;
    receipt: any;
};
export type UserOpStatus = {
    state: string;
    transactionHash?: string;
    userOperationReceipt?: UserOpReceipt;
};
export type GetUserOperationReceiptResponse = {
    jsonrpc: string;
    id: number;
    result: UserOpReceipt;
    error?: JsonRpcError;
};
export type GetUserOperationStatusResponse = {
    jsonrpc: string;
    id: number;
    result: UserOpStatus;
    error?: JsonRpcError;
};
export type SendUserOpResponse = {
    jsonrpc: string;
    id: number;
    result: string;
    error?: JsonRpcError;
};
export type UserOpResponse = {
    userOpHash: string;
    wait(_confirmations?: number): Promise<UserOpReceipt>;
    waitForTxHash(): Promise<UserOpStatus>;
};
export type EstimateUserOpGasResponse = {
    jsonrpc: string;
    id: number;
    result: UserOpGasResponse;
    error?: JsonRpcError;
};
export type UserOpGasResponse = {
    preVerificationGas: string;
    verificationGasLimit: string;
    callGasLimit: string;
    maxPriorityFeePerGas: string;
    maxFeePerGas: string;
};
export type GetUserOpByHashResponse = {
    jsonrpc: string;
    id: number;
    result: UserOpByHashResponse;
    error?: JsonRpcError;
};
export type UserOpByHashResponse = UserOperationStruct & {
    transactionHash: string;
    blockNumber: number;
    blockHash: string;
    entryPoint: string;
};
export type JsonRpcError = {
    code: string;
    message: string;
    data: any;
};
export type GetGasFeeValuesResponse = {
    jsonrpc: string;
    id: number;
    result: GasFeeValues;
    error?: JsonRpcError;
};
export type GasFeeValues = {
    maxPriorityFeePerGas: string;
    maxFeePerGas: string;
};
//# sourceMappingURL=Types.d.ts.map