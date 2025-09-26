"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BatchedSessionRouterModule = void 0;
const viem_1 = require("viem");
const account_1 = require("../account/index.js");
const BaseValidationModule_js_1 = require("./BaseValidationModule.js");
const SessionKeyManagerModule_js_1 = require("./SessionKeyManagerModule.js");
const Constants_js_1 = require("./utils/Constants.js");
class BatchedSessionRouterModule extends BaseValidationModule_js_1.BaseValidationModule {
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
        Object.defineProperty(this, "createSessionData", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: async (leavesData) => {
                return this.sessionKeyManagerModule.createSessionData(leavesData);
            }
        });
    }
    static async create(moduleConfig) {
        const instance = new BatchedSessionRouterModule(moduleConfig);
        if (moduleConfig.moduleAddress) {
            instance.moduleAddress = moduleConfig.moduleAddress;
        }
        else if (moduleConfig.version) {
            const moduleAddr = Constants_js_1.BATCHED_SESSION_ROUTER_MODULE_ADDRESSES_BY_VERSION[moduleConfig.version];
            if (!moduleAddr) {
                throw new Error(`Invalid version ${moduleConfig.version}`);
            }
            instance.moduleAddress = moduleAddr;
            instance.version = moduleConfig.version;
        }
        else {
            instance.moduleAddress = Constants_js_1.DEFAULT_BATCHED_SESSION_ROUTER_MODULE;
        }
        instance.sessionManagerModuleAddress =
            moduleConfig.sessionManagerModuleAddress ??
                Constants_js_1.DEFAULT_SESSION_KEY_MANAGER_MODULE;
        if (!moduleConfig.sessionKeyManagerModule) {
            const sessionModule = await SessionKeyManagerModule_js_1.SessionKeyManagerModule.create({
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
    async signUserOpHash(userOpHash, params) {
        const sessionParams = params?.batchSessionParams;
        if (!sessionParams || sessionParams.length === 0) {
            throw new Error("Session parameters are not provided");
        }
        const sessionDataTupleArray = [];
        const { signer: sessionSigner } = await (0, account_1.convertSigner)(sessionParams[0].sessionSigner, false);
        const signature = await sessionSigner.signMessage({
            raw: (0, viem_1.toBytes)(userOpHash)
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
            const leafDataHex = (0, viem_1.concat)([
                (0, viem_1.pad)((0, viem_1.toHex)(sessionSignerData.validUntil), { size: 6 }),
                (0, viem_1.pad)((0, viem_1.toHex)(sessionSignerData.validAfter), { size: 6 }),
                (0, viem_1.pad)(sessionSignerData.sessionValidationModule, { size: 20 }),
                sessionSignerData.sessionKeyData
            ]);
            const proof = this.sessionKeyManagerModule.merkleTree.getHexProof((0, viem_1.keccak256)(leafDataHex));
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
        const paddedSignature = (0, viem_1.encodeAbiParameters)(abiParameters, [
            this.getSessionKeyManagerAddress(),
            sessionDataTupleArray,
            signature
        ]);
        return paddedSignature;
    }
    async updateSessionStatus(param, status) {
        this.sessionKeyManagerModule.sessionStorageClient.updateSessionStatus(param, status);
    }
    async clearPendingSessions() {
        this.sessionKeyManagerModule.sessionStorageClient.clearPendingSessions();
    }
    getAddress() {
        return this.moduleAddress;
    }
    getSessionKeyManagerAddress() {
        return this.sessionManagerModuleAddress;
    }
    async getSigner() {
        throw new Error("Method not implemented.");
    }
    async getDummySignature(params) {
        const sessionParams = params?.batchSessionParams;
        if (!sessionParams || sessionParams.length === 0) {
            throw new Error("Session parameters are not provided");
        }
        const sessionDataTupleArray = [];
        const { signer: sessionSigner } = await (0, account_1.convertSigner)(sessionParams[0].sessionSigner, false);
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
            const leafDataHex = (0, viem_1.concat)([
                (0, viem_1.pad)((0, viem_1.toHex)(sessionSignerData.validUntil), { size: 6 }),
                (0, viem_1.pad)((0, viem_1.toHex)(sessionSignerData.validAfter), { size: 6 }),
                (0, viem_1.pad)(sessionSignerData.sessionValidationModule, { size: 20 }),
                sessionSignerData.sessionKeyData
            ]);
            const proof = this.sessionKeyManagerModule.merkleTree.getHexProof((0, viem_1.keccak256)(leafDataHex));
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
        const paddedSignature = (0, viem_1.encodeAbiParameters)(abiParameters, [
            this.getSessionKeyManagerAddress(),
            sessionDataTupleArray,
            this.mockEcdsaSessionKeySig
        ]);
        const dummySig = (0, viem_1.encodeAbiParameters)((0, viem_1.parseAbiParameters)("bytes, address"), [
            paddedSignature,
            this.getAddress()
        ]);
        return dummySig;
    }
    async getInitData() {
        throw new Error("Method not implemented.");
    }
    async signMessage(_message) {
        throw new Error("Method not implemented.");
    }
}
exports.BatchedSessionRouterModule = BatchedSessionRouterModule;
//# sourceMappingURL=BatchedSessionRouterModule.js.map