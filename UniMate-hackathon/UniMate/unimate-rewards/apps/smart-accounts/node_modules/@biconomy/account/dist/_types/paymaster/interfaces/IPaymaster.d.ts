import type { UserOperationStruct } from "../../account";
import type { PaymasterAndDataResponse } from "../utils/Types.js";
export interface IPaymaster {
    getPaymasterAndData(_userOp: Partial<UserOperationStruct>): Promise<PaymasterAndDataResponse>;
    getDummyPaymasterAndData(_userOp: Partial<UserOperationStruct>): Promise<string>;
}
//# sourceMappingURL=IPaymaster.d.ts.map