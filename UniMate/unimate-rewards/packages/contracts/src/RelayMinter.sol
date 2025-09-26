// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IWELL {
    function mint(address to, uint256 amount) external;     // onlyOwner in WELL
}

/**
 * @title RelayMinter
 * @dev Secure contract for gasless token minting via Gelato sponsored calls
 * @notice Uses EIP-712 signatures for authorization and replay protection
 */
contract RelayMinter is EIP712, Ownable2Step, Pausable, ReentrancyGuard {
    // ---- EIP712 ----
    // struct Mint { address to; uint256 amount; uint256 deadline; bytes32 actionId; }
    bytes32 private constant MINT_TYPEHASH =
        keccak256("Mint(address to,uint256 amount,uint256 deadline,bytes32 actionId)");

    // backend signer that authorizes mints
    address public signer;

    // replay protection (actionId => used?)
    mapping(bytes32 => bool) public used;

    // WELL token this contract controls (as owner)
    IWELL public immutable well;

    // --- Custom Errors (Gas Optimized) ---
    error ZeroAddress();
    error ExpiredSignature();
    error ActionAlreadyUsed();
    error InvalidSigner();
    error NoChange();

    // --- Events ---
    event SignerUpdated(address indexed previousSigner, address indexed newSigner);
    event Minted(address indexed to, uint256 amount, bytes32 indexed actionId);

    constructor(address _well, address _initialOwner, address _signer)
        EIP712("RelayMinter", "1")
        Ownable(_initialOwner)
    {
        if (_well == address(0) || _initialOwner == address(0) || _signer == address(0)) {
            revert ZeroAddress();
        }
        well = IWELL(_well);
        signer = _signer;
    }

    /**
     * @dev Pause minting in case of emergency
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @dev Unpause minting
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @dev Rotate the backend signer address
     * @param _signer New signer address
     */
    function setSigner(address _signer) external onlyOwner {
        if (_signer == address(0)) revert ZeroAddress();
        if (_signer == signer) revert NoChange();

        address previousSigner = signer;
        signer = _signer;
        emit SignerUpdated(previousSigner, _signer);
    }

    /**
     * @dev Mint tokens with a valid signature from the backend signer
     * @param to Recipient address
     * @param amount Amount of tokens to mint (in wei)
     * @param deadline Signature expiration timestamp
     * @param actionId Unique identifier to prevent replay attacks
     * @param sig EIP-712 signature from the backend signer
     */
    function mintWithSig(
        address to,
        uint256 amount,
        uint256 deadline,
        bytes32 actionId,
        bytes calldata sig
    ) external whenNotPaused nonReentrant {
        // Check expiry first (cheapest check)
        if (block.timestamp > deadline) revert ExpiredSignature();

        // Check replay protection
        if (used[actionId]) revert ActionAlreadyUsed();

        // Verify EIP-712 signature (most expensive check last)
        bytes32 digest = _hashTypedDataV4(
            keccak256(abi.encode(MINT_TYPEHASH, to, amount, deadline, actionId))
        );
        address recovered = ECDSA.recover(digest, sig);
        if (recovered != signer) revert InvalidSigner();

        // Update state before external call
        used[actionId] = true;

        // Execute mint
        well.mint(to, amount);
        emit Minted(to, amount, actionId);
    }

    /**
     * @dev Check if an actionId has been used
     * @param actionId The action identifier to check
     * @return Whether the actionId has been used
     */
    function isActionUsed(bytes32 actionId) external view returns (bool) {
        return used[actionId];
    }
}