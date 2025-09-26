// Will convert the userOp hex, bigInt and number values to hex strings
export const transformUserOP = (userOp) => {
    try {
        const userOperation = { ...userOp };
        const keys = [
            "nonce",
            "callGasLimit",
            "verificationGasLimit",
            "preVerificationGas",
            "maxFeePerGas",
            "maxPriorityFeePerGas"
        ];
        for (const key of keys) {
            if (userOperation[key] && userOperation[key] !== "0x") {
                userOperation[key] = `0x${BigInt(userOp[key]).toString(16)}`;
            }
        }
        return userOperation;
    }
    catch (error) {
        throw `Failed to transform user operation: ${error}`;
    }
};
/**
 * @description this function will return current timestamp in seconds
 * @returns Number
 */
export const getTimestampInSeconds = () => {
    return Math.floor(Date.now() / 1000);
};
//# sourceMappingURL=HelperFunction.js.map