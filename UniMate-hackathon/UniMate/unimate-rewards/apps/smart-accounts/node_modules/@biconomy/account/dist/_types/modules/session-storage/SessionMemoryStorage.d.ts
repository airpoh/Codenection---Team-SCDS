import { type Chain, type Hex } from "viem";
import { type SmartAccountSigner } from "../../account";
import type { ISessionStorage, SessionLeafNode, SessionSearchParam, SessionStatus } from "../interfaces/ISessionStorage.js";
import type { SignerData } from "../utils/Types.js";
export declare class SessionMemoryStorage implements ISessionStorage {
    smartAccountAddress: Hex;
    constructor(smartAccountAddress: Hex);
    private validateSearchParam;
    private getSessionStore;
    getSignerStore(): Record<string, SignerData>;
    private getStorageKey;
    private toLowercaseAddress;
    addSessionData(leaf: SessionLeafNode): Promise<void>;
    getSessionData(param: SessionSearchParam): Promise<SessionLeafNode>;
    updateSessionStatus(param: SessionSearchParam, status: SessionStatus): Promise<void>;
    clearPendingSessions(): Promise<void>;
    addSigner(signerData: SignerData, chain: Chain): Promise<SmartAccountSigner>;
    getSignerByKey(sessionPublicKey: string, chain: Chain): Promise<SmartAccountSigner>;
    revokeSessions(sessionIDs: string[]): Promise<any[]>;
    getSignerBySession(param: SessionSearchParam, chain: Chain): Promise<SmartAccountSigner>;
    getAllSessionData(param?: SessionSearchParam): Promise<SessionLeafNode[]>;
    getMerkleRoot(): Promise<string>;
    setMerkleRoot(merkleRoot: string): Promise<void>;
}
//# sourceMappingURL=SessionMemoryStorage.d.ts.map