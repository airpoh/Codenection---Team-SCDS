import { encodeAbiParameters, parseAbiParameters } from "viem";
/**
 * Session validation module for ERC20 token transfers.
 * It encodes session data into a sessionKeyData bytes to be verified by ERC20SessionValidationModule on chain.
 *
 * @author Sachin Tomar <sachin.tomar@biconomy.io>
 */
export class ERC20SessionValidationModule {
    /**
     * This constructor is private. Use the static create method to instantiate ERC20SessionValidationModule
     * @param moduleConfig The configuration for the module
     * @returns An instance of ERC20SessionValidationModule
     */
    constructor(moduleConfig) {
        Object.defineProperty(this, "moduleAddress", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "version", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: "V1_0_0"
        });
        if (!moduleConfig.moduleAddress) {
            throw new Error("Module address is required");
        }
        this.moduleAddress = moduleConfig.moduleAddress;
    }
    /**
     * Asynchronously creates and initializes an instance of ERC20SessionValidationModule
     * @param moduleConfig The configuration for the module
     * @returns A Promise that resolves to an instance of ERC20SessionValidationModule
     */
    static async create(moduleConfig) {
        const module = new ERC20SessionValidationModule(moduleConfig);
        return module;
    }
    async getSessionKeyData(sessionData) {
        this._validateSessionKeyData(sessionData);
        const sessionKeyData = encodeAbiParameters(parseAbiParameters("address, address, address, uint256"), [
            sessionData.sessionKey,
            sessionData.token,
            sessionData.recipient,
            sessionData.maxAmount
        ]);
        return sessionKeyData;
    }
    _validateSessionKeyData(sessionData) {
        if (!sessionData) {
            throw new Error("Session data is required");
        }
        if (!sessionData.sessionKey) {
            throw new Error("Session key is required in sessionData");
        }
        if (!sessionData.token) {
            throw new Error("Token address is required in sessionData");
        }
        if (!sessionData.recipient) {
            throw new Error("Recipient address is required in sessionData");
        }
        if (!sessionData.maxAmount) {
            throw new Error("MaxAmount is required in sessionData");
        }
    }
    getAddress() {
        return this.moduleAddress;
    }
}
//# sourceMappingURL=ERC20SessionValidationModule.js.map