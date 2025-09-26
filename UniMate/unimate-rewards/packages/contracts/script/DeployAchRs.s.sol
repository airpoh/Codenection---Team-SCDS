// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {Achievements} from "../src/Achievements.sol";
import {RedemptionSystem} from "../src/RedemptionSystem.sol";

contract DeployAchRs is Script {
    function run(address well, uint256 ratePerVoucher) external {
        uint256 pk = uint256(vm.envBytes32("PRIVATE_KEY")); // your test deployer key
        address owner = vm.addr(pk);

        console2.log("Deploying Achievements and RedemptionSystem with:");
        console2.log("  WELL address:", well);
        console2.log("  Owner:", owner);
        console2.log("  Rate per voucher:", ratePerVoucher);

        vm.startBroadcast(pk);

        // Deploy Achievements contract (URI is hardcoded in constructor)
        Achievements ach = new Achievements(owner);
        console2.log("Achievements deployed at:", address(ach));

        // Deploy RedemptionSystem contract
        RedemptionSystem rs = new RedemptionSystem(
            well,
            owner,
            ratePerVoucher,
            owner,  // Backend signer (for hackathon, use same as owner)
            100     // Points to WELL rate: 100 points = 1 WELL
        );
        console2.log("RedemptionSystem deployed at:", address(rs));

        vm.stopBroadcast();

        console2.log("");
        console2.log("Deployment Summary:");
        console2.log("ACH:", address(ach));
        console2.log("RS :", address(rs));
        console2.log("");
        console2.log("Next steps:");
        console2.log("1. export ACH=%s", address(ach));
        console2.log("2. export RS=%s", address(rs));
        console2.log("3. Add to .env:");
        console2.log("   ACH_ADDRESS=%s", address(ach));
        console2.log("   RS_ADDRESS=%s", address(rs));
    }
}
