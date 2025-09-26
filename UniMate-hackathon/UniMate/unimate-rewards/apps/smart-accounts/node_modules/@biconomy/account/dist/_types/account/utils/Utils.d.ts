import { type Address, type Hash, type Hex } from "viem";
import type { UserOperationStruct } from "../../account";
import { type SupportedSigner } from "../../account";
import type { BiconomySmartAccountV2Config } from "./Types.js";
/**
 * pack the userOperation
 * @param op
 * @param forSignature "true" if the hash is needed to calculate the getUserOpHash()
 *  "false" to pack entire UserOp, for calculating the calldata cost of putting it on-chain.
 */
export declare function packUserOp(op: Partial<UserOperationStruct>, forSignature?: boolean): string;
export declare const isNullOrUndefined: (value: any) => value is undefined;
export declare const compareChainIds: (signer: SupportedSigner, biconomySmartAccountConfig: BiconomySmartAccountV2Config, skipChainIdCalls: boolean) => Promise<Error | void>;
export declare const isValidRpcUrl: (url: string) => boolean;
export declare const addressEquals: (a?: string, b?: string) => boolean;
export type SignWith6492Params = {
    factoryAddress: Address;
    factoryCalldata: Hex;
    signature: Hash;
};
export declare const wrapSignatureWith6492: ({ factoryAddress, factoryCalldata, signature }: SignWith6492Params) => Hash;
export declare function percentage(partialValue: number, totalValue: number): number;
export declare function convertToFactor(percentage: number | undefined): number;
//# sourceMappingURL=Utils.d.ts.map