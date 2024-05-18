import type { WalletClient } from "@nomicfoundation/hardhat-viem/types";
import type { Token, MatchersContract } from "./contracts";

import assert from "assert";
import { AssertionError, expect } from "chai";
import path from "path";
import util from "util";

import "../src/internal/add-chai-matchers";
import { clearTokenDescriptionsCache } from "../src/internal/changeTokenBalance";
import {
  CHANGE_TOKEN_BALANCE_MATCHER,
  CHANGE_TOKEN_BALANCES_MATCHER,
} from "../src/internal/constants";
import { useEnvironment, useEnvironmentWithNode } from "./helpers";

describe("INTEGRATION: changeTokenBalance and changeTokenBalances matchers", function () {
  describe("with the in-process hardhat network", function () {
    useEnvironment("hardhat-project");

    runTests();
  });

  describe("connected to a hardhat node", function () {
    useEnvironmentWithNode("hardhat-project");

    runTests();
  });

  afterEach(function () {
    clearTokenDescriptionsCache();
  });

  function runTests() {
    let sender: WalletClient;
    let receiver: WalletClient;
    let mockToken: Token;
    let matchers: MatchersContract;

    beforeEach(async function () {
      [sender, receiver] = await this.hre.viem.getWalletClients();

      mockToken = await this.hre.viem.deployContract("MockToken");

      matchers = await this.hre.viem.deployContract("Matchers");
    });

    describe("transaction that doesn't move tokens", () => {
      it("with a promise of a TxResponse", async function () {
        const transactionResponse = sender.sendTransaction({
          to: receiver.account.address,
        });
        await runAllAsserts(
          transactionResponse,
          mockToken,
          [sender, receiver],
          [0, 0]
        );
      });

      it("with a TxResponse", async function () {
        await runAllAsserts(
          await sender.sendTransaction({
            to: receiver.account.address,
          }),
          mockToken,
          [sender, receiver],
          [0, 0]
        );
      });

      it("with a function that returns a promise of a TxResponse", async function () {
        await runAllAsserts(
          () => sender.sendTransaction({ to: receiver.account.address }),
          mockToken,
          [sender, receiver],
          [0, 0]
        );
      });

      it("with a function that returns a TxResponse", async function () {
        const txResponse = await sender.sendTransaction({
          to: receiver.account.address,
        });
        await runAllAsserts(
          () => txResponse,
          mockToken,
          [sender, receiver],
          [0, 0]
        );
      });

      it("accepts addresses", async function () {
        await expect(
          sender.sendTransaction({ to: receiver.account.address })
        ).to.changeTokenBalance(mockToken, sender.account.address, 0);

        await expect(() =>
          sender.sendTransaction({ to: receiver.account.address })
        ).to.changeTokenBalances(
          mockToken,
          [sender.account.address, receiver.account.address],
          [0, 0]
        );

        // mixing signers and addresses
        await expect(() =>
          sender.sendTransaction({ to: receiver.account.address })
        ).to.changeTokenBalances(
          mockToken,
          [sender.account.address, receiver],
          [0, 0]
        );
      });

      it("negated", async function () {
        await expect(
          sender.sendTransaction({ to: receiver.account.address })
        ).to.not.changeTokenBalance(mockToken, sender, 1);

        await expect(
          sender.sendTransaction({ to: receiver.account.address })
        ).to.not.changeTokenBalance(
          mockToken,
          sender,
          (diff: bigint) => diff > 0n
        );

        await expect(() =>
          sender.sendTransaction({ to: receiver.account.address })
        ).to.not.changeTokenBalances(mockToken, [sender, receiver], [0, 1]);

        await expect(() =>
          sender.sendTransaction({ to: receiver.account.address })
        ).to.not.changeTokenBalances(mockToken, [sender, receiver], [1, 0]);

        await expect(() =>
          sender.sendTransaction({ to: receiver.account.address })
        ).to.not.changeTokenBalances(mockToken, [sender, receiver], [1, 1]);
      });

      describe("assertion failures", function () {
        it("doesn't change balance as expected", async function () {
          await expect(
            expect(
              sender.sendTransaction({ to: receiver.account.address })
            ).to.changeTokenBalance(mockToken, sender, 1)
          ).to.be.rejectedWith(
            AssertionError,
            /Expected the balance of MCK tokens for "0x\w{40}" to change by 1, but it changed by 0/
          );
        });

        it("change balance doesn't satisfies the predicate", async function () {
          await expect(
            expect(
              sender.sendTransaction({ to: receiver.account.address })
            ).to.changeTokenBalance(
              mockToken,
              sender,
              (diff: bigint) => diff > 0n
            )
          ).to.be.rejectedWith(
            AssertionError,
            /Expected the balance of MCK tokens for "0x\w{40}" to satisfy the predicate, but it didn't \(token balance change: 0 wei\)/
          );
        });

        it("changes balance in the way it was not expected", async function () {
          await expect(
            expect(
              sender.sendTransaction({ to: receiver.account.address })
            ).to.not.changeTokenBalance(mockToken, sender, 0)
          ).to.be.rejectedWith(
            AssertionError,
            /Expected the balance of MCK tokens for "0x\w{40}" NOT to change by 0, but it did/
          );
        });

        it("changes balance doesn't have to satisfy the predicate, but it did", async function () {
          await expect(
            expect(
              sender.sendTransaction({ to: receiver.account.address })
            ).to.not.changeTokenBalance(
              mockToken,
              sender,
              (diff: bigint) => diff < 1n
            )
          ).to.be.rejectedWith(
            AssertionError,
            /Expected the balance of MCK tokens for "0x\w{40}" to NOT satisfy the predicate, but it did \(token balance change: 0 wei\)/
          );
        });

        it("the first account doesn't change its balance as expected", async function () {
          await expect(
            expect(
              sender.sendTransaction({ to: receiver.account.address })
            ).to.changeTokenBalances(mockToken, [sender, receiver], [1, 0])
          ).to.be.rejectedWith(AssertionError);
        });

        it("the second account doesn't change its balance as expected", async function () {
          await expect(
            expect(
              sender.sendTransaction({ to: receiver.account.address })
            ).to.changeTokenBalances(mockToken, [sender, receiver], [0, 1])
          ).to.be.rejectedWith(AssertionError);
        });

        it("neither account changes its balance as expected", async function () {
          await expect(
            expect(
              sender.sendTransaction({ to: receiver.account.address })
            ).to.changeTokenBalances(mockToken, [sender, receiver], [1, 1])
          ).to.be.rejectedWith(AssertionError);
        });

        it("accounts change their balance in the way it was not expected", async function () {
          await expect(
            expect(
              sender.sendTransaction({ to: receiver.account.address })
            ).to.not.changeTokenBalances(mockToken, [sender, receiver], [0, 0])
          ).to.be.rejectedWith(AssertionError);
        });
      });
    });

    describe("Transaction Callback", function () {
      it("Should pass when given predicate", async () => {
        await expect(() =>
          mockToken.write.transfer([receiver.account.address, 75n])
        ).to.changeTokenBalances(
          mockToken,
          [sender, receiver],
          ([senderDiff, receiverDiff]: bigint[]) =>
            senderDiff === -75n && receiverDiff === 75n
        );
      });

      it("Should fail when the predicate returns false", async () => {
        await expect(
          expect(
            mockToken.write.transfer([receiver.account.address, 75n])
          ).to.changeTokenBalances(
            mockToken,
            [sender, receiver],
            ([senderDiff, receiverDiff]: bigint[]) =>
              senderDiff === -74n && receiverDiff === 75n
          )
        ).to.be.eventually.rejectedWith(
          AssertionError,
          "Expected the balance changes of MCK to satisfy the predicate, but they didn't"
        );
      });

      it("Should fail when the predicate returns true and the assertion is negated", async () => {
        await expect(
          expect(
            mockToken.write.transfer([receiver.account.address, 75n])
          ).to.not.changeTokenBalances(
            mockToken,
            [sender, receiver],
            ([senderDiff, receiverDiff]: bigint[]) =>
              senderDiff === -75n && receiverDiff === 75n
          )
        ).to.be.eventually.rejectedWith(
          AssertionError,
          "Expected the balance changes of MCK to NOT satisfy the predicate, but they did"
        );
      });
    });

    describe("transaction that transfers some tokens", function () {
      it("with a promise of a TxResponse", async function () {
        await runAllAsserts(
          mockToken.write.transfer([receiver.account.address, 50n]),
          mockToken,
          [sender, receiver],
          [-50, 50]
        );

        await runAllAsserts(
          mockToken.write.transfer([receiver.account.address, 100n]),
          mockToken,
          [sender, receiver],
          [-100, 100]
        );
      });

      it("with a TxResponse", async function () {
        await runAllAsserts(
          await mockToken.write.transfer([receiver.account.address, 150n]),
          mockToken,
          [sender, receiver],
          [-150, 150]
        );
      });

      it("with a function that returns a promise of a TxResponse", async function () {
        await runAllAsserts(
          () => mockToken.write.transfer([receiver.account.address, 200n]),
          mockToken,
          [sender, receiver],
          [-200, 200]
        );
      });

      it("with a function that returns a TxResponse", async function () {
        const txResponse = await mockToken.write.transfer([
          receiver.account.address,
          300n,
        ]);
        await runAllAsserts(
          () => txResponse,
          mockToken,
          [sender, receiver],
          [-300, 300]
        );
      });

      it("changeTokenBalance shouldn't run the transaction twice", async function () {
        const receiverBalanceBefore = await mockToken.read.balanceOf([
          receiver.account.address,
        ]);

        await expect(() =>
          mockToken.write.transfer([receiver.account.address, 50n])
        ).to.changeTokenBalance(mockToken, receiver, 50);

        const receiverBalanceChange =
          (await mockToken.read.balanceOf([receiver.account.address])) -
          receiverBalanceBefore;

        expect(receiverBalanceChange).to.equal(50n);
      });

      it("changeTokenBalances shouldn't run the transaction twice", async function () {
        const receiverBalanceBefore = await mockToken.read.balanceOf([
          receiver.account.address,
        ]);

        await expect(() =>
          mockToken.write.transfer([receiver.account.address, 50n])
        ).to.changeTokenBalances(mockToken, [sender, receiver], [-50, 50]);

        const receiverBalanceChange =
          (await mockToken.read.balanceOf([receiver.account.address])) -
          receiverBalanceBefore;

        expect(receiverBalanceChange).to.equal(50n);
      });

      it("negated", async function () {
        await expect(
          mockToken.write.transfer([receiver.account.address, 50n])
        ).to.not.changeTokenBalance(mockToken, sender, 0);
        await expect(
          mockToken.write.transfer([receiver.account.address, 50n])
        ).to.not.changeTokenBalance(mockToken, sender, 1);

        await expect(
          mockToken.write.transfer([receiver.account.address, 50n])
        ).to.not.changeTokenBalances(mockToken, [sender, receiver], [0, 0]);
        await expect(
          mockToken.write.transfer([receiver.account.address, 50n])
        ).to.not.changeTokenBalances(mockToken, [sender, receiver], [-50, 0]);
        await expect(
          mockToken.write.transfer([receiver.account.address, 50n])
        ).to.not.changeTokenBalances(mockToken, [sender, receiver], [0, 50]);
      });

      describe("assertion failures", function () {
        it("doesn't change balance as expected", async function () {
          await expect(
            expect(
              mockToken.write.transfer([receiver.account.address, 50n])
            ).to.changeTokenBalance(mockToken, receiver, 500)
          ).to.be.rejectedWith(
            AssertionError,
            /Expected the balance of MCK tokens for "0x\w{40}" to change by 500, but it changed by 50/
          );
        });

        it("change balance doesn't satisfies the predicate", async function () {
          await expect(
            expect(
              mockToken.write.transfer([receiver.account.address, 50n])
            ).to.changeTokenBalance(
              mockToken,
              receiver,
              (diff: bigint) => diff === 500n
            )
          ).to.be.rejectedWith(
            AssertionError,
            /Expected the balance of MCK tokens for "0x\w{40}" to satisfy the predicate, but it didn't \(token balance change: 50 wei\)/
          );
        });

        it("changes balance in the way it was not expected", async function () {
          await expect(
            expect(
              mockToken.write.transfer([receiver.account.address, 50n])
            ).to.not.changeTokenBalance(mockToken, receiver, 50)
          ).to.be.rejectedWith(
            AssertionError,
            /Expected the balance of MCK tokens for "0x\w{40}" NOT to change by 50, but it did/
          );
        });

        it("changes balance doesn't have to satisfy the predicate, but it did", async function () {
          await expect(
            expect(
              mockToken.write.transfer([receiver.account.address, 50n])
            ).to.not.changeTokenBalance(
              mockToken,
              receiver,
              (diff: bigint) => diff === 50n
            )
          ).to.be.rejectedWith(
            AssertionError,
            /Expected the balance of MCK tokens for "0x\w{40}" to NOT satisfy the predicate, but it did \(token balance change: 50 wei\)/
          );
        });

        it("the first account doesn't change its balance as expected", async function () {
          await expect(
            expect(
              mockToken.write.transfer([receiver.account.address, 50n])
            ).to.changeTokenBalances(mockToken, [sender, receiver], [-100, 50])
          ).to.be.rejectedWith(AssertionError);
        });

        it("the second account doesn't change its balance as expected", async function () {
          await expect(
            expect(
              mockToken.write.transfer([receiver.account.address, 50n])
            ).to.changeTokenBalances(mockToken, [sender, receiver], [-50, 100])
          ).to.be.rejectedWith(AssertionError);
        });

        it("neither account changes its balance as expected", async function () {
          await expect(
            expect(
              mockToken.write.transfer([receiver.account.address, 50n])
            ).to.changeTokenBalances(mockToken, [sender, receiver], [0, 0])
          ).to.be.rejectedWith(AssertionError);
        });

        it("accounts change their balance in the way it was not expected", async function () {
          await expect(
            expect(
              mockToken.write.transfer([receiver.account.address, 50n])
            ).to.not.changeTokenBalances(
              mockToken,
              [sender, receiver],
              [-50, 50]
            )
          ).to.be.rejectedWith(AssertionError);
        });

        it("uses the token name if the contract doesn't have a symbol", async function () {
          const tokenWithOnlyName = await this.hre.viem.deployContract(
            "TokenWithOnlyName"
          );

          await expect(
            expect(
              tokenWithOnlyName.write.transfer([receiver.account.address, 50n])
            ).to.changeTokenBalance(tokenWithOnlyName, receiver, 500)
          ).to.be.rejectedWith(
            AssertionError,
            /Expected the balance of MockToken tokens for "0x\w{40}" to change by 500, but it changed by 50/
          );

          await expect(
            expect(
              tokenWithOnlyName.write.transfer([receiver.account.address, 50n])
            ).to.not.changeTokenBalance(tokenWithOnlyName, receiver, 50)
          ).to.be.rejectedWith(
            AssertionError,
            /Expected the balance of MockToken tokens for "0x\w{40}" NOT to change by 50, but it did/
          );
        });

        it("uses the contract address if the contract doesn't have name or symbol", async function () {
          const tokenWithoutNameNorSymbol = await this.hre.viem.deployContract(
            "TokenWithoutNameNorSymbol"
          );

          await expect(
            expect(
              tokenWithoutNameNorSymbol.write.transfer([
                receiver.account.address,
                50n,
              ])
            ).to.changeTokenBalance(tokenWithoutNameNorSymbol, receiver, 500)
          ).to.be.rejectedWith(
            AssertionError,
            /Expected the balance of <token at 0x\w{40}> tokens for "0x\w{40}" to change by 500, but it changed by 50/
          );

          await expect(
            expect(
              tokenWithoutNameNorSymbol.write.transfer([
                receiver.account.address,
                50n,
              ])
            ).to.not.changeTokenBalance(tokenWithoutNameNorSymbol, receiver, 50)
          ).to.be.rejectedWith(
            AssertionError,
            /Expected the balance of <token at 0x\w{40}> tokens for "0x\w{40}" NOT to change by 50, but it did/
          );
        });

        it("changeTokenBalance: Should throw if chained to another non-chainable method", () => {
          expect(() =>
            expect(mockToken.write.transfer([receiver.account.address, 50n]))
              .to.emit(mockToken, "SomeEvent")
              .and.to.changeTokenBalance(mockToken, receiver, 50)
          ).to.throw(
            /The matcher 'changeTokenBalance' cannot be chained after 'emit'./
          );
        });

        it("changeTokenBalances: should throw if chained to another non-chainable method", () => {
          expect(() =>
            expect(
              mockToken.write.transfer([receiver.account.address, 50n])
            ).to.be.reverted.and.to.changeTokenBalances(
              mockToken,
              [sender, receiver],
              [-50, 100]
            )
          ).to.throw(
            /The matcher 'changeTokenBalances' cannot be chained after 'reverted'./
          );
        });
      });
    });

    describe("validation errors", function () {
      describe(CHANGE_TOKEN_BALANCE_MATCHER, function () {
        it("token is not specified", async function () {
          expect(() =>
            expect(mockToken.write.transfer([receiver.account.address, 50n]))
              .to // @ts-expect-error
              .changeTokenBalance(receiver, 50)
          ).to.throw(
            Error,
            "The first argument of changeTokenBalance must be the contract instance of the token"
          );

          // if an address is used
          expect(() =>
            expect(mockToken.write.transfer([receiver.account.address, 50n]))
              .to // @ts-expect-error
              .changeTokenBalance(receiver.address, 50)
          ).to.throw(
            Error,
            "The first argument of changeTokenBalance must be the contract instance of the token"
          );
        });

        it("contract is not a token", async function () {
          const notAToken = await this.hre.viem.deployContract("NotAToken");

          expect(() =>
            expect(
              mockToken.write.transfer([receiver.account.address, 50n])
            ).to.changeTokenBalance(notAToken, sender, -50)
          ).to.throw(
            Error,
            "The given contract instance is not an ERC20 token"
          );
        });

        it("tx is not the only one in the block", async function () {
          await this.hre.network.provider.send("evm_setAutomine", [false]);

          // we set a gas limit to avoid using the whole block gas limit
          await sender.sendTransaction({
            to: receiver.account.address,
            gas: 30_000n,
          });

          await this.hre.network.provider.send("evm_setAutomine", [true]);

          await expect(
            expect(
              mockToken.write.transfer([receiver.account.address, 50n], {
                gas: 100_000n,
              })
            ).to.changeTokenBalance(mockToken, sender, -50)
          ).to.be.rejectedWith(Error, "Multiple transactions found in block");
        });

        it("tx reverts", async function () {
          await expect(
            expect(
              mockToken.write.transfer([receiver.account.address, 0n])
            ).to.changeTokenBalance(mockToken, sender, -50)
          ).to.be.rejectedWith(
            Error,
            // check that the error message includes the revert reason
            "Transferred value is zero"
          );
        });
      });

      describe(CHANGE_TOKEN_BALANCES_MATCHER, function () {
        it("token is not specified", async function () {
          expect(() =>
            expect(mockToken.write.transfer([receiver.account.address, 50n]))
              .to // @ts-expect-error
              .changeTokenBalances([sender, receiver], [-50, 50])
          ).to.throw(
            Error,
            "The first argument of changeTokenBalances must be the contract instance of the token"
          );
        });

        it("contract is not a token", async function () {
          const notAToken = await this.hre.viem.deployContract("NotAToken");

          expect(() =>
            expect(
              mockToken.write.transfer([receiver.account.address, 50n])
            ).to.changeTokenBalances(notAToken, [sender, receiver], [-50, 50])
          ).to.throw(
            Error,
            "The given contract instance is not an ERC20 token"
          );
        });

        it("arrays have different length", async function () {
          expect(() =>
            expect(
              mockToken.write.transfer([receiver.account.address, 50n])
            ).to.changeTokenBalances(mockToken, [sender], [-50, 50])
          ).to.throw(
            Error,
            "The number of accounts (1) is different than the number of expected balance changes (2)"
          );

          expect(() =>
            expect(
              mockToken.write.transfer([receiver.account.address, 50n])
            ).to.changeTokenBalances(mockToken, [sender, receiver], [-50])
          ).to.throw(
            Error,
            "The number of accounts (2) is different than the number of expected balance changes (1)"
          );
        });

        it("arrays have different length, subject is a rejected promise", async function () {
          expect(() =>
            expect(
              matchers.write.revertsWithoutReason()
            ).to.changeTokenBalances(mockToken, [sender], [-50, 50])
          ).to.throw(
            Error,
            "The number of accounts (1) is different than the number of expected balance changes (2)"
          );
        });

        it("tx is not the only one in the block", async function () {
          await this.hre.network.provider.send("evm_setAutomine", [false]);

          // we set a gas limit to avoid using the whole block gas limit
          await sender.sendTransaction({
            to: receiver.account.address,
            gas: 30_000n,
          });

          await this.hre.network.provider.send("evm_setAutomine", [true]);

          await expect(
            expect(
              mockToken.write.transfer([receiver.account.address, 50n], {
                gas: 100_000n,
              })
            ).to.changeTokenBalances(mockToken, [sender, receiver], [-50, 50])
          ).to.be.rejectedWith(Error, "Multiple transactions found in block");
        });

        it("tx reverts", async function () {
          await expect(
            expect(
              mockToken.write.transfer([receiver.account.address, 0n])
            ).to.changeTokenBalances(mockToken, [sender, receiver], [-50, 50])
          ).to.be.rejectedWith(
            Error,
            // check that the error message includes the revert reason
            "Transferred value is zero"
          );
        });
      });
    });

    describe("accepted number types", function () {
      it("native bigints are accepted", async function () {
        await expect(
          mockToken.write.transfer([receiver.account.address, 50n])
        ).to.changeTokenBalance(mockToken, sender, -50n);

        await expect(
          mockToken.write.transfer([receiver.account.address, 50n])
        ).to.changeTokenBalances(mockToken, [sender, receiver], [-50n, 50n]);
      });
    });

    // smoke tests for stack traces
    describe("stack traces", function () {
      describe(CHANGE_TOKEN_BALANCE_MATCHER, function () {
        it("includes test file", async function () {
          let hasProperStackTrace = false;
          try {
            await expect(
              mockToken.write.transfer([receiver.account.address, 50n])
            ).to.changeTokenBalance(mockToken, sender, -100);
          } catch (e: any) {
            hasProperStackTrace = util
              .inspect(e)
              .includes(path.join("test", "changeTokenBalance.ts"));
          }

          expect(hasProperStackTrace).to.equal(true);
        });
      });

      describe(CHANGE_TOKEN_BALANCES_MATCHER, function () {
        it("includes test file", async function () {
          try {
            await expect(
              mockToken.write.transfer([receiver.account.address, 50n])
            ).to.changeTokenBalances(
              mockToken,
              [sender, receiver],
              [-100, 100]
            );
          } catch (e: any) {
            expect(util.inspect(e)).to.include(
              path.join("test", "changeTokenBalance.ts")
            );

            return;
          }

          expect.fail("Expected an exception but none was thrown");
        });
      });
    });
  }
});

function zip<T, U>(a: T[], b: U[]): Array<[T, U]> {
  assert(a.length === b.length);

  return a.map((x, i) => [x, b[i]]);
}

/**
 * Given an expression `expr`, a token, and a pair of arrays, check that
 * `changeTokenBalance` and `changeTokenBalances` behave correctly in different
 * scenarios.
 */
async function runAllAsserts(
  expr:
    | `0x${string}`
    | Promise<`0x${string}`>
    | (() => `0x${string}`)
    | (() => Promise<`0x${string}`>),
  token: Token,
  accounts: Array<`0x${string}` | WalletClient>,
  balances: Array<number | bigint>
) {
  // changeTokenBalances works for the given arrays
  await expect(expr).to.changeTokenBalances(token, accounts, balances);

  // changeTokenBalances works for empty arrays
  await expect(expr).to.changeTokenBalances(token, [], []);

  // for each given pair of account and balance, check that changeTokenBalance
  // works correctly
  for (const [account, balance] of zip(accounts, balances)) {
    await expect(expr).to.changeTokenBalance(token, account, balance);
  }
}
