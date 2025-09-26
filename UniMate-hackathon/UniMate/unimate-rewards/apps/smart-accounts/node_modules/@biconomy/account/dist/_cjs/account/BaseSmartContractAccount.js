"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseSmartContractAccount = exports.DeploymentState = void 0;
const viem_1 = require("viem");
const EntryPointAbi_js_1 = require("./abi/EntryPointAbi.js");
const index_js_1 = require("./index.js");
const Constants_js_1 = require("./utils/Constants.js");
const Utils_js_1 = require("./utils/Utils.js");
var DeploymentState;
(function (DeploymentState) {
    DeploymentState["UNDEFINED"] = "0x0";
    DeploymentState["NOT_DEPLOYED"] = "0x1";
    DeploymentState["DEPLOYED"] = "0x2";
})(DeploymentState || (exports.DeploymentState = DeploymentState = {}));
class BaseSmartContractAccount {
    constructor(params) {
        Object.defineProperty(this, "factoryAddress", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "deploymentState", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: DeploymentState.UNDEFINED
        });
        Object.defineProperty(this, "accountAddress", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "accountInitCode", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "signer", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "entryPoint", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "entryPointAddress", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "rpcProvider", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "encodeUpgradeToAndCall", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: async (_upgradeToImplAddress, _upgradeToInitData) => {
                throw new Error("Upgrade ToAndCall Not Supported");
            }
        });
        Object.defineProperty(this, "extend", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: (fn) => {
                const extended = fn(this);
                for (const key in this) {
                    delete extended[key];
                }
                return Object.assign(this, extended);
            }
        });
        this.entryPointAddress =
            params.entryPointAddress ?? Constants_js_1.DEFAULT_ENTRYPOINT_ADDRESS;
        this.rpcProvider = (0, viem_1.createPublicClient)({
            chain: params.viemChain ?? params.customChain ?? (0, index_js_1.getChain)(params.chainId),
            transport: (0, viem_1.http)(params.rpcUrl || (0, index_js_1.getChain)(params.chainId).rpcUrls.default.http[0])
        });
        this.accountAddress = params.accountAddress;
        this.factoryAddress = params.factoryAddress;
        this.signer = params.signer;
        this.accountInitCode = params.initCode;
        this.entryPoint = (0, viem_1.getContract)({
            address: this.entryPointAddress,
            abi: EntryPointAbi_js_1.EntryPointAbi,
            client: this.rpcProvider
        });
    }
    async signUserOperationHash(uoHash) {
        return this.signMessage(uoHash);
    }
    async signTypedData(_params) {
        throw new Error("signTypedData not supported");
    }
    async signMessageWith6492(msg) {
        const [isDeployed, signature] = await Promise.all([
            this.isAccountDeployed(),
            this.signMessage(msg)
        ]);
        return this.create6492Signature(isDeployed, signature);
    }
    async signTypedDataWith6492(params) {
        throw new Error("signTypedDataWith6492 not supported");
    }
    async encodeBatchExecute(_txs) {
        throw new Error("Batch execution not supported");
    }
    async getNonce() {
        if (!(await this.isAccountDeployed())) {
            return 0n;
        }
        const address = await this.getAddress();
        return this.entryPoint.read.getNonce([address, BigInt(0)]);
    }
    async getInitCode() {
        if (this.deploymentState === DeploymentState.DEPLOYED) {
            return "0x";
        }
        const contractCode = await this.rpcProvider.getBytecode({
            address: await this.getAddress()
        });
        if ((contractCode?.length ?? 0) > 2) {
            this.deploymentState = DeploymentState.DEPLOYED;
            return "0x";
        }
        this.deploymentState = DeploymentState.NOT_DEPLOYED;
        return this._getAccountInitCode();
    }
    async getAddress() {
        if (!this.accountAddress) {
            const initCode = await this._getAccountInitCode();
            index_js_1.Logger.log("[BaseSmartContractAccount](getAddress) initCode: ", initCode);
            try {
                await this.entryPoint.simulate.getSenderAddress([initCode]);
            }
            catch (err) {
                index_js_1.Logger.log("[BaseSmartContractAccount](getAddress) getSenderAddress err: ", err);
                if (err.cause?.data?.errorName === "SenderAddressResult") {
                    this.accountAddress = err.cause.data.args[0];
                    index_js_1.Logger.log("[BaseSmartContractAccount](getAddress) entryPoint.getSenderAddress result:", this.accountAddress);
                    return this.accountAddress;
                }
                if (err.details === "Invalid URL") {
                    throw new Error("Invalid URL");
                }
            }
            throw new Error("Failed to get counterfactual account address");
        }
        return this.accountAddress;
    }
    getSigner() {
        return this.signer;
    }
    getFactoryAddress() {
        return this.factoryAddress;
    }
    getEntryPointAddress() {
        return this.entryPointAddress;
    }
    async isAccountDeployed() {
        return (await this.getDeploymentState()) === DeploymentState.DEPLOYED;
    }
    async getDeploymentState() {
        if (this.deploymentState === DeploymentState.UNDEFINED) {
            const initCode = await this.getInitCode();
            return initCode === "0x"
                ? DeploymentState.DEPLOYED
                : DeploymentState.NOT_DEPLOYED;
        }
        return this.deploymentState;
    }
    async parseFactoryAddressFromAccountInitCode() {
        const initCode = await this._getAccountInitCode();
        const factoryAddress = `0x${initCode.substring(2, 42)}`;
        const factoryCalldata = `0x${initCode.substring(42)}`;
        return [factoryAddress, factoryCalldata];
    }
    async getImplementationAddress() {
        const accountAddress = await this.getAddress();
        const storage = await this.rpcProvider.getStorageAt({
            address: accountAddress,
            slot: "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc"
        });
        if (storage == null) {
            throw new Error("Failed to get storage slot 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc");
        }
        return (0, viem_1.trim)(storage);
    }
    async _getAccountInitCode() {
        return this.accountInitCode ?? this.getAccountInitCode();
    }
    async create6492Signature(isDeployed, signature) {
        if (isDeployed) {
            return signature;
        }
        const [factoryAddress, factoryCalldata] = await this.parseFactoryAddressFromAccountInitCode();
        index_js_1.Logger.log(`[BaseSmartContractAccount](create6492Signature)\
        factoryAddress: ${factoryAddress}, factoryCalldata: ${factoryCalldata}`);
        return (0, Utils_js_1.wrapSignatureWith6492)({
            factoryAddress,
            factoryCalldata,
            signature
        });
    }
}
exports.BaseSmartContractAccount = BaseSmartContractAccount;
//# sourceMappingURL=BaseSmartContractAccount.js.map