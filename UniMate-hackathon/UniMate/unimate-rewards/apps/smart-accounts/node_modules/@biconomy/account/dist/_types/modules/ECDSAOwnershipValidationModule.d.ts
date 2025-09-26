import { type Hex } from "viem";
import { type SmartAccountSigner } from "../account";
import { BaseValidationModule } from "./BaseValidationModule.js";
import type { ECDSAOwnershipValidationModuleConfig, ModuleVersion } from "./utils/Types.js";
export declare class ECDSAOwnershipValidationModule extends BaseValidationModule {
    signer: SmartAccountSigner;
    moduleAddress: Hex;
    version: ModuleVersion;
    private constructor();
    static create(moduleConfig: ECDSAOwnershipValidationModuleConfig): Promise<ECDSAOwnershipValidationModule>;
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
}
//# sourceMappingURL=ECDSAOwnershipValidationModule.d.ts.map