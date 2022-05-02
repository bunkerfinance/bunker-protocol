import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/types';
import {parseEther} from 'ethers/lib/utils';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {deployments, getNamedAccounts} = hre;
  const {deploy} = deployments;

  const { deployer } = await getNamedAccounts();
  const admin = deployer;

  // Parameters taken from Compound's deployment at 0xd8ec56013ea119e7181d231e5048f90fbbe753c0
  // which they use for cUSDC's interest rate.
  let baseRatePerYear = 0;
  let multiplierPerYear = parseEther('0.1');
  let jumpMultiplierPerYear = parseEther('1.09');
  let kink = parseEther('0.8');

  await deploy('JumpRateModelV2', {
    from: deployer,
    args: [baseRatePerYear,
          multiplierPerYear,
          jumpMultiplierPerYear,
          kink,
          admin
    ],
    log: true
  });
};
export default func;
