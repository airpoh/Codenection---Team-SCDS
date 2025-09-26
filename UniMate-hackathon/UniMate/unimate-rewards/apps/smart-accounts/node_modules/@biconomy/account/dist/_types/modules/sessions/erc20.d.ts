import type { EncodeAbiParametersReturnType, Hex } from "viem";
import type { SessionEpoch } from "..";
import type { CreateSessionDataParams } from "../utils/Types";
export type CreateERC20SessionConfig = {
    interval: SessionEpoch;
    sessionKeyAddress: Hex;
    sessionKeyData: EncodeAbiParametersReturnType;
};
/**
 *
 * @param erc20SessionConfig {@link CreateERC20SessionConfig}
 * @returns {@link CreateSessionDataParams}
 */
export declare const createERC20SessionDatum: ({ interval, sessionKeyAddress, sessionKeyData }: CreateERC20SessionConfig) => CreateSessionDataParams;
//# sourceMappingURL=erc20.d.ts.map