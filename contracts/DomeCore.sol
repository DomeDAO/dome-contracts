// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

/// Openzeppelin imports
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import "@openzeppelin/contracts/interfaces/IERC4626.sol";

/// Local imports
import "./TestSaveMStable.sol";
import "hardhat/console.sol";

contract DomeCore is ERC4626, Ownable {

    using SafeERC20 for IERC20;

    struct BeneficiaryInfo {
        //string name;
        //string url;
        //string logo;
        //string description;
        string beneficiaryCID;
        address wallet;
        uint256 percentage;
    }

    //string public _name;
    //string public _description;
    //string public _shareTokenName;
    //address public _owner;
    string public _domeCID;
    address public _systemOwner;

    uint256 public _systemOwnerPercentage;

    //Amount Of Underlying assets owned by depositor, interested + principal
    uint256 public underlyingAssetsOwnedByDepositor;

    BeneficiaryInfo[] public beneficiaries;

    /// contracts
    IERC20 public stakingcoin;
    TestSaveMStable public testMStable; //todo(changed)

    event Staked(address indexed staker, uint256 amount, uint256 timestamp);
    event Unstaked(
        address indexed unstaker,
        uint256 totalAmount,
        uint256 unstakedAmount,
        uint256 timestamp
    );

    /// Constructor
    constructor(
        //string memory name,
        //string memory description,
        string memory domeCID,
        string memory shareTokenName,
        string memory shareTokenSymbol,
        address stakingCoinAddress,
        address testMstableAddress,
        address owner,
        address systemOwner,
        uint256 systemOwnerPercentage,
        BeneficiaryInfo[] memory beneficiariesInfo
    )
        ERC20(shareTokenName, shareTokenSymbol)
        ERC4626(IERC20Metadata(stakingCoinAddress))
    {
        stakingcoin = IERC20(stakingCoinAddress);
        _domeCID = domeCID;
        //_name = name;
        //_description = description;
        //_shareTokenName = shareTokenName;
        for (uint256 i; i < beneficiariesInfo.length; i++) {
            beneficiaries.push(beneficiariesInfo[i]);
        }
        transferOwnership(owner);
        testMStable = TestSaveMStable(testMstableAddress);
        stakingcoin.approve(address(testMStable), 2**256 - 1);
        //_owner = owner;
        _systemOwner = systemOwner;
        _systemOwnerPercentage = systemOwnerPercentage;
    }

    function decimals()
        public
        pure
        override(ERC20, IERC20Metadata)
        returns (uint8)
    {
        return 6;
    }

    function getBeneficiariesInfo()
        public
        view
        returns (BeneficiaryInfo[] memory)
    {
        return beneficiaries;
    }

    function getUnderlyingAssetsOwnedByDepositor()
        public
        view
        returns (uint256)
    {
        return underlyingAssetsOwnedByDepositor;
    }

    function totalBalance() public view returns (uint256) {
        return testMStable.balanceOfUnderlying(address(this));
    }

    function setApproveForDome(uint256 amount) public onlyOwner {
        stakingcoin.approve(address(testMStable), amount);
    }

    function setMstable(address addr) external onlyOwner {  //todo  =>remove
        testMStable = TestSaveMStable(addr);
    }

    function deposit(uint256 assets, address receiver)
        public
        override
        returns (uint256)
    {
        uint256 shares = previewDeposit(assets);
        _deposit(msg.sender, receiver, assets, shares);
        return shares;
    }

    function mint(uint256 shares, address receiver)
        public
        virtual
        override
        returns (uint256)
    {
        uint256 assets = previewMint(shares);
        _deposit(msg.sender, receiver, assets, shares);
        return assets;
    }

    function withdraw(
        uint256 assets,
        address receiver,
        address owner
    ) public override returns (uint256) {
        uint256 shares = previewWithdraw(assets);
        _withdraw(msg.sender, receiver, owner, assets, shares);
        return shares;
    }

    function redeem(
        uint256 shares,
        address receiver,
        address owner
    ) public virtual override returns (uint256) {
        uint256 assets = previewRedeem(shares);
        _withdraw(msg.sender, receiver, owner, assets, shares);
        return assets;
    }

    function claimInterests() public returns (uint256) {
        uint256 reward = testMStable.balanceOfUnderlying(address(this)) -
            underlyingAssetsOwnedByDepositor;
        uint256 systemFee = (reward * _systemOwnerPercentage) / 100;
        uint256 beneficiariesReward = ((reward - systemFee) *
            beneficiariesPercentage()) / 100;
        testMStable.withdraw(
            beneficiariesReward + systemFee,
            address(this),
            address(this)
        );
        stakingcoin.safeTransfer(_systemOwner, systemFee);
        uint256 totalTransfered = systemFee;
        uint256 toTransfer;
        for (uint256 i; i < beneficiaries.length; i++) {
            if (i == beneficiaries.length - 1) {
                toTransfer = beneficiariesReward + systemFee - totalTransfered;
                stakingcoin.safeTransfer(beneficiaries[i].wallet, toTransfer);
                totalTransfered += toTransfer;
            } else {
                toTransfer =
                    ((reward - systemFee) * beneficiaries[i].percentage) /
                    100;
                stakingcoin.safeTransfer(beneficiaries[i].wallet, toTransfer);
                totalTransfered += toTransfer;
            }
        }
        underlyingAssetsOwnedByDepositor += (reward - totalTransfered);
        return totalTransfered;
    }

    function beneficiariesPercentage()
        public
        view
        returns (uint256 totalPercentage)
    {
        for (uint256 i; i < beneficiaries.length; i++) {
            totalPercentage += beneficiaries[i].percentage;
        }
    }

    function balanceOfUnderlying(address user) public view returns (uint256) {
        if (balanceOf(user) == 0) {
            return 0;
        } else {
            return (balanceOf(user) * estimateReward()) / totalSupply();
        }
    }

    function convertToAssets(uint256 shares)
        public
        view
        virtual
        override
        returns (uint256 assets)
    {
        if (totalSupply() == 0) {
            return shares;
        } else {
            return (shares * estimateReward()) / totalSupply();
        }
    }

    function convertToShares(uint256 assets)
        public
        view
        virtual
        override
        returns (uint256 shares)
    {
        if (totalSupply() == 0) {
            return assets;
        } else {
            return (assets * totalSupply()) / estimateReward();
        }
    }

    function maxWithdraw(address owner)
        public
        view
        virtual
        override
        returns (uint256)
    {
        return balanceOfUnderlying(owner);
    }

    function previewDeposit(uint256 assets)
        public
        view
        virtual
        override
        returns (uint256)
    {
        return convertToShares(assets);
    }

    function previewMint(uint256 shares)
        public
        view
        virtual
        override
        returns (uint256)
    {
        return convertToAssets(shares);
    }

    function previewWithdraw(uint256 assets)
        public
        view
        virtual
        override
        returns (uint256)
    {
        return convertToShares(assets);
    }

    function previewRedeem(uint256 shares)
        public
        view
        virtual
        override
        returns (uint256)
    {
        return convertToAssets(shares);
    }

    function estimateReward() internal view returns (uint256) {
        uint256 totalReward = testMStable.balanceOfUnderlying(address(this));
        uint256 reward;
        if (totalReward > underlyingAssetsOwnedByDepositor) {
            uint256 newReward = totalReward - underlyingAssetsOwnedByDepositor;
            uint256 systemFee = (newReward * _systemOwnerPercentage) / 100;
            uint256 beneficiariesInterest = ((newReward - systemFee) *
                beneficiariesPercentage()) / 100;
            reward = totalReward - systemFee - beneficiariesInterest;
        } else {
            reward = totalReward;
        }
        return reward;
    }

    function _deposit(
        address caller,
        address receiver,
        uint256 assets,
        uint256 shares
    ) internal virtual override {
        require(assets > 0, "The assets must be greater than 0");
        require(
            assets <= stakingcoin.allowance(caller, address(this)),
            "There is no as much allowance for staking coin"
        );
        require(
            assets <= stakingcoin.balanceOf(caller),
            "There is no as much balance for staking coin"
        );

        stakingcoin.safeTransferFrom(caller, address(this), assets);

        testMStable.deposit(assets, address(this));

        underlyingAssetsOwnedByDepositor += assets;

        _mint(receiver, shares);

        emit Staked(receiver, assets, block.timestamp);
    }

    function _withdraw(
        address caller,
        address receiver,
        address owner,
        uint256 assets,
        uint256 shares
    ) internal virtual override {
        require(owner == caller, "Caller is not owner");
        require(0 < assets, "The amount must be greater than 0");
        uint256 liquidityAmount = balanceOf(owner);
        require(shares <= liquidityAmount, "You dont have enough balance");

        uint256 claimed = claimInterests();

        // uint256 sharesInMStable = testMStable.convertToShares(assets);
        // testMStable.redeem(sharesInMStable, receiver, address(this));

        testMStable.withdraw(assets, receiver, address(this));

        //console.log(underlyingAssetsOwnedByDepositor);

        underlyingAssetsOwnedByDepositor -=
            (shares * underlyingAssetsOwnedByDepositor) /
            totalSupply(); //todo ==>> assets

        //console.log(underlyingAssetsOwnedByDepositor);

        _burn(msg.sender, shares);

        emit Unstaked(caller, assets + claimed, assets, block.timestamp);
    }
}
