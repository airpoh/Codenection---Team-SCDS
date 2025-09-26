import type { Address, Chain, Hex } from "viem";
import type { BiconomySmartAccountV2, SmartAccountSigner } from "../../account";
import type { ISessionStorage } from "../interfaces/ISessionStorage";
export type SessionStoragePayload = {
    sessionKeyAddress: Hex;
    signer: SmartAccountSigner;
    sessionStorageClient: ISessionStorage;
};
/**
 * createSessionKeyEOA
 *
 * This function is used to store a new session key in the session storage.
 * If the session storage client is not provided as the third argument, it will create a new session storage client based on the environment.
 * When localStorage is supported, it will return SessionLocalStorage, otherwise it will assume you are in a backend and use SessionMemoryStorage.
 *
 * @param smartAccount: BiconomySmartAccountV2
 * @param chain: Chain
 * @param _sessionStorageClient: ISessionStorage
 * @returns
 */
export declare const createSessionKeyEOA: (smartAccount: BiconomySmartAccountV2, chain: Chain, _sessionStorageClient?: ISessionStorage) => Promise<SessionStoragePayload>;
export declare const inTesting: () => boolean;
export declare const inNodeBackend: () => boolean;
export declare const getDefaultStorageClient: (address: Address) => ISessionStorage;
//# sourceMappingURL=utils.d.ts.map