// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {INonfungiblePositionManagerLike, IPonsLaunchFactory} from "../interfaces/ILaunchpad.sol";

/// @dev Test doubles only. Never deployed to a live network.

contract MockERC20 is ERC20 {
    constructor(string memory n, string memory s) ERC20(n, s) {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @notice Stands in for the launch factory: serves one launch record per token.
contract MockFactory is IPonsLaunchFactory {
    mapping(address => LaunchedToken) private _records;

    function set(address token, LaunchedToken calldata record) external {
        _records[token] = record;
    }

    function getLaunchedToken(address token) external view returns (LaunchedToken memory) {
        return _records[token];
    }

    /// @dev Lets a test drive locker functions that carry the onlyFactory modifier.
    function call(address target, bytes calldata data) external returns (bytes memory) {
        (bool ok, bytes memory ret) = target.call(data);
        require(ok, "MockFactory: call failed");
        return ret;
    }
}

/// @notice Stands in for the Uniswap V3 position manager.
contract MockPositionManager is INonfungiblePositionManagerLike {
    address public token0;
    address public token1;
    address private _owner;

    uint256 public pending0;
    uint256 public pending1;

    constructor(address token0_, address token1_, address owner_) {
        token0 = token0_;
        token1 = token1_;
        _owner = owner_;
    }

    function setOwner(address owner_) external {
        _owner = owner_;
    }

    /// @dev Simulates fees accruing to the position, held by this contract.
    function accrue(uint256 amount0, uint256 amount1) external {
        pending0 += amount0;
        pending1 += amount1;
    }

    function ownerOf(uint256) external view returns (address) {
        return _owner;
    }

    function positions(uint256)
        external
        view
        returns (uint96, address, address, address, uint24, int24, int24, uint128, uint256, uint256, uint128, uint128)
    {
        return (0, address(0), token0, token1, 3000, 0, 0, 0, 0, 0, 0, 0);
    }

    function collect(CollectParams calldata params) external payable returns (uint256 amount0, uint256 amount1) {
        amount0 = pending0;
        amount1 = pending1;
        pending0 = 0;
        pending1 = 0;
        if (amount0 != 0) MockERC20(token0).mint(params.recipient, amount0);
        if (amount1 != 0) MockERC20(token1).mint(params.recipient, amount1);
    }

    // unused by the locker
    function createAndInitializePoolIfNecessary(address, address, uint24, uint160)
        external
        payable
        returns (address)
    {
        return address(0);
    }

    function mint(MintParams calldata) external payable returns (uint256, uint128, uint256, uint256) {
        return (0, 0, 0, 0);
    }

    function safeTransferFrom(address, address, uint256) external {}
}
