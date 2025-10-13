const Shop = require('../models/Shop');

exports.createShop = async (req, res) => {
    try {
        const shop = await Shop.create(req.body);
        res.json({ success: true, shop });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

exports.listShops = async (req, res) => {
    try {
        const shops = await Shop.find();
        res.json({ success: true, shops });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
