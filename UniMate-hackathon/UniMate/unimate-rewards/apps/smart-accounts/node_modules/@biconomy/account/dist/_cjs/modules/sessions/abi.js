"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSingleSessionTxParams = exports.createABISessionDatum = exports.createSession = exports.RuleHelpers = exports.PolicyHelpers = void 0;
exports.getABISVMSessionKeyData = getABISVMSessionKeyData;
exports.getSessionDatum = getSessionDatum;
exports.parseReferenceValue = parseReferenceValue;
const viem_1 = require("viem");
const __1 = require("../index.js");
const account_1 = require("../../account/index.js");
const Utils_1 = require("../../bundler/utils/Utils.js");
const utils_1 = require("../session-storage/utils.js");
const Constants_1 = require("../utils/Constants.js");
exports.PolicyHelpers = {
    Indefinitely: { validUntil: 0, validAfter: 0 },
    NoValueLimit: 0n,
};
const RULE_CONDITIONS = [
    "EQUAL",
    "LASS_THAN_OR_EQUAL",
    "LESS_THAN",
    "GREATER_THAN_OR_EQUAL",
    "GREATER_THAN",
    "NOT_EQUAL"
];
exports.RuleHelpers = {
    OffsetByIndex: (i) => i * 32,
    Condition: (condition) => RULE_CONDITIONS.indexOf(condition),
};
const createSession = async (smartAccount, policy, sessionStorageClient, buildUseropDto) => {
    const smartAccountAddress = await smartAccount.getAddress();
    const defaultedChainId = (0, Utils_1.extractChainIdFromBundlerUrl)(smartAccount?.bundler?.getBundlerUrl() ?? "");
    if (!defaultedChainId) {
        throw new Error(account_1.ERROR_MESSAGES.CHAIN_NOT_FOUND);
    }
    const chain = (0, account_1.getChain)(defaultedChainId);
    const { sessionKeyAddress, sessionStorageClient: storageClientFromCreateKey, } = await (0, utils_1.createSessionKeyEOA)(smartAccount, chain);
    const defaultedSessionStorageClient = sessionStorageClient ?? storageClientFromCreateKey;
    const sessionsModule = await (0, __1.createSessionKeyManagerModule)({
        smartAccountAddress,
        sessionStorageClient: defaultedSessionStorageClient,
    });
    const defaultedPolicy = policy.map((p) => !p.sessionKeyAddress ? { ...p, sessionKeyAddress } : p);
    const humanReadablePolicyArray = defaultedPolicy.map(exports.createABISessionDatum);
    const { data: policyData, sessionIDInfo } = await sessionsModule.createSessionData(humanReadablePolicyArray);
    const permitTx = {
        to: Constants_1.DEFAULT_SESSION_KEY_MANAGER_MODULE,
        data: policyData,
    };
    const txs = [];
    const isDeployed = await smartAccount.isAccountDeployed();
    const enableSessionTx = await smartAccount.getEnableModuleData(Constants_1.DEFAULT_SESSION_KEY_MANAGER_MODULE);
    if (isDeployed) {
        const enabled = await smartAccount.isModuleEnabled(Constants_1.DEFAULT_SESSION_KEY_MANAGER_MODULE);
        if (!enabled) {
            txs.push(enableSessionTx);
        }
    }
    else {
        account_1.Logger.log(account_1.ERROR_MESSAGES.ACCOUNT_NOT_DEPLOYED);
        txs.push(enableSessionTx);
    }
    txs.push(permitTx);
    const userOpResponse = await smartAccount.sendTransaction(txs, buildUseropDto);
    return {
        session: {
            sessionStorageClient: defaultedSessionStorageClient,
            sessionIDInfo,
        },
        ...userOpResponse,
    };
};
exports.createSession = createSession;
const createABISessionDatum = ({ interval, sessionKeyAddress, contractAddress, functionSelector, rules, valueLimit, danModuleInfo, }) => {
    const { validUntil = 0, validAfter = 0 } = interval ?? {};
    let parsedFunctionSelector = "0x";
    const rawFunctionSelectorWasProvided = !!functionSelector?.raw;
    if (rawFunctionSelectorWasProvided) {
        parsedFunctionSelector = functionSelector
            .raw;
    }
    else {
        const unparsedFunctionSelector = functionSelector;
        parsedFunctionSelector = (0, viem_1.slice)((0, viem_1.toFunctionSelector)(unparsedFunctionSelector), 0, 4);
    }
    const result = {
        validUntil,
        validAfter,
        sessionValidationModule: Constants_1.DEFAULT_ABI_SVM_MODULE,
        sessionPublicKey: sessionKeyAddress,
        sessionKeyData: getSessionDatum(sessionKeyAddress, {
            destContract: contractAddress,
            functionSelector: parsedFunctionSelector,
            valueLimit,
            rules,
        }),
    };
    return danModuleInfo ? { ...result, danModuleInfo } : result;
};
exports.createABISessionDatum = createABISessionDatum;
async function getABISVMSessionKeyData(sessionKey, permission) {
    let sessionKeyData = (0, viem_1.concat)([
        sessionKey,
        permission.destContract,
        permission.functionSelector,
        (0, viem_1.pad)((0, viem_1.toHex)(permission.valueLimit), { size: 16 }),
        (0, viem_1.pad)((0, viem_1.toHex)(permission.rules.length), { size: 2 }),
    ]);
    for (let i = 0; i < permission.rules.length; i++) {
        sessionKeyData = (0, viem_1.concat)([
            sessionKeyData,
            (0, viem_1.pad)((0, viem_1.toHex)(permission.rules[i].offset), { size: 2 }),
            (0, viem_1.pad)((0, viem_1.toHex)(permission.rules[i].condition), { size: 1 }),
            permission.rules[i].referenceValue,
        ]);
    }
    return sessionKeyData;
}
function getSessionDatum(sessionKeyAddress, permission) {
    let sessionKeyData = (0, viem_1.concat)([
        sessionKeyAddress,
        permission.destContract,
        permission.functionSelector,
        (0, viem_1.pad)((0, viem_1.toHex)(permission.valueLimit), { size: 16 }),
        (0, viem_1.pad)((0, viem_1.toHex)(permission.rules.length), { size: 2 }),
    ]);
    for (let i = 0; i < permission.rules.length; i++) {
        sessionKeyData = (0, viem_1.concat)([
            sessionKeyData,
            (0, viem_1.pad)((0, viem_1.toHex)(permission.rules[i].offset), { size: 2 }),
            (0, viem_1.pad)((0, viem_1.toHex)(permission.rules[i].condition), { size: 1 }),
            parseReferenceValue(permission.rules[i].referenceValue),
        ]);
    }
    return sessionKeyData;
}
function parseReferenceValue(referenceValue) {
    try {
        if (referenceValue?.raw) {
            return referenceValue?.raw;
        }
        if (typeof referenceValue === "bigint") {
            return (0, viem_1.pad)((0, viem_1.toHex)(referenceValue), { size: 32 });
        }
        return (0, viem_1.pad)(referenceValue, { size: 32 });
    }
    catch (e) {
        return (0, viem_1.pad)(referenceValue, { size: 32 });
    }
}
const getSingleSessionTxParams = async (conditionalSession, chain, correspondingIndex) => {
    const { sessionStorageClient } = await (0, __1.resumeSession)(conditionalSession);
    const allSessions = await sessionStorageClient.getAllSessionData();
    const sessionID = (0, __1.didProvideFullSession)(conditionalSession)
        ? conditionalSession.sessionIDInfo[correspondingIndex ?? 0]
        : allSessions[correspondingIndex ?? allSessions.length - 1].sessionID;
    const sessionSigner = await sessionStorageClient.getSignerBySession({
        sessionID,
    }, chain);
    return {
        params: {
            sessionSigner,
            sessionID,
        },
    };
};
exports.getSingleSessionTxParams = getSingleSessionTxParams;
//# sourceMappingURL=abi.js.map