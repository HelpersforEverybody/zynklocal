const mongoose = require('mongoose');

const shopSchema = new mongoose.Schema({
    name: { type: String, required: true },
    phone: { type: String, required: true, unique: true },
    description: { type: String, default: '' },
    address: { type: String, required: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    lastOrderNumber: { type: Number, default: 0 },
    pincode: { type: String, required: true },
    online: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now },
}, { timestamps: true });

shopSchema.index({ pincode: 1 });

module.exports = mongoose.models.Shop || mongoose.model('Shop', shopSchema);
