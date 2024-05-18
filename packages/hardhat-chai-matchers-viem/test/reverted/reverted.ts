import type { HardhatRuntimeEnvironment } from "hardhat/types/runtime";
import type { MatchersContract } from "../contracts";

import { AssertionError, expect } from "chai";
import { TransactionExecutionError } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import path from "path";
import util from "util";

import "../../src/internal/add-chai-matchers";
import {
  runSuccessfulAsserts,
  runFailedAsserts,
  useEnvironment,
  useEnvironmentWithNode,
  mineSuccessfulTransaction,
  mineRevertedTransaction,
  waitForTransactionReceipt,
} from "../helpers";

describe("INTEGRATION: Reverted", function () {
  describe("with the in-process hardhat network", function () {
    useEnvironment("hardhat-project");

    runTests();
  });

  // external hardhat node with viem does not include error data in many cases
  describe.skip("connected to a hardhat node", function () {
    useEnvironmentWithNode("hardhat-project");

    runTests();
  });

  function runTests() {
    // deploy Matchers contract before each test
    let matchers: MatchersContract;
    beforeEach("deploy matchers contract", async function () {
      matchers = await this.hre.viem.deployContract("Matchers");
    });

    // helpers
    const expectAssertionError = async (x: Promise<void>, message: string) => {
      return expect(x).to.be.eventually.rejectedWith(AssertionError, message);
    };

    describe("with a string as its subject", function () {
      it("hash of a successful transaction", async function () {
        const hash = await mineSuccessfulTransaction(this.hre);

        await expectAssertionError(
          expect(hash).to.be.reverted,
          "Expected transaction to be reverted"
        );
        await expect(hash).to.not.be.reverted;
      });

      it("hash of a reverted transaction", async function () {
        const hash = await mineRevertedTransaction(this.hre, matchers);

        await expect(hash).to.be.reverted;
        await expectAssertionError(
          expect(hash).to.not.be.reverted,
          "Expected transaction NOT to be reverted"
        );
      });

      it("invalid string", async function () {
        await expect(expect("0x123").to.be.reverted).to.be.rejectedWith(
          TypeError,
          "Expected a valid transaction hash, but got '0x123'"
        );

        await expect(expect("0x123").to.not.be.reverted).to.be.rejectedWith(
          TypeError,
          "Expected a valid transaction hash, but got '0x123'"
        );
      });

      it("promise of a hash of a successful transaction", async function () {
        const hash = await mineSuccessfulTransaction(this.hre);

        await expectAssertionError(
          expect(Promise.resolve(hash)).to.be.reverted,
          "Expected transaction to be reverted"
        );
        await expect(Promise.resolve(hash)).to.not.be.reverted;
      });

      it("promise of a hash of a reverted transaction", async function () {
        const hash = await mineRevertedTransaction(this.hre, matchers);

        await expect(Promise.resolve(hash)).to.be.reverted;
        await expectAssertionError(
          expect(Promise.resolve(hash)).to.not.be.reverted,
          "Expected transaction NOT to be reverted"
        );
      });

      it("promise of an invalid string", async function () {
        await expect(
          expect(Promise.resolve("0x123")).to.be.reverted
        ).to.be.rejectedWith(
          TypeError,
          "Expected a valid transaction hash, but got '0x123'"
        );

        await expect(
          expect(Promise.resolve("0x123")).to.not.be.reverted
        ).to.be.rejectedWith(
          TypeError,
          "Expected a valid transaction hash, but got '0x123'"
        );
      });
    });

    describe("with a TxResponse as its subject", function () {
      it("TxResponse of a successful transaction", async function () {
        const hash = await mineSuccessfulTransaction(this.hre);

        await expectAssertionError(
          expect(hash).to.be.reverted,
          "Expected transaction to be reverted"
        );
        await expect(hash).to.not.be.reverted;
      });

      it("TxResponse of a reverted transaction", async function () {
        const hash = await mineRevertedTransaction(this.hre, matchers);

        await expect(hash).to.be.reverted;
        await expectAssertionError(
          expect(hash).to.not.be.reverted,
          "Expected transaction NOT to be reverted"
        );
      });

      it("promise of a TxResponse of a successful transaction", async function () {
        const hashPromise = mineSuccessfulTransaction(this.hre);

        await expectAssertionError(
          expect(hashPromise).to.be.reverted,
          "Expected transaction to be reverted"
        );
        await expect(hashPromise).to.not.be.reverted;
      });

      it("promise of a TxResponse of a reverted transaction", async function () {
        const hashPromise = mineRevertedTransaction(this.hre, matchers);

        await expect(hashPromise).to.be.reverted;
        await expectAssertionError(
          expect(hashPromise).to.not.be.reverted,
          "Expected transaction NOT to be reverted"
        );
      });

      it("reverted: should throw if chained to another non-chainable method", function () {
        const hashPromise = mineRevertedTransaction(this.hre, matchers);
        expect(
          () =>
            expect(hashPromise).to.be.revertedWith("an error message").and.to.be
              .reverted
        ).to.throw(
          /The matcher 'reverted' cannot be chained after 'revertedWith'./
        );
      });

      it("revertedWith: should throw if chained to another non-chainable method", function () {
        const hashPromise = mineRevertedTransaction(this.hre, matchers);
        expect(() =>
          expect(hashPromise)
            .to.be.revertedWithCustomError(matchers, "SomeCustomError")
            .and.to.be.revertedWith("an error message")
        ).to.throw(
          /The matcher 'revertedWith' cannot be chained after 'revertedWithCustomError'./
        );
      });

      it("revertedWithCustomError: should throw if chained to another non-chainable method", function () {
        const hashPromise = mineRevertedTransaction(this.hre, matchers);
        expect(() =>
          expect(hashPromise)
            .to.be.revertedWithoutReason()
            .and.to.be.revertedWithCustomError(matchers, "SomeCustomError")
        ).to.throw(
          /The matcher 'revertedWithCustomError' cannot be chained after 'revertedWithoutReason'./
        );
      });

      it("revertedWithoutReason: should throw if chained to another non-chainable method", function () {
        const hashPromise = mineRevertedTransaction(this.hre, matchers);
        expect(() =>
          expect(hashPromise)
            .to.be.revertedWithPanic()
            .and.to.be.revertedWithoutReason()
        ).to.throw(
          /The matcher 'revertedWithoutReason' cannot be chained after 'revertedWithPanic'./
        );
      });

      it("revertedWithPanic: should throw if chained to another non-chainable method", async function () {
        const [sender] = await this.hre.viem.getWalletClients();
        const hashPromise = mineRevertedTransaction(this.hre, matchers);
        expect(() =>
          expect(hashPromise)
            .to.changeEtherBalance(sender, "-200")
            .and.to.be.revertedWithPanic()
        ).to.throw(
          /The matcher 'revertedWithPanic' cannot be chained after 'changeEtherBalance'./
        );
      });
    });

    describe("with a TxReceipt as its subject", function () {
      it("TxReceipt of a successful transaction", async function () {
        const hash = await mineSuccessfulTransaction(this.hre);
        const receipt = await waitForTransactionReceipt(this.hre, hash);

        await expectAssertionError(
          expect(receipt).to.be.reverted,
          "Expected transaction to be reverted"
        );
        await expect(receipt).to.not.be.reverted;
      });

      it("TxReceipt of a reverted transaction", async function () {
        const hash = await mineRevertedTransaction(this.hre, matchers);
        const receipt = await waitForTransactionReceipt(this.hre, hash);

        await expect(receipt).to.be.reverted;
        await expectAssertionError(
          expect(receipt).to.not.be.reverted,
          "Expected transaction NOT to be reverted"
        );
      });

      it("promise of a TxReceipt of a successful transaction", async function () {
        const hash = await mineSuccessfulTransaction(this.hre);
        const receiptPromise = waitForTransactionReceipt(this.hre, hash);

        await expectAssertionError(
          expect(receiptPromise).to.be.reverted,
          "Expected transaction to be reverted"
        );
        await expect(receiptPromise).to.not.be.reverted;
      });

      it("promise of a TxReceipt of a reverted transaction", async function () {
        const hash = await mineRevertedTransaction(this.hre, matchers);
        const receiptPromise = waitForTransactionReceipt(this.hre, hash);

        await expect(receiptPromise).to.be.reverted;
        await expectAssertionError(
          expect(receiptPromise).to.not.be.reverted,
          "Expected transaction NOT to be reverted"
        );
      });
    });

    describe("calling a contract method that succeeds", function () {
      it("successful asserts", async function () {
        await runSuccessfulAsserts({
          matchers,
          method: "succeeds",
          successfulAssert: (x) => expect(x).to.not.be.reverted,
        });
      });

      it("failed asserts", async function () {
        await runFailedAsserts({
          matchers,
          method: "succeeds",
          failedAssert: (x) => expect(x).to.be.reverted,
          failedAssertReason: "Expected transaction to be reverted",
        });
      });
    });

    describe("calling a method that reverts without a reason", function () {
      it("successful asserts", async function () {
        await runSuccessfulAsserts({
          matchers,
          method: "revertsWithoutReason",
          successfulAssert: (x) => expect(x).to.be.reverted,
        });
      });

      it("failed asserts", async function () {
        await runFailedAsserts({
          matchers,
          method: "revertsWithoutReason",
          failedAssert: (x) => expect(x).not.to.be.reverted,
          failedAssertReason: "Expected transaction NOT to be reverted",
        });
      });
    });

    describe("calling a method that reverts with a reason string", function () {
      it("successful asserts", async function () {
        await runSuccessfulAsserts({
          matchers,
          method: "revertsWith",
          args: ["some reason"],
          successfulAssert: (x) => expect(x).to.be.reverted,
        });
      });

      it("failed asserts", async function () {
        await runFailedAsserts({
          matchers,
          method: "revertsWith",
          args: ["some reason"],
          failedAssert: (x) => expect(x).not.to.be.reverted,
          failedAssertReason:
            "Expected transaction NOT to be reverted, but it reverted with reason 'some reason'",
        });
      });
    });

    describe("calling a method that reverts with a panic code", function () {
      it("successful asserts", async function () {
        await runSuccessfulAsserts({
          matchers,
          method: "panicAssert",
          successfulAssert: (x) => expect(x).to.be.reverted,
        });
      });

      it("failed asserts", async function () {
        await runFailedAsserts({
          matchers,
          method: "panicAssert",
          failedAssert: (x) => expect(x).not.to.be.reverted,
          failedAssertReason:
            "Expected transaction NOT to be reverted, but it reverted with panic code 0x01 (Assertion error)",
        });
      });
    });

    describe("calling a method that reverts with a custom error", function () {
      it("successful asserts", async function () {
        await runSuccessfulAsserts({
          matchers,
          method: "revertWithSomeCustomError",
          successfulAssert: (x) => expect(x).to.be.reverted,
        });
      });

      it("failed asserts", async function () {
        await runFailedAsserts({
          matchers,
          method: "revertWithSomeCustomError",
          failedAssert: (x) => expect(x).not.to.be.reverted,
          failedAssertReason: "Expected transaction NOT to be reverted",
        });
      });
    });

    describe("invalid rejection values", function () {
      it("non-errors", async function () {
        await expectAssertionError(
          expect(Promise.reject({})).to.be.reverted,
          "Expected an Error object"
        );
      });

      it("errors that are not related to a reverted transaction", async function () {
        // use an address that almost surely doesn't have balance
        const randomPrivateKey =
          "0xc5c587cc6e48e9692aee0bf07474118e6d830c11905f7ec7ff32c09c99eba5f9";
        const account = privateKeyToAccount(randomPrivateKey);
        const wallet = await this.hre.viem.getWalletClient(account.address, {
          account,
        });

        // this transaction will fail because of lack of funds, not because of a
        // revert
        await expect(
          expect(
            matchers.write.revertsWithoutReason({
              gas: 1_000_000n,
              account: wallet.account,
            })
          ).to.not.be.reverted
        ).to.be.eventually.rejectedWith(
          TransactionExecutionError,
          "Sender doesn't have enough funds to send tx"
        );
      });
    });

    describe("stack traces", function () {
      // smoke test for stack traces
      it("includes test file", async function () {
        try {
          await expect(matchers.write.succeeds()).to.be.reverted;
        } catch (e: any) {
          const errorString = util.inspect(e);
          expect(errorString).to.include("Expected transaction to be reverted");
          expect(errorString).to.include(
            path.join("test", "reverted", "reverted.ts")
          );

          return;
        }

        expect.fail("Expected an exception but none was thrown");
      });
    });
  }
});
