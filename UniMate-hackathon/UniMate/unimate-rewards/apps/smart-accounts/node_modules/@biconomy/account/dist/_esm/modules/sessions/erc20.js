import { DEFAULT_ERC20_MODULE } from "../utils/Constants.js";
/**
 *
 * @param erc20SessionConfig {@link CreateERC20SessionConfig}
 * @returns {@link CreateSessionDataParams}
 */
export const createERC20SessionDatum = ({ 
/** The time interval within which the session is valid. If left unset the session will remain invalid indefinitely {@link SessionEpoch} */
interval, 
/** The sessionKeyAddress upon which the policy is to be imparted. Used as a reference to the stored session keys */
sessionKeyAddress, 
/** The sessionKeyData to be included in the policy {@link EncodeAbiParametersReturnType}*/
sessionKeyData }) => {
    const { validUntil = 0, validAfter = 0 } = interval ?? {};
    return {
        validUntil,
        validAfter,
        sessionValidationModule: DEFAULT_ERC20_MODULE,
        sessionPublicKey: sessionKeyAddress,
        sessionKeyData
    };
};
//# sourceMappingURL=erc20.js.map