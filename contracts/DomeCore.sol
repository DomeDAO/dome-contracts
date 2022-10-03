// SPDX-License-Identifier: MIT

pragma solidity ^0.8.13;

/// Openzeppelin imports
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// Local imports
import "./IDomeCore.sol";
import "./LiquidityToken.sol";
import "./IStrategy.sol";
import "hardhat/console.sol";

contract DomeCore is IDomeCore, Ownable {
    
    struct Staking {
        uint104 amount;
    }

    struct BeneficiariesInfo {
        string name;
        string url;
        string logo;
        address wallet;
        string description;
        uint32 percentage;
    }

    using SafeERC20 for IERC20;
    using SafeERC20 for LiquidityToken; //The users receive Liqudity Tokens to keep track of their stake in the USDC pool

    string public name;
    string public description;
    string public lpTokenName;

    mapping(address => Staking) private userStaking;
    mapping(address => uint256) private interests;
    //mapping(address => BenInfo[]) public beneficiaries;
    BeneficiariesInfo[] public beneficiaries;

    /// contracts
    LiquidityToken public liquidityToken;
    IStrategy public strategy;
    IERC20 public stakingcoin;


    /// Constructor
    constructor(
        address stakingcoinAddress,
        address owner,
        string memory _name,
        string memory _description,
        string memory _lpTokenName,
        BeneficiariesInfo[] memory beneficiariesInfo
    ) {
        liquidityToken = new LiquidityToken();
        stakingcoin = IERC20(stakingcoinAddress);
        name = _name;
        description = _description;
        lpTokenName = _lpTokenName;
        beneficiaries = beneficiariesInfo;
        transferOwnership(owner);
    }

    // function stake(uint104 amount) external {

    // }

    function stake(uint104 amount) external {
        require(amount > 0, "The amount must be greater than 0.");
        uint256 allowance = stakingcoin.allowance(msg.sender, address(this));
        require(
            amount <= allowance,
            "There is no as much allowance for staking coin."
        );
        uint256 balance = stakingcoin.balanceOf(msg.sender);
        require(
            amount <= balance,
            "There is no as much balance for staking coin."
        );


        uint256 totalRewardBeforeStake = strategy.estimateReward(address(this)); 

        stakingcoin.safeTransferFrom(msg.sender, address(this), amount);

        ////Stakes into Yearn
        (bool success, bytes memory result) = address(strategy).delegatecall(
            abi.encodeWithSignature(
                "farm(address,uint256)",
                stakingcoin,
                amount
            )
        );
        require(success, "Staking to yearn failed");
        uint256 stakingCoinAmount = abi.decode(result, (uint256));

        uint256 liquidityAmount;
        uint256 totalReward = strategy.estimateReward(address(this));
        uint256 rewarDdifference = totalReward - totalRewardBeforeStake;        
        if (
            totalReward == 0 ||
            totalReward <= stakingCoinAmount ||                             
            liquidityToken.totalSupply() == 0
        ) {
            liquidityAmount = rewarDdifference;                             
        } else {
            liquidityAmount =
                (rewarDdifference * liquidityToken.totalSupply()) /      
                (totalReward - rewarDdifference);                           
        }

        liquidityToken.mint(msg.sender, liquidityAmount);
        Staking storage staking = userStaking[msg.sender];
        staking.amount += amount;
    }

    function unstake(uint104 amount) external {
        require(0 < amount, "The amount must be greater than 0.");
        uint256 totalReward = strategy.estimateReward(address(this));
        (uint256 gross, uint256 net, uint256 fee, ) = estimateRewardDetails(msg.sender);
        

        // net =! 0;
        Staking storage staking = userStaking[msg.sender];
        uint256 wantedGross = (amount * gross) / staking.amount;

        uint256 liquidityAmount = liquidityToken.balanceOf(msg.sender);

        uint256 lToBurn = (wantedGross * liquidityToken.totalSupply()) /
            totalReward;
        if (liquidityAmount < lToBurn) {
            lToBurn = liquidityAmount;
        }

        takeReward(wantedGross); // yearn => DomeCore
        uint256 amountForSave = (wantedGross - amount) * 90 / 100;
        uint256 savedInterests = saveInterests((amountForSave));
        stakingcoin.safeTransfer(msg.sender, amount + (amountForSave - savedInterests)); // DomeCore => user
        liquidityToken.burn(msg.sender, lToBurn);
    }

    function withdraw(address tokenAddress)
        external
        onlyOwner
    {
        IERC20 token = IERC20(tokenAddress);
        uint256 amountToTransfer = token.balanceOf(address(this));
        token.transfer(msg.sender, amountToTransfer);
    }

    function claimInterests() external{
        require(interests[msg.sender] > 0, "You don't have interst");
        stakingcoin.safeTransfer(msg.sender, interests[msg.sender]);
        interests[msg.sender] = 0;
    }

    function saveInterests(uint256 total) internal returns (uint256){
        uint256 totalSaved;
        for(uint256 i; i < beneficiaries.length; i++) {
            interests[beneficiaries[i].wallet] += total * beneficiaries[i].percentage / 100;
            totalSaved += total * beneficiaries[i].percentage / 100;
        }
        return totalSaved;
    }



    function stakingAmount(address lpProvider) external view returns (uint104) {
        Staking storage staking = userStaking[lpProvider];
        return staking.amount;
    }


    function estimateNetReward(address lpProvider)
        external
        view
        returns (uint256)
    {
        uint256 grossReward = estimateGrossReward(lpProvider);
        Staking storage staking = userStaking[lpProvider];
        if(grossReward <= staking.amount) {
            return grossReward;
        }
        else {
            uint256 profit = grossReward - staking.amount;
            uint256 fee = profit * 10 / 100;
            //uint256 fee = (beneficiariesPercentage() * (profit - ownerPercentage)) / 100;
            uint256 netReward = grossReward - fee;
            return netReward;
        }
    }

    function beneficiariesPercentage() public view returns (uint256 totalPercentage){
        for(uint256 i; i < beneficiaries.length; i++){
            totalPercentage += beneficiaries[i].percentage;
        }
    }

    function estimateRewardDetails(address lpProvider)
        public
        view
        returns (
            uint256 gross,
            uint256 net,
            uint256 profit,
            uint256 fee
        )
    {
        gross = estimateGrossReward(lpProvider);
        Staking storage staking = userStaking[lpProvider];
        uint256 userStakingAmount = staking.amount;
        if(gross <= userStakingAmount) {
            profit = 0;
            fee = 0;
            net = gross;
        }
        else {
            profit = gross - userStakingAmount;
            uint256 fee = profit * 10 / 100;
            //uint256 fee = (beneficiariesPercentage() * (profit - ownerPercentage)) / 100;
            net = gross - fee;
        }
    }

    // function ownerCurrentPercentage(uint256 index) public view returns (uint32) {
    //     return beneficiaries[index].percentage;
    // }

    /// public functions
    function estimateGrossReward(address lpProvider)
        public
        view
        returns (uint256)
    {
        if (liquidityToken.totalSupply() == 0) {
            return 0;
        }
        uint256 totalReward = strategy.estimateReward(address(this));
        uint256 userReward = uint256(
            (totalReward * liquidityToken.balanceOf(lpProvider)) /
                liquidityToken.totalSupply()
        );
        return userReward;
    }

    /// private functions
    function takeReward(uint256 amount) private {
        if (0 != amount) {
            (bool success, ) = address(strategy).delegatecall(
                abi.encodeWithSignature(
                    "takeReward(address,uint256)",
                    address(this),
                    amount
                )
            );
            require(success, "Failed to take the stakes from YEARN");
        }
    }
}
