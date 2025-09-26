import { type Hex } from "viem";
import { type SmartAccountSigner, type UserOperationStruct } from "../account";
import { BaseValidationModule } from "./BaseValidationModule.js";
import type { ModuleVersion, MultiChainUserOpDto, MultiChainValidationModuleConfig } from "./utils/Types.js";
export declare class MultiChainValidationModule extends BaseValidationModule {
    signer: SmartAccountSigner;
    moduleAddress: Hex;
    version: ModuleVersion;
    private constructor();
    static create(moduleConfig: MultiChainValidationModuleConfig): Promise<MultiChainValidationModule>;
    getAddress(): Hex;
    getSigner(): Promise<SmartAccountSigner>;
    getDummySignature(): Promise<Hex>;
    getInitData(): Promise<Hex>;
    signUserOpHash(userOpHash: string): Promise<Hex>;
    /**
     * Signs a message using the appropriate method based on the type of signer.
     *
     * @param {Uint8Array | string} message - The message to be signed.
     * @returns {Promise<string>} A promise resolving to the signature or error message.
     * @throws {Error} If the signer type is invalid or unsupported.
     */
    signMessage(_message: Uint8Array | string): Promise<string>;
    signUserOps(multiChainUserOps: MultiChainUserOpDto[]): Promise<UserOperationStruct[]>;
}
//# sourceMappingURL=MultichainValidationModule.d.ts.map