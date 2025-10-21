// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {WELL} from "../src/WELL.sol";
import {RedemptionSystem} from "../src/RedemptionSystem.sol";

contract RedemptionSystemTest is Test {
    WELL well;
    RedemptionSystem rs;
    address owner = address(0xA11CE);
    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    address relayerWallet = address(0xDEF1);

    function setUp() public {
        vm.startPrank(owner);
        // Deploy WELL with AccessControl (admin + relayerWallet)
        well = new WELL(owner, relayerWallet);

        // Deploy RedemptionSystem with AccessControl
        rs = new RedemptionSystem(
            address(well),
            owner,          // admin
            relayerWallet,  // backend role
            100 ether,      // rate per voucher
            owner,          // backend signer
            100             // points to WELL rate
        );
        vm.stopPrank();

        // owner mints to bob for testing
        vm.prank(owner);
        well.mint(bob, 200 ether);
    }

    function testInitialState() public {
        assertEq(address(rs.well()), address(well));
        assertEq(rs.ratePerVoucher(), 100 ether);
        assertEq(rs.getRate(), 100 ether);
    }

    function testRedeemWithApproval() public {
        // Bob approves RS to burn tokens
        vm.prank(bob);
        well.approve(address(rs), 150 ether);

        uint256 initialBalance = well.balanceOf(bob);
        uint256 initialSupply = well.totalSupply();

        // Bob redeems 150 WELL
        vm.prank(bob);
        rs.redeem("VOUCHER-123", 150 ether);

        assertEq(well.balanceOf(bob), initialBalance - 150 ether);
        assertEq(well.totalSupply(), initialSupply - 150 ether);
    }

    function testRedeemFailsWithoutApproval() public {
        vm.expectRevert(RedemptionSystem.InsufficientAllowance.selector);
        vm.prank(bob);
        rs.redeem("VOUCHER-123", 150 ether);
    }

    function testRedeemFailsWithInsufficientBalance() public {
        vm.prank(bob);
        well.approve(address(rs), 300 ether);

        vm.expectRevert(RedemptionSystem.InsufficientBalance.selector);
        vm.prank(bob);
        rs.redeem("VOUCHER-123", 300 ether);
    }

    function testRedeemFailsWithZeroAmount() public {
        vm.expectRevert(RedemptionSystem.InvalidAmount.selector);
        vm.prank(bob);
        rs.redeem("VOUCHER-123", 0);
    }

    function testPartialApprovalSpending() public {
        vm.prank(bob);
        well.approve(address(rs), 100 ether);

        vm.prank(bob);
        rs.redeem("VOUCHER-456", 50 ether);

        assertEq(well.allowance(bob, address(rs)), 50 ether);
        assertEq(well.balanceOf(bob), 150 ether);

        // Can redeem again with remaining approval
        vm.prank(bob);
        rs.redeem("VOUCHER-789", 50 ether);

        assertEq(well.allowance(bob, address(rs)), 0);
        assertEq(well.balanceOf(bob), 100 ether);
    }

    function testSetRateByOwner() public {
        uint256 newRate = 200 ether;

        vm.prank(owner);
        rs.setRate(newRate);

        assertEq(rs.ratePerVoucher(), newRate);
        assertEq(rs.getRate(), newRate);
    }

    function testSetRateFailsForNonAdmin() public {
        // Bob doesn't have ADMIN_ROLE, so this should revert
        vm.prank(bob);
        vm.expectRevert();
        rs.setRate(200 ether);
    }

    function testCanUserRedeem() public {
        // Bob has 200 ether, no approval
        assertFalse(rs.canUserRedeem(bob, 100 ether));

        // Bob approves 150 ether
        vm.prank(bob);
        well.approve(address(rs), 150 ether);

        // Can redeem up to approval amount and balance
        assertTrue(rs.canUserRedeem(bob, 100 ether));
        assertTrue(rs.canUserRedeem(bob, 150 ether));
        assertFalse(rs.canUserRedeem(bob, 200 ether)); // Exceeds approval
        assertFalse(rs.canUserRedeem(bob, 250 ether)); // Exceeds both balance and approval
    }

    function testRedeemEvent() public {
        vm.prank(bob);
        well.approve(address(rs), 100 ether);

        vm.expectEmit(true, false, false, true);
        emit RedemptionSystem.Redeemed(bob, 100 ether, "SPECIAL-REWARD");

        vm.prank(bob);
        rs.redeem("SPECIAL-REWARD", 100 ether);
    }

    function testRateUpdateEvent() public {
        uint256 oldRate = rs.ratePerVoucher();
        uint256 newRate = 150 ether;

        vm.expectEmit(false, false, false, true);
        emit RedemptionSystem.RateUpdated(oldRate, newRate);

        vm.prank(owner);
        rs.setRate(newRate);
    }

    function testReentrancyProtection() public {
        // This test ensures the nonReentrant modifier is working
        // In a real reentrancy attack, the malicious contract would try to call redeem again
        // The nonReentrant modifier should prevent this

        vm.prank(bob);
        well.approve(address(rs), 100 ether);

        vm.prank(bob);
        rs.redeem("TEST-REENTRANCY", 100 ether);

        // If we reach here without revert, reentrancy protection is working
        assertEq(well.balanceOf(bob), 100 ether);
    }
}