import { http, createPublicClient, getContract, trim } from "viem";
import { EntryPointAbi } from "./abi/EntryPointAbi.js";
import { Logger, getChain } from "./index.js";
import { DEFAULT_ENTRYPOINT_ADDRESS } from "./utils/Constants.js";
import { wrapSignatureWith6492 } from "./utils/Utils.js";
export var DeploymentState;
(function (DeploymentState) {
    DeploymentState["UNDEFINED"] = "0x0";
    DeploymentState["NOT_DEPLOYED"] = "0x1";
    DeploymentState["DEPLOYED"] = "0x2";
})(DeploymentState || (DeploymentState = {}));
export class BaseSmartContractAccount {
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
        /**
         * If your contract supports UUPS, you can implement this method which can be
         * used to upgrade the implementation of the account.
         *
         * @param upgradeToImplAddress -- the implementation address of the contract you want to upgrade to
         * @param upgradeToInitData -- the initialization data required by that account
         */
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
                // this should make it so extensions can't overwrite the base methods
                for (const key in this) {
                    delete extended[key];
                }
                return Object.assign(this, extended);
            }
        });
        this.entryPointAddress =
            params.entryPointAddress ?? DEFAULT_ENTRYPOINT_ADDRESS;
        this.rpcProvider = createPublicClient({
            chain: params.viemChain ?? params.customChain ?? getChain(params.chainId),
            transport: http(params.rpcUrl || getChain(params.chainId).rpcUrls.default.http[0])
        });
        this.accountAddress = params.accountAddress;
        this.factoryAddress = params.factoryAddress;
        this.signer = params.signer;
        this.accountInitCode = params.initCode;
        this.entryPoint = getContract({
            address: this.entryPointAddress,
            abi: EntryPointAbi,
            client: this.rpcProvider
        });
    }
    //#endregion abstract-methods
    //#region optional-methods
    /**
     * If your account handles 1271 signatures of personal_sign differently
     * than it does UserOperations, you can implement two different approaches to signing
     *
     * @param uoHash -- The hash of the UserOperation to sign
     * @returns the signature of the UserOperation
     */
    async signUserOperationHash(uoHash) {
        return this.signMessage(uoHash);
    }
    /**
     * If your contract supports signing and verifying typed data,
     * you should implement this method.
     *
     * @param _params -- Typed Data params to sign
     */
    async signTypedData(_params) {
        throw new Error("signTypedData not supported");
    }
    /**
     * This method should wrap the result of `signMessage` as per
     * [EIP-6492](https://eips.ethereum.org/EIPS/eip-6492)
     *
     * @param msg -- the message to sign
     */
    async signMessageWith6492(msg) {
        const [isDeployed, signature] = await Promise.all([
            this.isAccountDeployed(),
            this.signMessage(msg)
        ]);
        return this.create6492Signature(isDeployed, signature);
    }
    /**
     * Similar to the signMessageWith6492 method above,
     * this method should wrap the result of `signTypedData` as per
     * [EIP-6492](https://eips.ethereum.org/EIPS/eip-6492)
     *
     * @param params -- Typed Data params to sign
     */
    async signTypedDataWith6492(
    // @ts-ignore
    params) {
        throw new Error("signTypedDataWith6492 not supported");
        // const [isDeployed, signature] = await Promise.all([
        //   this.isAccountDeployed(),
        //   this.signTypedData(params)
        // ])
        // return this.create6492Signature(isDeployed, signature)
    }
    /**
     * Not all contracts support batch execution.
     * If your contract does, this method should encode a list of
     * transactions into the call data that will be passed to your
     * contract's batch execution method.
     *
     * @param _txs -- the transactions to batch execute
     */
    async encodeBatchExecute(_txs) {
        throw new Error("Batch execution not supported");
    }
    //#endregion optional-methods
    // Extra implementations
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
            Logger.log("[BaseSmartContractAccount](getAddress) initCode: ", initCode);
            try {
                await this.entryPoint.simulate.getSenderAddress([initCode]);
            }
            catch (err) {
                Logger.log("[BaseSmartContractAccount](getAddress) getSenderAddress err: ", err);
                if (err.cause?.data?.errorName === "SenderAddressResult") {
                    this.accountAddress = err.cause.data.args[0];
                    Logger.log("[BaseSmartContractAccount](getAddress) entryPoint.getSenderAddress result:", this.accountAddress);
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
    /**
     * https://eips.ethereum.org/EIPS/eip-4337#first-time-account-creation
     * The initCode field (if non-zero length) is parsed as a 20-byte address,
     * followed by calldata to pass to this address.
     * The factory address is the first 40 char after the 0x, and the callData is the rest.
     */
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
            // This is the default slot for the implementation address for Proxies
            slot: "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc"
        });
        if (storage == null) {
            throw new Error("Failed to get storage slot 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc");
        }
        return trim(storage);
    }
    async _getAccountInitCode() {
        return this.accountInitCode ?? this.getAccountInitCode();
    }
    async create6492Signature(isDeployed, signature) {
        if (isDeployed) {
            return signature;
        }
        const [factoryAddress, factoryCalldata] = await this.parseFactoryAddressFromAccountInitCode();
        Logger.log(`[BaseSmartContractAccount](create6492Signature)\
        factoryAddress: ${factoryAddress}, factoryCalldata: ${factoryCalldata}`);
        return wrapSignatureWith6492({
            factoryAddress,
            factoryCalldata,
            signature
        });
    }
}
//# sourceMappingURL=BaseSmartContractAccount.js.map