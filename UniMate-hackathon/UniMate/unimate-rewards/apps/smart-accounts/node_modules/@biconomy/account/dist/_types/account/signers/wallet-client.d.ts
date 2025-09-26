import { type Hex, type SignableMessage, type TypedData, type TypedDataDefinition, type WalletClient } from "viem";
import type { SmartAccountSigner } from "../utils/Types.js";
export declare class WalletClientSigner implements SmartAccountSigner<WalletClient> {
    signerType: string;
    inner: WalletClient;
    constructor(client: WalletClient, signerType: string);
    getAddress: () => Promise<`0x${string}`>;
    readonly signMessage: (message: SignableMessage) => Promise<`0x${string}`>;
    signTypedData: <const TTypedData extends TypedData | {
        [key: string]: unknown;
    }, TPrimaryType extends string = string>(typedData: TypedDataDefinition<TTypedData, TPrimaryType>) => Promise<Hex>;
}
//# sourceMappingURL=wallet-client.d.ts.map