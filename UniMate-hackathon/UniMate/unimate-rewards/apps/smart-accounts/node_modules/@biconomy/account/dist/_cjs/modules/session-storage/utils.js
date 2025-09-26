"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDefaultStorageClient = exports.inNodeBackend = exports.inTesting = exports.createSessionKeyEOA = void 0;
const SessionLocalStorage_1 = require("./SessionLocalStorage.js");
const index_js_1 = require("./index.js");
const createSessionKeyEOA = async (smartAccount, chain, _sessionStorageClient) => {
    const userAccountAddress = await smartAccount.getAddress();
    const sessionStorageClient = _sessionStorageClient ?? (0, exports.getDefaultStorageClient)(userAccountAddress);
    const newSigner = await sessionStorageClient.addSigner(undefined, chain);
    const sessionKeyAddress = await newSigner.getAddress();
    return { sessionKeyAddress, signer: newSigner, sessionStorageClient };
};
exports.createSessionKeyEOA = createSessionKeyEOA;
const inTesting = () => {
    try {
        return process?.env?.TESTING?.toString() === "true";
    }
    catch (e) {
        return false;
    }
};
exports.inTesting = inTesting;
const inNodeBackend = () => {
    try {
        return typeof process === "object" && process?.release?.name === "node";
    }
    catch (e) {
        return false;
    }
};
exports.inNodeBackend = inNodeBackend;
const getDefaultStorageClient = (address) => {
    if ((0, exports.inTesting)()) {
        return new index_js_1.SessionMemoryStorage(address);
    }
    if (SessionLocalStorage_1.supportsLocalStorage) {
        return new index_js_1.SessionLocalStorage(address);
    }
    if ((0, exports.inNodeBackend)()) {
        return new index_js_1.SessionMemoryStorage(address);
    }
    throw new Error("No session storage client available");
};
exports.getDefaultStorageClient = getDefaultStorageClient;
//# sourceMappingURL=utils.js.map