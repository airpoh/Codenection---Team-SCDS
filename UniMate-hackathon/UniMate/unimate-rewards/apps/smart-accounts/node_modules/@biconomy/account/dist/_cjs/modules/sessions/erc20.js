"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createERC20SessionDatum = void 0;
const Constants_1 = require("../utils/Constants.js");
const createERC20SessionDatum = ({ interval, sessionKeyAddress, sessionKeyData }) => {
    const { validUntil = 0, validAfter = 0 } = interval ?? {};
    return {
        validUntil,
        validAfter,
        sessionValidationModule: Constants_1.DEFAULT_ERC20_MODULE,
        sessionPublicKey: sessionKeyAddress,
        sessionKeyData
    };
};
exports.createERC20SessionDatum = createERC20SessionDatum;
//# sourceMappingURL=erc20.js.map