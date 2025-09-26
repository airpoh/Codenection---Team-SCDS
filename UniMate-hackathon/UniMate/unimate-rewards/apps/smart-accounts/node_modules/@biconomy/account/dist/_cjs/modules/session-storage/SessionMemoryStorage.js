"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionMemoryStorage = void 0;
const viem_1 = require("viem");
const accounts_1 = require("viem/accounts");
const account_1 = require("../../account/index.js");
const Helper_js_1 = require("../utils/Helper.js");
const memoryStorage = {
    _store: {},
    getItem: (key) => {
        return memoryStorage._store[key];
    },
    setItem: (key, value) => {
        memoryStorage._store[key] = value;
    }
};
class SessionMemoryStorage {
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
        const data = memoryStorage.getItem(this.getStorageKey("sessions"));
        return data ? JSON.parse(data) : { merkleRoot: "", leafNodes: [] };
    }
    getSignerStore() {
        const data = memoryStorage.getItem(this.getStorageKey("signers"));
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
        memoryStorage.setItem(this.getStorageKey("sessions"), JSON.stringify(data));
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
        memoryStorage.setItem(this.getStorageKey("sessions"), JSON.stringify(data));
    }
    async clearPendingSessions() {
        const data = this.getSessionStore();
        data.leafNodes = data.leafNodes.filter((s) => s.status !== "PENDING");
        memoryStorage.setItem(this.getStorageKey("sessions"), JSON.stringify(data));
    }
    async addSigner(signerData, chain) {
        const signers = this.getSignerStore();
        const signer = signerData ?? (0, Helper_js_1.getRandomSigner)();
        const accountSigner = (0, accounts_1.privateKeyToAccount)(signer.pvKey);
        const client = (0, viem_1.createWalletClient)({
            account: accountSigner,
            chain,
            transport: (0, viem_1.http)()
        });
        const walletClientSigner = new account_1.WalletClientSigner(client, "json-rpc");
        signers[this.toLowercaseAddress(accountSigner.address)] = signer;
        memoryStorage.setItem(this.getStorageKey("signers"), JSON.stringify(signers));
        return walletClientSigner;
    }
    async getSignerByKey(sessionPublicKey, chain) {
        const signers = this.getSignerStore();
        const signerData = signers[this.toLowercaseAddress(sessionPublicKey)];
        if (!signerData) {
            throw new Error("Signer not found.");
        }
        const account = (0, accounts_1.privateKeyToAccount)(signerData.pvKey);
        const client = (0, viem_1.createWalletClient)({
            account,
            chain,
            transport: (0, viem_1.http)()
        });
        const signer = new account_1.WalletClientSigner(client, "viem");
        return signer;
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
    async getMerkleRoot() {
        return this.getSessionStore().merkleRoot;
    }
    setMerkleRoot(merkleRoot) {
        const data = this.getSessionStore();
        data.merkleRoot = merkleRoot;
        memoryStorage.setItem(this.getStorageKey("sessions"), JSON.stringify(data));
        return Promise.resolve();
    }
}
exports.SessionMemoryStorage = SessionMemoryStorage;
//# sourceMappingURL=SessionMemoryStorage.js.map