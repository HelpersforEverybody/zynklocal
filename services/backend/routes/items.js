// routes/items.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const streamifier = require('streamifier');
const cloudinary = require('cloudinary').v2;
const mongoose = require('mongoose');

// Configure Cloudinary using env (same as you would elsewhere)
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME || '',
    api_key: process.env.CLOUDINARY_API_KEY || '',
    api_secret: process.env.CLOUDINARY_API_SECRET || '',
});

// multer memory storage
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }); // 5MB limit

// Get models registered on mongoose in server.js (server.js defines these models globally)
const MenuItem = mongoose.model('MenuItem');
const Shop = mongoose.model('Shop');

// POST /api/upload-cloud/:itemId
// Uploads the image data (field name "image") to Cloudinary and returns { imageUrl, publicId }
// Does not persist to DB; frontend can call the persist route (below) or we could persist here if desired.
router.post('/api/upload-cloud/:itemId', upload.single('image'), async (req, res) => {
    console.log('upload-cloud called for item', req.params.itemId);
    try {
        const itemId = req.params.itemId;
        if (!req.file) return res.status(400).json({ error: 'No file uploaded (field name: image)' });

        // stream upload to cloudinary
        const result = await new Promise((resolve, reject) => {
            const upload_stream = cloudinary.uploader.upload_stream(
                { folder: 'app_items', use_filename: true, unique_filename: false, resource_type: 'image' },
                (error, result) => {
                    if (error) return reject(error);
                    resolve(result);
                }
            );
            streamifier.createReadStream(req.file.buffer).pipe(upload_stream);
        });

        // result contains secure_url and public_id (public_id may be in result.public_id)
        const imageUrl = result.secure_url || result.url || null;
        const publicId = result.public_id || result.publicId || null;

        if (!imageUrl) return res.status(500).json({ error: 'Upload succeeded but no url returned by Cloudinary' });

        // Return object; frontend will call persist endpoint to save to DB (or you may persist here)
        return res.json({ imageUrl, publicId });
    } catch (err) {
        console.error('upload-cloud error', err && err.stack ? err.stack : err);
        return res.status(500).json({ error: 'upload failed', detail: (err && err.message) ? err.message : String(err) });
    }
});

// POST /api/shops/:shopId/items/:itemId/image
// Persist image metadata into the MenuItem record: { imageUrl, publicId }
router.post('/api/shops/:shopId/items/:itemId/image', async (req, res) => {
    try {
        const { shopId, itemId } = req.params;
        const { imageUrl, publicId } = req.body || {};

        if (!imageUrl && !publicId) return res.status(400).json({ error: 'imageUrl or publicId required' });

        const item = await MenuItem.findOne({ _id: itemId, shop: shopId });
        if (!item) return res.status(404).json({ error: 'item not found' });

        // store permissive keys so frontend/android can read either
        item.imageUrl = imageUrl || item.imageUrl || '';
        item.publicId = publicId || item.publicId || '';
        item.imagePublicId = publicId || item.imagePublicId || '';
        item.imageKey = publicId || item.imageKey || '';

        await item.save();
        return res.json({ ok: true, item });
    } catch (err) {
        console.error('persist image error', err && err.stack ? err.stack : err);
        return res.status(500).json({ error: 'failed to persist image', detail: (err && err.message) ? err.message : String(err) });
    }
});

// DELETE /api/shops/:shopId/items/:itemId/image
// Deletes Cloudinary asset (if publicId available) and clears DB fields
router.delete('/api/shops/:shopId/items/:itemId/image', async (req, res) => {
    try {
        const { shopId, itemId } = req.params;
        const body = req.body || {};
        const providedPublicId = body.publicId || body.public_id || null;

        // load item (to find stored publicId if none provided)
        const item = await MenuItem.findOne({ _id: itemId, shop: shopId });
        if (!item) return res.status(404).json({ error: 'item not found' });

        const publicId = providedPublicId || item.publicId || item.imagePublicId || item.imageKey || null;

        if (publicId) {
            try {
                const cloudRes = await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
                // cloudRes may be { result: 'ok' } or { result: 'not found' }, etc.
                console.log('cloudinary destroy result for', publicId, cloudRes);
            } catch (cloudErr) {
                console.error('Cloudinary destroy failed for', publicId, cloudErr && cloudErr.message ? cloudErr.message : cloudErr);
                // continue to clear DB fields even if Cloudinary deletion failed
            }
        } else {
            console.log('No publicId found for item', itemId, '- skipping cloudinary destroy');
        }

        // Clear image-related DB fields
        item.imageUrl = '';
        item.publicId = '';
        item.imagePublicId = '';
        item.imageKey = '';
        await item.save();

        return res.json({ ok: true });
    } catch (err) {
        console.error('delete image error', err && err.stack ? err.stack : err);
        return res.status(500).json({ error: 'failed to delete image', detail: (err && err.message) ? err.message : String(err) });
    }
});

module.exports = router;
