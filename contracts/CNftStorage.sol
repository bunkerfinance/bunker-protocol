// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.5.16 <0.9.0;

contract CNftStorage {
    /**
     * @notice Indicator that this is a CNft contract (for inspection)
     */
    bool public constant isCNft = true;

    /**
     * @notice The address of the CNft's Comptroller.
     */
    address public comptroller;

    /**
     * @notice The underlying NFT contract.
     */
    address public underlying;

    /**
     * @notice Whether `underlying` represents a CryptoPunk.
     */
    bool public isPunk;

    /**
     * @notice Whether `underlying` represents an ERC-1155.
     */
    bool public is1155;

    /**
     * @notice Mapping from user to number of tokens.
     */
    mapping(address => uint256) public totalBalance;
}
