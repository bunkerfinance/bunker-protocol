// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

// Simple contract used to test making arbitrary contract calls on behalf of cNFT.
contract Counter {
    uint256 public count;

    function increaseCount(uint256 delta) external {
        count += delta;
    }
}
