import { type Hex, type WalletClient } from "viem";
import type { SmartAccountSigner, SupportedSigner } from "../../account";
interface SmartAccountResult {
    signer: SmartAccountSigner;
    chainId: number | null;
    rpcUrl: string | undefined;
}
export declare function isWalletClient(signer: SupportedSigner): signer is WalletClient;
export declare const convertSigner: (signer: SupportedSigner, skipChainIdCalls?: boolean, _rpcUrl?: string) => Promise<SmartAccountResult>;
export declare const getSignerAddress: (signer: SupportedSigner) => Promise<Hex>;
export {};
//# sourceMappingURL=convertSigner.d.ts.map