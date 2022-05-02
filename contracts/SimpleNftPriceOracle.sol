// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.5.16;

import "./NftPriceOracle.sol";

contract SimpleNftPriceOracle is NftPriceOracle {
    mapping(address => uint) prices;
    event PricePosted(address asset, uint previousPriceMantissa, uint requestedPriceMantissa, uint newPriceMantissa);

    function getUnderlyingPrice(CNftInterface cNft) public view returns (uint) {
        return prices[address(cNft.underlying())];
    }

    function setUnderlyingPrice(CNftInterface cNft, uint underlyingPriceMantissa) public {
        address asset = address(cNft.underlying());
        emit PricePosted(asset, prices[asset], underlyingPriceMantissa, underlyingPriceMantissa);
        prices[asset] = underlyingPriceMantissa;
    }

    function setDirectPrice(address asset, uint price) public {
        emit PricePosted(asset, prices[asset], price, price);
        prices[asset] = price;
    }

    // v1 price oracle interface for use as backing of proxy
    function assetPrices(address asset) external view returns (uint) {
        return prices[asset];
    }

    function compareStrings(string memory a, string memory b) internal pure returns (bool) {
        return (keccak256(abi.encodePacked((a))) == keccak256(abi.encodePacked((b))));
    }
}
