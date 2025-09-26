import { http, createWalletClient } from "viem";
import { WalletClientSigner } from "../../account/index.js";
import { EthersSigner } from "./EthersSigner.js";
function isPrivateKeyAccount(signer) {
    return signer.type === "local";
}
export function isWalletClient(signer) {
    return signer.transport !== undefined;
}
function isEthersSigner(signer) {
    return signer.provider !== undefined;
}
function isAlchemySigner(signer) {
    return signer?.signerType !== undefined;
}
export const convertSigner = async (signer, skipChainIdCalls = false, _rpcUrl) => {
    let resolvedSmartAccountSigner;
    let rpcUrl = _rpcUrl;
    let chainId = null;
    if (!isAlchemySigner(signer)) {
        if (isEthersSigner(signer)) {
            const ethersSigner = signer;
            if (!skipChainIdCalls) {
                // If chainId not provided, get it from walletClient
                if (!ethersSigner.provider) {
                    throw new Error("Cannot consume an ethers Wallet without a provider");
                }
                const chainIdFromProvider = await ethersSigner.provider.getNetwork();
                if (!chainIdFromProvider?.chainId) {
                    throw new Error("Cannot consume an ethers Wallet without a chainId");
                }
                chainId = Number(chainIdFromProvider.chainId);
            }
            // convert ethers Wallet to alchemy's SmartAccountSigner under the hood
            resolvedSmartAccountSigner = new EthersSigner(ethersSigner, "ethers");
            // @ts-ignore
            rpcUrl = ethersSigner.provider?.connection?.url ?? undefined;
        }
        else if (isWalletClient(signer)) {
            const walletClient = signer;
            if (!walletClient.account) {
                throw new Error("Cannot consume a viem wallet without an account");
            }
            if (!skipChainIdCalls) {
                // If chainId not provided, get it from walletClient
                if (!walletClient.chain) {
                    throw new Error("Cannot consume a viem wallet without a chainId");
                }
                chainId = walletClient.chain.id;
            }
            // convert viems walletClient to alchemy's SmartAccountSigner under the hood
            resolvedSmartAccountSigner = new WalletClientSigner(walletClient, "viem");
            rpcUrl = walletClient?.transport?.url ?? undefined;
        }
        else if (isPrivateKeyAccount(signer)) {
            if (rpcUrl !== null && rpcUrl !== undefined) {
                const walletClient = createWalletClient({
                    account: signer,
                    transport: http(rpcUrl)
                });
                resolvedSmartAccountSigner = new WalletClientSigner(walletClient, "viem");
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
/*
  This function is used to get the signer's address, it can be used to get the signer's address from different types of signers.
  The function takes a signer as an argument and returns the signer's address.
  The function checks the type of the signer and returns the signer's address based on the type of the signer.
  The function throws an error if the signer is not supported.
*/
export const getSignerAddress = async (signer) => {
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
//# sourceMappingURL=convertSigner.js.map