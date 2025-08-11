require('dotenv').config();
const express = require('express');
const router = express.Router();
const { MongoClient, ObjectId } = require('mongodb');
const paymongoService = require('../services/paymongoService');

module.exports = function (db) {


const uri = process.env.MONGODB_URI;

// Helper function to safely create ObjectId
function createObjectId(id) {
    try {
        if (ObjectId.isValid(id)) {
            return new ObjectId(id);
        }
        return null;
    } catch (error) {
        console.error('Invalid ObjectId:', error);
        return null;
    }
}

// Create payment intent
router.post('/create-payment-intent', async (req, res) => {
    let client;
    try {
        const { amount, loanId, description } = req.body;

        // Validate input
        if (!amount || !loanId) {
            return res.status(400).json({
                success: false,
                message: 'Amount and loan ID are required'
            });
        }

        // Create payment intent with PayMongo
        const paymentIntent = await paymongoService.createPaymentIntent(
            amount,
            'PHP',
            description || `Payment for Loan ${loanId}`
        );

        // Store payment record in database
        client = new MongoClient(uri);
        await client.connect();
        const db = client.db('VLSystem');
        
        const paymentRecord = {
            loanId: loanId,
            paymentIntentId: paymentIntent.data.id,
            amount: amount,
            currency: 'PHP',
            status: 'pending',
            paymongoData: paymentIntent.data,
            createdAt: new Date(),
            updatedAt: new Date()
        };

        const result = await db.collection('payments').insertOne(paymentRecord);

        res.json({
            success: true,
            paymentIntent: paymentIntent.data,
            paymentId: result.insertedId.toString()
        });

    } catch (error) {
        console.error('Create payment intent error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create payment intent',
            error: error.message
        });
    } finally {
        if (client) {
            await client.close();
        }
    }
});

// Process payment
router.post('/process-payment', async (req, res) => {
    let client;
    try {
        const { paymentIntentId, paymentMethodId, loanId } = req.body;

        if (!paymentIntentId || !paymentMethodId || !loanId) {
            return res.status(400).json({
                success: false,
                message: 'Payment intent ID, payment method ID, and loan ID are required'
            });
        }

        // Attach payment method to payment intent
        const result = await paymongoService.attachPaymentIntent(paymentIntentId, paymentMethodId);

        client = new MongoClient(uri);
        await client.connect();
        const db = client.db('VLSystem');

        // Update payment record
        await db.collection('payments').updateOne(
            { paymentIntentId: paymentIntentId },
            {
                $set: {
                    status: result.data.attributes.status,
                    paymentMethodId: paymentMethodId,
                    paymongoData: result.data,
                    updatedAt: new Date()
                }
            }
        );

        // If payment is successful, update loan balance
        if (result.data.attributes.status === 'succeeded') {
            const payment = await db.collection('payments').findOne({ paymentIntentId: paymentIntentId });
            
            if (payment) {
                // Update loan balance
                await db.collection('loans').updateOne(
                    { loanId: loanId },
                    {
                        $inc: { 
                            totalPaid: payment.amount,
                            remainingBalance: -payment.amount 
                        },
                        $set: { updatedAt: new Date() }
                    }
                );

                // Add to payment history
                await db.collection('paymentHistory').insertOne({
                    loanId: loanId,
                    paymentId: payment._id.toString(),
                    amount: payment.amount,
                    paymentMethod: 'PayMongo',
                    referenceNumber: paymentIntentId,
                    datePaid: new Date(),
                    status: 'completed',
                    createdAt: new Date()
                });
            }
        }

        res.json({
            success: true,
            payment: result.data,
            status: result.data.attributes.status
        });

    } catch (error) {
        console.error('Process payment error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to process payment',
            error: error.message
        });
    } finally {
        if (client) {
            await client.close();
        }
    }
});

// Get loan payment details
router.get('/loan-details/:loanId', async (req, res) => {
    let client;
    try {
        const { loanId } = req.params;

        client = new MongoClient(uri);
        await client.connect();
        const db = client.db('VLSystem');

        // Get loan details
        const loan = await db.collection('loans').findOne({ loanId: loanId });
        
        if (!loan) {
            return res.status(404).json({
                success: false,
                message: 'Loan not found'
            });
        }

        // Get payment history
        const payments = await db.collection('paymentHistory')
            .find({ loanId: loanId })
            .sort({ datePaid: -1 })
            .toArray();

        // Calculate next payment amount
        const nextPaymentAmount = Math.min(25000, loan.remainingBalance || 0);

        res.json({
            success: true,
            loan: {
                ...loan,
                _id: loan._id.toString()
            },
            payments: payments.map(payment => ({
                ...payment,
                _id: payment._id ? payment._id.toString() : null
            })),
            nextPaymentAmount
        });

    } catch (error) {
        console.error('Get loan details error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get loan details',
            error: error.message
        });
    } finally {
        if (client) {
            await client.close();
        }
    }
});

// Simple test endpoint to verify ObjectId works
router.get('/test-objectid', async (req, res) => {
    try {
        const testId = new ObjectId();
        res.json({
            success: true,
            message: 'ObjectId works correctly',
            testId: testId.toString()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'ObjectId error',
            error: error.message
        });
    }
});

return router;
};

