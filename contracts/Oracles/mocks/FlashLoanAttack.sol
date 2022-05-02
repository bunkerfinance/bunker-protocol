// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "./MockUniswapV2Pair.sol";
import "../UniswapV2PriceOracle.sol";

contract FlashLoanAttack {
    function attack(
        address pair,
        address oracle,
        uint112 reserve0,
        uint112 reserve1,
        address token,
        address baseToken,
        address factory
    ) external returns (uint) {
        (uint112 originalReserve0, uint112 originalReserve1,) = MockUniswapV2Pair(pair).getReserves();
        MockUniswapV2Pair(pair).setReserves(reserve0, reserve1);
        uint256 newPrice = UniswapV2PriceOracle(oracle).price(token, baseToken, factory);
        MockUniswapV2Pair(pair).setReserves(originalReserve0, originalReserve1);
        return newPrice;
    }
}
