// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Achievements} from "../src/Achievements.sol";

contract AchievementsTest is Test {
    Achievements ach;
    address owner = address(0xA11CE);
    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    address charlie = address(0xC0DE);

    function setUp() public {
        vm.prank(owner);
        ach = new Achievements(owner);
    }

    function testInitialState() public {
        assertEq(ach.name(), "UniMate Achievements");
        assertEq(ach.symbol(), "UMA");
        assertEq(ach.owner(), owner);
        assertEq(ach.uri(1), "https://api.unimate.com/metadata/{id}.json");
    }

    function testMintRegularAchievement() public {
        vm.prank(owner);
        ach.mint(bob, 1, 1, false);

        assertEq(ach.balanceOf(bob, 1), 1);
        assertEq(ach.totalSupply(1), 1);
        assertFalse(ach.isSoulbound(1));

        // Regular tokens can be transferred
        vm.prank(bob);
        ach.safeTransferFrom(bob, charlie, 1, 1, "");

        assertEq(ach.balanceOf(bob, 1), 0);
        assertEq(ach.balanceOf(charlie, 1), 1);
    }

    function testMintSoulboundAchievement() public {
        vm.prank(owner);
        ach.mint(bob, 1, 1, true);

        assertEq(ach.balanceOf(bob, 1), 1);
        assertTrue(ach.isSoulbound(1));

        // Soulbound tokens cannot be transferred
        vm.expectRevert(Achievements.SoulboundTransferNotAllowed.selector);
        vm.prank(bob);
        ach.safeTransferFrom(bob, charlie, 1, 1, "");
    }

    function testBatchMintWithSoulbound() public {
        uint256[] memory ids = new uint256[](3);
        uint256[] memory amounts = new uint256[](3);
        bool[] memory soulboundFlags = new bool[](3);

        ids[0] = 1;
        ids[1] = 2;
        ids[2] = 3;
        amounts[0] = 1;
        amounts[1] = 2;
        amounts[2] = 1;
        soulboundFlags[0] = true;  // Soulbound
        soulboundFlags[1] = false; // Regular
        soulboundFlags[2] = true;  // Soulbound

        vm.prank(owner);
        ach.mintBatch(bob, ids, amounts, soulboundFlags);

        assertEq(ach.balanceOf(bob, 1), 1);
        assertEq(ach.balanceOf(bob, 2), 2);
        assertEq(ach.balanceOf(bob, 3), 1);

        assertTrue(ach.isSoulbound(1));
        assertFalse(ach.isSoulbound(2));
        assertTrue(ach.isSoulbound(3));

        // Can transfer regular token
        vm.prank(bob);
        ach.safeTransferFrom(bob, charlie, 2, 1, "");
        assertEq(ach.balanceOf(charlie, 2), 1);

        // Cannot transfer soulbound tokens
        vm.expectRevert(Achievements.SoulboundTransferNotAllowed.selector);
        vm.prank(bob);
        ach.safeTransferFrom(bob, charlie, 1, 1, "");
    }

    function testBatchMintArrayMismatch() public {
        uint256[] memory ids = new uint256[](2);
        uint256[] memory amounts = new uint256[](2);
        bool[] memory soulboundFlags = new bool[](3); // Mismatched length

        vm.expectRevert("Arrays length mismatch");
        vm.prank(owner);
        ach.mintBatch(bob, ids, amounts, soulboundFlags);
    }

    function testSetSoulboundStatus() public {
        vm.prank(owner);
        ach.mint(bob, 1, 1, false);

        assertFalse(ach.isSoulbound(1));

        // Can transfer initially
        vm.prank(bob);
        ach.safeTransferFrom(bob, charlie, 1, 1, "");

        // Transfer back for test
        vm.prank(charlie);
        ach.safeTransferFrom(charlie, bob, 1, 1, "");

        // Owner sets as soulbound
        vm.prank(owner);
        ach.setSoulboundStatus(1, true);

        assertTrue(ach.isSoulbound(1));

        // Now cannot transfer
        vm.expectRevert(Achievements.SoulboundTransferNotAllowed.selector);
        vm.prank(bob);
        ach.safeTransferFrom(bob, charlie, 1, 1, "");
    }

    function testBurnSoulboundToken() public {
        vm.prank(owner);
        ach.mint(bob, 1, 1, true);

        // Burning should work even for soulbound tokens
        vm.prank(bob);
        ach.burn(bob, 1, 1);

        assertEq(ach.balanceOf(bob, 1), 0);
        assertEq(ach.totalSupply(1), 0);
    }

    function testPauseUnpause() public {
        vm.prank(owner);
        ach.pause();

        assertTrue(ach.paused());

        vm.prank(owner);
        vm.expectRevert();
        ach.mint(bob, 1, 1, false);

        vm.prank(owner);
        ach.unpause();

        assertFalse(ach.paused());

        vm.prank(owner);
        ach.mint(bob, 1, 1, false);
        assertEq(ach.balanceOf(bob, 1), 1);
    }

    function testOnlyOwnerFunctions() public {
        vm.prank(bob);
        vm.expectRevert();
        ach.mint(charlie, 1, 1, false);

        vm.prank(bob);
        vm.expectRevert();
        ach.pause();

        vm.prank(bob);
        vm.expectRevert();
        ach.setSoulboundStatus(1, true);

        vm.prank(bob);
        vm.expectRevert();
        ach.setURI("https://newuri.com/{id}.json");
    }

    function testSetURI() public {
        string memory newURI = "https://newapi.unimate.com/metadata/{id}.json";

        vm.prank(owner);
        ach.setURI(newURI);

        assertEq(ach.uri(1), newURI);
    }
}