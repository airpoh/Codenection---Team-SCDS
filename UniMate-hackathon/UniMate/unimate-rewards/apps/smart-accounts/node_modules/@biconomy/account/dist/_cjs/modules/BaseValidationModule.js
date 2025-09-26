"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseValidationModule = void 0;
const account_1 = require("../account/index.js");
class BaseValidationModule {
    constructor(moduleConfig) {
        Object.defineProperty(this, "entryPointAddress", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        const { entryPointAddress } = moduleConfig;
        this.entryPointAddress = entryPointAddress || account_1.DEFAULT_ENTRYPOINT_ADDRESS;
    }
    setEntryPointAddress(entryPointAddress) {
        this.entryPointAddress = entryPointAddress;
    }
    async signMessageSmartAccountSigner(_message, signer) {
        const message = typeof _message === "string" ? _message : { raw: _message };
        let signature = await signer.signMessage(message);
        const potentiallyIncorrectV = Number.parseInt(signature.slice(-2), 16);
        if (![27, 28].includes(potentiallyIncorrectV)) {
            const correctV = potentiallyIncorrectV + 27;
            signature = `0x${signature.slice(0, -2) + correctV.toString(16)}`;
        }
        return signature;
    }
}
exports.BaseValidationModule = BaseValidationModule;
//# sourceMappingURL=BaseValidationModule.js.map