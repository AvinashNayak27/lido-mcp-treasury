// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

interface IWstETH is IERC20 {
    function getStETHByWstETH(uint256 wstETHAmount) external view returns (uint256);
    function stEthPerToken() external view returns (uint256);
}

contract StETHTreasury {
    IWstETH public immutable wstETH;
    address public owner;
    address public agent;
    uint256 public principalWstETH;
    uint256 public principalStETHSnapshot;
    uint256 public agentTokenId;

    event Deposited(address indexed from, uint256 wstETHAmount, uint256 stETHSnapshot);
    event YieldSpent(address indexed to, uint256 wstETHAmount, address authorisedBy);
    event AgentUpdated(address indexed newAgent, uint256 erc8004TokenId);
    event OwnershipTransferred(address indexed oldOwner, address indexed newOwner);

    modifier onlyOwner() { require(msg.sender == owner, "StETHTreasury: caller is not owner"); _; }
    modifier onlyAuthorised() { require(msg.sender == owner || msg.sender == agent, "StETHTreasury: caller not authorised"); _; }

    constructor(address _wstETH) { wstETH = IWstETH(_wstETH); owner = msg.sender; }

    function deposit(uint256 amount) external onlyOwner {
        require(amount > 0, "StETHTreasury: zero amount");
        wstETH.transferFrom(msg.sender, address(this), amount);
        principalWstETH += amount;
        principalStETHSnapshot = wstETH.getStETHByWstETH(principalWstETH);
        emit Deposited(msg.sender, amount, principalStETHSnapshot);
    }

    function setAgent(address _agent, uint256 _tokenId) external onlyOwner {
        agent = _agent; agentTokenId = _tokenId; emit AgentUpdated(_agent, _tokenId);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "StETHTreasury: zero address");
        emit OwnershipTransferred(owner, newOwner); owner = newOwner;
    }

    function spendYield(address to, uint256 amount) external onlyAuthorised {
        require(to != address(0), "StETHTreasury: zero recipient");
        uint256 spendable = spendableYield();
        require(amount <= spendable, "StETHTreasury: exceeds available yield");
        wstETH.transfer(to, amount);
        emit YieldSpent(to, amount, msg.sender);
    }

    function totalBalance() external view returns (uint256) { return wstETH.balanceOf(address(this)); }

    function spendableYield() public view returns (uint256) {
        uint256 balance = wstETH.balanceOf(address(this));
        if (balance <= principalWstETH) return 0;
        return balance - principalWstETH;
    }

    function currentStETHValue() external view returns (uint256) { return wstETH.getStETHByWstETH(wstETH.balanceOf(address(this))); }

    function accruedYieldStETH() external view returns (uint256) {
        uint256 current = wstETH.getStETHByWstETH(wstETH.balanceOf(address(this)));
        if (current <= principalStETHSnapshot) return 0;
        return current - principalStETHSnapshot;
    }

    function status() external view returns (uint256 balance, uint256 principal, uint256 spendable, uint256 stETHValue, uint256 stETHPrincipalSnapshot, uint256 rate) {
        balance = wstETH.balanceOf(address(this));
        principal = principalWstETH;
        spendable = balance > principal ? balance - principal : 0;
        stETHValue = wstETH.getStETHByWstETH(balance);
        stETHPrincipalSnapshot = principalStETHSnapshot;
        rate = wstETH.stEthPerToken();
    }
}
