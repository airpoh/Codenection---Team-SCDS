// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {WELL} from "../src/WELL.sol";

contract DeployWell is Script {
    function run() external {
        // Read your 0x... key from env (hex32)
        uint256 pk = uint256(vm.envBytes32("PRIVATE_KEY"));
        address owner = vm.addr(pk);

        vm.startBroadcast(pk);
        WELL well = new WELL(owner);
        vm.stopBroadcast();

        console2.log("WELL:", address(well));
        console2.log("OWNER:", owner);
    }
}
