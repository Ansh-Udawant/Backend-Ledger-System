const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        type: 'OAuth2',
        user: process.env.EMAIL_USER,
        clientId: process.env.CLIENT_ID,
        clientSecret: process.env.CLIENT_SECRET,
        refreshToken: process.env.REFRESH_TOKEN,
    },
});

// Verify the connection configuration
transporter.verify((error, success) => {
    if (error) {
        console.error('Error connecting to email server:', error);
    } else {
        console.log('Email server is ready to send messages');
    }
});


// Function to send email
const sendEmail = async (to, subject, text, html) => {
    console.log(`[Email Service] Attempting to send email to: ${to} | Subject: "${subject}"`);
    try {
        const info = await transporter.sendMail({
            from: `"Backend Ledger" <${process.env.EMAIL_USER}>`, // sender address
            to, // list of receivers
            subject, // Subject line
            text, // plain text body
            html, // html body
        });

        console.log('Message sent: %s', info.messageId);
        console.log('Preview URL: %s', nodemailer.getTestMessageUrl(info));
    } catch (error) {
        console.error('Error sending email:', error);
    }
};


async function sendRegistrationEmail(userEmail, name) {
    const subject = 'Welcome to Backend Ledger!';
    const text = `Hello ${name},\n\nThank you for registering at Backend Ledger. We're excited to have you on board!\n\nBest regards,\nThe Backend Ledger Team`;
    const html = `<p>Hello ${name},</p><p>Thank you for registering at Backend Ledger. We're excited to have you on board!</p><p>Best regards,<br>The Backend Ledger Team</p>`;

    await sendEmail(userEmail, subject, text, html);
}

async function sendInitialFundsEmail(userEmail, name, amount, toAccount) {
    const subject = 'Initial Funds Credited!';
    const text = `Hello ${name},\n\nGood news! Your account ${toAccount} has been successfully credited with initial funds of INR ${amount}.\n\nBest regards,\nThe Backend Ledger Team`;
    const html = `<p>Hello ${name},</p><p>Good news! Your account <code>${toAccount}</code> has been successfully credited with initial funds of <strong>INR ${amount}</strong>.</p><p>Best regards,<br>The Backend Ledger Team</p>`;

    await sendEmail(userEmail, subject, text, html);
}

async function sendTransferSuccessEmail(userEmail, name, amount, toAccount, remainingBalance, transactionId) {
    const subject = 'Transaction Successful!';
    const text = `Hello ${name},\n\nYour transaction was successful!\n\nTransaction Details:\n- Transaction ID: ${transactionId}\n- Sent To Account: ${toAccount}\n- Amount: INR ${amount}\n- Remaining Balance: INR ${remainingBalance}\n\nThank you for using Backend Ledger.\n\nBest regards,\nThe Backend Ledger Team`;
    const html = `<p>Hello ${name},</p><p>Your transaction was successful!</p><h3>Transaction Details:</h3><ul><li><strong>Transaction ID:</strong> <code>${transactionId}</code></li><li><strong>Sent To Account:</strong> <code>${toAccount}</code></li><li><strong>Amount:</strong> INR ${amount}</li><li><strong>Remaining Balance:</strong> <strong>INR ${remainingBalance}</strong></li></ul><p>Thank you for using Backend Ledger.</p><p>Best regards,<br>The Backend Ledger Team</p>`;

    await sendEmail(userEmail, subject, text, html);
}

async function sendTransactionFailureEmail(userEmail, name, amount, toAccount, reason) {
    const subject = 'Transaction Failed';
    const text = `Hello ${name},\n\nWe regret to inform you that your transaction of INR ${amount} to account ${toAccount} has failed.\n\nReason for failure: ${reason}\n\nPlease try again later.\n\nBest regards,\nThe Backend Ledger Team`;
    const html = `<p>Hello ${name},</p><p>We regret to inform you that your transaction of <strong>INR ${amount}</strong> to account <code>${toAccount}</code> has failed.</p><p><strong>Reason for failure:</strong> <span style="color: red;">${reason}</span></p><p>Please try again later.</p><p>Best regards,<br>The Backend Ledger Team</p>`;

    await sendEmail(userEmail, subject, text, html);
}

module.exports = {
    sendRegistrationEmail,
    sendInitialFundsEmail,
    sendTransferSuccessEmail,
    sendTransactionFailureEmail
};