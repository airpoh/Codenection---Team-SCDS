// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

interface IWELL {
    function mint(address to, uint256 amount) external;
    function burn(uint256 amount) external;
    function burnFrom(address account, uint256 amount) external;
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
}

/// @title Enhanced redemption system: supports both allowance-based and challenge point redemption
/// @author UniMate Team
/// @notice Allows users to burn WELL tokens to redeem various rewards via two methods:
///         1. Traditional: Direct WELL token burning via allowance
///         2. Challenge Points: EIP-712 signed redemption with mint-and-burn
///         3. Backend Batch Reconciliation: For Defender Relayer operations
/// @dev Upgraded to AccessControl for role-based permissions (Biconomy + Defender Relayer integration)
/// @custom:security-contact security@unimate.com
contract RedemptionSystem is AccessControl, ReentrancyGuard, EIP712 {
    // Role definitions for access control
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant BACKEND_ROLE = keccak256("BACKEND_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    ERC20Burnable public immutable well;
    uint256 public ratePerVoucher; // e.g., 100e18 WELL per voucher unit (optional informational)

    // Challenge point redemption
    address public backendSigner; // Authorized backend signer for challenge point redemption
    uint256 public pointsToWellRate; // Points to WELL conversion rate (e.g., 100 points = 1e18 WELL)
    mapping(uint256 => bool) public usedNonces; // Prevent nonce replay attacks

    // EIP-712 type hash for challenge point redemption
    bytes32 private constant CHALLENGE_REDEMPTION_TYPEHASH =
        keccak256("ChallengeRedemption(address user,uint256 points,string rewardId,uint256 nonce,uint256 deadline)");

    event Redeemed(address indexed user, uint256 wellSpent, string rewardId);
    event ChallengeRedemption(address indexed user, uint256 pointsSpent, uint256 wellMinted, string rewardId);
    event RateUpdated(uint256 oldRate, uint256 newRate);
    event BackendSignerUpdated(address oldSigner, address newSigner);
    event PointsRateUpdated(uint256 oldRate, uint256 newRate);
    event PointsReconciled(address indexed user, uint256 points, uint256 wellMinted);
    event BatchReconciled(uint256 userCount, uint256 timestamp);

    error InvalidAmount();
    error InsufficientAllowance();
    error InsufficientBalance();
    error InvalidSignature();
    error SignatureExpired();
    error NonceAlreadyUsed();
    error InvalidBackendSigner();
    error InsufficientWellBalance();
    error InsufficientWellAllowance();
    error BatchTooLarge();
    error ArrayLengthMismatch();

    constructor(
        address well_,
        address admin,
        address relayerWallet,
        uint256 rate_,
        address backendSigner_,
        uint256 pointsToWellRate_
    ) EIP712("UniMate RedemptionSystem", "1") {
        well = ERC20Burnable(well_);
        ratePerVoucher = rate_;
        backendSigner = backendSigner_;
        pointsToWellRate = pointsToWellRate_; // e.g., 100 means 100 points = 1e18 WELL

        // Grant all roles to admin
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
        _grantRole(BACKEND_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);

        // Grant backend role to Defender Relayer wallet
        _grantRole(BACKEND_ROLE, relayerWallet);
        _grantRole(PAUSER_ROLE, relayerWallet);
    }

    /// @notice Set the rate per voucher for informational purposes
    /// @param newRate New rate in WELL tokens per voucher
    function setRate(uint256 newRate) external onlyRole(ADMIN_ROLE) {
        uint256 oldRate = ratePerVoucher;
        ratePerVoucher = newRate;
        emit RateUpdated(oldRate, newRate);
    }

    /// @notice Burn `wellAmount` from msg.sender. Requires ERC20 allowance to be set to this contract.
    /// @param rewardId String identifier for the reward being redeemed
    /// @param wellAmount Amount of WELL tokens to burn for this redemption
    function redeem(string calldata rewardId, uint256 wellAmount) external nonReentrant {
        if (wellAmount == 0) revert InvalidAmount();

        // Check balance and allowance
        if (well.balanceOf(msg.sender) < wellAmount) revert InsufficientBalance();
        if (well.allowance(msg.sender, address(this)) < wellAmount) revert InsufficientAllowance();

        // Uses allowance; user must call WELL.approve(address(this), wellAmount) beforehand
        well.burnFrom(msg.sender, wellAmount);
        emit Redeemed(msg.sender, wellAmount, rewardId);
    }

    /// @notice Get current rate for informational purposes
    /// @return Current rate per voucher
    function getRate() external view returns (uint256) {
        return ratePerVoucher;
    }

    /// @notice Check if user has sufficient balance and allowance to redeem
    /// @param user Address to check
    /// @param amount Amount to check
    /// @return canRedeem Whether the user can redeem this amount
    function canUserRedeem(address user, uint256 amount) external view returns (bool canRedeem) {
        return well.balanceOf(user) >= amount && well.allowance(user, address(this)) >= amount;
    }

    /// @notice Set the backend signer address for challenge point redemption
    /// @param newSigner New backend signer address
    function setBackendSigner(address newSigner) external onlyRole(ADMIN_ROLE) {
        if (newSigner == address(0)) revert InvalidBackendSigner();
        address oldSigner = backendSigner;
        backendSigner = newSigner;
        emit BackendSignerUpdated(oldSigner, newSigner);
    }

    /// @notice Set the points to WELL conversion rate
    /// @param newRate New rate (e.g., 100 means 100 points = 1e18 WELL)
    function setPointsToWellRate(uint256 newRate) external onlyRole(ADMIN_ROLE) {
        if (newRate == 0) revert InvalidAmount();
        uint256 oldRate = pointsToWellRate;
        pointsToWellRate = newRate;
        emit PointsRateUpdated(oldRate, newRate);
    }

    /// @notice Redeem challenge points for rewards using EIP-712 signature
    /// @param user The user address
    /// @param points Amount of challenge points to redeem
    /// @param rewardId String identifier for the reward being redeemed
    /// @param nonce Unique nonce to prevent replay attacks
    /// @param deadline Expiration timestamp for the signature
    /// @param signature EIP-712 signature from backend
    function redeemWithPoints(
        address user,
        uint256 points,
        string calldata rewardId,
        uint256 nonce,
        uint256 deadline,
        bytes calldata signature
    ) external nonReentrant {
        if (points == 0) revert InvalidAmount();
        if (block.timestamp > deadline) revert SignatureExpired();
        if (backendSigner == address(0)) revert InvalidBackendSigner();

        // Check if nonce has already been used (prevent replay attacks)
        if (usedNonces[nonce]) revert NonceAlreadyUsed();

        // Verify EIP-712 signature
        bytes32 structHash = keccak256(
            abi.encode(
                CHALLENGE_REDEMPTION_TYPEHASH,
                user,
                points,
                keccak256(bytes(rewardId)),
                nonce,
                deadline
            )
        );
        bytes32 digest = _hashTypedDataV4(structHash);
        address recoveredSigner = ECDSA.recover(digest, signature);

        if (recoveredSigner != backendSigner) revert InvalidSignature();

        // Mark nonce as used to prevent replay attacks
        usedNonces[nonce] = true;

        // Calculate WELL amount equivalent to points
        uint256 wellAmount = (points * 1e18) / pointsToWellRate;

        // For Method B: Mint tokens to user first (backend/owner does this)
        // Then user approves this contract to burn them
        // This creates the on-chain record of the redemption

        // Check if user has the required tokens (they should be minted by backend before calling this)
        if (well.balanceOf(user) < wellAmount) {
            revert InsufficientWellBalance();
        }

        // Check if user has approved this contract to burn their tokens
        if (well.allowance(user, address(this)) < wellAmount) {
            revert InsufficientWellAllowance();
        }

        // Burn the tokens to complete the redemption
        well.burnFrom(user, wellAmount);

        emit ChallengeRedemption(user, points, wellAmount, rewardId);
    }

    /// @notice Convert points to WELL amount for preview
    /// @param points Amount of challenge points
    /// @return wellAmount Equivalent WELL amount
    function pointsToWell(uint256 points) external view returns (uint256 wellAmount) {
        if (pointsToWellRate == 0) return 0;
        return (points * 1e18) / pointsToWellRate;
    }

    /// @notice Check if a nonce has been used
    /// @param nonce The nonce to check
    /// @return used Whether the nonce has been used
    function isNonceUsed(uint256 nonce) external view returns (bool used) {
        return usedNonces[nonce];
    }

    /// @notice Batch reconcile points to WELL tokens (Backend operation via Defender Relayer)
    /// @dev Called by Defender Relayer for nightly reconciliation
    /// @param users Array of user addresses
    /// @param points Array of points to convert (must match users length)
    function batchReconcile(
        address[] calldata users,
        uint256[] calldata points
    ) external nonReentrant onlyRole(BACKEND_ROLE) {
        if (users.length != points.length) revert ArrayLengthMismatch();
        if (users.length > 200) revert BatchTooLarge(); // Gas limit protection

        for (uint256 i = 0; i < users.length; i++) {
            if (points[i] == 0) continue; // Skip zero amounts

            // Convert points to WELL tokens
            uint256 wellAmount = (points[i] * 1e18) / pointsToWellRate;

            // Mint WELL tokens directly to user
            IWELL(address(well)).mint(users[i], wellAmount);

            emit PointsReconciled(users[i], points[i], wellAmount);
        }

        emit BatchReconciled(users.length, block.timestamp);
    }
}