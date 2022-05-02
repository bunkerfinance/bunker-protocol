import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";
import { BigNumber } from "ethers";

async function main() {
  // const { getNamedAccounts, network } = hre;
  const user = (await ethers.getSigners())[0].address;

  const punk = await ethers.getContractAt(
    "CryptoPunksMarket",
    "0xb47e3cd837dDF8e4c57F05d70Ab865de6e193BBB"
  );

  for (let i = 6529; i < 6540; ++i) {
    const victim = await punk.punkIndexToAddress(i);
    await ethers.provider.send('hardhat_impersonateAccount', [victim]);

    try {
      const signer = await ethers.getSigner(victim);

      await punk.connect(signer).transferPunk(user, i);

      console.log(
        `Deployer now has ${await punk.balanceOf(user)} CryptoPunks`
      );
    } catch (e) {
      console.log(e);
      console.log(
        "did not steal punk -- make sure to run hardhat-fork if you want to interact with real punks"
      );
    }
  }

  await ethers.provider.send('hardhat_impersonateAccount', ["0x72a53cdbbcc1b9efa39c834a540550e23463aacb"]);

  try {
    const signer = await ethers.getSigner(
      "0x72a53cdbbcc1b9efa39c834a540550e23463aacb"
    );

    const usdc = await ethers.getContractAt(
      "ERC20Mock",
      "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"
    );
    await usdc
      .connect(signer)
      .transfer(user, BigNumber.from("1000000000000"));

    console.log(
      `Deployer now has ${(await usdc.balanceOf(user)).div(1000000)} USDC`
    );
  } catch (e) {
    console.log(e);
    console.log(
      "did not steal punk -- make sure to run hardhat-fork if you want to interact with real punks"
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
