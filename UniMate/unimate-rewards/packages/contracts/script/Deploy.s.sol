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

        console2.log("Deploying contracts with account:", deployer);
        console2.log("Account balance:", deployer.balance);

        vm.startBroadcast(deployerPrivateKey);

        // Deploy WELL token
        WELL well = new WELL(deployer);
        console2.log("WELL deployed to:", address(well));

        // Deploy Achievements contract
        Achievements achievements = new Achievements(deployer);
        console2.log("Achievements deployed to:", address(achievements));

        // Deploy RedemptionSystem
        RedemptionSystem redemptionSystem = new RedemptionSystem(
            address(well),
            deployer,
            100 ether, // 100 WELL per voucher as default rate
            deployer,  // Backend signer (for hackathon, use same as deployer)
            100        // Points to WELL rate: 100 points = 1 WELL
        );
        console2.log("RedemptionSystem deployed to:", address(redemptionSystem));

        vm.stopBroadcast();

        // Log deployment summary
        console2.log("\n=== Deployment Summary ===");
        console2.log("WELL Token:", address(well));
        console2.log("Achievements:", address(achievements));
        console2.log("RedemptionSystem:", address(redemptionSystem));
        console2.log("========================\n");

        // Verify initial states
        console2.log("WELL total supply:", well.totalSupply() / 1e18, "WELL");
        console2.log("WELL owner balance:", well.balanceOf(deployer) / 1e18, "WELL");
        console2.log("Achievements name:", achievements.name());
        console2.log("RedemptionSystem rate:", redemptionSystem.ratePerVoucher() / 1e18, "WELL per voucher");
    }
}