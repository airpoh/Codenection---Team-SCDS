"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBatchSessionTxParams = exports.createBatchSession = void 0;
const account_1 = require("../../account/index.js");
const index_js_1 = require("../index.js");
const createBatchSession = async (smartAccount, sessionStorageClient, leaves, buildUseropDto) => {
    const smartAccountAddress = await smartAccount.getAddress();
    const sessionsModule = await (0, index_js_1.createSessionKeyManagerModule)({
        smartAccountAddress,
        sessionStorageClient
    });
    const batchedSessionModule = await (0, index_js_1.createBatchedSessionRouterModule)({
        smartAccountAddress,
        sessionKeyManagerModule: sessionsModule
    });
    const { data: policyData, sessionIDInfo } = await batchedSessionModule.createSessionData(leaves);
    const permitTx = {
        to: index_js_1.DEFAULT_SESSION_KEY_MANAGER_MODULE,
        data: policyData
    };
    const isDeployed = await smartAccount.isAccountDeployed();
    const txs = [];
    const enableSessionKeyTx = await smartAccount.getEnableModuleData(index_js_1.DEFAULT_SESSION_KEY_MANAGER_MODULE);
    const enableBatchedSessionTx = await smartAccount.getEnableModuleData(index_js_1.DEFAULT_BATCHED_SESSION_ROUTER_MODULE);
    if (isDeployed) {
        const [isSessionModuleEnabled, isBatchedSessionModuleEnabled] = await Promise.all([
            smartAccount.isModuleEnabled(index_js_1.DEFAULT_SESSION_KEY_MANAGER_MODULE),
            smartAccount.isModuleEnabled(index_js_1.DEFAULT_BATCHED_SESSION_ROUTER_MODULE)
        ]);
        if (!isSessionModuleEnabled) {
            txs.push(enableSessionKeyTx);
        }
        if (!isBatchedSessionModuleEnabled) {
            txs.push(enableBatchedSessionTx);
        }
    }
    else {
        account_1.Logger.log(account_1.ERROR_MESSAGES.ACCOUNT_NOT_DEPLOYED);
        txs.push(enableSessionKeyTx, enableBatchedSessionTx);
    }
    txs.push(permitTx);
    const userOpResponse = await smartAccount.sendTransaction(txs, buildUseropDto);
    return {
        session: {
            sessionStorageClient,
            sessionIDInfo
        },
        ...userOpResponse
    };
};
exports.createBatchSession = createBatchSession;
const getBatchSessionTxParams = async (transactions, correspondingIndexes, conditionalSession, chain) => {
    if (correspondingIndexes &&
        correspondingIndexes.length !== transactions.length) {
        throw new Error(account_1.ERROR_MESSAGES.INVALID_SESSION_INDEXES);
    }
    const { sessionStorageClient } = await (0, index_js_1.resumeSession)(conditionalSession);
    let sessionIDInfo = [];
    const allSessions = await sessionStorageClient.getAllSessionData();
    if ((0, index_js_1.didProvideFullSession)(conditionalSession)) {
        sessionIDInfo = conditionalSession.sessionIDInfo;
    }
    else if ((0, account_1.isNullOrUndefined)(correspondingIndexes)) {
        sessionIDInfo = allSessions
            .slice(-transactions.length)
            .map(({ sessionID }) => sessionID);
    }
    else {
        sessionIDInfo = (correspondingIndexes ?? []).map((index) => allSessions[index].sessionID);
    }
    const sessionSigner = await sessionStorageClient.getSignerBySession({
        sessionID: sessionIDInfo[0]
    }, chain);
    return {
        params: {
            batchSessionParams: sessionIDInfo.map((sessionID) => ({
                sessionSigner,
                sessionID
            }))
        }
    };
};
exports.getBatchSessionTxParams = getBatchSessionTxParams;
//# sourceMappingURL=batch.js.map