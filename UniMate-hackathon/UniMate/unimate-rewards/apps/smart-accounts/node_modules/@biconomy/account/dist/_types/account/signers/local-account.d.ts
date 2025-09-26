import type { HDAccount, Hex, LocalAccount, PrivateKeyAccount, SignableMessage, TypedData, TypedDataDefinition } from "viem";
import type { SmartAccountSigner } from "../utils/Types.js";
export declare class LocalAccountSigner<T extends HDAccount | PrivateKeyAccount | LocalAccount> implements SmartAccountSigner<T> {
    inner: T;
    signerType: string;
    constructor(inner: T);
    readonly signMessage: (message: SignableMessage) => Promise<`0x${string}`>;
    readonly signTypedData: <const TTypedData extends TypedData | {
        [key: string]: unknown;
    }, TPrimaryType extends string = string>(params: TypedDataDefinition<TTypedData, TPrimaryType>) => Promise<Hex>;
    readonly getAddress: () => Promise<`0x${string}`>;
    static mnemonicToAccountSigner(key: string): LocalAccountSigner<HDAccount>;
    static privateKeyToAccountSigner(key: Hex): LocalAccountSigner<PrivateKeyAccount>;
}
//# sourceMappingURL=local-account.d.ts.map