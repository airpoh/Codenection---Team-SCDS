import { http, createWalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { WalletClientSigner } from "../../account/index.js";
import { getRandomSigner } from "../../index.js";
// @ts-ignore
export const inBrowser = typeof window !== "undefined";
export const supportsLocalStorage = 
// @ts-ignore: LocalStorage is not available in node
inBrowser && typeof window.localStorage !== "undefined";
export class SessionLocalStorage {
    constructor(smartAccountAddress) {
        Object.defineProperty(this, "smartAccountAddress", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.smartAccountAddress = smartAccountAddress.toLowerCase();
    }
    validateSearchParam(param) {
        if (param.sessionID ||
            (!param.sessionID &&
                param.sessionPublicKey &&
                param.sessionValidationModule)) {
            return;
        }
        throw new Error("Either pass sessionId or a combination of sessionPublicKey and sessionValidationModule address.");
    }
    getSessionStore() {
        // @ts-ignore: LocalStorage is not available in node
        const data = localStorage.getItem(this.getStorageKey("sessions"));
        return data ? JSON.parse(data) : { merkleRoot: "", leafNodes: [] };
    }
    getSignerStore() {
        // @ts-ignore: LocalStorage is not available in node
        const data = localStorage.getItem(this.getStorageKey("signers"));
        return data ? JSON.parse(data) : {};
    }
    getStorageKey(type) {
        return `${this.smartAccountAddress}_${type}`;
    }
    toLowercaseAddress(address) {
        return address.toLowerCase();
    }
    async addSessionData(leaf) {
        const data = this.getSessionStore();
        leaf.sessionValidationModule = this.toLowercaseAddress(leaf.sessionValidationModule);
        leaf.sessionPublicKey = this.toLowercaseAddress(leaf.sessionPublicKey);
        data.leafNodes.push(leaf);
        // @ts-ignore: LocalStorage is not available in node
        localStorage.setItem(this.getStorageKey("sessions"), JSON.stringify(data));
    }
    async getSessionData(param) {
        this.validateSearchParam(param);
        const sessions = this.getSessionStore().leafNodes;
        const session = sessions.find((s) => {
            if (param.sessionID) {
                return (s.sessionID === param.sessionID &&
                    (!param.status || s.status === param.status));
            }
            if (param.sessionPublicKey && param.sessionValidationModule) {
                return (s.sessionPublicKey ===
                    this.toLowercaseAddress(param.sessionPublicKey) &&
                    s.sessionValidationModule ===
                        this.toLowercaseAddress(param.sessionValidationModule) &&
                    (!param.status || s.status === param.status));
            }
            return undefined;
        });
        if (!session) {
            throw new Error("Session not found.");
        }
        return session;
    }
    async updateSessionStatus(param, status) {
        this.validateSearchParam(param);
        const data = this.getSessionStore();
        const session = data.leafNodes.find((s) => {
            if (param.sessionID) {
                return s.sessionID === param.sessionID;
            }
            if (param.sessionPublicKey && param.sessionValidationModule) {
                return (s.sessionPublicKey ===
                    this.toLowercaseAddress(param.sessionPublicKey) &&
                    s.sessionValidationModule ===
                        this.toLowercaseAddress(param.sessionValidationModule));
            }
            return undefined;
        });
        if (!session) {
            throw new Error("Session not found.");
        }
        session.status = status;
        // @ts-ignore: LocalStorage is not available in node
        localStorage.setItem(this.getStorageKey("sessions"), JSON.stringify(data));
    }
    async clearPendingSessions() {
        const data = this.getSessionStore();
        data.leafNodes = data.leafNodes.filter((s) => s.status !== "PENDING");
        // @ts-ignore: LocalStorage is not available in node
        localStorage.setItem(this.getStorageKey("sessions"), JSON.stringify(data));
    }
    async addSigner(signerData, chain) {
        const signers = this.getSignerStore();
        const signer = signerData ?? getRandomSigner();
        const accountSigner = privateKeyToAccount(signer.pvKey);
        const client = createWalletClient({
            account: accountSigner,
            chain,
            transport: http()
        });
        const walletClientSigner = new WalletClientSigner(client, "json-rpc" // signerType
        );
        signers[this.toLowercaseAddress(accountSigner.address)] = signer;
        // @ts-ignore: LocalStorage is not available in node
        localStorage.setItem(this.getStorageKey("signers"), JSON.stringify(signers));
        return walletClientSigner;
    }
    async getSignerByKey(sessionPublicKey, chain) {
        const signers = this.getSignerStore();
        const signerData = signers[this.toLowercaseAddress(sessionPublicKey)];
        if (!signerData) {
            throw new Error("Signer not found.");
        }
        const account = privateKeyToAccount(signerData.pvKey);
        const client = createWalletClient({
            account,
            chain,
            transport: http()
        });
        const signer = new WalletClientSigner(client, "viem");
        return signer;
    }
    async getSignerBySession(param, chain) {
        const session = await this.getSessionData(param);
        return this.getSignerByKey(session.sessionPublicKey, chain);
    }
    async getAllSessionData(param) {
        const sessions = this.getSessionStore().leafNodes;
        if (!param || !param.status) {
            return sessions;
        }
        return sessions.filter((s) => s.status === param.status);
    }
    async revokeSessions(sessionIDs) {
        const data = this.getSessionStore();
        let newLeafNodes = [];
        for (const sessionID of sessionIDs) {
            newLeafNodes = data.leafNodes.filter((s) => {
                if (sessionID) {
                    return s.sessionID !== sessionID;
                }
                return undefined;
            });
        }
        return newLeafNodes;
    }
    async getMerkleRoot() {
        return this.getSessionStore().merkleRoot;
    }
    setMerkleRoot(merkleRoot) {
        const data = this.getSessionStore();
        data.merkleRoot = merkleRoot;
        // @ts-ignore: LocalStorage is not available in node
        localStorage.setItem(this.getStorageKey("sessions"), JSON.stringify(data));
        return Promise.resolve();
    }
}
//# sourceMappingURL=SessionLocalStorage.js.map