// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {WELL} from "../src/WELL.sol";
import {Achievements} from "../src/Achievements.sol";
import {RedemptionSystem} from "../src/RedemptionSystem.sol";

contract Deploy is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        // Define addresses for AccessControl roles
        address admin = deployer; // Admin gets all roles
        address relayerWallet = 0x76d8CfF46209a8969389c3ff4d48ec36cc47241C; // From Vault

        console2.log("==================================================");
        console2.log("Deploying UniMate Contracts with AccessControl");
        console2.log("==================================================");
        console2.log("Deployer:", deployer);
        console2.log("Admin:", admin);
        console2.log("Relayer Wallet:", relayerWallet);
        console2.log("Account balance:", deployer.balance);
        console2.log("");

        vm.startBroadcast(deployerPrivateKey);

        // Deploy WELL token with AccessControl
        WELL well = new WELL(admin, relayerWallet);
        console2.log("WELL deployed to:", address(well));

        // Deploy Achievements contract
        Achievements achievements = new Achievements(deployer);
        console2.log("Achievements deployed to:", address(achievements));

        // Deploy RedemptionSystem with AccessControl
        RedemptionSystem redemptionSystem = new RedemptionSystem(
            address(well),
            admin,          // Admin role
            relayerWallet,  // Backend role (for Defender Relayer)
            100 ether,      // 100 WELL per voucher as default rate
            deployer,       // Backend signer (for hackathon, use same as deployer)
            100             // Points to WELL rate: 100 points = 1 WELL
        );
        console2.log("RedemptionSystem deployed to:", address(redemptionSystem));

        vm.stopBroadcast();

        // Log deployment summary
        console2.log("");
        console2.log("==================================================");
        console2.log("Deployment Summary");
        console2.log("==================================================");
        console2.log("WELL Token:", address(well));
        console2.log("Achievements:", address(achievements));
        console2.log("RedemptionSystem:", address(redemptionSystem));
        console2.log("");

        // Verify initial states
        console2.log("=== Initial States ===");
        console2.log("WELL total supply:", well.totalSupply() / 1e18, "WELL");
        console2.log("WELL admin balance:", well.balanceOf(admin) / 1e18, "WELL");
        console2.log("Achievements name:", achievements.name());
        console2.log("RedemptionSystem rate:", redemptionSystem.ratePerVoucher() / 1e18, "WELL per voucher");
        console2.log("");

        // Log role assignments
        console2.log("=== Role Assignments ===");
        console2.log("WELL Token Roles:");
        console2.log("  - Admin (all roles):", admin);
        console2.log("  - Relayer (MINTER + PAUSER):", relayerWallet);
        console2.log("");
        console2.log("RedemptionSystem Roles:");
        console2.log("  - Admin (ADMIN_ROLE):", admin);
        console2.log("  - Relayer (BACKEND_ROLE + PAUSER):", relayerWallet);
        console2.log("==================================================");
    }
}