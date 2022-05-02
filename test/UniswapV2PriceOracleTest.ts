import { expect } from "chai";
import { MockContract } from "ethereum-waffle";
import { ethers, waffle } from "hardhat";
import UniV2FactoryJSON from "../artifacts/contracts/Oracles/uniswapv2/IUniswapV2Factory.sol/IUniswapV2Factory.json";
import Erc20JSON from "../artifacts/@openzeppelin/contracts/token/ERC20/ERC20.sol/ERC20.json";
import { MockUniswapV2Pair, UniswapV2PriceOracle } from "../typechain-types";
import { BigNumber, BigNumberish } from "ethers";
import { Decimal } from "decimal.js";

describe("UniswapV2PriceOracle", () => {
  const admin = waffle.provider.getWallets()[0];
  let pair1: MockUniswapV2Pair;
  let pair2: MockUniswapV2Pair;
  let oracle: UniswapV2PriceOracle;

  beforeEach(async () => {
    const pairFactory = await ethers.getContractFactory("MockUniswapV2Pair");

    const initializePair = async () => {
      // Initialize with some hardcoded values.
      const pair = await pairFactory.deploy();
      await pair.deployed();
      const reserve0 = 1;
      const reserve1 = 2;
      let tx = await pair.setReserves(reserve0, reserve1);
      await tx.wait();
      // Need to set reserves more than once to start the price accumulators.
      tx = await pair.setReserves(reserve0, reserve1);
      await tx.wait();
      return pair;
    };
    pair1 = await initializePair();
    pair2 = await initializePair();

    const oracleFactory = await ethers.getContractFactory("UniswapV2PriceOracle");
    oracle = await oracleFactory.deploy();
    await oracle.deployed();
  });

  // We can only get the returned value by simulating the transaction, so we define a helper
  // function to simulate the transaction, execute the transaction, and return the value from the
  // simulated transaction.
  const update = async (addresses: string[]) => {
    let returnValue = await oracle.callStatic.update(addresses);
    if (returnValue.isZero()) {
      return returnValue;
    }
    const tx = await oracle.update(addresses);
    const receipt = await tx.wait();
    expect(receipt.status).to.equal(1);
    return returnValue;
  };

  const wait = async (address: string, time: BigNumberish) => {
    const index = (await oracle.numPairObservations(address))
      .sub(1)
      .mod(await oracle.OBSERVATION_BUFFER_SIZE())
      .toNumber();
    const lastUpdateTime = (await oracle.pairObservations(address, index)).timestamp;
    await waffle.provider.send("evm_mine", [lastUpdateTime.add(time).toNumber()]);
  };

  const waitTwapTime = async (address: string) => {
    await wait(address, (await oracle.MIN_TWAP_TIME()).add(1));
  };

  const waitTwapTimeAndUpdate = async (address: string) => {
    await waitTwapTime(address);
    await update([address]);
  };

  describe("Update Oracle", () => {
    it("Updates with the correct values", async () => {
      const tx = await oracle.update([pair1.address]);
      const receipt = await tx.wait();
      const blockTimestamp = (await waffle.provider.getBlock(receipt.blockNumber)).timestamp;
      let pairObservation = await oracle.pairObservations(pair1.address, 0);
      expect(pairObservation.timestamp).to.equal(blockTimestamp);
      // The cumulative prices should be greater than the cumulative prices of the pair because
      // time has passed since the last update on the pair.
      expect(pairObservation.price0Cumulative).to.be.gt(await pair1.price0CumulativeLast());
      expect(pairObservation.price1Cumulative).to.be.gt(await pair1.price1CumulativeLast());
    });

    it("Correctly increments numPairObservations when successfully updated", async () => {
      expect(await oracle.numPairObservations(pair1.address)).to.equal(0);
      expect(await update([pair1.address])).to.equal(1);
      expect(await oracle.numPairObservations(pair1.address)).to.equal(1);
    });

    it("Can update multiple pairs at once", async () => {
      expect(await update([pair1.address, pair2.address])).to.equal(2);
    });

    it("Only allows updates after MIN_TWAP_TIME has passed", async () => {
      await update([pair1.address]);
      const firstUpdateTime = (await oracle.pairObservations(pair1.address, 0)).timestamp;

      // MIN_TWAP_TIME has not passed, so the update should not succeed.
      expect(await update([pair1.address])).to.equal(0);
      expect(await oracle.numPairObservations(pair1.address)).to.equal(1);

      // But updating pair2, which has never been updated before, should succeed.
      expect(await update([pair1.address, pair2.address])).to.equal(1);
      expect(await oracle.numPairObservations(pair2.address)).to.equal(1);

      // After exactly MIN_TWAP_TIME has passed we still shouldn't be able to update.
      await waffle.provider.send("evm_mine", [
        firstUpdateTime.add(await oracle.MIN_TWAP_TIME()).toNumber(),
      ]);
      expect(await update([pair1.address])).to.equal(0);

      // Mine an empty block to increase the timestamp.
      await waffle.provider.send("evm_mine", []);
      // Now >MIN_TWAP_TIME has passed so we should be able to update now.
      expect(await update([pair1.address])).to.equal(1);
      expect(await oracle.numPairObservations(pair1.address)).to.equal(2);
    });

    it("Rejects updates if reserves are 0", async () => {
      let tx = await pair1.setReserves(0, 0);
      await tx.wait();
      await expect(update([pair1.address])).to.be.reverted;

      tx = await pair1.setReserves(0, 5);
      await tx.wait();
      await expect(update([pair1.address])).to.be.reverted;

      tx = await pair1.setReserves(5, 0);
      await tx.wait();
      await expect(update([pair1.address])).to.be.reverted;
    });

    it("Can handle more than OBSERVATION_BUFFER_SIZE updates", async () => {
      await update([pair1.address]);
      const firstObservation = await oracle.pairObservations(pair1.address, 0);

      for (let i = 0; i < (await oracle.OBSERVATION_BUFFER_SIZE()).toNumber(); ++i) {
        await waitTwapTimeAndUpdate(pair1.address);
      }

      const lastObservation = await oracle.pairObservations(pair1.address, 0);
      expect(firstObservation.price0Cumulative).to.not.equal(lastObservation.price0Cumulative);
      expect(firstObservation.price1Cumulative).to.not.equal(lastObservation.price1Cumulative);
      expect(firstObservation.timestamp).to.not.equal(lastObservation.timestamp);
    });
  });

  describe("Get Price", () => {
    let WETH: MockContract;
    let PUNK: MockContract;
    const WETH_DECIMALS = 18;
    // The real PUNK token has 18 decimals, but we make the amount of decimals different from
    // that of WETH so that the tests are a little more interesting.
    const PUNK_DECIMALS = 16;
    // uniV2Factory.getPair will always return pair1.
    let uniV2Factory: MockContract;

    const setReserves = async (reserves: { weth: string; punk: string }) => {
      if (WETH.address.toLowerCase() < PUNK.address.toLowerCase()) {
        let tx = await pair1.setReserves(
          BigNumber.from(reserves.weth),
          BigNumber.from(reserves.punk)
        );
        await tx.wait();
      } else {
        let tx = await pair1.setReserves(
          BigNumber.from(reserves.punk),
          BigNumber.from(reserves.weth)
        );
        await tx.wait();
      }
    };

    const expectedPunkWethPrice = async () => {
      const [reserve0, reserve1, _] = await pair1.getReserves();
      if (WETH.address.toLowerCase() < PUNK.address.toLowerCase()) {
        return reserve0.mul(BigNumber.from("10").pow(PUNK_DECIMALS)).div(reserve1);
      } else {
        return reserve1.mul(BigNumber.from("10").pow(PUNK_DECIMALS)).div(reserve0);
      }
    };

    const expectedWethPunkPrice = async () => {
      const [reserve0, reserve1, _] = await pair1.getReserves();
      if (WETH.address.toLowerCase() < PUNK.address.toLowerCase()) {
        return reserve1.mul(BigNumber.from("10").pow(WETH_DECIMALS)).div(reserve0);
      } else {
        return reserve0.mul(BigNumber.from("10").pow(WETH_DECIMALS)).div(reserve1);
      }
    };

    beforeEach(async () => {
      // Unlike the update tests, the exact price of the oracle matters. So we reset the price
      // before each test.
      const pairFactory = await ethers.getContractFactory("MockUniswapV2Pair");
      pair1 = await pairFactory.deploy();
      await pair1.deployed();

      WETH = await waffle.deployMockContract(admin, Erc20JSON.abi);
      await WETH.mock.decimals.returns(WETH_DECIMALS);
      // The real PUNK token has 18 decimals, but we make the amount of decimals different from
      // that of WETH so that the tests are a little more interesting.
      PUNK = await waffle.deployMockContract(admin, Erc20JSON.abi);
      await PUNK.mock.decimals.returns(PUNK_DECIMALS);

      uniV2Factory = await waffle.deployMockContract(admin, UniV2FactoryJSON.abi);
      await uniV2Factory.mock.getPair.returns(pair1.address);
    });

    it("Cannot report a price when there are no observations", async () => {
      await setReserves({ weth: "5", punk: "1" });
      await setReserves({ weth: "5", punk: "1" });

      // No observations. Should be reverted.
      await expect(oracle.price(PUNK.address, WETH.address, uniV2Factory.address)).to.be.reverted;
      await expect(oracle.price(WETH.address, PUNK.address, uniV2Factory.address)).to.be.reverted;
    });

    it("One observation is enough to report a price if enough time has passed", async () => {
      await setReserves({ weth: "5", punk: "1" });
      await setReserves({ weth: "5", punk: "1" });
      await update([pair1.address]);

      // There's one observation, but it hasn't been MIN_TWAP_TIME since. Should be reverted.
      await update([pair1.address]);
      await expect(oracle.price(PUNK.address, WETH.address, uniV2Factory.address)).to.be.reverted;
      await expect(oracle.price(WETH.address, PUNK.address, uniV2Factory.address)).to.be.reverted;

      await waitTwapTime(pair1.address);
      await expect(oracle.price(PUNK.address, WETH.address, uniV2Factory.address)).to.not.be
        .reverted;
    });

    it("Requires at least two observations to report a price if not enough time has passed", async () => {
      await setReserves({ weth: "5", punk: "1" });
      await setReserves({ weth: "5", punk: "1" });

      await update([pair1.address]);
      await waitTwapTimeAndUpdate(pair1.address);
      // Even though it hasn't been MIN_TWAP_TIME since the second observation, sufficient time
      // has passed since the first observation, so this should work.
      await expect(oracle.price(PUNK.address, WETH.address, uniV2Factory.address)).to.not.be
        .reverted;
    });

    it("Reports an unchanging price correctly", async () => {
      // WETH has 18 decimals and PUNK has 16, so this means that 1 PUNK = 5 WETH.
      const wethReserves = BigNumber.from("500");
      const punkReserves = BigNumber.from("1");

      await setReserves({ weth: wethReserves.toString(), punk: punkReserves.toString() });
      await setReserves({ weth: wethReserves.toString(), punk: punkReserves.toString() });
      await update([pair1.address]);

      await waitTwapTime(pair1.address);
      const firstPunkWethPrice = await oracle.price(
        PUNK.address,
        WETH.address,
        uniV2Factory.address
      );
      const firstWethPunkPrice = await oracle.price(
        WETH.address,
        PUNK.address,
        uniV2Factory.address
      );
      expect(firstPunkWethPrice).to.be.closeTo(await expectedPunkWethPrice(), 1);
      expect(firstWethPunkPrice).to.be.closeTo(await expectedWethPunkPrice(), 1);

      // Price shouldn't change before or after a second update to the oracle.
      expect(await oracle.price(PUNK.address, WETH.address, uniV2Factory.address)).to.equal(
        firstPunkWethPrice
      );
      expect(await oracle.price(WETH.address, PUNK.address, uniV2Factory.address)).to.equal(
        firstWethPunkPrice
      );
      expect(await update([pair1.address])).to.equal(1);
      expect(await oracle.price(PUNK.address, WETH.address, uniV2Factory.address)).to.equal(
        firstPunkWethPrice
      );
      expect(await oracle.price(WETH.address, PUNK.address, uniV2Factory.address)).to.equal(
        firstWethPunkPrice
      );
    });

    it("Reports a changing price correctly", async () => {
      await setReserves({ weth: "500", punk: "1" });
      await setReserves({ weth: "500", punk: "1" });
      await update([pair1.address]);
      const firstPrice = await expectedPunkWethPrice();

      await wait(pair1.address, (await oracle.MIN_TWAP_TIME()).div(2));
      await setReserves({ weth: "1000", punk: "1" });
      const twap = new Decimal((await expectedPunkWethPrice()).add(firstPrice).div(2).toString());

      // Even though the oracle hasn't been updated with the new reserves, it should take them
      // into account; the price should be the arithemetic mean of the old price and the new
      // price.
      await wait(pair1.address, (await oracle.MIN_TWAP_TIME()).add(1));
      const preUpdatePrice = new Decimal(
        (await oracle.price(PUNK.address, WETH.address, uniV2Factory.address)).toString()
      );
      expect(parseFloat(twap.dividedBy(preUpdatePrice).toString())).to.be.closeTo(1, 0.001);

      // Still should have the same price.
      await update([pair1.address]);
      const postUpdatePrice = new Decimal(
        (await oracle.price(PUNK.address, WETH.address, uniV2Factory.address)).toString()
      );
      expect(parseFloat(twap.dividedBy(postUpdatePrice).toString())).to.be.closeTo(1, 0.001);

      // The old price should be out of the TWAP window, so we should only report the new price.
      await waitTwapTimeAndUpdate(pair1.address);
      expect(await oracle.price(PUNK.address, WETH.address, uniV2Factory.address)).to.equal(
        await expectedPunkWethPrice()
      );
    });

    it("Is resistant to flash loan attacks", async () => {
      await setReserves({ weth: "1525993768283563107293", punk: "257659215830256711" });
      await setReserves({ weth: "1525993768283563107293", punk: "257659215830256711" });
      await update([pair1.address]);
      await waitTwapTimeAndUpdate(pair1.address);
      const originalPrice = await oracle.price(PUNK.address, WETH.address, uniV2Factory.address);

      const flashLoanAttackFactory = await ethers.getContractFactory("FlashLoanAttack");
      const flashLoanAttack = await flashLoanAttackFactory.deploy();
      await flashLoanAttack.deployed();

      const newPrice = await flashLoanAttack.callStatic.attack(
        pair1.address,
        oracle.address,
        1,
        9999999999,
        PUNK.address,
        WETH.address,
        uniV2Factory.address
      );

      // Flash loan attacks cannot influence the price.
      expect(originalPrice).to.equal(newPrice);
    });

    it("Requires a large amount of capital to manipulate the price", async () => {
      // It requires about $40,000,000 of ETH to increase the oracle price by 50% for one block.
      // Reserves are based on historical data.
      const originalWethReserve = BigNumber.from("1525993768283563107293");
      const punkReserve = BigNumber.from("257659215830256711");
      await setReserves({ weth: originalWethReserve.toString(), punk: punkReserve.toString() });
      await setReserves({ weth: originalWethReserve.toString(), punk: punkReserve.toString() });
      await update([pair1.address]);
      await waitTwapTimeAndUpdate(pair1.address);
      const firstPrice = await oracle.price(PUNK.address, WETH.address, uniV2Factory.address);
      const changeFactor = 10;
      await setReserves({ weth: originalWethReserve.mul(changeFactor).toString(), punk: punkReserve.div(changeFactor).toString() });

      // Wait 10 seconds, which is in the range of the block time of Ethereum.
      await wait(pair1.address, 10);

      const newPrice = await oracle.price(PUNK.address, WETH.address, uniV2Factory.address);
      const priceRatio = new Decimal(newPrice.toString()).div(new Decimal(firstPrice.toString()));
      expect(parseFloat(priceRatio.toString())).to.be.lessThan(1.5);
    });
  });
});
