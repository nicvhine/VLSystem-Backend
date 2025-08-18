const axios = require('axios');

class PayMongoService {
    constructor() {
        this.apiKey = process.env.PAYMONGO_SECRET_KEY;
        this.baseURL = 'https://api.paymongo.com/v1';
        this.headers = {
            'Authorization': `Basic ${Buffer.from(this.apiKey + ':').toString('base64')}`,
            'Content-Type': 'application/json'
        };
    }

    // Create Payment Intent for Credit/Debit Cards, GCash, and GrabPay
    async createPaymentIntent(amount, currency = 'PHP', description = 'Loan Payment') {
        try {
            const response = await axios.post(`${this.baseURL}/payment_intents`, {
                data: {
                    attributes: {
                        amount: amount * 100, // PayMongo expects amount in centavos
                        payment_method_allowed: ['card', 'gcash', 'grab_pay'],
                        payment_method_options: {
                            card: {
                                request_three_d_secure: 'automatic'
                            }
                        },
                        currency,
                        description,
                        capture_type: 'automatic'
                    }
                }
            }, { headers: this.headers });

            return response.data;
        } catch (error) {
            console.error('PayMongo createPaymentIntent error:', error.response?.data || error.message);
            throw new Error('Failed to create payment intent');
        }
    }

    // Create Payment Method
    async createPaymentMethod(type, details) {
        try {
            let payload = {
                data: {
                    attributes: {
                        type,
                        details
                    }
                }
            };

            const response = await axios.post(`${this.baseURL}/payment_methods`, payload, { headers: this.headers });
            return response.data;
        } catch (error) {
            console.error('PayMongo createPaymentMethod error:', error.response?.data || error.message);
            throw new Error('Failed to create payment method');
        }
    }

    // Attach Payment Method to Payment Intent
    async attachPaymentIntent(paymentIntentId, paymentMethodId) {
        try {
            const response = await axios.post(`${this.baseURL}/payment_intents/${paymentIntentId}/attach`, {
                data: {
                    attributes: {
                        payment_method: paymentMethodId
                    }
                }
            }, { headers: this.headers });

            return response.data;
        } catch (error) {
            console.error('PayMongo attachPaymentIntent error:', error.response?.data || error.message);
            throw new Error('Failed to attach payment intent');
        }
    }

    // Retrieve Payment Intent
    async retrievePaymentIntent(paymentIntentId) {
        try {
            const response = await axios.get(`${this.baseURL}/payment_intents/${paymentIntentId}`, { headers: this.headers });
            return response.data;
        } catch (error) {
            console.error('PayMongo retrievePaymentIntent error:', error.response?.data || error.message);
            throw new Error('Failed to retrieve payment intent');
        }
    }

    // Create Checkout Session for GCash and QRPH
    async createCheckoutSession(amount, currency = 'PHP', description = 'Loan Payment', paymentMethods = ['gcash', 'qrph']) {
        try {
            const response = await axios.post(`${this.baseURL}/checkout_sessions`, {
                data: {
                    attributes: {
                        amount: amount * 100, // PayMongo expects amount in centavos
                        currency,
                        description,
                        payment_method_types: paymentMethods,
                        success_url: process.env.PAYMONGO_SUCCESS_URL,
                        cancel_url: process.env.PAYMONGO_CANCEL_URL
                    }
                }
            }, { headers: this.headers });

            return response.data;
        } catch (error) {
            console.error('PayMongo createCheckoutSession error:', error.response?.data || error.message);
            throw new Error('Failed to create checkout session');
        }
    }
}

module.exports = new PayMongoService();