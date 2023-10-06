//SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC4626, IERC20, Context, ERC20, IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {DomeBase, SafeERC20} from "./base/DomeBase.sol";

struct BeneficiaryInfo {
    string beneficiaryCID;
    address wallet;
    uint16 percent; // Percentage has 2 deciaml points, 100% == 10.000
}

struct DomeInfo {
    string CID;
    string tokenName;
    string tokenSymbol;
}

contract Dome is ERC20, IERC4626, DomeBase {
    using SafeERC20 for IERC20;

    IERC4626 public immutable yieldProtocol;
    uint256 public totalAssets;

    address public _systemOwner;
    uint8 public _systemOwnerPercentage;

    string public _domeCID;

    BeneficiaryInfo[] public beneficiaries;

    event YieldClaim(address _yieldProtocol, uint256 _amount);
    event Distribute(address indexed beneficiary, uint256 amount);

    constructor(
        DomeInfo memory domeInfo,
        BeneficiaryInfo[] memory beneficiariesInfo,
        address _yieldProtocol,
        address systemOwner,
        uint16 systemOwnerPercent
    )
        ERC20(domeInfo.tokenName, domeInfo.tokenSymbol)
        DomeBase(systemOwner, systemOwnerPercent)
    {
        _domeCID = domeInfo.CID;
        yieldProtocol = IERC4626(_yieldProtocol);

        uint16 _totalPercent = 0;
        for (uint8 i; i < beneficiariesInfo.length; i++) {
            beneficiaries.push(beneficiariesInfo[i]);
            _totalPercent += beneficiariesInfo[i].percent;
        }
        require(_totalPercent == 10000, "Beneficiaries percent check failed");

        // Initial max approve to yieldProtocol
        _approveToken(asset(), _yieldProtocol, type(uint256).max);
    }

    function decimals()
        public
        view
        override(ERC20, IERC20Metadata)
        returns (uint8)
    {
        return IERC20Metadata(yieldProtocol.asset()).decimals();
    }

    function getBeneficiariesInfo()
        public
        view
        returns (BeneficiaryInfo[] memory)
    {
        return beneficiaries;
    }

    function asset() public view returns (address) {
        return yieldProtocol.asset();
    }

    function totalShares() public view returns (uint256) {
        return _getBalance(address(yieldProtocol));
    }

    function deposit(
        uint256 assets,
        address receiver
    ) external override returns (uint256) {
        assets = _pullTokens(asset(), assets);
        uint256 shares = yieldProtocol.previewDeposit(assets);

        _deposit(_msgSender(), receiver, assets, shares);

        return shares;
    }

    function mint(
        uint256 shares,
        address receiver
    ) external override returns (uint256) {
        uint256 assets = yieldProtocol.previewMint(shares);
        assets = _pullTokens(asset(), assets);

        _deposit(_msgSender(), receiver, assets, shares);

        return assets;
    }

    function _deposit(
        address caller,
        address receiver,
        uint256 assets,
        uint256 shares
    ) internal {
        require(shares > 0, "Zero share mint");

        uint256 yieldSharesBalanceBefore = _getBalance(address(yieldProtocol));
        yieldProtocol.mint(shares, address(this));
        uint256 yieldSharesReceived = _getBalance(address(yieldProtocol)) -
            yieldSharesBalanceBefore;

        require(
            yieldSharesReceived > 0,
            "Doesn't get anything from yield protocol"
        );

        // We mint our wrapped share only after share validation
        _mint(receiver, assets);
        totalAssets += assets;

        emit Deposit(caller, receiver, assets, yieldSharesReceived);
    }

    function withdraw(
        uint256 assets,
        address receiver,
        address owner
    ) external override returns (uint256) {
        uint256 shares = yieldProtocol.previewWithdraw(assets);
        _withdraw(_msgSender(), receiver, owner, assets, shares);

        return shares;
    }

    function redeem(
        uint256 shares,
        address receiver,
        address owner
    ) public virtual override returns (uint256) {
        uint256 assets = yieldProtocol.previewRedeem(shares);
        _withdraw(_msgSender(), receiver, owner, assets, shares);

        return assets;
    }

    function _withdraw(
        address caller,
        address receiver,
        address owner,
        uint256 assets,
        uint256 shares
    ) internal {
        if (caller != owner) {
            _decreaseAllowance(owner, caller, shares);
        }

        _burn(owner, assets);
        totalAssets -= assets;

        yieldProtocol.withdraw(assets, receiver, address(this));

        emit Withdraw(caller, receiver, owner, assets, shares);
    }

    function _decreaseAllowance(
        address owner,
        address spender,
        uint256 amount
    ) internal {
        uint256 currentAllowance = allowance(owner, spender);
        if (currentAllowance != type(uint256).max) {
            require(
                currentAllowance >= amount,
                "ERC20: insufficient allowance"
            );
            unchecked {
                _approve(owner, spender, currentAllowance - amount);
            }
        }
    }

    function availableYield() public view returns (uint256) {
        uint256 sharesBalance = _getBalance(address(yieldProtocol));
        uint256 domeAssetBalance = yieldProtocol.convertToAssets(sharesBalance);

        return domeAssetBalance - totalAssets;
    }

    function _distribute(uint256 amount) internal {
        for (uint256 i; i < beneficiaries.length; i++) {
            uint256 distributeAmout = (amount * beneficiaries[i].percent) /
                10000;

            IERC20(asset()).safeTransfer(
                beneficiaries[i].wallet,
                distributeAmout
            );

            emit Distribute(beneficiaries[i].wallet, distributeAmout);
        }
    }

    function claimYieldAndDistribute() external {
        uint256 withdrawAssetAmount = availableYield();

        yieldProtocol.withdraw(
            withdrawAssetAmount,
            address(this),
            address(this)
        );

        withdrawAssetAmount = _subtractFees(asset(), withdrawAssetAmount);

        _distribute(withdrawAssetAmount);
        emit YieldClaim(address(yieldProtocol), withdrawAssetAmount);
    }

    /// TODO: Need to be discussed...

    function convertToShares(
        uint256 assets
    ) external view returns (uint256 shares) {
        return yieldProtocol.convertToShares(assets);
    }

    function convertToAssets(
        uint256 shares
    ) external view returns (uint256 assets) {
        return yieldProtocol.convertToAssets(shares);
    }

    function maxDeposit(
        address receiver
    ) external view returns (uint256 maxAssets) {
        return yieldProtocol.maxDeposit(receiver);
    }

    function previewDeposit(
        uint256 assets
    ) external view returns (uint256 shares) {
        return yieldProtocol.previewDeposit(assets);
    }

    function maxMint(
        address receiver
    ) external view returns (uint256 maxShares) {
        return yieldProtocol.maxMint(receiver);
    }

    function previewMint(
        uint256 shares
    ) external view returns (uint256 assets) {
        return yieldProtocol.previewMint(shares);
    }

    function maxWithdraw(
        address owner
    ) external view returns (uint256 maxAssets) {
        return yieldProtocol.maxWithdraw(owner);
    }

    function previewWithdraw(
        uint256 assets
    ) external view returns (uint256 shares) {
        return yieldProtocol.previewWithdraw(assets);
    }

    function maxRedeem(
        address owner
    ) external view returns (uint256 maxShares) {
        return yieldProtocol.maxRedeem(owner);
    }

    function previewRedeem(
        uint256 shares
    ) external view returns (uint256 assets) {
        return yieldProtocol.previewRedeem(shares);
    }
}
