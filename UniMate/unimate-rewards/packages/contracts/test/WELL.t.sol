// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {WELL} from "../src/WELL.sol";

contract WELLTest is Test {
    WELL well;
    address owner = address(0xA11CE);
    address alice = address(0xA11CE);
    address bob = address(0xB0B);

    function setUp() public {
        vm.prank(owner);
        well = new WELL(owner);
    }

    function testInitialState() public {
        assertEq(well.name(), "UniMate Wellness Token");
        assertEq(well.symbol(), "WELL");
        assertEq(well.decimals(), 18);
        assertEq(well.totalSupply(), 1_000_000 ether);
        assertEq(well.balanceOf(owner), 1_000_000 ether);
        assertEq(well.owner(), owner);
    }

    function testMintByOwner() public {
        vm.prank(owner);
        well.mint(bob, 100 ether);
        assertEq(well.balanceOf(bob), 100 ether);
        assertEq(well.totalSupply(), 1_000_000 ether + 100 ether);
    }

    function testMintFailsForNonOwner() public {
        vm.prank(bob);
        vm.expectRevert();
        well.mint(alice, 100 ether);
    }

    function testBurnByHolder() public {
        vm.prank(owner);
        well.transfer(bob, 100 ether);

        vm.prank(bob);
        well.burn(50 ether);

        assertEq(well.balanceOf(bob), 50 ether);
        assertEq(well.totalSupply(), 1_000_000 ether - 50 ether);
    }

    function testBurnFromWithApproval() public {
        vm.prank(owner);
        well.transfer(bob, 100 ether);

        vm.prank(bob);
        well.approve(alice, 50 ether);

        vm.prank(alice);
        well.burnFrom(bob, 30 ether);

        assertEq(well.balanceOf(bob), 70 ether);
        assertEq(well.allowance(bob, alice), 20 ether);
    }

    function testPauseUnpause() public {
        vm.prank(owner);
        well.pause();

        assertTrue(well.paused());

        vm.prank(owner);
        vm.expectRevert();
        well.transfer(bob, 100 ether);

        vm.prank(owner);
        well.unpause();

        assertFalse(well.paused());

        vm.prank(owner);
        well.transfer(bob, 100 ether);
        assertEq(well.balanceOf(bob), 100 ether);
    }

    function testPauseFailsForNonOwner() public {
        vm.prank(bob);
        vm.expectRevert();
        well.pause();
    }

    function testPermit() public {
        uint256 privateKey = 0x123;
        address user = vm.addr(privateKey);

        vm.prank(owner);
        well.transfer(user, 100 ether);

        uint256 deadline = block.timestamp + 1 hours;
        uint256 value = 50 ether;

        bytes32 structHash = keccak256(
            abi.encode(
                keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"),
                user,
                bob,
                value,
                well.nonces(user),
                deadline
            )
        );

        bytes32 hash = keccak256(abi.encodePacked("\x19\x01", well.DOMAIN_SEPARATOR(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, hash);

        well.permit(user, bob, value, deadline, v, r, s);

        assertEq(well.allowance(user, bob), value);
    }

    function testVotingPower() public {
        vm.prank(owner);
        well.transfer(bob, 100 ether);

        assertEq(well.getVotes(bob), 0); // No self-delegation yet

        vm.prank(bob);
        well.delegate(bob);

        assertEq(well.getVotes(bob), 100 ether);
    }

    function testClockMode() public {
        assertEq(well.CLOCK_MODE(), "mode=timestamp");
        assertEq(well.clock(), uint48(block.timestamp));
    }
}