# Bunker Finance

## Set up

1. Install nvm: https://github.com/nvm-sh/nvm#installing-and-updating
2. Install node: `nvm install 16` (Later versions don't work well with hardhat)
3. Install yarn: `npm install --global yarn`
4. Install packages: `yarn`
5. (Highly recommended) Install the [hardhat shorthand](https://hardhat.org/guides/shorthand.html).

## Testing

The unit test suite can be run with `hh test`. If you have never compiled the code before, it may be a good idea to run `hh compile` first.

## Forking Mainnet

1. A mainnet fork can be spun up with `yarn hardhat-fork`.
2. After spinning up the mainnet fork, in another terminal run `hh run scripts/steal_assets.ts --network localhost` to give CryptoPunks and USDC to the first hardhat account.

