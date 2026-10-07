require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const Product = require('./models/Product');
const Category = require('./models/Category');

const app = express();
const PORT = process.env.PORT || 5005;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/sosis_heaven_sentosa';

app.use(cors());
app.use(express.json());

// Ensure uploads folder exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Serve uploaded files statically
app.use('/uploads', express.static(uploadsDir));

// Multer Storage Configuration for File Uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, 'sosis-' + uniqueSuffix + ext);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Hanya file gambar (jpg, png, webp, jpeg) yang diperbolehkan!'));
    }
  }
});

// POST /api/upload - Upload Image File
app.post('/api/upload', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'Tidak ada file yang diunggah' });
  }
  const imageUrl = `/uploads/${req.file.filename}`;
  res.json({
    success: true,
    message: 'Gambar berhasil diunggah!',
    imageUrl: imageUrl
  });
});

let isMongoConnected = false;

// Seed initial data to MongoDB
const seedDatabaseIfNeeded = async () => {
  try {
    // Seed Categories if empty
    const catCount = await Category.countDocuments();
    if (catCount === 0) {
      console.log('🌱 Seeding kategori awal ke MongoDB Atlas...');
      const initialCats = ['Sosis Bakar', 'Sosis Premium', 'Sosis Keju', 'Sosis Mini', 'Sosis Breakfast'];
      for (const name of initialCats) {
        await Category.updateOne({ name }, { name }, { upsert: true });
      }
    }

    // Seed Products if empty
    const count = await Product.countDocuments();
    if (count === 0) {
      console.log('🌱 Database MongoDB kosong. Mengimpor data awal Sosis Heaven Sentosa...');
      const seedFile = path.join(__dirname, 'data', 'products.json');
      if (fs.existsSync(seedFile)) {
        const raw = fs.readFileSync(seedFile, 'utf8');
        const initialProducts = JSON.parse(raw);
        const formatted = initialProducts.map(({ id, ...rest }) => rest);
        await Product.insertMany(formatted);
        console.log(`✅ Berhasil mengimpor ${initialProducts.length} produk ke MongoDB!`);
      }
    }
  } catch (err) {
    console.error('Gagal seeding data MongoDB:', err.message);
  }
};

// Connect to MongoDB
mongoose.connect(MONGO_URI)
  .then(async () => {
    isMongoConnected = true;
    console.log(`🍃 Berhasil terhubung ke MongoDB Database! (${MONGO_URI.includes('127.0.0.1') ? 'Local MongoDB' : 'MongoDB Atlas Cloud'})`);
    await seedDatabaseIfNeeded();
  })
  .catch((err) => {
    console.warn(`⚠️ Koneksi MongoDB Gagal: ${err.message}`);
    console.warn(`💡 Menggunakan fallback penyimpanan JSON lokal`);
  });

// JSON Fallback Helpers
const DATA_FILE = path.join(__dirname, 'data', 'products.json');
const getProductsDataJSON = () => {
  try {
    if (!fs.existsSync(DATA_FILE)) return [];
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (err) {
    return [];
  }
};
const saveProductsDataJSON = (data) => {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {}
};

// ==========================
// PRODUCT ENDPOINTS
// ==========================

// GET /api/products
app.get('/api/products', async (req, res) => {
  const { category, search, featured } = req.query;

  if (isMongoConnected) {
    try {
      let filter = {};
      if (category && category !== 'All') {
        filter.category = new RegExp(`^${category.trim()}$`, 'i');
      }
      if (search) {
        filter.$or = [
          { name: new RegExp(search, 'i') },
          { description: new RegExp(search, 'i') },
          { badge: new RegExp(search, 'i') }
        ];
      }
      if (featured === 'true') {
        filter.isFeatured = true;
      }

      const products = await Product.find(filter).sort({ createdAt: -1 });
      return res.json({ success: true, total: products.length, data: products, source: 'MongoDB' });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  // Fallback JSON File
  let products = getProductsDataJSON();
  if (category && category !== 'All') {
    products = products.filter(p => p.category.toLowerCase() === category.toLowerCase());
  }
  if (search) {
    const q = search.toLowerCase();
    products = products.filter(p => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q));
  }
  if (featured === 'true') products = products.filter(p => p.isFeatured);
  res.json({ success: true, total: products.length, data: products, source: 'JSON File' });
});

// GET /api/products/:id
app.get('/api/products/:id', async (req, res) => {
  if (isMongoConnected) {
    try {
      const product = await Product.findById(req.params.id);
      if (!product) return res.status(404).json({ success: false, message: 'Produk tidak ditemukan' });
      return res.json({ success: true, data: product });
    } catch (err) {
      return res.status(400).json({ success: false, message: 'ID produk tidak valid' });
    }
  }
  const products = getProductsDataJSON();
  const product = products.find(p => p.id === req.params.id);
  if (!product) return res.status(404).json({ success: false, message: 'Produk tidak ditemukan' });
  res.json({ success: true, data: product });
});

// POST /api/products - Create Product
app.post('/api/products', async (req, res) => {
  const { name, category, price, unit, description, image, badge, isFeatured, stock, spicyLevel, meatContent, variants } = req.body;

  if (!name || !price) {
    return res.status(400).json({ success: false, message: 'Nama dan harga wajib diisi' });
  }

  if (isMongoConnected) {
    try {
      // Get first category dynamically if not specified
      let finalCategory = category;
      if (!finalCategory) {
        const firstCat = await Category.findOne();
        finalCategory = firstCat ? firstCat.name : 'Sosis Premium';
      }

      const newProduct = await Product.create({
        name,
        category: finalCategory,
        price: Number(price),
        unit: unit || '500g',
        description: description || '',
        image: image || 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=800&q=80',
        badge: badge || '',
        isFeatured: Boolean(isFeatured),
        stock: stock || 'In Stock',
        spicyLevel: Number(spicyLevel) || 0,
        meatContent: meatContent || '85% Daging Sapi Murni',
        variants: Array.isArray(variants) ? variants : []
      });

      // Ensure category document exists
      await Category.updateOne({ name: finalCategory }, { name: finalCategory }, { upsert: true });

      return res.status(201).json({ success: true, message: 'Produk berhasil disimpan ke MongoDB!', data: newProduct });
    } catch (err) {

      return res.status(400).json({ success: false, message: err.message });
    }
  }

  // Fallback JSON File
  const products = getProductsDataJSON();
  const newProduct = {
    id: Date.now().toString(),
    name, category, price: Number(price), unit, description, image, badge, isFeatured: Boolean(isFeatured), stock, spicyLevel: Number(spicyLevel), meatContent,
    variants: Array.isArray(variants) ? variants : []
  };
  products.unshift(newProduct);
  saveProductsDataJSON(products);
  res.status(201).json({ success: true, message: 'Produk berhasil disimpan!', data: newProduct });
});

// PUT /api/products/:id - Update Product
app.put('/api/products/:id', async (req, res) => {
  if (isMongoConnected) {
    try {
      const updatedProduct = await Product.findByIdAndUpdate(
        req.params.id,
        { $set: req.body },
        { new: true, runValidators: true }
      );
      if (!updatedProduct) return res.status(404).json({ success: false, message: 'Produk tidak ditemukan' });

      if (req.body.category) {
        await Category.updateOne({ name: req.body.category }, { name: req.body.category }, { upsert: true });
      }

      return res.json({ success: true, message: 'Produk berhasil diperbarui di MongoDB!', data: updatedProduct });
    } catch (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
  }

  // Fallback JSON File
  const products = getProductsDataJSON();
  const index = products.findIndex(p => p.id === req.params.id);
  if (index === -1) return res.status(404).json({ success: false, message: 'Produk tidak ditemukan' });
  products[index] = { ...products[index], ...req.body };
  saveProductsDataJSON(products);
  res.json({ success: true, message: 'Produk berhasil diperbarui!', data: products[index] });
});

// DELETE /api/products/:id - Delete Product
app.delete('/api/products/:id', async (req, res) => {
  if (isMongoConnected) {
    try {
      const deleted = await Product.findByIdAndDelete(req.params.id);
      if (!deleted) return res.status(404).json({ success: false, message: 'Produk tidak ditemukan' });
      return res.json({ success: true, message: 'Produk berhasil dihapus dari MongoDB!' });
    } catch (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
  }

  // Fallback JSON File
  const products = getProductsDataJSON();
  const filtered = products.filter(p => p.id !== req.params.id);
  saveProductsDataJSON(filtered);
  res.json({ success: true, message: 'Produk berhasil dihapus!' });
});

// ==========================
// CATEGORY ENDPOINTS (COMPLETE & CLEAN DELETE LOGIC)
// ==========================

// GET /api/categories
app.get('/api/categories', async (req, res) => {
  if (isMongoConnected) {
    try {
      const dbCats = await Category.find().sort({ _id: 1 });
      const catNames = dbCats.map(c => c.name);
      return res.json({ success: true, data: ['All', ...catNames] });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }
  const products = getProductsDataJSON();
  const categories = ['All', ...new Set(products.map(p => p.category))];
  res.json({ success: true, data: categories });
});

// POST /api/categories - Create Category
app.post('/api/categories', async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ success: false, message: 'Nama kategori wajib diisi' });
  }

  const trimmed = name.trim();

  if (isMongoConnected) {
    try {
      const existing = await Category.findOne({ name: new RegExp(`^${trimmed}$`, 'i') });
      if (existing) {
        return res.status(400).json({ success: false, message: 'Kategori tersebut sudah ada' });
      }
      const newCat = await Category.create({ name: trimmed });
      return res.status(201).json({ success: true, message: 'Kategori berhasil disimpan ke MongoDB!', data: newCat });
    } catch (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
  }
  res.json({ success: true, message: 'Kategori ditambahkan' });
});

// PUT /api/categories/:oldName - Rename Category
app.put('/api/categories/:oldName', async (req, res) => {
  const oldName = decodeURIComponent(req.params.oldName).trim();
  const { newName } = req.body;

  if (!newName || !newName.trim()) {
    return res.status(400).json({ success: false, message: 'Nama kategori baru wajib diisi' });
  }

  const trimmedNew = newName.trim();

  if (isMongoConnected) {
    try {
      await Category.deleteMany({ name: new RegExp(`^${oldName}$`, 'i') });
      await Category.updateOne({ name: trimmedNew }, { name: trimmedNew }, { upsert: true });

      const updateResult = await Product.updateMany(
        { category: new RegExp(`^${oldName}$`, 'i') },
        { $set: { category: trimmedNew } }
      );

      return res.json({
        success: true,
        message: `Kategori "${oldName}" diubah menjadi "${trimmedNew}" di MongoDB!`,
        data: { oldName, newName: trimmedNew }
      });
    } catch (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
  }
  res.json({ success: true, message: 'Kategori diperbarui' });
});

// DELETE /api/categories/:name - Delete Category Completely from MongoDB
app.delete('/api/categories/:name', async (req, res) => {
  const name = decodeURIComponent(req.params.name).trim();

  if (isMongoConnected) {
    try {
      // 1. Delete Category document
      await Category.deleteMany({ name: new RegExp(`^${name}$`, 'i') });

      // 2. Find first remaining category as fallback for orphaned products
      const remainingCat = await Category.findOne({ name: { $ne: name } });
      const fallbackName = remainingCat ? remainingCat.name : 'Sosis Premium';

      // 3. Move products to remaining fallback category name
      await Product.updateMany(
        { category: new RegExp(`^${name}$`, 'i') },
        { $set: { category: fallbackName } }
      );

      return res.json({
        success: true,
        message: `Kategori "${name}" telah berhasil dihapus sepenuhnya dari MongoDB Atlas! (Produk dipindahkan ke '${fallbackName}')`
      });
    } catch (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
  }
  res.json({ success: true, message: 'Kategori dihapus' });
});

app.listen(PORT, () => {
  console.log(`🚀 Server Express Sosis Heaven Sentosa berjalan di http://localhost:${PORT}`);
});
