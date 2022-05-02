import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy, execute, get } = deployments;

  const { deployer } = await getNamedAccounts();

  const deployResult = await deploy('PriceOracle', {
    from: deployer,
    contract: 'PriceOracleImplementation',
    log: true,
    args: [
      (await get('CEther')).address,
    ],
  });
  await execute('Comptroller', { from: deployer, log: true }, '_setPriceOracle', deployResult.address);
};
export default func;
