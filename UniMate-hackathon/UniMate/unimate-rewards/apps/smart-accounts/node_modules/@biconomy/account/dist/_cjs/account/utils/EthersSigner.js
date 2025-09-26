"use strict";
var _EthersSigner_correctSignature;
Object.defineProperty(exports, "__esModule", { value: true });
exports.EthersSigner = void 0;
const tslib_1 = require("tslib");
class EthersSigner {
    constructor(inner, signerType) {
        Object.defineProperty(this, "signerType", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: "ethers"
        });
        Object.defineProperty(this, "inner", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        _EthersSigner_correctSignature.set(this, (_signature) => {
            let signature = _signature;
            const potentiallyIncorrectV = Number.parseInt(signature.slice(-2), 16);
            if (![27, 28].includes(potentiallyIncorrectV)) {
                const correctV = potentiallyIncorrectV + 27;
                signature = signature.slice(0, -2) + correctV.toString(16);
            }
            return signature;
        });
        this.inner = inner;
        this.signerType = signerType;
    }
    async getAddress() {
        return (await this.inner.getAddress());
    }
    async signMessage(_message) {
        const message = typeof _message === "string" ? _message : _message.raw;
        const signature = await this.inner?.signMessage(message);
        return tslib_1.__classPrivateFieldGet(this, _EthersSigner_correctSignature, "f").call(this, signature);
    }
    async signTypedData(_) {
        throw new Error("signTypedData is not supported for Ethers Signer");
    }
}
exports.EthersSigner = EthersSigner;
_EthersSigner_correctSignature = new WeakMap();
exports.default = EthersSigner;
//# sourceMappingURL=EthersSigner.js.map