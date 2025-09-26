import type { Hex, SignableMessage } from "viem";
import type { LightSigner, SmartAccountSigner } from "../utils/Types.js";
export declare class EthersSigner<T extends LightSigner> implements SmartAccountSigner<T> {
    #private;
    signerType: string;
    inner: T;
    constructor(inner: T, signerType: string);
    getAddress(): Promise<`0x${string}`>;
    signMessage(_message: SignableMessage): Promise<Hex>;
    signTypedData(_: any): Promise<Hex>;
}
export default EthersSigner;
//# sourceMappingURL=EthersSigner.d.ts.map