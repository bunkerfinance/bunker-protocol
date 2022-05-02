import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/types';
import {parseEther} from 'ethers/lib/utils';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {deployments, getNamedAccounts} = hre;
  const { deploy, execute } = deployments;

  const { deployer } = await getNamedAccounts();
  const admin = deployer;

  let baseRatePerYear = 0;
  let multiplierPerYear = parseEther('0.125');
  let jumpMultiplierPerYear = parseEther('1.75');
  let kink = parseEther('0.7');

  const result = await deploy('AggressiveJumpRateModelV2', {
    from: deployer,
    contract: "JumpRateModelV2",
    args: [baseRatePerYear,
          multiplierPerYear,
          jumpMultiplierPerYear,
          kink,
          admin
    ],
    log: true
  });

  // await execute('CEther', { from: deployer, log: true }, '_setInterestRateModel', result.address);
};
export default func;
func.tags = ['AggressiveInterestRateModel'];

// hh deploy --tags AggressiveInterestRateModel
