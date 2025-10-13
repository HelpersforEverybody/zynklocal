// services/backend/routes/testShop.js
const express = require('express');
const Shop = require('../models/Shop');
const router = express.Router();

// create a dummy shop (for testing)
router.post('/create', async (req, res) => {
    try {
        const shop = await Shop.create({
            name: 'Test Store',
            phone: '9999999999',
            address: 'Main Street',
            pincode: '400001',
            isOnline: true,
        });
        res.json({ success: true, shop });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// list all shops (for testing)
router.get('/list', async (req, res) => {
    try {
        const shops = await Shop.find();
        res.json({ success: true, count: shops.length, shops });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
