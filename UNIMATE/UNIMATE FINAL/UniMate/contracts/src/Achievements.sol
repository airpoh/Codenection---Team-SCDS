// SPDX-License-Identifier: MIT
// Compatible with OpenZeppelin Contracts ^5.0.0
pragma solidity ^0.8.24;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {ERC1155Burnable} from "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Burnable.sol";
import {ERC1155Pausable} from "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Pausable.sol";
import {ERC1155Supply} from "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Supply.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title UniMate Achievements (Soulbound ERC-1155)
/// @author UniMate Team
/// @notice Soulbound achievement tokens that cannot be transferred between users
/// @custom:security-contact security@unimate.com
contract Achievements is ERC1155, Ownable, ERC1155Pausable, ERC1155Burnable, ERC1155Supply {
    string public name = "UniMate Achievements";
    string public symbol = "UMA";

    /// @notice Mapping to track if a token ID represents a soulbound achievement
    mapping(uint256 => bool) public isSoulbound;

    event AchievementMinted(address indexed to, uint256 indexed id, uint256 amount);
    event SoulboundStatusSet(uint256 indexed id, bool soulbound);

    error SoulboundTransferNotAllowed();

    constructor(address initialOwner)
        ERC1155("https://api.unimate.com/metadata/{id}.json")
        Ownable(initialOwner)
    {}

    function setURI(string memory newuri) external onlyOwner {
        _setURI(newuri);
    }

    function pause() public onlyOwner {
        _pause();
    }

    function unpause() public onlyOwner {
        _unpause();
    }

    /// @notice Mint achievement tokens to a user
    /// @param to Address to mint tokens to
    /// @param id Token ID to mint
    /// @param amount Amount to mint
    /// @param soulbound Whether this token should be soulbound
    function mint(address to, uint256 id, uint256 amount, bool soulbound) external onlyOwner {
        if (soulbound) {
            isSoulbound[id] = true;
            emit SoulboundStatusSet(id, true);
        }
        _mint(to, id, amount, "");
        emit AchievementMinted(to, id, amount);
    }

    /// @notice Batch mint achievement tokens
    /// @param to Address to mint tokens to
    /// @param ids Array of token IDs to mint
    /// @param amounts Array of amounts to mint
    /// @param soulboundFlags Array indicating which tokens should be soulbound
    function mintBatch(
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bool[] memory soulboundFlags
    ) external onlyOwner {
        require(ids.length == soulboundFlags.length, "Arrays length mismatch");

        for (uint256 i = 0; i < ids.length; i++) {
            if (soulboundFlags[i]) {
                isSoulbound[ids[i]] = true;
                emit SoulboundStatusSet(ids[i], true);
            }
            emit AchievementMinted(to, ids[i], amounts[i]);
        }

        _mintBatch(to, ids, amounts, "");
    }

    /// @notice Set soulbound status for existing token ID
    /// @param id Token ID to modify
    /// @param soulbound New soulbound status
    function setSoulboundStatus(uint256 id, bool soulbound) external onlyOwner {
        isSoulbound[id] = soulbound;
        emit SoulboundStatusSet(id, soulbound);
    }

    /// @notice Override to prevent transfers of soulbound tokens
    function _update(address from, address to, uint256[] memory ids, uint256[] memory values)
        internal
        override(ERC1155, ERC1155Pausable, ERC1155Supply)
    {
        // Allow minting (from == address(0)) and burning (to == address(0))
        if (from != address(0) && to != address(0)) {
            for (uint256 i = 0; i < ids.length; i++) {
                if (isSoulbound[ids[i]]) {
                    revert SoulboundTransferNotAllowed();
                }
            }
        }
        super._update(from, to, ids, values);
    }

    /// @notice Get token URI for a specific token ID
    /// @param id Token ID to get URI for
    /// @return Token URI
    function uri(uint256 id) public view override returns (string memory) {
        return super.uri(id);
    }
}