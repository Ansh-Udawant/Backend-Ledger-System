const transactionModel = require("../models/transaction.model")
const ledgerModel = require("../models/ledger.model")
const accountModel = require("../models/account.model")
const emailService = require("../services/email.service")
const mongoose = require("mongoose")

/**
 * - Create a new transaction
 * THE 10-STEP TRANSFER FLOW:
     * 1. Validate request
     * 2. Validate idempotency key
     * 3. Check account status
     * 4. Derive sender balance from ledger
     * 5. Create transaction (PENDING)
     * 6. Create DEBIT ledger entry
     * 7. Create CREDIT ledger entry
     * 8. Mark transaction COMPLETED
     * 9. Commit MongoDB session
     * 10. Send email notification
 */

async function createTransaction(req, res) {

    /**
     * 1. Validate request
     */
    const { fromAccount, toAccount, amount, idempotencyKey } = req.body

    if (!fromAccount || !toAccount || !amount || !idempotencyKey) {
        return res.status(400).json({
            message: "FromAccount, toAccount, amount and idempotencyKey are required"
        })
    }

    const fromUserAccount = await accountModel.findOne({
        _id: fromAccount,
    })

    const toUserAccount = await accountModel.findOne({
        _id: toAccount,
    })

    if (!fromUserAccount || !toUserAccount) {
        const reason = "Invalid fromAccount or toAccount"
        try {
            await emailService.sendTransactionFailureEmail(req.user.email, req.user.name, amount, toAccount, reason)
        } catch (emailError) {
            console.error("Failed to send transaction failure email:", emailError)
        }
        return res.status(400).json({
            message: reason
        })
    }

    /**
     * 2. Validate idempotency key
     */

    const isTransactionAlreadyExists = await transactionModel.findOne({
        idempotencyKey: idempotencyKey
    })

    if (isTransactionAlreadyExists) {
        if (isTransactionAlreadyExists.status === "COMPLETED") {
            return res.status(200).json({
                message: "Transaction already processed",
                transaction: isTransactionAlreadyExists
            })

        }

        if (isTransactionAlreadyExists.status === "PENDING") {
            return res.status(200).json({
                message: "Transaction is still processing",
            })
        }

        if (isTransactionAlreadyExists.status === "FAILED") {
            return res.status(500).json({
                message: "Transaction processing failed, please retry"
            })
        }

        if (isTransactionAlreadyExists.status === "REVERSED") {
            return res.status(500).json({
                message: "Transaction was reversed, please retry"
            })
        }
    }

    /**
     * 3. Check account status
     */

    if (fromUserAccount.status !== "ACTIVE" || toUserAccount.status !== "ACTIVE") {
        const reason = "Both fromAccount and toAccount must be ACTIVE to process transaction"
        try {
            await emailService.sendTransactionFailureEmail(req.user.email, req.user.name, amount, toAccount, reason)
        } catch (emailError) {
            console.error("Failed to send transaction failure email:", emailError)
        }
        return res.status(400).json({
            message: reason
        })
    }

    /**
     * 4. Derive sender balance from ledger
     */
    const balance = await fromUserAccount.getBalance()

    if (balance < amount) {
        const reason = `Insufficient balance. Current balance is ${balance}. Requested amount is ${amount}`
        try {
            await emailService.sendTransactionFailureEmail(req.user.email, req.user.name, amount, toAccount, reason)
        } catch (emailError) {
            console.error("Failed to send transaction failure email:", emailError)
        }
        return res.status(400).json({
            message: reason
        })
    }

    let transaction;
    let session;
    try {


        /**
         * 5. Create transaction (PENDING)
         */
        session = await mongoose.startSession()
        session.startTransaction()

        transaction = (await transactionModel.create([ {
            fromAccount,
            toAccount,
            amount,
            idempotencyKey,
            status: "PENDING"
        } ], { session }))[ 0 ]

        const debitLedgerEntry = await ledgerModel.create([ {
            account: fromAccount,
            amount: amount,
            transaction: transaction._id,
            type: "DEBIT"
        } ], { session })

        const creditLedgerEntry = await ledgerModel.create([ {
            account: toAccount,
            amount: amount,
            transaction: transaction._id,
            type: "CREDIT"
        } ], { session })

        await transactionModel.findOneAndUpdate(
            { _id: transaction._id },
            { status: "COMPLETED" },
            { session }
        )


        await session.commitTransaction()
        session.endSession()
    } catch (error) {
        if (session) {
            await session.abortTransaction()
            session.endSession()
        }
        
        // Send failure email notification with reason
        try {
            await emailService.sendTransactionFailureEmail(req.user.email, req.user.name, amount, toAccount, error.message)
        } catch (emailError) {
            console.error("Failed to send transaction failure email:", emailError)
        }

        return res.status(400).json({
            message: "Transaction failed, please retry",
            error: error.message
        })
    }

    const remainingBalance = await fromUserAccount.getBalance()

    console.log(`[Transaction Controller] Transfer successful. Remaining Balance: ${remainingBalance}. Triggering success email for user: ${req.user?.email}`);

    /**
     * 10. Send email notification
     */
    try {
        await emailService.sendTransferSuccessEmail(
            req.user.email,
            req.user.name,
            amount,
            toAccount,
            remainingBalance,
            transaction._id
        )
    } catch (emailError) {
        console.error("Failed to send transfer success email:", emailError)
    }

    return res.status(201).json({
        message: "Transaction completed successfully",
        transaction: transaction
    })

}

async function createInitialFundsTransaction(req, res) {
    const { toAccount, amount, idempotencyKey } = req.body

    if (!toAccount || !amount || !idempotencyKey) {
        return res.status(400).json({
            message: "toAccount, amount and idempotencyKey are required"
        })
    }

    const toUserAccount = await accountModel.findOne({
        _id: toAccount,
    }).populate("user")

    if (!toUserAccount) {
        return res.status(400).json({
            message: "Invalid toAccount"
        })
    }

    const fromUserAccount = await accountModel.findOne({
        user: req.user._id
    })

    if (!fromUserAccount) {
        return res.status(400).json({
            message: "System user account not found"
        })
    }


    let session;
    try {
        session = await mongoose.startSession()
        session.startTransaction()

        const [ transaction ] = await transactionModel.create([ {
            fromAccount: fromUserAccount._id,
            toAccount,
            amount,
            idempotencyKey,
            status: "PENDING"
        } ], { session })

        const debitLedgerEntry = await ledgerModel.create([ {
            account: fromUserAccount._id,
            amount: amount,
            transaction: transaction._id,
            type: "DEBIT"
        } ], { session })

        const creditLedgerEntry = await ledgerModel.create([ {
            account: toAccount,
            amount: amount,
            transaction: transaction._id,
            type: "CREDIT"
        } ], { session })

        await transactionModel.findOneAndUpdate(
            { _id: transaction._id },
            { status: "COMPLETED" },
            { session }
        )

        await session.commitTransaction()
        session.endSession()

        // Send email to the recipient
        try {
            if (toUserAccount && toUserAccount.user) {
                await emailService.sendInitialFundsEmail(
                    toUserAccount.user.email,
                    toUserAccount.user.name,
                    amount,
                    toAccount
                )
            }
        } catch (emailError) {
            console.error("Failed to send initial funds email:", emailError)
        }

        return res.status(201).json({
            message: "Initial funds transaction completed successfully",
            transaction: transaction
        })
    } catch (error) {
        if (session) {
            await session.abortTransaction()
            session.endSession()
        }
        return res.status(400).json({
            message: "Initial funds transaction failed",
            error: error.message
        })
    }


}

module.exports = {
    createTransaction,
    createInitialFundsTransaction
}

