import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/types';
import {parseEther} from 'ethers/lib/utils';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment, id?: string) {
  const {deployments, getNamedAccounts} = hre;
  const {deploy, execute, get, save} = deployments;

  const {deployer} = await getNamedAccounts();

  const comptrollerImpl = await deploy('Comptroller_Implementation', {
    from: deployer,
    contract: 'Comptroller',
    log: true
  });

  const unitrollerAddress = (await get('Unitroller')).address;
  // update Comptroller ABI
  await save('Comptroller', {
    abi: comptrollerImpl.abi,
    address: unitrollerAddress
  });

  if (comptrollerImpl.newlyDeployed) {
    await execute('Unitroller', { from: deployer }, '_setPendingImplementation', comptrollerImpl.address);
    await execute('Comptroller_Implementation', { from: deployer }, '_become', unitrollerAddress);
    const closeFactor = parseEther('1');
    const liquidationIncentive = parseEther('1.125');

    await execute('Comptroller', { from: deployer, log: true }, '_setCloseFactor', closeFactor);
    await execute('Comptroller', { from: deployer, log: true }, '_setLiquidationIncentive', liquidationIncentive);
  }
};
export default func;
func.tags = ['Comptroller'];
func.dependencies = ['Unitroller'];
