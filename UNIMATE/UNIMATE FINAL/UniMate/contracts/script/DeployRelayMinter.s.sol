// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {RelayMinter} from "../src/RelayMinter.sol";

contract DeployRelayMinter is Script {
    function run(address well, address signer) external {
        uint256 pk = vm.envUint("PRIVATE_KEY"); // your current WELL owner key
        address deployer = vm.addr(pk);

        console2.log("Deploying RelayMinter with:");
        console2.log("  WELL address:", well);
        console2.log("  Initial owner:", deployer);
        console2.log("  Backend signer:", signer);

        vm.startBroadcast(pk);
        RelayMinter minter = new RelayMinter(well, deployer, signer);
        console2.log("RelayMinter deployed at:", address(minter));
        vm.stopBroadcast();

        console2.log("");
        console2.log("Next steps:");
        console2.log("1. Set MINTER=%s", address(minter));
        console2.log("2. Transfer WELL ownership to RelayMinter:");
        console2.log("   cast send %s \"transferOwnership(address)\" %s --rpc-url amoy --private-key $PRIVATE_KEY", well, address(minter));
        console2.log("3. Verify WELL owner:");
        console2.log("   cast call %s \"owner()(address)\" --rpc-url amoy", well);
    }
}