﻿// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const Counter = require('./models/Counter');
const mongoose = require('mongoose');
const Shop = require('./models/Shop');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cloudinary = require('cloudinary').v2;


const app = express();
const server = http.createServer(app);
const { Server } = require('socket.io');
// configure cloudinary from env (make sure these env vars exist)
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME || '',
    api_key: process.env.CLOUDINARY_API_KEY || '',
    api_secret: process.env.CLOUDINARY_API_SECRET || '',
    secure: true
});
const memUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
// FRONTEND origin (can be set in env)
const FRONTEND_ORIGIN = (process.env.FRONTEND_ORIGIN || "https://whatsapp-saas-frontend1.onrender.com").trim();

// --- CORS setup (replace any existing corsOptions & app.use(cors(...)) ) ---
// List allowed origins (add any other frontend domains here)
const ALLOWED_ORIGINS = [
    FRONTEND_ORIGIN,
    "https://zync-customer-frontend.onrender.com",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "capacitor://localhost",
    "http://localhost",
    "http://10.0.2.2:5173"
].filter(Boolean);

// CORS options allowing credentials and preflight
const corsOptions = {
    origin: function (origin, callback) {
        // allow non-browser requests (curl, Postman, server-to-server)
        if (!origin) return callback(null, true);

        // exact match allowed origins
        if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);

        // allow any localhost-like origin (helps when using LAN IPs during dev)
        try {
            const u = new URL(origin);
            if (u.hostname === "localhost" || u.hostname === "127.0.0.1") return callback(null, true);
        } catch (e) {
            // ignore invalid origin URL parse
        }

        // not allowed
        console.warn('CORS: blocked origin ->', origin);
        return callback(new Error('Not allowed by CORS'));
    },
    methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-api-key"],
    credentials: true,            // allow cookies / credentials
    preflightContinue: false,
    optionsSuccessStatus: 204
};

// Explicitly handle preflight OPTIONS requests (fast path)
app.options('*', cors(corsOptions));

// Apply CORS and body parsing
app.use(cors(corsOptions));


// apply cors + body parsing middleware
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use('/api/shops', require('./routes/shops'));

// POST /api/upload-cloud/:itemId
// Accepts multipart/form-data field "image". Returns JSON { imageUrl, publicId }
app.post('/api/upload-cloud/:itemId', requireOwner, memUpload.single('image'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

        // stream upload to cloudinary
        const streamUpload = (buffer) => {
            return new Promise((resolve, reject) => {
                const stream = cloudinary.uploader.upload_stream(
                    { folder: process.env.CLOUDINARY_FOLDER || 'menu_items' },
                    (error, result) => {
                        if (error) return reject(error);
                        resolve(result);
                    }
                );
                stream.end(buffer);
            });
        };

        const result = await streamUpload(req.file.buffer);
        // result.secure_url is the HTTPS URL
        const imageUrl = result.secure_url;
        const publicId = result.public_id;

        // Optionally persist onto MenuItem (best-effort). Use params: itemId and shop from req.body or try matching ownership
        try {
            const itemId = req.params.itemId;
            if (itemId) {
                // if you want to restrict by shop ownership, pass shop id in body or use req.body.shop
                await MenuItem.findOneAndUpdate(
                    { _id: itemId },
                    { $set: { imageUrl, imageKey: publicId } },
                    { new: true }
                ).exec();
            }
        } catch (dbErr) {
            console.warn('Warning: could not persist cloudinary image info:', dbErr && dbErr.message ? dbErr.message : dbErr);
            // ignore DB errors; upload succeeded so we still return imageUrl
        }

        return res.json({ imageUrl, publicId });
    } catch (err) {
        console.error('upload-cloud error', err);
        return res.status(500).json({ error: 'upload failed', detail: err && err.message ? err.message : err });
    }
});

// Socket.IO (allow any origin for socket connections; it's separate from express CORS)
const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'] },
});

io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    socket.on('joinOrder', ({ orderId }) => {
        if (!orderId) return;
        socket.join(`order:${orderId}`);
        console.log(`Socket ${socket.id} joined order:${orderId}`);
    });
    socket.on('disconnect', () => console.log('Client disconnected:', socket.id));
});
function emitOrderUpdate(orderId, payload) {
    io.to(`order:${orderId}`).emit('orderStatusUpdate', payload);
}

const PORT = process.env.PORT || 3000;

/* env helpers */
const API_KEY_ENV = (process.env.API_KEY || '').toString().trim();
const JWT_SECRET = (process.env.JWT_SECRET || '').toString().trim();
const ADMIN_PASSWORD = (process.env.ADMIN_PASSWORD || '').toString().trim();

/* DB connect */
mongoose
    .connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('✅ MongoDB connected'))
    .catch((err) => console.error('❌ MongoDB connection error:', err));

/* Models */

// User (merchant)
const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    passwordHash: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
});
userSchema.methods.verifyPassword = function (plain) {
    return bcrypt.compareSync(String(plain), this.passwordHash);
};
const User = mongoose.models.User || mongoose.model('User', userSchema);

// Customer address subdoc now has isDefault flag
const customerAddressSchema = new mongoose.Schema({
    label: { type: String, default: '' }, // Home/Work/Other (optional)
    name: { type: String, default: '' }, // receiver name for this address
    address: { type: String, required: true },
    phone: { type: String, default: '' }, // normalized phone for this address
    pincode: { type: String, required: true },
    isDefault: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
});

// Customer model
const customerSchema = new mongoose.Schema({
    name: { type: String, default: 'Customer' },
    phone: { type: String, required: true, unique: true }, // normalized +91...
    addresses: [customerAddressSchema],
    createdAt: { type: Date, default: Date.now },
});
customerSchema.index({ phone: 1 });
const Customer = mongoose.models.Customer || mongoose.model('Customer', customerSchema);



// MenuItem
const menuItemSchema = new mongoose.Schema({
    shop: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', required: true },
    name: { type: String, required: true },
    price: { type: Number, default: 0 }, // base price (used if no variants)
    available: { type: Boolean, default: true },
    externalId: { type: String },

    // store image URL (public) and optional storage key (S3 key or filename)
    imageUrl: { type: String, default: "" },
    imageKey: { type: String, default: "" },

    // New: variants array for sub-items/options
    variants: [
        {
            id: { type: String },
            label: { type: String },
            price: { type: Number, default: 0 },
            available: { type: Boolean, default: true }
        }
    ],
    createdAt: { type: Date, default: Date.now },
});

menuItemSchema.index({ shop: 1, externalId: 1 });
const MenuItem = mongoose.models.MenuItem || mongoose.model('MenuItem', menuItemSchema);

// Order (store optional customer ref and snapshot address)
const orderSchema = new mongoose.Schema({
    shop: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop' },
    orderNumber: { type: Number, default: null },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
    customerName: { type: String, required: true },
    phone: { type: String, required: true },
    address: {
        label: String,
        address: String,
        phone: String,
        pincode: String,
    },
    items: [
        {
            name: String,
            qty: { type: Number, default: 1 },
            price: { type: Number, default: 0 },
        },
    ],
    total: { type: Number, default: 0 },
    status: { type: String, default: 'received' },
    createdAt: { type: Date, default: Date.now },
});
const Order = mongoose.models.Order || mongoose.model('Order', orderSchema);

/* Twilio (optional) */
let twClient = null;
const TWILIO_FROM = process.env.TWILIO_WHATSAPP_NUMBER || null;
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && TWILIO_FROM) {
    const Twilio = require('twilio');
    twClient = Twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    console.log('✅ Twilio configured');
} else {
    console.log('ℹ️ Twilio not configured');
}
async function sendWhatsAppMessageSafe(toPhone, text) {
    if (!twClient || !TWILIO_FROM) {
        console.log('Twilio not configured, skipping send:', text);
        return null;
    }
    try {
        const msg = await twClient.messages.create({ from: TWILIO_FROM, to: `whatsapp:${toPhone}`, body: text });
        console.log('Twilio message SID:', msg.sid);
        return msg;
    } catch (err) {
        console.error('Twilio send error:', err && err.message ? err.message : err);
        return null;
    }
}

/* Auth helpers */
function verifyJwtToken(authHeader) {
    if (!authHeader) return null;
    const parts = authHeader.split(/\s+/);
    if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') return null;
    const token = parts[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        return decoded;
    } catch (e) {
        return null;
    }
}

// require either valid API key or JWT (admin/merchant)
const requireApiKeyOrJwt = (req, res, next) => {
    const key = (req.get('x-api-key') || req.query.api_key || '').toString().trim();
    if (!API_KEY_ENV) {
        return res.status(500).json({ error: 'server misconfigured: API_KEY missing' });
    }

    const authHeader = (req.get('authorization') || '').toString().trim();
    if (authHeader) {
        const decoded = verifyJwtToken(authHeader);
        if (decoded && (decoded.role === 'admin' || decoded.role === 'merchant')) {
            req.auth = decoded;
            return next();
        }
    }

    if (key && key === API_KEY_ENV) return next();
    return res.status(401).json({ error: 'unauthorized' });
};

// requireOwner - ensure merchant JWT and shop ownership if shopId provided
const requireOwner = async (req, res, next) => {
    const authHeader = (req.get('authorization') || '').toString().trim();
    const decoded = verifyJwtToken(authHeader);
    if (!decoded || decoded.role !== 'merchant') {
        return res.status(401).json({ error: 'unauthorized' });
    }
    req.merchantId = decoded.userId;

    const shopId = req.params.shopId || req.body.shopId || req.body.shop;
    if (shopId) {
        try {
            const shop = await Shop.findById(shopId).lean();
            if (!shop) return res.status(404).json({ error: 'shop not found' });
            if (!shop.owner || String(shop.owner) !== String(req.merchantId)) {
                return res.status(403).json({ error: 'forbidden: not owner of shop' });
            }
        } catch (e) {
            return res.status(400).json({ error: 'invalid shop id' });
        }
    }
    next();
};
// ---------- Image upload (local dev) ----------
// Minimal multer-based upload handler that saves to ./uploads and returns JSON { imageUrl }
// Requires: npm i multer


const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// simple disk storage with timestamped filename
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname) || '.jpg';
        const name = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
        cb(null, name);
    }
});
const upload = multer({
    storage,
    limits: { fileSize: 8 * 1024 * 1024 }, // 8MB limit
    fileFilter: (req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) return cb(new Error('Not an image'), false);
        cb(null, true);
    }
});

// serve uploads folder publicly
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// POST /api/upload-local/:itemId
// Accepts multipart/form-data field "image". Returns JSON { imageUrl }
app.post('/api/upload-local/:itemId', requireOwner, upload.single('image'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

        // public URL (adjust if you serve behind a proxy or use absolute URL)
        const imageUrl = `/uploads/${req.file.filename}`;

        // Optional: attach to MenuItem right away (best-effort)
        try {
            const itemId = req.params.itemId;
            if (itemId) {
                await MenuItem.findOneAndUpdate({ _id: itemId, shop: req.body.shop || undefined }, { $set: { imageUrl, imageKey: req.file.filename } }).exec();
            }
        } catch (e) {
            // ignore DB errors here — we'll still return imageUrl
            console.warn('Warning: could not persist imageUrl on upload:', e && e.message ? e.message : e);
        }

        return res.json({ imageUrl });
    } catch (err) {
        console.error('upload-local error', err);
        return res.status(500).json({ error: 'upload failed', detail: (err && err.message) || err });
    }
});

// Persist imageUrl explicitly via API (frontend calls this after presigned/S3 or after upload)
app.post('/api/shops/:shopId/items/:itemId/image', requireOwner, async (req, res) => {
    try {
        const { imageUrl, imageKey } = req.body || {};
        if (!imageUrl) return res.status(400).json({ error: 'imageUrl required' });

        const updated = await MenuItem.findOneAndUpdate(
            { _id: req.params.itemId, shop: req.params.shopId },
            { $set: { imageUrl, imageKey: imageKey || "" } },
            { new: true }
        ).lean();

        if (!updated) return res.status(404).json({ error: 'item not found or not owner' });
        return res.json({ imageUrl: updated.imageUrl });
    } catch (err) {
        console.error('persist image error', err);
        return res.status(500).json({ error: 'failed to save image url' });
    }
});

// requireCustomer - verify JWT with role 'customer'
const requireCustomer = (req, res, next) => {
    const authHeader = (req.get('authorization') || '').toString().trim();
    if (!authHeader) return res.status(401).json({ error: 'unauthorized' });
    const decoded = verifyJwtToken(authHeader);
    if (!decoded || decoded.role !== 'customer') return res.status(401).json({ error: 'unauthorized' });
    req.customerId = decoded.userId;
    next();
};

/* Customer signup & OTP flow */

// Helper: normalize incoming phone to a consistent string (E.164-like).
function normalizePhoneInput(phone) {
    if (!phone) return null;
    const digits = String(phone).replace(/\D/g, '');
    if (digits.length === 10) return `+91${digits}`;
    if (digits.length === 11 && digits.startsWith('0')) return `+91${digits.slice(1)}`;
    if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
    if (String(phone || "").trim().startsWith('+') && digits.length >= 7) return `+${digits}`;
    return null;
}

/* rest of your routes (auth, shops, menu, orders, customer addresses, etc.)
   I will reuse your existing inline route code exactly as-is so nothing is lost.
   (Below I place the same route implementations you provided earlier.)
*/

// Admin login
app.post('/auth/login', (req, res) => {
    try {
        const { password } = req.body || {};
        if (!ADMIN_PASSWORD) return res.status(500).json({ error: 'server misconfigured: ADMIN_PASSWORD missing' });
        if (!JWT_SECRET) return res.status(500).json({ error: 'server misconfigured: JWT_SECRET missing' });
        if (!password || password !== ADMIN_PASSWORD) return res.status(401).json({ error: 'invalid credentials' });
        const token = jwt.sign({ role: 'admin', issuedAt: Date.now() }, JWT_SECRET, { expiresIn: '12h' });
        return res.json({ token, expiresIn: 12 * 3600 });
    } catch (e) {
        console.error('Login error', e);
        return res.status(500).json({ error: 'server error' });
    }
});

// Merchant signup (create shop required)
app.post('/auth/signup', async (req, res) => {
    try {
        const { name, email, password, createShop } = req.body || {};
        if (!name || !email || !password) return res.status(400).json({ error: 'name,email,password required' });
        const existing = await User.findOne({ email: email.toLowerCase() });
        if (existing) return res.status(409).json({ error: 'email already registered' });
        const saltRounds = Number(process.env.SALT_ROUNDS || 10);
        const hash = bcrypt.hashSync(String(password), saltRounds);
        const user = await User.create({ name, email: email.toLowerCase(), passwordHash: hash });

        let shop = null;
        if (!createShop || !createShop.name || !createShop.phone || !createShop.address || !createShop.pincode) {
            return res.status(400).json({ error: 'createShop with name, phone, address and pincode is required' });
        } else {
            shop = await Shop.create({
                name: createShop.name,
                phone: createShop.phone,
                description: createShop.description || '',
                address: createShop.address,
                pincode: (createShop.pincode || '').toString(),
                online: true,
                owner: user._id,
            });
        }

        return res.status(201).json({ userId: user._id, shopId: shop ? shop._id : null });
    } catch (e) {
        console.error('Signup error', e);
        return res.status(500).json({ error: 'server error' });
    }
});

// Merchant login
app.post('/auth/merchant-login', async (req, res) => {
    try {
        const { email, password } = req.body || {};
        if (!email || !password) return res.status(400).json({ error: 'email and password required' });
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) return res.status(401).json({ error: 'invalid credentials' });
        const ok = user.verifyPassword(password);
        if (!ok) return res.status(401).json({ error: 'invalid credentials' });
        if (!JWT_SECRET) return res.status(500).json({ error: 'server misconfigured: JWT_SECRET missing' });
        const token = jwt.sign({ role: 'merchant', userId: String(user._id) }, JWT_SECRET, { expiresIn: '12h' });
        return res.json({ token, userId: user._id });
    } catch (e) {
        console.error('Merchant login error', e);
        return res.status(500).json({ error: 'server error' });
    }
});

/* Fake OTP storage for demo — in production use a DB or Redis with TTL */
const otpStore = new Map();
function genOtp() { return Math.floor(100000 + Math.random() * 900000).toString(); }

app.post('/auth/send-otp', async (req, res) => {
    try {
        const { phone } = req.body || {};
        if (!phone) return res.status(400).json({ error: 'phone required' });
        const normalized = normalizePhoneInput(phone);
        if (!normalized) return res.status(400).json({ error: 'invalid phone format' });
        const otp = genOtp();
        const expiresAt = Date.now() + 5 * 60 * 1000;
        otpStore.set(normalized, { otp, expiresAt });
        console.log(`[OTP] send-otp to ${normalized}: ${otp} (expires in 5m)`);
        if (twClient && TWILIO_FROM) {
            sendWhatsAppMessageSafe(normalized, `Your OTP: ${otp}`);
        }
        return res.json({ ok: true, message: 'OTP generated and (pretend) sent' });
    } catch (e) {
        console.error('send-otp error', e);
        return res.status(500).json({ error: 'server error' });
    }
});

app.post('/auth/verify-otp', async (req, res) => {
    try {
        const { phone, otp, name, signup } = req.body || {};
        if (!phone || !otp) return res.status(400).json({ error: 'phone and otp required' });

        const normalized = String(phone).replace(/[^\d+]/g, '');
        const rec = otpStore.get(normalized);
        if (!rec) return res.status(400).json({ error: 'no otp found (request send-otp first)' });
        if (Date.now() > rec.expiresAt) { otpStore.delete(normalized); return res.status(400).json({ error: 'otp expired' }); }
        if (String(otp).trim() !== String(rec.otp)) return res.status(401).json({ error: 'invalid otp' });

        const digits = normalized.replace(/\D/g, '');
        let normalizedPhone = normalized;
        if (!normalized.startsWith('+') && digits.length === 10) normalizedPhone = `+91${digits}`;
        else if (!normalized.startsWith('+')) normalizedPhone = `+${digits}`;

        let customer = await Customer.findOne({ phone: normalizedPhone });
        if (!customer) {
            if (signup || (name && String(name).trim().length > 1)) {
                const createName = (name && String(name).trim()) ? String(name).trim() : 'Customer';
                customer = await Customer.create({ name: createName, phone: normalizedPhone });
            } else {
                return res.status(401).json({ error: 'phone not registered. Please sign up first via /auth/customer-signup' });
            }
        }

        otpStore.delete(normalized);

        if (!JWT_SECRET) return res.status(500).json({ error: 'server misconfigured: JWT_SECRET missing' });
        const token = jwt.sign({ role: 'customer', userId: String(customer._id), phone: normalizedPhone }, JWT_SECRET, { expiresIn: '7d' });

        return res.json({ token, userId: customer._id, phone: normalizedPhone, name: customer.name || '' });
    } catch (e) {
        console.error('verify-otp error', e);
        return res.status(500).json({ error: 'server error' });
    }
});

/* API routes (shops, menu, orders) */

// Health
app.get('/status', (req, res) => res.json({ status: 'ok', time: new Date() }));

// Create shop (owner-only)
app.post('/api/shops', requireOwner, async (req, res) => {
    try {
        const { name, phone, description, pincode, address } = req.body;
        if (!name || !phone || !address || !pincode) return res.status(400).json({ error: 'name, phone, address and pincode required' });
        const shop = await Shop.create({ name, phone, description, address, owner: req.merchantId, pincode: (pincode || '').toString() });
        res.status(201).json(shop);
    } catch (err) {
        console.error('Create shop error:', err);
        res.status(500).json({ error: 'failed to create shop', detail: err.message });
    }
});

// Public list: only online shops, optional pincode
app.get('/api/shops', async (req, res) => {
    try {
        const { pincode } = req.query;
        let q = { online: true };
        if (pincode) q.pincode = String(pincode).trim();
        const shops = await Shop.find(q).select('-__v').lean();
        res.json(shops);
    } catch (err) {
        console.error('List shops error:', err);
        res.status(500).json({ error: 'failed' });
    }
});

// Owner: get my shops
app.get('/api/me/shops', async (req, res) => {
    try {
        const authHeader = (req.get('authorization') || '').toString().trim();
        const decoded = verifyJwtToken(authHeader);
        if (!decoded || decoded.role !== 'merchant') return res.status(401).json({ error: 'unauthorized' });
        const shops = await Shop.find({ owner: decoded.userId }).lean();
        res.json(shops);
    } catch (e) {
        console.error('me/shops error', e);
        res.status(500).json({ error: 'failed' });
    }
});

// Toggle shop online/offline (owner only)
app.put('/api/shops/:shopId/status', requireOwner, async (req, res) => {
    try {
        const { online } = req.body;
        const shop = await Shop.findById(req.params.shopId);
        if (!shop) return res.status(404).json({ error: 'shop not found' });
        shop.online = Boolean(online);
        await shop.save();
        res.json({ ok: true, shop });
    } catch (err) {
        console.error('Toggle shop status error:', err);
        res.status(500).json({ error: 'failed to toggle status' });
    }
});

// Edit shop details (owner only)
app.patch('/api/shops/:shopId', requireOwner, async (req, res) => {
    try {
        const update = {};
        const allowed = ['name', 'phone', 'address', 'pincode', 'description', 'online'];
        for (const k of allowed) {
            if (typeof req.body[k] !== 'undefined') update[k] = req.body[k];
        }
        if (Object.keys(update).length === 0) return res.status(400).json({ error: 'nothing to update' });

        const shop = await Shop.findOneAndUpdate({ _id: req.params.shopId, owner: req.merchantId }, update, { new: true });
        if (!shop) return res.status(404).json({ error: 'not found or not owner' });
        res.json(shop);
    } catch (err) {
        console.error('Edit shop error:', err);
        res.status(500).json({ error: 'failed to edit shop' });
    }
});

// Add menu item
// Add menu item
app.post('/api/shops/:shopId/items', requireOwner, async (req, res) => {
    try {
        const { name, price } = req.body;
        if (!name) return res.status(400).json({ error: 'name required' });

        // Read variants safely from request body
        const rawVariants = Array.isArray(req.body.variants) ? req.body.variants : [];
        const normalizedVariants = rawVariants.map((v, idx) => ({
            id: (v && v.id) ? String(v.id) : String(idx + 1),
            label: (v && (v.label || v.id)) ? String(v.label || v.id) : `Option ${idx + 1}`,
            price: Number((v && v.price) || 0),
            available: typeof (v && v.available) === 'boolean' ? v.available : true,
        }));

        const externalId = Math.random().toString(36).slice(2, 8).toUpperCase();

        const item = await MenuItem.create({
            shop: req.params.shopId,
            name,
            price: Number(price || 0),
            externalId,
            variants: normalizedVariants,
        });

        res.status(201).json(item);
    } catch (err) {
        console.error('Add menu item error:', err);
        res.status(500).json({ error: 'failed to add item', detail: err.message });
    }
});


// Edit menu item
app.patch('/api/shops/:shopId/items/:itemId', requireOwner, async (req, res) => {
    try {
        // copy allowed fields; variants is allowed and normalized
        const update = {};
        if (typeof req.body.name !== 'undefined') update.name = req.body.name;
        if (typeof req.body.price !== 'undefined') update.price = Number(req.body.price || 0);
        if (typeof req.body.available !== 'undefined') update.available = Boolean(req.body.available);
        if (typeof req.body.externalId !== 'undefined') update.externalId = req.body.externalId;

        if (Array.isArray(req.body.variants)) {
            update.variants = req.body.variants.map((v, idx) => ({
                id: (v.id || String(idx + 1)),
                label: String(v.label || v.id || `Option ${idx + 1}`),
                price: Number(v.price || 0),
                available: typeof v.available === 'boolean' ? v.available : true,
            }));
        }

        const item = await MenuItem.findOneAndUpdate(
            { _id: req.params.itemId, shop: req.params.shopId },
            update,
            { new: true }
        );
        if (!item) return res.status(404).json({ error: 'not found' });
        res.json(item);
    } catch (err) {
        console.error('Edit item error:', err);
        res.status(500).json({ error: 'failed' });
    }
});

// Delete item
app.delete('/api/shops/:shopId/items/:itemId', requireOwner, async (req, res) => {
    try {
        const del = await MenuItem.findOneAndDelete({ _id: req.params.itemId, shop: req.params.shopId });
        if (!del) return res.status(404).json({ error: 'not found' });
        res.json({ ok: true });
    } catch (e) {
        console.error('Delete item error', e);
        res.status(500).json({ error: 'failed' });
    }
});

// List menu (public)
app.get('/api/shops/:shopId/menu', async (req, res) => {
    try {
        const items = await MenuItem.find({ shop: req.params.shopId }).select('-__v').lean();
        res.json(items);
    } catch (err) {
        console.error('List menu error:', err);
        res.status(500).json({ error: 'failed to load menu' });
    }
});

/* Create order (same as you had) */
app.post('/api/orders', async (req, res) => {
    try {
        const { shop: shopId, customerName, phone: rawPhone, items = [], address } = req.body;
        if (!customerName || !rawPhone) return res.status(400).json({ error: 'customerName and phone required' });

        const normalizedPhone = normalizePhoneInput(rawPhone);
        if (!normalizedPhone) return res.status(400).json({ error: 'invalid phone format; provide 10 digit local phone or full international number' });

        const total = items.reduce((s, it) => s + Number(it.price || 0) * Number(it.qty || 0), 0);

        let shop = null;
        if (shopId) {
            shop = await Shop.findById(shopId).lean();
            if (!shop) return res.status(400).json({ error: 'invalid shop id' });
            if (address && address.pincode && String(address.pincode).trim() !== String(shop.pincode).trim()) {
                return res.status(400).json({ error: `Shop does not deliver to pincode ${address.pincode}. Shop pincode is ${shop.pincode}` });
            }
        }

        let customerId = null;
        try {
            const authHeader = (req.get('authorization') || '').toString().trim();
            if (authHeader) {
                const decoded = verifyJwtToken(authHeader);
                if (decoded && decoded.role === 'customer') {
                    customerId = decoded.userId;
                }
            }
        } catch (e) {
            customerId = null;
        }

        let orderNumber = null;
        if (shopId) {
            const seq = await Shop.findByIdAndUpdate(shopId, { $inc: { lastOrderNumber: 1 } }, { new: true });
            if (seq) orderNumber = seq.lastOrderNumber;
        }

        const orderPayload = {
            shop: shopId || null,
            orderNumber,
            customer: customerId || null,
            customerName,
            phone: normalizedPhone,
            address: address && typeof address === 'object' ? {
                label: address.label || '',
                address: address.address || '',
                phone: address.phone || '',
                pincode: address.pincode || '',
            } : undefined,
            items,
            total,
            status: 'received',
        };
        // ensure we have an incremental order numbe
        try {
            // use Counter to generate a globally incrementing orderNumber
            orderNumber = await Counter.next('orderNumber');
        } catch (e) {
            console.error('Counter.next error (falling back to shop seq):', e);
            // fallback to per-shop lastOrderNumber if Counter fails
            if (shopId) {
                const seq = await Shop.findByIdAndUpdate(shopId, { $inc: { lastOrderNumber: 1 } }, { new: true });
                if (seq) orderNumber = seq.lastOrderNumber;
            }
        }

        // set both shapes so whichever Order model is used downstream keeps working
        const finalPayload = {
            ...orderPayload,
            orderNumber,
            totalPrice: orderPayload.total,   // keep totalPrice for models/Order.js
            itemsTotal: orderPayload.total,   // optional (we don't compute separate deliveryFee here)
        };

        const order = await Order.create(finalPayload);
        sendWhatsAppMessageSafe(normalizedPhone, `Hi ${customerName}, we received your order ${order.orderNumber ? `#${String(order.orderNumber).padStart(6, '0')}` : order._id}. Total: ₹${total}`).catch(() => { });
        try {
            emitOrderUpdate(order._id.toString(), {
                orderId: order._id.toString(),
                status: order.status,
                orderNumber: orderNumber,
                at: new Date().toISOString(),
            });
        } catch (e) {
            console.error('Socket emit error:', e);
        }

        res.status(201).json(order);
    } catch (err) {
        console.error('Create order error:', err);
        res.status(500).json({ error: 'failed to create order' });
    }
});

// List orders (admin or API key or merchant)
app.get('/api/orders', requireApiKeyOrJwt, async (req, res) => {
    try {
        const { shopId } = req.query;
        const q = shopId ? { shop: shopId } : {};
        const orders = await Order.find(q).sort({ createdAt: -1 }).limit(200).lean();
        res.json(orders);
    } catch (err) {
        console.error('List orders error:', err);
        res.status(500).json({ error: 'failed to list orders' });
    }
});

// Get single order (public)
app.get('/api/orders/:id', async (req, res) => {
    try {
        const order = await Order.findById(req.params.id).lean();
        if (!order) return res.status(404).json({ error: 'not found' });
        res.json(order);
    } catch (err) {
        res.status(400).json({ error: 'invalid id' });
    }
});

// Owner: list shop orders (owner only)
app.get('/api/shops/:shopId/orders', requireOwner, async (req, res) => {
    try {
        const orders = await Order.find({ shop: req.params.shopId }).sort({ createdAt: -1 }).limit(200).lean();
        res.json(orders);
    } catch (err) {
        console.error('Shop orders error:', err);
        res.status(500).json({ error: 'failed' });
    }
});

// Update order status
app.patch('/api/orders/:id/status', requireApiKeyOrJwt, async (req, res) => {
    try {
        const { status } = req.body;
        if (!status) return res.status(400).json({ error: 'status required' });
        const order = await Order.findByIdAndUpdate(req.params.id, { status }, { new: true });
        if (!order) return res.status(404).json({ error: 'not found' });
        sendWhatsAppMessageSafe(order.phone, `Order ${order.orderNumber ? `#${String(order.orderNumber).padStart(6, '0')}` : order._id} status updated: ${status}`).catch(() => { });
        try {
            const payload = { orderId: order._id.toString(), status, at: new Date().toISOString() };
            emitOrderUpdate(order._id.toString(), payload);
        } catch (e) { console.error('Socket emit error:', e); }
        res.json(order);
    } catch (err) {
        console.error('Update status error:', err);
        res.status(400).json({ error: 'invalid request' });
    }
});

/* Customer endpoints (addresses & profile) */

// Get current customer profile
app.get('/api/customers/me', requireCustomer, async (req, res) => {
    try {
        const cust = await Customer.findById(req.customerId).select('-__v').lean();
        if (!cust) return res.status(404).json({ error: 'not found' });
        res.json(cust);
    } catch (e) {
        console.error('customers/me error', e);
        res.status(500).json({ error: 'failed' });
    }
});

// Update current customer profile (name, phone)
app.patch('/api/customers/me', requireCustomer, async (req, res) => {
    try {
        const update = {};
        if (typeof req.body.name !== 'undefined') update.name = req.body.name;
        if (typeof req.body.phone !== 'undefined') {
            const normalized = normalizePhoneInput(req.body.phone);
            if (!normalized) return res.status(400).json({ error: 'invalid phone' });
            update.phone = normalized;
        }
        if (Object.keys(update).length === 0) return res.status(400).json({ error: 'nothing to update' });
        const cust = await Customer.findByIdAndUpdate(req.customerId, update, { new: true }).lean();
        if (!cust) return res.status(404).json({ error: 'not found' });
        res.json(cust);
    } catch (e) {
        console.error('customers/me patch error', e);
        res.status(500).json({ error: 'failed' });
    }
});

// List addresses
app.get('/api/customers/addresses', requireCustomer, async (req, res) => {
    try {
        const cust = await Customer.findById(req.customerId).select('addresses').lean();
        if (!cust) return res.status(404).json({ error: 'not found' });
        res.json(cust.addresses || []);
    } catch (e) {
        console.error('addresses list error', e);
        res.status(500).json({ error: 'failed' });
    }
});

// Add address
app.post('/api/customers/addresses', requireCustomer, async (req, res) => {
    try {
        const { label, name, address, phone, pincode } = req.body || {};
        if (!address || !pincode || !name) return res.status(400).json({ error: 'name, address and pincode required' });

        let phoneNorm = '';
        if (phone) {
            const digits = String(phone).replace(/\D/g, '');
            phoneNorm = digits.length === 10 ? `+91${digits}` : (digits.length >= 7 ? `+${digits}` : '');
        }

        const cust = await Customer.findById(req.customerId);
        if (!cust) return res.status(404).json({ error: 'not found' });

        const isDefault = !(cust.addresses && cust.addresses.length > 0);

        const addr = { label: label || '', name: name || '', address, phone: phoneNorm, pincode: String(pincode).trim(), isDefault };
        cust.addresses.push(addr);

        if (isDefault) {
            cust.addresses.forEach((a, idx) => { if (idx !== cust.addresses.length - 1) a.isDefault = false; });
        }

        await cust.save();
        res.status(201).json(cust.addresses[cust.addresses.length - 1]);
    } catch (e) {
        console.error('add address error', e);
        res.status(500).json({ error: 'failed' });
    }
});

// Edit address
app.patch('/api/customers/addresses/:addrId', requireCustomer, async (req, res) => {
    try {
        const { label, name, address, phone, pincode, isDefault } = req.body || {};
        const cust = await Customer.findById(req.customerId);
        if (!cust) return res.status(404).json({ error: 'not found' });
        const addr = cust.addresses.id(req.params.addrId);
        if (!addr) return res.status(404).json({ error: 'address not found' });

        if (typeof label !== 'undefined') addr.label = label;
        if (typeof name !== 'undefined') addr.name = name;
        if (typeof address !== 'undefined') addr.address = address;
        if (typeof pincode !== 'undefined') addr.pincode = String(pincode);
        if (typeof phone !== 'undefined') {
            const digits = String(phone).replace(/\D/g, '');
            addr.phone = digits.length === 10 ? `+91${digits}` : (digits.length >= 7 ? `+${digits}` : '');
        }

        if (typeof isDefault !== 'undefined' && isDefault === true) {
            cust.addresses.forEach(a => (a.isDefault = false));
            addr.isDefault = true;
        }

        await cust.save();
        res.json(addr);
    } catch (e) {
        console.error('edit address error', e);
        res.status(500).json({ error: 'failed' });
    }
});

// Delete address
app.delete('/api/customers/addresses/:addrId', requireCustomer, async (req, res) => {
    try {
        const cust = await Customer.findById(req.customerId);
        if (!cust) return res.status(404).json({ error: 'not found' });
        const addr = cust.addresses.id(req.params.addrId);
        if (!addr) return res.status(404).json({ error: 'address not found' });

        if (addr.isDefault) {
            const other = cust.addresses.find(a => String(a._id) !== String(addr._id));
            if (!other) {
                return res.status(400).json({ error: "cannot delete default address — add another address and set it default first" });
            }
            const hasOtherDefault = cust.addresses.some(a => String(a._id) !== String(addr._id) && a.isDefault);
            if (!hasOtherDefault) {
                const otherAddr = cust.addresses.find(a => String(a._id) !== String(addr._id));
                otherAddr.isDefault = true;
            }
        }

        addr.remove();
        await cust.save();
        res.json({ ok: true });
    } catch (e) {
        console.error('delete address error', e);
        res.status(500).json({ error: 'failed' });
    }
});

// Customer: list own orders
app.get('/api/customers/orders', requireCustomer, async (req, res) => {
    try {
        const orders = await Order.find({ customer: req.customerId }).sort({ createdAt: -1 }).lean();
        res.json(orders);
    } catch (e) {
        console.error('customer orders error', e);
        res.status(500).json({ error: 'failed' });
    }
});

// Customer: get single order (owned)
app.get('/api/customers/orders/:id', requireCustomer, async (req, res) => {
    try {
        const order = await Order.findById(req.params.id).lean();
        if (!order) return res.status(404).json({ error: 'not found' });
        if (!order.customer || String(order.customer) !== String(req.customerId)) {
            return res.status(403).json({ error: 'forbidden' });
        }
        res.json(order);
    } catch (e) {
        console.error('customer order detail error', e);
        res.status(400).json({ error: 'invalid id' });
    }
});

app.post('/webhook/whatsapp', async (req, res) => {
    // Twilio may send fields with different casing
    const fromRaw = (req.body.From || req.body.from || '').toString();
    const rawBody = (req.body.Body || req.body.body || '').toString().trim();
    console.log('Incoming WhatsApp:', fromRaw, rawBody);

    // split tokens on any whitespace (covers newlines, spaces, tabs)
    const parts = (rawBody || '').split(/\s+/).filter(Boolean);
    const cmd = (parts[0] || '').toLowerCase();

    const MessagingResponse = require('twilio').twiml.MessagingResponse;
    const twiml = new MessagingResponse();

    try {
        // ---------- MENU ----------
        // "menu <shopPhone>"
        if (cmd === 'menu' && parts[1]) {
            const shopPhone = parts[1];
            const shop = await Shop.findOne({ phone: shopPhone });
            if (!shop) {
                twiml.message(`Shop ${shopPhone} not found.`);
            } else {
                const items = await MenuItem.find({ shop: shop._id, available: true }).lean();
                if (!items || items.length === 0) {
                    twiml.message(`No items found for ${shop.name}.`);
                } else {
                    // build friendly menu with letters A, B, C...
                    let msg = `📋 Menu for ${shop.name}:\n\n`;
                    items.forEach((it, i) => {
                        const label = String.fromCharCode(65 + i); // A, B, C...
                        msg += `${label}. ${it.name} — ₹${it.price}\n`;
                    });
                    msg += `\nTo order: order ${shop.phone} <letter|itemId> <qty> [<letter|itemId> <qty> ...]`;
                    msg += `\nExample: order ${shop.phone} A 2 B 1`;
                    twiml.message(msg);
                }
            }

            // ---------- ORDER ----------
            // "order <shopPhone> <itemExt> <qty> [<itemExt2> <qty2> ...]"
        } else if (cmd === 'order' && parts.length >= 3) {
            const shopPhone = parts[1];
            const rest = parts.slice(2); // remaining tokens

            if (rest.length === 0) {
                twiml.message('Usage: order <shopPhone> <itemId|letter> <qty> [<itemId|letter> <qty> ...]');
            } else {
                const shop = await Shop.findOne({ phone: shopPhone });
                if (!shop) {
                    twiml.message(`Shop ${shopPhone} not found.`);
                } else {
                    // fetch current menu items once
                    const menuItems = await MenuItem.find({ shop: shop._id, available: true }).lean() || [];

                    // build map: externalId (upper trimmed) -> item, and index map for letters
                    const extMap = {};
                    menuItems.forEach(mi => {
                        if (mi.externalId) extMap[String(mi.externalId).trim().toUpperCase()] = mi;
                    });

                    // parse tokens into pairs; allow final odd token to mean qty=1
                    const pairs = [];
                    for (let i = 0; i < rest.length; i += 2) {
                        const itemTokenRaw = rest[i];
                        const qtyToken = rest[i + 1];
                        const qty = qtyToken ? Math.max(1, parseInt(qtyToken, 10) || 1) : 1;
                        pairs.push({ token: String(itemTokenRaw).trim(), qty });
                    }

                    // resolve each pair to a menu item (support: letter A/B/C..., externalId, or exact name match)
                    const resolved = [];
                    const missingTokens = [];
                    for (const p of pairs) {
                        const t = p.token;
                        let mi = null;

                        // 1) If token is a single letter A..Z, map to index in menuItems
                        if (/^[A-Za-z]$/.test(t)) {
                            const idx = t.toUpperCase().charCodeAt(0) - 65;
                            if (idx >= 0 && idx < menuItems.length) mi = menuItems[idx];
                        }

                        // 2) Try externalId (case-insensitive)
                        if (!mi) {
                            const lookup = String(t).trim().toUpperCase();
                            if (extMap[lookup]) mi = extMap[lookup];
                        }

                        // 3) Try exact name match (case-insensitive)
                        if (!mi) {
                            const byName = menuItems.find(x => String(x.name || '').trim().toLowerCase() === String(t).trim().toLowerCase());
                            if (byName) mi = byName;
                        }

                        if (!mi) missingTokens.push(t);
                        else resolved.push({ menuItem: mi, qty: Number(p.qty || 1) });
                    }

                    if (missingTokens.length) {
                        twiml.message(`Item(s) not found: ${missingTokens.join(', ')}. Check the menu and use the letter or item code shown.`);
                    } else {
                        // build items with price/line totals
                        const itemsForOrder = resolved.map(r => {
                            const price = Number(r.menuItem.price || 0);
                            const qty = Number(r.qty || 1);
                            const lineTotal = price * qty;
                            return { name: r.menuItem.name, qty, price, lineTotal };
                        });

                        const itemsTotal = itemsForOrder.reduce((s, x) => s + x.lineTotal, 0);
                        const deliveryFee = 0;
                        const total = itemsTotal + deliveryFee;

                        // increment shop.lastOrderNumber (best-effort)
                        let orderNumber = null;
                        try {
                            const seq = await Shop.findByIdAndUpdate(shop._id, { $inc: { lastOrderNumber: 1 } }, { new: true }).lean();
                            if (seq && typeof seq.lastOrderNumber !== 'undefined') orderNumber = seq.lastOrderNumber;
                        } catch (e) {
                            console.warn('Failed to increment shop.lastOrderNumber (webhook):', e && e.message ? e.message : e);
                        }

                        const fromPhoneRaw = (fromRaw || '').replace(/^whatsapp:/i, '').trim();
                        const normalizedPhone = normalizePhoneInput(fromPhoneRaw) || fromPhoneRaw;

                        const orderPayload = {
                            shop: shop._id,
                            orderNumber: orderNumber ?? null,
                            customer: null,
                            customerName: `WhatsApp:${fromPhoneRaw}`,
                            phone: normalizedPhone,
                            address: {
                                label: 'WhatsApp',
                                address: `WhatsApp order from ${fromPhoneRaw}`,
                                phone: normalizedPhone,
                                pincode: ''
                            },
                            items: itemsForOrder.map(it => ({ name: it.name, qty: it.qty, price: it.price })),
                            total,
                            status: 'received',
                            createdAt: new Date()
                        };

                        const order = await Order.create(orderPayload);
                        const displayId = order.orderNumber ? `#${String(order.orderNumber).padStart(6, '0')}` : String(order._id);

                        // pretty item lines for WhatsApp messages
                        const itemLines = itemsForOrder.map(i => `${i.name} ×${i.qty} — ₹${i.price} = ₹${i.lineTotal}`).join('\n');

                        // Notify shop
                        sendWhatsAppMessageSafe(
                            shop.phone,
                            `📥 New order ${displayId} from ${order.phone}\n\n${itemLines}\n\nTotal: ₹${order.total}`
                        ).catch(() => { });

                        // Notify customer
                        sendWhatsAppMessageSafe(
                            order.phone,
                            `✅ Order placed: ${displayId}\n\n${itemLines}\n\nTotal: ₹${order.total}\nYou will receive updates here.`
                        ).catch(() => { });

                        // socket emit
                        try {
                            emitOrderUpdate(order._id.toString(), {
                                orderId: order._id.toString(),
                                orderNumber: order.orderNumber ?? null,
                                status: order.status,
                                at: new Date().toISOString()
                            });
                        } catch (e) { console.error('Socket emit error (webhook):', e); }

                        // reply to webhook sender
                        twiml.message(`✅ Order placed: ${displayId}\n\n${itemLines}\n\nTotal: ₹${order.total}\nYou will receive updates here.`);
                    }
                }
            }

            // ---------- STATUS ----------
        } else if (cmd === 'status' && parts[1]) {
            try {
                const order = await Order.findById(parts[1]);
                if (!order) twiml.message(`Order ${parts[1]} not found.`);
                else twiml.message(`Order ${order.orderNumber ? `#${String(order.orderNumber).padStart(6, '0')}` : order._id} status: ${order.status}`);
            } catch (e) {
                twiml.message('Invalid order id.');
            }

            // ---------- FALLBACK ----------
        } else {
            twiml.message('Welcome. Commands:\n1) menu <shopPhone>\n2) order <shopPhone> <letter|itemId> <qty> [more pairs]\n3) status <orderId>');
        }
    } catch (err) {
        console.error('Webhook error:', err);
        try { twiml.message('Server error.'); } catch (e) { }
    }

    // respond with TwiML XML
    res.writeHead(200, { 'Content-Type': 'text/xml' });
    res.end(twiml.toString());
});




/* Finally, if you have a separate routes/orders.js file (you do),
   mount it once here so it can add or override routes if needed.
   Require it after models exist so it can import models from Mongoose.
*/
try {
    const ordersRouter = require('./routes/orders');
    if (ordersRouter && typeof ordersRouter === 'function') {
        app.use('/api', ordersRouter());
    } else if (ordersRouter) {
        app.use('/api', ordersRouter);
    }
} catch (e) {
    // if routes file is missing or throws, log and continue (we already defined inline routes)
    console.log('No external routes/orders.js mounted or error requiring it (continuing):', e && e.message ? e.message : e);
}

/* Start server */
server.listen(PORT, () => console.log(`Server running with Socket.io on port ${PORT}`));