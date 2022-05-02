import { expect } from "chai";
import { MockContract } from "ethereum-waffle";
import { ethers, waffle } from "hardhat";
import { CNftPriceOracle } from "../typechain-types";
import CNftInterfaceJSON from "../artifacts/contracts/CNftInterface.sol/CNftInterface.json";
import INFTXVaultJSON from "../artifacts/contracts/Oracles/nftx/INFTXVault.sol/INFTXVault.json";
import UniswapV2OracleJSON from "../artifacts/contracts/Oracles/UniswapV2PriceOracle.sol/UniswapV2PriceOracle.json";

describe("CNftPriceOracle", () => {
  const [admin, notAdmin] = waffle.provider.getWallets();
  let cnft1: MockContract;
  let cnft2: MockContract;
  // Fake addresses; their values are insignificant.
  const underlyingNft1 = "0xC8dD7Ee89d319ee6860420804229Ce5e05De9Eb5";
  const underlyingNft2 = "0x9B34475F848B482544dBcFB0903B0B2d412A4AdE";
  let nftxToken1: MockContract;
  let nftxToken2: MockContract;
  const uniswapV2Factory = "0x045C30bef87C8b818957Af63D0518D4d0b6fda23";
  const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
  let mockUniswapV2PriceOracle: MockContract;
  let priceOracle: CNftPriceOracle;

  beforeEach(async () => {
    cnft1 = await waffle.deployMockContract(admin, CNftInterfaceJSON.abi);
    await cnft1.deployed();
    await cnft1.mock.underlying.returns(underlyingNft1);
    cnft2 = await waffle.deployMockContract(admin, CNftInterfaceJSON.abi);
    await cnft2.deployed();
    await cnft2.mock.underlying.returns(underlyingNft2);

    nftxToken1 = await waffle.deployMockContract(admin, INFTXVaultJSON.abi);
    await nftxToken1.deployed();
    nftxToken2 = await waffle.deployMockContract(admin, INFTXVaultJSON.abi);
    await nftxToken2.deployed();

    const priceOracleFactory = await ethers.getContractFactory("CNftPriceOracle");
    mockUniswapV2PriceOracle = await waffle.deployMockContract(admin, UniswapV2OracleJSON.abi);
    priceOracle = await priceOracleFactory.deploy(
      admin.address,
      mockUniswapV2PriceOracle.address,
      uniswapV2Factory,
      WETH
    );
    await priceOracle.deployed();
  });

  it("Initializes correctly", async () => {
    expect(await priceOracle.admin()).to.equal(admin.address);
    expect(await priceOracle.uniswapV2Oracle()).to.equal(mockUniswapV2PriceOracle.address);
    expect(await priceOracle.uniswapV2Factory()).to.equal(uniswapV2Factory);
  });

  describe("Change Admin", () => {
    it("Only admin can call changeAdmin", async () => {
      await expect(priceOracle.connect(notAdmin.address).changeAdmin(notAdmin.address)).to.be
        .reverted;
    });

    it("Calling changeAdmin changes the admin", async () => {
      await priceOracle.changeAdmin(notAdmin.address);
      expect(await priceOracle.admin()).to.equal(notAdmin.address);
    });
  });

  describe("Add Address Mapping", () => {
    it("Only admin can call addAddressMapping", async () => {
      await expect(
        priceOracle
          .connect(notAdmin.address)
          .addAddressMapping([cnft1.address, cnft2.address], [nftxToken1.address, nftxToken2.address])
      ).to.be.reverted;
    });

    it("addAddressMapping inputs cannot be empty", async () => {
      await expect(priceOracle.connect(notAdmin.address).addAddressMapping([], [])).to.be.reverted;
    });

    it("addAddressMapping inputs must have equal length", async () => {
      await expect(
        priceOracle
          .connect(notAdmin.address)
          .addAddressMapping([cnft1.address], [nftxToken1.address, nftxToken2.address])
      ).to.be.reverted;
      await expect(
        priceOracle
          .connect(notAdmin.address)
          .addAddressMapping([cnft1.address, cnft2.address], [nftxToken1.address])
      ).to.be.reverted;

      await priceOracle.addAddressMapping(
        [cnft1.address, cnft2.address],
        [nftxToken1.address, nftxToken2.address]
      );
      expect(await priceOracle.underlyingNftxTokenAddress(cnft1.underlying())).to.equal(nftxToken1.address);
      expect(await priceOracle.underlyingNftxTokenAddress(cnft2.underlying())).to.equal(nftxToken2.address);
    });
  });

  describe("Get Underlying price", () => {
    beforeEach(async () => {
      await priceOracle.addAddressMapping([cnft1.address], [nftxToken1.address]);
      await nftxToken1.mock.mintFee.returns(0);
    });

    it("Reverts if mapping does not exist", async () => {
      await expect(priceOracle.getUnderlyingPrice(cnft2.address)).to.be.reverted;
    });

    it("Calculates price correctly", async () => {
      const price = ethers.constants.WeiPerEther;
      await mockUniswapV2PriceOracle.mock.price.returns(price);

      // Test that the contract reports a 25% vault fee properly.
      await nftxToken1.mock.mintFee.returns(ethers.constants.WeiPerEther.div(4));
      expect(await priceOracle.getUnderlyingPrice(cnft1.address)).to.equal(price.mul(3).div(4));
    });

    it("Non-admins can call getUnderlyingPrice", async () => {
      const price = ethers.constants.WeiPerEther;
      await mockUniswapV2PriceOracle.mock.price.returns(price);
      expect(await priceOracle.connect(notAdmin.address).getUnderlyingPrice(cnft1.address)).to.equal(
        price
      );
    });
  });
});
