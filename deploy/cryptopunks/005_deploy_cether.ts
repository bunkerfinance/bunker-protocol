import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import {parseEther} from 'ethers/lib/utils';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy, execute } = deployments;

  const { deployer } = await getNamedAccounts();

  const interestRateAddress = (await deployments.get("JumpRateModelV2")).address;
  const comptrollerAddress = (await deployments.get("Comptroller")).address;
  const deployResult = await deploy("CEther", {
    from: deployer,
    log: true,
    args: [
      comptrollerAddress,
      interestRateAddress,
      parseEther("10000000000"),
      "Bunker Ether (CryptoPunks)",
      "bPUNK-ETH",
      8,
      deployer,
    ],
  });

  if (deployResult.newlyDeployed) {
    await execute('Comptroller', { from: deployer, log: true }, '_supportMarket', deployResult.address);
  }
};
export default func;
func.dependencies = ['Comptroller'];
