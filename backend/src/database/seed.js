import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from './connection.js';
import { User } from '../modules/users/user.model.js';
import { Category } from '../modules/categories/category.model.js';
import { Product } from '../modules/catalog/product.model.js';
import { Location } from '../modules/locations/location.model.js';
import { Inventory } from '../modules/inventory/inventory.model.js';
import { Coupon } from '../modules/pricing/coupon.model.js';
import { hashPassword } from '../common/utils/crypto.utils.js';
import { ROLES } from '../common/constants/roles.js';
import { logger } from '../common/utils/logger.js';

/**
 * Seeds initial admin and customer accounts.
 */
async function seedUsers() {
  const adminHash = await hashPassword('Admin@OmniRetail2026!');
  const admin = await User.findOneAndUpdate(
    { email: 'admin@walmart.com' },
    { $set: { firstName: 'System', lastName: 'Admin', passwordHash: adminHash, role: ROLES.ADMIN, isEmailVerified: true } },
    { upsert: true, new: true }
  );

  const customerHash = await hashPassword('Customer@12345!');
  const customer = await User.findOneAndUpdate(
    { email: 'customer@walmart.com' },
    { $set: { firstName: 'Jane', lastName: 'Doe', passwordHash: customerHash, role: ROLES.CUSTOMER, isEmailVerified: true } },
    { upsert: true, new: true }
  );

  logger.info({ adminId: admin._id, customerId: customer._id }, 'Seeded users');
  return { admin, customer };
}

/**
 * Seeds store and warehouse locations with GeoJSON coordinates.
 */
async function seedLocations() {
  const locationsData = [
    {
      code: 'STORE-DAL-001',
      name: 'Walmart Supercenter #1001 (Dallas Downtown)',
      type: 'STORE',
      address: { street: '1401 Main St', city: 'Dallas', state: 'TX', postalCode: '75201', country: 'USA' },
      geo: { type: 'Point', coordinates: [-96.797, 32.776] }
    },
    {
      code: 'STORE-AUS-002',
      name: 'Walmart Supercenter #2002 (Austin Central)',
      type: 'STORE',
      address: { street: '2525 W Anderson Ln', city: 'Austin', state: 'TX', postalCode: '78757', country: 'USA' },
      geo: { type: 'Point', coordinates: [-97.740, 30.358] }
    },
    {
      code: 'WH-HOU-001',
      name: 'OmniRetail Regional Warehouse Houston',
      type: 'WAREHOUSE',
      address: { street: '500 Logistics Way', city: 'Houston', state: 'TX', postalCode: '77001', country: 'USA' },
      geo: { type: 'Point', coordinates: [-95.369, 29.760] }
    },
    {
      code: 'DC-FTW-001',
      name: 'Texas Central Distribution Center',
      type: 'DISTRIBUTION_CENTER',
      address: { street: '800 Hub Blvd', city: 'Fort Worth', state: 'TX', postalCode: '76101', country: 'USA' },
      geo: { type: 'Point', coordinates: [-97.330, 32.755] }
    }
  ];

  const locations = [];
  for (const loc of locationsData) {
    const record = await Location.findOneAndUpdate({ code: loc.code }, { $set: loc }, { upsert: true, new: true });
    locations.push(record);
  }
  logger.info({ count: locations.length }, 'Seeded locations');
  return locations;
}

/**
 * Seeds catalog categories.
 */
async function seedCategories() {
  const catData = [
    { name: 'Electronics & Audio', slug: 'electronics' },
    { name: 'Home & Kitchen', slug: 'home-kitchen' },
    { name: 'Pantry & Grocery', slug: 'grocery' }
  ];

  const categories = [];
  for (const c of catData) {
    const rec = await Category.findOneAndUpdate({ slug: c.slug }, { $set: c }, { upsert: true, new: true });
    categories.push(rec);
  }
  logger.info({ count: categories.length }, 'Seeded categories');
  return categories;
}

/**
 * Seeds catalog products and returns created documents.
 */
function getProductDefinitions(categories) {
  const elec = categories.find((c) => c.slug === 'electronics')._id;
  const home = categories.find((c) => c.slug === 'home-kitchen')._id;
  return [
    { sku: 'SKU-SONY-XM5', name: 'Sony WH-1000XM5 Headphones', brand: 'Sony', category: elec, regularPrice: 34999, salePrice: 29999, status: 'ACTIVE', description: 'Industry-leading noise canceling.' },
    { sku: 'SKU-APPL-M4-IPAD', name: 'Apple iPad Pro 13-inch (M4)', brand: 'Apple', category: elec, regularPrice: 129900, salePrice: null, status: 'ACTIVE', description: 'Ultra Retina XDR display.' },
    { sku: 'SKU-INST-AIRFRY', name: 'Instant Vortex Plus Air Fryer', brand: 'Instant', category: home, regularPrice: 8999, salePrice: 6999, status: 'ACTIVE', description: 'EvenCrisp technology.' }
  ];
}

async function seedProducts(categories) {
  const definitions = getProductDefinitions(categories);
  const products = [];
  for (const p of definitions) {
    const prod = await Product.findOneAndUpdate({ sku: p.sku }, { $set: p }, { upsert: true, new: true });
    products.push(prod);
  }
  return products;
}

/**
 * Distributes initial on-hand stock across stores and warehouses.
 */
async function seedInventory(products, locations) {
  for (const prod of products) {
    for (const loc of locations) {
      const stockQty = loc.type === 'DISTRIBUTION_CENTER' ? 250 : loc.type === 'WAREHOUSE' ? 100 : 30;
      await Inventory.findOneAndUpdate(
        { productId: prod._id, locationId: loc._id },
        { $set: { onHandStock: stockQty, availableStock: stockQty, reservedStock: 0 } },
        { upsert: true }
      );
    }
  }
  logger.info('Seeded multi-location inventory');
}

/**
 * Seeds promotional discount coupons.
 */
async function seedCoupons() {
  const coupons = [
    {
      code: 'WELCOME20',
      discountType: 'PERCENTAGE',
      discountValue: 20,
      maxDiscountAmount: 2000,
      minOrderAmount: 500,
      startDate: new Date('2026-01-01'),
      endDate: new Date('2027-12-31'),
      isActive: true
    },
    {
      code: 'FLAT500',
      discountType: 'FLAT',
      discountValue: 500,
      minOrderAmount: 2500,
      startDate: new Date('2026-01-01'),
      endDate: new Date('2027-12-31'),
      isActive: true
    }
  ];

  for (const c of coupons) {
    await Coupon.findOneAndUpdate({ code: c.code }, { $set: c }, { upsert: true });
  }
  logger.info('Seeded discount coupons');
}

/**
 * Master execution sequence for database seeding.
 */
export async function seedDatabase() {
  logger.info('Starting OmniRetail database seeding...');
  await connectDatabase();
  try {
    await seedUsers();
    const locations = await seedLocations();
    const categories = await seedCategories();
    const products = await seedProducts(categories);
    await seedInventory(products, locations);
    await seedCoupons();
    logger.info('OmniRetail database seeded successfully! 🎉');
  } finally {
    await disconnectDatabase();
  }
}

if (process.argv[1]?.endsWith('seed.js')) {
  seedDatabase()
    .then(() => process.exit(0))
    .catch((err) => {
      logger.fatal({ err }, 'Database seeding failed');
      process.exit(1);
    });
}
