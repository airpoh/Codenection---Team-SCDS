import { concat, encodeAbiParameters, keccak256, pad, parseAbiParameters, toBytes, toHex } from "viem";
import { convertSigner } from "../account/index.js";
import { BaseValidationModule } from "./BaseValidationModule.js";
import { SessionKeyManagerModule } from "./SessionKeyManagerModule.js";
import { BATCHED_SESSION_ROUTER_MODULE_ADDRESSES_BY_VERSION, DEFAULT_BATCHED_SESSION_ROUTER_MODULE, DEFAULT_SESSION_KEY_MANAGER_MODULE } from "./utils/Constants.js";
export class BatchedSessionRouterModule extends BaseValidationModule {
    /**
     * This constructor is private. Use the static create method to instantiate SessionKeyManagerModule
     * @param moduleConfig The configuration for the module
     * @returns An instance of SessionKeyManagerModule
     */
    constructor(moduleConfig) {
        super(moduleConfig);
        Object.defineProperty(this, "version", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: "V1_0_0"
        });
        Object.defineProperty(this, "moduleAddress", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "sessionManagerModuleAddress", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "sessionKeyManagerModule", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "mockEcdsaSessionKeySig", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: "0x73c3ac716c487ca34bb858247b5ccf1dc354fbaabdd089af3b2ac8e78ba85a4959a2d76250325bd67c11771c31fccda87c33ceec17cc0de912690521bb95ffcb1b"
        });
        /**
         * Method to create session data for any module. The session data is used to create a leaf in the merkle tree
         * @param leavesData The data of one or more leaves to be used to create session data
         * @returns The session data
         */
        Object.defineProperty(this, "createSessionData", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: async (leavesData) => {
                return this.sessionKeyManagerModule.createSessionData(leavesData);
            }
        });
    }
    /**
     * Asynchronously creates and initializes an instance of SessionKeyManagerModule
     * @param moduleConfig The configuration for the module
     * @returns A Promise that resolves to an instance of SessionKeyManagerModule
     */
    static async create(moduleConfig) {
        const instance = new BatchedSessionRouterModule(moduleConfig);
        if (moduleConfig.moduleAddress) {
            instance.moduleAddress = moduleConfig.moduleAddress;
        }
        else if (moduleConfig.version) {
            const moduleAddr = BATCHED_SESSION_ROUTER_MODULE_ADDRESSES_BY_VERSION[moduleConfig.version];
            if (!moduleAddr) {
                throw new Error(`Invalid version ${moduleConfig.version}`);
            }
            instance.moduleAddress = moduleAddr;
            instance.version = moduleConfig.version;
        }
        else {
            instance.moduleAddress = DEFAULT_BATCHED_SESSION_ROUTER_MODULE;
            // Note: in this case Version remains the default one
        }
        instance.sessionManagerModuleAddress =
            moduleConfig.sessionManagerModuleAddress ??
                DEFAULT_SESSION_KEY_MANAGER_MODULE;
        if (!moduleConfig.sessionKeyManagerModule) {
            // generate sessionModule
            const sessionModule = await SessionKeyManagerModule.create({
                moduleAddress: instance.sessionManagerModuleAddress,
                smartAccountAddress: moduleConfig.smartAccountAddress,
                storageType: moduleConfig.storageType
            });
            instance.sessionKeyManagerModule = sessionModule;
        }
        else {
            instance.sessionKeyManagerModule = moduleConfig.sessionKeyManagerModule;
            instance.sessionManagerModuleAddress =
                moduleConfig.sessionKeyManagerModule.getAddress();
        }
        return instance;
    }
    /**
     * This method is used to sign the user operation using the session signer
     * @param userOp The user operation to be signed
     * @param sessionParams Information about all the sessions to be used to sign the user operation which has a batch execution
     * @returns The signature of the user operation
     */
    async signUserOpHash(userOpHash, params) {
        const sessionParams = params?.batchSessionParams;
        if (!sessionParams || sessionParams.length === 0) {
            throw new Error("Session parameters are not provided");
        }
        const sessionDataTupleArray = [];
        // signer must be the same for all the sessions
        const { signer: sessionSigner } = await convertSigner(sessionParams[0].sessionSigner, false);
        const signature = await sessionSigner.signMessage({
            raw: toBytes(userOpHash)
        });
        for (const sessionParam of sessionParams) {
            if (!sessionParam.sessionSigner) {
                throw new Error("Session signer is not provided.");
            }
            if (!sessionParam.sessionID && !sessionParam.sessionValidationModule) {
                throw new Error("sessionID or sessionValidationModule should be provided.");
            }
            const sessionSignerData = await this.sessionKeyManagerModule.sessionStorageClient.getSessionData(sessionParam.sessionID
                ? {
                    sessionID: sessionParam.sessionID
                }
                : {
                    sessionValidationModule: sessionParam.sessionValidationModule,
                    sessionPublicKey: await sessionSigner.getAddress()
                });
            const leafDataHex = concat([
                pad(toHex(sessionSignerData.validUntil), { size: 6 }),
                pad(toHex(sessionSignerData.validAfter), { size: 6 }),
                pad(sessionSignerData.sessionValidationModule, { size: 20 }),
                sessionSignerData.sessionKeyData
            ]);
            const proof = this.sessionKeyManagerModule.merkleTree.getHexProof(keccak256(leafDataHex));
            const sessionDataTuple = [
                sessionSignerData.validUntil,
                sessionSignerData.validAfter,
                sessionSignerData.sessionValidationModule,
                sessionSignerData.sessionKeyData,
                proof,
                sessionParam.additionalSessionData ?? "0x"
            ];
            sessionDataTupleArray.push(sessionDataTuple);
        }
        // Generate the padded signature
        const abiParameters = [
            { type: "address" },
            {
                type: "tuple[]",
                components: [
                    { type: "uint48" },
                    { type: "uint48" },
                    { type: "address" },
                    { type: "bytes" },
                    { type: "bytes32[]" },
                    { type: "bytes" }
                ]
            },
            { type: "bytes" }
        ];
        const paddedSignature = encodeAbiParameters(abiParameters, [
            this.getSessionKeyManagerAddress(),
            sessionDataTupleArray,
            signature
        ]);
        return paddedSignature;
    }
    /**
     * Update the session data pending state to active
     * @param param The search param to find the session data
     * @param status The status to be updated
     * @returns
     */
    async updateSessionStatus(param, status) {
        this.sessionKeyManagerModule.sessionStorageClient.updateSessionStatus(param, status);
    }
    /**
     * @remarks This method is used to clear all the pending sessions
     * @returns
     */
    async clearPendingSessions() {
        this.sessionKeyManagerModule.sessionStorageClient.clearPendingSessions();
    }
    /**
     * @returns SessionKeyManagerModule address
     */
    getAddress() {
        return this.moduleAddress;
    }
    /**
     * @returns SessionKeyManagerModule address
     */
    getSessionKeyManagerAddress() {
        return this.sessionManagerModuleAddress;
    }
    /**
     * @remarks This is the version of the module contract
     */
    async getSigner() {
        throw new Error("Method not implemented.");
    }
    /**
     * @remarks This is the dummy signature for the module, used in buildUserOp for bundler estimation
     * @returns Dummy signature
     */
    async getDummySignature(params) {
        const sessionParams = params?.batchSessionParams;
        if (!sessionParams || sessionParams.length === 0) {
            throw new Error("Session parameters are not provided");
        }
        const sessionDataTupleArray = [];
        // signer must be the same for all the sessions
        const { signer: sessionSigner } = await convertSigner(sessionParams[0].sessionSigner, false);
        for (const sessionParam of sessionParams) {
            if (!sessionParam.sessionSigner) {
                throw new Error("Session signer is not provided.");
            }
            if (!sessionParam.sessionID && !sessionParam.sessionValidationModule) {
                throw new Error("sessionID or sessionValidationModule should be provided.");
            }
            const sessionSignerData = await this.sessionKeyManagerModule.sessionStorageClient.getSessionData(sessionParam.sessionID
                ? {
                    sessionID: sessionParam.sessionID
                }
                : {
                    sessionValidationModule: sessionParam.sessionValidationModule,
                    sessionPublicKey: await sessionSigner.getAddress()
                });
            const leafDataHex = concat([
                pad(toHex(sessionSignerData.validUntil), { size: 6 }),
                pad(toHex(sessionSignerData.validAfter), { size: 6 }),
                pad(sessionSignerData.sessionValidationModule, { size: 20 }),
                sessionSignerData.sessionKeyData
            ]);
            const proof = this.sessionKeyManagerModule.merkleTree.getHexProof(keccak256(leafDataHex));
            const sessionDataTuple = [
                BigInt(sessionSignerData.validUntil),
                BigInt(sessionSignerData.validAfter),
                sessionSignerData.sessionValidationModule,
                sessionSignerData.sessionKeyData,
                proof,
                sessionParam.additionalSessionData ?? "0x"
            ];
            sessionDataTupleArray.push(sessionDataTuple);
        }
        // Generate the padded signature
        const abiParameters = [
            { type: "address" },
            {
                type: "tuple[]",
                components: [
                    { type: "uint48" },
                    { type: "uint48" },
                    { type: "address" },
                    { type: "bytes" },
                    { type: "bytes32[]" },
                    { type: "bytes" }
                ]
            },
            { type: "bytes" }
        ];
        const paddedSignature = encodeAbiParameters(abiParameters, [
            this.getSessionKeyManagerAddress(),
            sessionDataTupleArray,
            this.mockEcdsaSessionKeySig
        ]);
        const dummySig = encodeAbiParameters(parseAbiParameters("bytes, address"), [
            paddedSignature,
            this.getAddress()
        ]);
        return dummySig;
    }
    /**
     * @remarks Other modules may need additional attributes to build init data
     */
    async getInitData() {
        throw new Error("Method not implemented.");
    }
    /**
     * @remarks This Module dont have knowledge of signer. So, this method is not implemented
     */
    async signMessage(_message) {
        throw new Error("Method not implemented.");
    }
}
//# sourceMappingURL=BatchedSessionRouterModule.js.map