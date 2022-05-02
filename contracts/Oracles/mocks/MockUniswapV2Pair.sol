// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

/// @notice Mock UniswapV2Pair contract that partially implements IUniswapV2Pair.
contract MockUniswapV2Pair {
    uint112 private reserve0;
    uint112 private reserve1;
    uint32 private blockTimestampLast;

    uint256 public price0CumulativeLast;
    uint256 public price1CumulativeLast;

    /// @dev Similar to _update in UniswapV2Pair.
    function setReserves(uint112 balance0, uint112 balance1) external {
        unchecked {
            uint32 blockTimestamp = uint32(block.timestamp % 2**32);
            uint32 timeElapsed = blockTimestamp - blockTimestampLast; // overflow is desired
            if (timeElapsed > 0 && reserve0 != 0 && reserve1 != 0) {
                price0CumulativeLast += uint256((uint224(reserve1) << 112) / reserve0) * timeElapsed;
                price1CumulativeLast += uint256((uint224(reserve0) << 112) / reserve1) * timeElapsed;
            }
            reserve0 = balance0;
            reserve1 = balance1;
            blockTimestampLast = blockTimestamp;
        }
    }

    function getReserves() public view returns (uint112 _reserve0, uint112 _reserve1, uint32 _blockTimestampLast) {
        _reserve0 = reserve0;
        _reserve1 = reserve1;
        _blockTimestampLast = blockTimestampLast;
    }
}
