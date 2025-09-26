"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.wrapSignatureWith6492 = exports.addressEquals = exports.isValidRpcUrl = exports.compareChainIds = exports.isNullOrUndefined = void 0;
exports.packUserOp = packUserOp;
exports.percentage = percentage;
exports.convertToFactor = convertToFactor;
const viem_1 = require("viem");
const account_1 = require("../../account/index.js");
const bundler_1 = require("../../bundler/index.js");
const bundler_2 = require("../../bundler/index.js");
function packUserOp(op, forSignature = true) {
    if (!op.initCode || !op.callData || !op.paymasterAndData)
        throw new Error("Missing userOp properties");
    if (forSignature) {
        return (0, viem_1.encodeAbiParameters)((0, viem_1.parseAbiParameters)("address, uint256, bytes32, bytes32, uint256, uint256, uint256, uint256, uint256, bytes32"), [
            op.sender,
            BigInt(op.nonce),
            (0, viem_1.keccak256)(op.initCode),
            (0, viem_1.keccak256)(op.callData),
            BigInt(op.callGasLimit),
            BigInt(op.verificationGasLimit),
            BigInt(op.preVerificationGas),
            BigInt(op.maxFeePerGas),
            BigInt(op.maxPriorityFeePerGas),
            (0, viem_1.keccak256)(op.paymasterAndData)
        ]);
    }
    return (0, viem_1.encodeAbiParameters)((0, viem_1.parseAbiParameters)("address, uint256, bytes, bytes, uint256, uint256, uint256, uint256, uint256, bytes, bytes"), [
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
const isNullOrUndefined = (value) => {
    return value === null || value === undefined;
};
exports.isNullOrUndefined = isNullOrUndefined;
const compareChainIds = async (signer, biconomySmartAccountConfig, skipChainIdCalls) => {
    const signerResult = await (0, account_1.convertSigner)(signer, skipChainIdCalls, biconomySmartAccountConfig.rpcUrl);
    const chainIdFromBundler = biconomySmartAccountConfig.bundlerUrl
        ? (0, bundler_1.extractChainIdFromBundlerUrl)(biconomySmartAccountConfig.bundlerUrl)
        : biconomySmartAccountConfig.bundler
            ? (0, bundler_1.extractChainIdFromBundlerUrl)(biconomySmartAccountConfig.bundler.getBundlerUrl())
            : undefined;
    const chainIdFromPaymasterUrl = biconomySmartAccountConfig.paymasterUrl
        ? (0, bundler_2.extractChainIdFromPaymasterUrl)(biconomySmartAccountConfig.paymasterUrl)
        : undefined;
    if (!(0, exports.isNullOrUndefined)(signerResult.chainId)) {
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
exports.compareChainIds = compareChainIds;
const isValidRpcUrl = (url) => {
    const regex = /^(https:\/\/|wss:\/\/).*/;
    return regex.test(url);
};
exports.isValidRpcUrl = isValidRpcUrl;
const addressEquals = (a, b) => !!a && !!b && a?.toLowerCase() === b.toLowerCase();
exports.addressEquals = addressEquals;
const wrapSignatureWith6492 = ({ factoryAddress, factoryCalldata, signature }) => {
    return (0, viem_1.concat)([
        (0, viem_1.encodeAbiParameters)((0, viem_1.parseAbiParameters)("address, bytes, bytes"), [
            factoryAddress,
            factoryCalldata,
            signature
        ]),
        account_1.MAGIC_BYTES
    ]);
};
exports.wrapSignatureWith6492 = wrapSignatureWith6492;
function percentage(partialValue, totalValue) {
    return (100 * partialValue) / totalValue;
}
function convertToFactor(percentage) {
    if (percentage) {
        if (percentage < 1 || percentage > 100) {
            throw new Error("The percentage value should be between 1 and 100.");
        }
        const factor = percentage / 100 + 1;
        return factor;
    }
    return 1;
}
//# sourceMappingURL=Utils.js.map