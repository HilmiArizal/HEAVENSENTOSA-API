const mongoose = require('mongoose');

const variantSchema = new mongoose.Schema({
  unit: {
    type: String,
    required: true,
    trim: true
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  image: {
    type: String,
    default: ''
  },
  stock: {
    type: String,
    enum: ['In Stock', 'Limited', 'Out of Stock'],
    default: 'In Stock'
  }
});

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Nama produk wajib diisi'],
    trim: true
  },
  category: {
    type: String,
    required: [true, 'Kategori produk wajib diisi'],
    default: 'Sosis Bakar'
  },
  price: {
    type: Number,
    required: [true, 'Harga dasar produk wajib diisi'],
    min: 0
  },
  unit: {
    type: String,
    default: '500g (5 pcs)'
  },
  description: {
    type: String,
    default: ''
  },
  image: {
    type: String,
    default: 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=800&q=80'
  },
  badge: {
    type: String,
    default: ''
  },
  isFeatured: {
    type: Boolean,
    default: false
  },
  stock: {
    type: String,
    enum: ['In Stock', 'Limited', 'Out of Stock'],
    default: 'In Stock'
  },
  spicyLevel: {
    type: Number,
    default: 0,
    min: 0,
    max: 3
  },
  meatContent: {
    type: String,
    default: '85% Daging Sapi Murni'
  },
  variants: [variantSchema]
}, {
  timestamps: true,
  toJSON: {
    transform: (doc, ret) => {
      ret.id = ret._id.toString();
      delete ret._id;
      delete ret.__v;
    }
  }
});

module.exports = mongoose.model('Product', productSchema);
