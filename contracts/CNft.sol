// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "./CNftInterface080.sol";
import "./ComptrollerInterface080.sol";
import "./ERC1155Enumerable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import "@openzeppelin/contracts/interfaces/IERC1155.sol";
import "@openzeppelin/contracts/interfaces/IERC721.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";

contract CNft is CNftInterface, ERC1155Enumerable, IERC1155Receiver, IERC721Receiver, ReentrancyGuardUpgradeable, OwnableUpgradeable {
    function initialize (
        string memory _uri,
        address _underlying,
        bool _isPunk,
        bool _is1155,
        address _comptroller
    ) public initializer {
        require(_underlying != address(0), "CNFT: Asset should not be address(0)");
        require(ComptrollerInterface(_comptroller).isComptroller(), "_comptroller is not a Comptroller contract");
        __ERC1155Enumerable_init(_uri);
        __ReentrancyGuard_init();
        __Ownable_init();
        underlying = _underlying;
        isPunk = _isPunk;
        is1155 = _is1155;
        comptroller = _comptroller;
    }

    /// @notice If underlying is not ERC1155, amounts must be all 1s.
    function mint(
        uint256[] calldata tokenIds,
        uint256[] calldata amounts
    ) external nonReentrant returns (uint256) {
        require(tokenIds.length == amounts.length, "CNFT: id/amounts length mismatch");

        // Check if the Comptroller allows minting.
        // We set mintAmount to 0 because it is not used.
        uint mintAllowedResult = ComptrollerInterface(comptroller).mintAllowed(address(this), msg.sender, 0);
        require(mintAllowedResult == 0, "CNFT: Mint is not allowed");

        // Receive NFTs.
        uint256 length = tokenIds.length;
        uint256 totalAmount = 0;
        for (uint256 i; i < length; ++i) {
            if (!is1155) {
                require(amounts[i] == 1, "CNFT: Amounts must be all 1s for non-ERC1155s.");
            }
            totalAmount += amounts[i];
        }
        totalBalance[msg.sender] += totalAmount;
        if (is1155) {
            IERC1155(underlying).safeBatchTransferFrom(msg.sender, address(this), tokenIds, amounts, "");
        } else {
            if (isPunk) {
                // Adapted from https://github.com/NFTX-project/nftx-protocol-v2/blob/master/contracts/solidity/NFTXVaultUpgradeable.sol#L501
                for (uint256 i; i < length; ++i) {
                    bytes memory punkIndexToAddress = abi.encodeWithSignature("punkIndexToAddress(uint256)", tokenIds[i]);
                    (bool checkSuccess, bytes memory result) = underlying.staticcall(punkIndexToAddress);
                    (address nftOwner) = abi.decode(result, (address));
                    require(checkSuccess && nftOwner == msg.sender, "Not the NFT owner");
                    bytes memory data = abi.encodeWithSignature("buyPunk(uint256)", tokenIds[i]);
                    (bool buyPunkSuccess, ) = underlying.call(data);
                    require(buyPunkSuccess, "CNFT: Calling buyPunk was unsuccessful");
                }
            } else {
                for (uint256 i; i < length; ++i) {
                    IERC721(underlying).safeTransferFrom(msg.sender, address(this), tokenIds[i], "");
                }
            }
        }
        _mintBatch(msg.sender, tokenIds, amounts, "");
        emit Mint(msg.sender, tokenIds, amounts);

        return length;
    }

    // Adapted from the `seize` function in CToken.
    function seize(address liquidator, address borrower, uint256[] calldata seizeIds, uint256[] calldata seizeAmounts) external nonReentrant override {
        require(seizeIds.length == seizeAmounts.length, "CNFT: id/amounts length mismatch");

        // Check if the Comptroller allows seizing.
        // We set seizeAmount to 0 because it is not used.
        uint siezeAllowedResult = ComptrollerInterface(comptroller).seizeAllowed(address(this), msg.sender, liquidator, borrower, 0);
        require(siezeAllowedResult == 0, "CNFT: Seize is not allowed");

        // Fail if borrower == liquidator.
        require(borrower != liquidator, "CNFT: Liquidator cannot be borrower");

        // Transfer cNFT.
        uint256 length = seizeIds.length;
        uint256 totalAmount = 0;
        for (uint256 i; i < length; ++i) {
            if (!is1155) {
                require(seizeAmounts[i] == 1, "CNFT: Amounts must be all 1s for non-ERC1155s.");
            }
            totalAmount += seizeAmounts[i];
        }
        totalBalance[liquidator] += totalAmount;
        totalBalance[borrower] -= totalAmount;
        // We call the internal function instad of the public one because in liquidation, we
        // forcibly seize the borrower's cNFTs without approval.
        _safeBatchTransferFrom(borrower, liquidator, seizeIds, seizeAmounts, "");
    }

    /// @notice If underlying is not ERC1155, amounts must be all 1s.
    function redeem(
        uint256[] calldata tokenIds,
        uint256[] calldata amounts /* ignored for ERC721 */
    ) external nonReentrant {
        require(tokenIds.length == amounts.length, "CNFT: id/amounts length mismatch");

        uint256 length = tokenIds.length;
        uint256 totalAmount = 0;

        // Check for ownership.
        for (uint256 i; i < length; ++i) {
            if (!is1155) {
                require(amounts[i] == 1, "CNFT: Amounts must be all 1s for non-ERC1155s.");
            }
            totalAmount += amounts[i];
            require(balanceOf(msg.sender, tokenIds[i]) >= amounts[i], "CNFT: Not enough NFTs to redeem");
        }

        // Check if we can redeem.
        uint redeemAllowedResult = ComptrollerInterface(comptroller).redeemAllowed(address(this), msg.sender, totalAmount);
        require(redeemAllowedResult == 0, "CNFT: Redeem is not allowed");

        totalBalance[msg.sender] -= totalAmount;

        // Burn CNfts.
        _burnBatch(msg.sender, tokenIds, amounts);

        // Transfer underlying to `to`.
        if (is1155) {
            IERC1155(underlying).safeBatchTransferFrom(address(this), msg.sender, tokenIds, amounts, "");
        } else {
            if (isPunk) {
                // Adapted from https://github.com/NFTX-project/nftx-protocol-v2/blob/master/contracts/solidity/NFTXVaultUpgradeable.sol#L483
                for (uint256 i; i < length; ++i) {
                    bytes memory data = abi.encodeWithSignature("transferPunk(address,uint256)", msg.sender, tokenIds[i]);
                    (bool transferPunkSuccess, ) = underlying.call(data);
                    require(transferPunkSuccess, "CNFT: Calling transferPunk was unsuccessful");
                }
            } else {
                for (uint256 i; i < length; ++i) {
                    IERC721(underlying).safeTransferFrom(address(this), msg.sender, tokenIds[i], "");
                }
            }
        }

        emit Redeem(msg.sender, tokenIds, amounts);
    }

    /// @dev To avoid "stack too deep" error.
    struct BatchTransferLocalVars {
        uint256 length;
        uint256 totalAmount;
    }

    function safeBatchTransferFrom(
        address from,
        address to,
        uint256[] calldata ids,
        uint256[] calldata amounts,
        bytes calldata data
    ) public virtual nonReentrant override {
        BatchTransferLocalVars memory vars;
        vars.length = ids.length;
        vars.totalAmount = 0;
        for (uint256 i; i < vars.length; ++i) {
            vars.totalAmount += amounts[i];
        }

        // Check if we can transfer.
        uint transferAllowedResult = ComptrollerInterface(comptroller).transferAllowed(address(this), from, to, vars.totalAmount);
        require(transferAllowedResult == 0, "CNFT: Redeem is not allowed");

        // Transfer cNFT.
        totalBalance[to] += vars.totalAmount;
        totalBalance[from] -= vars.totalAmount;
        super.safeBatchTransferFrom(from, to, ids, amounts, data);
    }

    function safeTransferFrom(
        address from,
        address to,
        uint256 id,
        uint256 amount,
        bytes calldata data
        ) public virtual override {
            // Unused.
            from;
            to;
            id;
            amount;
            data;

            revert("CNFT: Use safeBatchTransferFrom instead");
    }

    modifier validReceive(address operator) {
        require(msg.sender == underlying, "CNFT: This contract can only receive the underlying NFT");
        require(operator == address(this), "CNFT: Only the CNFT contract can be the operator");
        _;
    }

    function onERC721Received(
        address operator,
        address from,
        uint256 tokenId,
        bytes calldata data
    ) public virtual override validReceive(operator) returns (bytes4) {
        return this.onERC721Received.selector;
    }

    function onERC1155Received(
        address operator,
        address from,
        uint256 id,
        uint256 value,
        bytes calldata data
    ) public virtual override validReceive(operator) returns (bytes4) {
        return this.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(
        address operator,
        address from,
        uint256[] calldata ids,
        uint256[] calldata values,
        bytes calldata data
    ) public virtual override validReceive(operator) returns (bytes4) {
        return this.onERC1155BatchReceived.selector;
    }

    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC1155Upgradeable, IERC165) returns (bool) {
        return interfaceId == type(IERC1155Receiver).interfaceId ||
            interfaceId == type(IERC721Receiver).interfaceId ||
            super.supportsInterface(interfaceId);
    }

    function executeCall(
        address to,
        uint256 value,
        bytes memory data,
        uint256 txGas
    ) internal returns (bool success) {
        assembly {
            success := call(
                txGas,
                to,
                value,
                add(data, 0x20),
                mload(data),
                0,
                0
            )
        }
    }

    /**
     * @notice Allows the admin to call arbitrary contracts, as long as the underlying balance is unchanged.
     * @notice This allows the admin to retrieve and distribute NFT airdrops that would otherwise be locked up in this contract.
     * @param to Contract address to call
     * @param value ETH value to send, if any
     * @param data Encoded data to send
     */
    function call(
        address to,
        uint256 value,
        bytes calldata data
    ) external payable nonReentrant onlyOwner returns (bool success) {
        require(to != underlying, "CNFT: Cannot make an arbitrary call to underlying NFT");
        success = executeCall(to, value, data, gasleft());
        emit Call(to, value, data);
    }
}
