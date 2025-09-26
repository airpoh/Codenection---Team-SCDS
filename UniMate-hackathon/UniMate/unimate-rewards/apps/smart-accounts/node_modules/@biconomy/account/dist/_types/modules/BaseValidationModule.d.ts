import type { Hex } from "viem";
import { type SmartAccountSigner } from "../account";
import type { IValidationModule } from "./interfaces/IValidationModule.js";
import type { BaseValidationModuleConfig, ModuleInfo } from "./utils/Types.js";
export declare abstract class BaseValidationModule implements IValidationModule {
    entryPointAddress: Hex;
    constructor(moduleConfig: BaseValidationModuleConfig);
    abstract getAddress(): Hex;
    setEntryPointAddress(entryPointAddress: Hex): void;
    abstract getInitData(): Promise<Hex>;
    abstract getDummySignature(_params?: ModuleInfo): Promise<Hex>;
    abstract getSigner(): Promise<SmartAccountSigner>;
    abstract signUserOpHash(_userOpHash: string, _params?: ModuleInfo): Promise<Hex>;
    abstract signMessage(_message: Uint8Array | string): Promise<string>;
    signMessageSmartAccountSigner(_message: string | Uint8Array, signer: SmartAccountSigner): Promise<string>;
}
//# sourceMappingURL=BaseValidationModule.d.ts.map