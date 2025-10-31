// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {WELL} from "../src/WELL.sol";

contract DeployWell is Script {
    function run() external {
        // Read deployer private key from env
        uint256 pk = uint256(vm.envBytes32("PRIVATE_KEY"));
        address deployer = vm.addr(pk);

        // Define addresses for AccessControl roles
        address admin = deployer; // Admin gets all roles
        address relayerWallet = 0x76d8CfF46209a8969389c3ff4d48ec36cc47241C; // From Vault

        console2.log("==================================================");
        console2.log("Deploying WELL Token with AccessControl");
        console2.log("==================================================");
        console2.log("Deployer:", deployer);
        console2.log("Admin:", admin);
        console2.log("Relayer Wallet:", relayerWallet);

        vm.startBroadcast(pk);
        WELL well = new WELL(admin, relayerWallet);
        vm.stopBroadcast();

        console2.log("==================================================");
        console2.log("WELL Token:", address(well));
        console2.log("Admin (all roles):", admin);
        console2.log("Relayer (MINTER + PAUSER):", relayerWallet);
        console2.log("==================================================");
    }
}
