const router = require('express').Router();
const shopController = require('../controllers/shopController');

router.post('/create', shopController.createShop);
router.get('/', shopController.listShops);

module.exports = router;
