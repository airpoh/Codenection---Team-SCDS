import { concat, encodeAbiParameters, keccak256, parseAbiParameters } from "viem";
import { MAGIC_BYTES, convertSigner } from "../../account/index.js";
import { extractChainIdFromBundlerUrl } from "../../bundler/index.js";
import { extractChainIdFromPaymasterUrl } from "../../bundler/index.js";
/**
 * pack the userOperation
 * @param op
 * @param forSignature "true" if the hash is needed to calculate the getUserOpHash()
 *  "false" to pack entire UserOp, for calculating the calldata cost of putting it on-chain.
 */
export function packUserOp(op, forSignature = true) {
    if (!op.initCode || !op.callData || !op.paymasterAndData)
        throw new Error("Missing userOp properties");
    if (forSignature) {
        return encodeAbiParameters(parseAbiParameters("address, uint256, bytes32, bytes32, uint256, uint256, uint256, uint256, uint256, bytes32"), [
            op.sender,
            BigInt(op.nonce),
            keccak256(op.initCode),
            keccak256(op.callData),
            BigInt(op.callGasLimit),
            BigInt(op.verificationGasLimit),
            BigInt(op.preVerificationGas),
            BigInt(op.maxFeePerGas),
            BigInt(op.maxPriorityFeePerGas),
            keccak256(op.paymasterAndData)
        ]);
    }
    // for the purpose of calculating gas cost encode also signature (and no keccak of bytes)
    return encodeAbiParameters(parseAbiParameters("address, uint256, bytes, bytes, uint256, uint256, uint256, uint256, uint256, bytes, bytes"), [
        op.sender,
        BigInt(op.nonce),
        op.initCode,
        op.callData,
        BigInt(op.callGasLimit),
        BigInt(op.verificationGasLimit),
        BigInt(op.preVerificationGas),
        BigInt(op.maxFeePerGas),
        BigInt(op.maxPriorityFeePerGas),
        op.paymasterAndData,
        op.signature
    ]);
}
// biome-ignore lint/suspicious/noExplicitAny: <explanation>
export const isNullOrUndefined = (value) => {
    return value === null || value === undefined;
};
export const compareChainIds = async (signer, biconomySmartAccountConfig, skipChainIdCalls
// biome-ignore lint/suspicious/noConfusingVoidType: <explanation>
) => {
    const signerResult = await convertSigner(signer, skipChainIdCalls, biconomySmartAccountConfig.rpcUrl);
    const chainIdFromBundler = biconomySmartAccountConfig.bundlerUrl
        ? extractChainIdFromBundlerUrl(biconomySmartAccountConfig.bundlerUrl)
        : biconomySmartAccountConfig.bundler
            ? extractChainIdFromBundlerUrl(biconomySmartAccountConfig.bundler.getBundlerUrl())
            : undefined;
    const chainIdFromPaymasterUrl = biconomySmartAccountConfig.paymasterUrl
        ? extractChainIdFromPaymasterUrl(biconomySmartAccountConfig.paymasterUrl)
        : undefined;
    if (!isNullOrUndefined(signerResult.chainId)) {
        if (chainIdFromBundler !== undefined &&
            signerResult.chainId !== chainIdFromBundler) {
            throw new Error(`Chain IDs from signer (${signerResult.chainId}) and bundler (${chainIdFromBundler}) do not match.`);
        }
        if (chainIdFromPaymasterUrl !== undefined &&
            signerResult.chainId !== chainIdFromPaymasterUrl) {
            throw new Error(`Chain IDs from signer (${signerResult.chainId}) and paymaster (${chainIdFromPaymasterUrl}) do not match.`);
        }
    }
    else {
        if (chainIdFromBundler !== undefined &&
            chainIdFromPaymasterUrl !== undefined &&
            chainIdFromBundler !== chainIdFromPaymasterUrl) {
            throw new Error(`Chain IDs from bundler (${chainIdFromBundler}) and paymaster (${chainIdFromPaymasterUrl}) do not match.`);
        }
    }
};
export const isValidRpcUrl = (url) => {
    const regex = /^(https:\/\/|wss:\/\/).*/;
    return regex.test(url);
};
export const addressEquals = (a, b) => !!a && !!b && a?.toLowerCase() === b.toLowerCase();
export const wrapSignatureWith6492 = ({ factoryAddress, factoryCalldata, signature }) => {
    // wrap the signature as follows: https://eips.ethereum.org/EIPS/eip-6492
    // concat(
    //  abi.encode(
    //    (create2Factory, factoryCalldata, originalERC1271Signature),
    //    (address, bytes, bytes)),
    //    magicBytes
    // )
    return concat([
        encodeAbiParameters(parseAbiParameters("address, bytes, bytes"), [
            factoryAddress,
            factoryCalldata,
            signature
        ]),
        MAGIC_BYTES
    ]);
};
export function percentage(partialValue, totalValue) {
    return (100 * partialValue) / totalValue;
}
export function convertToFactor(percentage) {
    // Check if the input is within the valid range
    if (percentage) {
        if (percentage < 1 || percentage > 100) {
            throw new Error("The percentage value should be between 1 and 100.");
        }
        // Calculate the factor
        const factor = percentage / 100 + 1;
        return factor;
    }
    return 1;
}
//# sourceMappingURL=Utils.js.map