"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSignerAddress = exports.convertSigner = void 0;
exports.isWalletClient = isWalletClient;
const viem_1 = require("viem");
const account_1 = require("../../account/index.js");
const EthersSigner_js_1 = require("./EthersSigner.js");
function isPrivateKeyAccount(signer) {
    return signer.type === "local";
}
function isWalletClient(signer) {
    return signer.transport !== undefined;
}
function isEthersSigner(signer) {
    return signer.provider !== undefined;
}
function isAlchemySigner(signer) {
    return signer?.signerType !== undefined;
}
const convertSigner = async (signer, skipChainIdCalls = false, _rpcUrl) => {
    let resolvedSmartAccountSigner;
    let rpcUrl = _rpcUrl;
    let chainId = null;
    if (!isAlchemySigner(signer)) {
        if (isEthersSigner(signer)) {
            const ethersSigner = signer;
            if (!skipChainIdCalls) {
                if (!ethersSigner.provider) {
                    throw new Error("Cannot consume an ethers Wallet without a provider");
                }
                const chainIdFromProvider = await ethersSigner.provider.getNetwork();
                if (!chainIdFromProvider?.chainId) {
                    throw new Error("Cannot consume an ethers Wallet without a chainId");
                }
                chainId = Number(chainIdFromProvider.chainId);
            }
            resolvedSmartAccountSigner = new EthersSigner_js_1.EthersSigner(ethersSigner, "ethers");
            rpcUrl = ethersSigner.provider?.connection?.url ?? undefined;
        }
        else if (isWalletClient(signer)) {
            const walletClient = signer;
            if (!walletClient.account) {
                throw new Error("Cannot consume a viem wallet without an account");
            }
            if (!skipChainIdCalls) {
                if (!walletClient.chain) {
                    throw new Error("Cannot consume a viem wallet without a chainId");
                }
                chainId = walletClient.chain.id;
            }
            resolvedSmartAccountSigner = new account_1.WalletClientSigner(walletClient, "viem");
            rpcUrl = walletClient?.transport?.url ?? undefined;
        }
        else if (isPrivateKeyAccount(signer)) {
            if (rpcUrl !== null && rpcUrl !== undefined) {
                const walletClient = (0, viem_1.createWalletClient)({
                    account: signer,
                    transport: (0, viem_1.http)(rpcUrl)
                });
                resolvedSmartAccountSigner = new account_1.WalletClientSigner(walletClient, "viem");
            }
            else {
                throw new Error("rpcUrl is required for PrivateKeyAccount signer type, please provide it in the config");
            }
        }
        else {
            throw new Error("Unsupported signer");
        }
    }
    else {
        resolvedSmartAccountSigner = signer;
    }
    return { signer: resolvedSmartAccountSigner, rpcUrl, chainId };
};
exports.convertSigner = convertSigner;
const getSignerAddress = async (signer) => {
    if (isEthersSigner(signer)) {
        const result = await signer?.getAddress();
        if (result)
            return result;
        throw new Error("Unsupported signer");
    }
    if (isWalletClient(signer)) {
        const result = (signer?.account?.address);
        if (result)
            return result;
        throw new Error("Unsupported signer");
    }
    if (isPrivateKeyAccount(signer)) {
        const result = (signer?.address);
        if (result)
            return result;
        throw new Error("Unsupported signer");
    }
    if (isAlchemySigner(signer)) {
        const result = (signer?.inner?.address);
        if (result)
            return result;
        throw new Error("Unsupported signer");
    }
    throw new Error("Unsupported signer");
};
exports.getSignerAddress = getSignerAddress;
//# sourceMappingURL=convertSigner.js.map